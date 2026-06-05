const { chromium } = require('playwright');
const path = require('path');

const RESULTS_DIR = path.join(__dirname, '..', 'test-results');
const BASE = 'http://localhost:5173';

let screenshotIndex = 0;
const consoleErrors = [];
const networkErrors = [];
const log = [];
const screenshotsTaken = [];

function logStep(msg) {
  const ts = new Date().toISOString().slice(11, 23);
  log.push(`[${ts}] ${msg}`);
  console.log(`[${ts}] ${msg}`);
}

async function screenshot(page, desc) {
  screenshotIndex++;
  const num = String(screenshotIndex).padStart(2, '0');
  const safeName = desc.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
  const filename = `search-${num}-${safeName}.png`;
  const filepath = path.join(RESULTS_DIR, filename);
  await page.screenshot({ path: filepath, fullPage: false });
  screenshotsTaken.push(filename);
  logStep(`Screenshot: ${filename}`);
  return filename;
}

async function safeGoto(page, url, label) {
  logStep(`Navigating to ${url} (${label})`);
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
    logStep(`  Loaded: ${page.url()}`);
  } catch (e) {
    logStep(`  Navigation timeout/error: ${e.message}. Waiting for domcontentloaded fallback...`);
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 });
      await page.waitForTimeout(2000);
      logStep(`  Fallback loaded: ${page.url()}`);
    } catch (e2) {
      logStep(`  FAILED to navigate: ${e2.message}`);
    }
  }
}

(async () => {
  logStep('=== Playwright Search/Discover/Edge Test Suite ===');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  // Capture console errors
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push({ url: page.url(), text: msg.text() });
    }
  });
  page.on('pageerror', err => {
    consoleErrors.push({ url: page.url(), text: err.message });
  });
  page.on('requestfailed', req => {
    networkErrors.push({ url: req.url(), failure: req.failure()?.errorText || 'unknown' });
  });

  try {
    // ======================================================================
    // 1. SEARCH PAGE (/search)
    // ======================================================================
    logStep('--- SECTION 1: Search Page ---');

    await safeGoto(page, `${BASE}/search`, 'Search page');
    await page.waitForTimeout(1500);
    await screenshot(page, 'search-initial-state');

    // Check tabs
    logStep('Checking for tab buttons...');
    const tabButtons = await page.$$('button');
    const tabLabels = [];
    for (const btn of tabButtons) {
      const text = (await btn.textContent()).trim();
      if (text.includes('Transcripts') || text.includes('Podcasts') || text.includes('Find Podcasts') || text.includes('Search Transcripts')) {
        tabLabels.push(text);
      }
    }
    logStep(`  Tabs found: ${tabLabels.length > 0 ? tabLabels.join(' | ') : 'NONE'}`);

    // Check search input
    logStep('Checking search input...');
    const searchInput = await page.$('input[type="text"]');
    if (searchInput) {
      const placeholder = await searchInput.getAttribute('placeholder');
      const isFocused = await searchInput.evaluate(el => document.activeElement === el);
      logStep(`  Search input found. Placeholder: "${placeholder}". Auto-focused: ${isFocused}`);
    } else {
      logStep('  ERROR: No search input found');
    }

    // Test semantic search
    logStep('Testing semantic search with query "artificial intelligence"...');
    if (searchInput) {
      await searchInput.click();
      await searchInput.fill('artificial intelligence');
      logStep('  Query entered, waiting for debounced search (3s)...');
      await page.waitForTimeout(3500);
      await screenshot(page, 'search-semantic-results');

      // Check for results or empty state
      const resultCards = await page.$$('[class*="SemanticSearchResult"], [class*="result"]');
      const noMatchText = await page.$('text=No matches found');
      const errorBox = await page.$('[class*="error"]');
      const resultCount = await page.$('text=/\\d+ result/');

      if (resultCount) {
        const countText = await resultCount.textContent();
        logStep(`  Results meta: "${countText.trim()}"`);
      }

      if (noMatchText) {
        logStep('  Empty state: "No matches found" displayed');
      } else if (errorBox) {
        const errorText = await errorBox.textContent();
        logStep(`  Error displayed: "${errorText.trim()}"`);
      } else {
        // Try to count actual result items by looking at result containers
        const resultItems = await page.$$('div.flex.flex-col.gap-3 > div');
        logStep(`  Result items found in DOM: ${resultItems.length}`);
      }

      // Check URL params
      const currentUrl = page.url();
      logStep(`  Current URL: ${currentUrl}`);
      const hasQParam = currentUrl.includes('q=');
      const hasTabParam = currentUrl.includes('tab=');
      logStep(`  URL has q= param: ${hasQParam}, tab= param: ${hasTabParam}`);
    }

    // Test filter toggle
    logStep('Testing search filters...');
    const filterBtn = await page.$('button[title="Filters"]');
    if (filterBtn) {
      await filterBtn.click();
      await page.waitForTimeout(500);
      await screenshot(page, 'search-filters-open');

      // Check filter contents
      const scopeLabel = await page.$('text=Scope');
      const thresholdLabel = await page.$('text=/Min relevance/');
      const allPodcastsPill = await page.$('text=All Podcasts');
      logStep(`  Scope label: ${!!scopeLabel}, Threshold: ${!!thresholdLabel}, All Podcasts pill: ${!!allPodcastsPill}`);

      // Check threshold slider
      const slider = await page.$('input[type="range"]');
      if (slider) {
        const min = await slider.getAttribute('min');
        const max = await slider.getAttribute('max');
        const value = await slider.getAttribute('value');
        logStep(`  Threshold slider: min=${min}, max=${max}, current=${value}`);
      }
    } else {
      logStep('  No filter button found');
    }

    // Switch to "Find Podcasts" tab
    logStep('Switching to Find Podcasts tab...');
    const findPodcastsTab = await page.$('button:has-text("Find Podcasts")');
    if (findPodcastsTab) {
      await findPodcastsTab.click();
      await page.waitForTimeout(500);
      await screenshot(page, 'search-find-podcasts-tab');

      // Check empty state
      const discoverText = await page.$('text=Discover new podcasts');
      logStep(`  Empty state text visible: ${!!discoverText}`);

      // Check placeholder changed
      const podSearchInput = await page.$('input[type="text"]');
      if (podSearchInput) {
        const placeholder = await podSearchInput.getAttribute('placeholder');
        logStep(`  Placeholder now: "${placeholder}"`);

        // Search for a podcast
        logStep('  Searching for "Joe Rogan"...');
        await podSearchInput.fill('Joe Rogan');
        await page.waitForTimeout(3500);
        await screenshot(page, 'search-podcast-index-results');

        // Check results
        const showCards = await page.$$('button[class*="w-full"]');
        const showCount = await page.$('text=/\\d+ podcast/');
        if (showCount) {
          const ct = await showCount.textContent();
          logStep(`  Podcast results: "${ct.trim()}"`);
        }
        const noShowsText = await page.$('text=No podcasts found');
        if (noShowsText) {
          logStep('  No podcast results found');
        }

        // Check for error
        const podError = await page.$('[class*="error"]');
        if (podError) {
          const errText = await podError.textContent();
          logStep(`  Podcast search error: "${errText.trim()}"`);
        }
      }
    } else {
      logStep('  ERROR: "Find Podcasts" tab button not found');
    }

    // Switch back to transcripts
    logStep('Switching back to Search Transcripts tab...');
    const transcriptsTab = await page.$('button:has-text("Search Transcripts")');
    if (transcriptsTab) {
      await transcriptsTab.click();
      await page.waitForTimeout(500);
      logStep('  Switched back to transcripts tab');
    }

    // ======================================================================
    // 2. DISCOVER PAGE (/discover)
    // ======================================================================
    logStep('--- SECTION 2: Discover Page ---');

    await safeGoto(page, `${BASE}/discover`, 'Discover page');
    await page.waitForTimeout(3000);
    await screenshot(page, 'discover-initial');

    // Check heading
    const discoverH1 = await page.$('h1');
    if (discoverH1) {
      const h1Text = await discoverH1.textContent();
      logStep(`  Page heading: "${h1Text.trim()}"`);
    }

    // Check subtitle
    const subtitle = await page.$('text=Trending podcasts');
    logStep(`  Subtitle "Trending podcasts..." visible: ${!!subtitle}`);

    // Check for categories
    const categoryButtons = await page.$$('div.flex.items-center.gap-2.flex-wrap > button');
    logStep(`  Category pill buttons found: ${categoryButtons.length}`);

    if (categoryButtons.length > 0) {
      const firstFewLabels = [];
      for (let i = 0; i < Math.min(categoryButtons.length, 5); i++) {
        const label = await categoryButtons[i].textContent();
        firstFewLabels.push(label.trim());
      }
      logStep(`  First few categories: ${firstFewLabels.join(', ')}`);

      // Click a category
      logStep('  Clicking first category...');
      await categoryButtons[0].click();
      await page.waitForTimeout(2500);
      await screenshot(page, 'discover-category-filtered');

      // Check if subtitle changed
      const filteredSubtitle = await page.$('p.text-\\[14px\\]');
      if (filteredSubtitle) {
        const ft = await filteredSubtitle.textContent();
        logStep(`  Subtitle after filter: "${ft.trim()}"`);
      }

      // Look for the clear/active category button
      const activeCatBtn = await page.$('button:has(svg)');
      // The clear button has the category name + an X icon
      const clearButtons = await page.$$('button.flex.items-center.gap-1\\.5');
      logStep(`  Active category buttons (with X): ${clearButtons.length}`);

      if (clearButtons.length > 0) {
        logStep('  Clicking category clear button...');
        await clearButtons[0].click();
        await page.waitForTimeout(2000);
        await screenshot(page, 'discover-category-cleared');
        logStep('  Category cleared, back to all trending');
      }
    } else {
      logStep('  No category buttons found - checking for loading/error state');
      const loadingText = await page.$('text=Loading');
      const errorText = await page.$('[class*="error"]');
      if (loadingText) logStep('  Still loading categories');
      if (errorText) {
        const et = await errorText.textContent();
        logStep(`  Error: "${et.trim()}"`);
      }
    }

    // Check show cards
    const showCards = await page.$$('div[class*="grid"] > div');
    logStep(`  Show cards in grid: ${showCards.length}`);

    if (showCards.length > 0) {
      // Check a show card's structure
      const firstCard = showCards[0];
      const cardImg = await firstCard.$('img');
      const cardTitle = await firstCard.$('p.text-\\[14px\\]');
      const cardAuthor = await firstCard.$('p.text-\\[12px\\]');
      const browseBtn = await firstCard.$('button:has-text("Browse Episodes")');

      logStep(`  Card has image: ${!!cardImg}, title: ${!!cardTitle}, author: ${!!cardAuthor}, Browse button: ${!!browseBtn}`);

      if (cardTitle) {
        const t = await cardTitle.textContent();
        logStep(`  First card title: "${t.trim()}"`);
      }

      // Click Browse Episodes
      if (browseBtn) {
        logStep('  Clicking "Browse Episodes"...');
        await browseBtn.click();
        await page.waitForTimeout(2000);
        await screenshot(page, 'discover-browse-episodes');

        // Check if modal/overlay opened (AddPodcastModal)
        const modal = await page.$('div[class*="fixed"][class*="inset-0"]');
        logStep(`  Modal opened: ${!!modal}`);

        if (modal) {
          // Close it
          const closeBtn = await modal.$('button:has(svg)');
          if (closeBtn) {
            await closeBtn.click();
            await page.waitForTimeout(500);
            logStep('  Modal closed');
          }
        }
      }
    }

    // ======================================================================
    // 3. KEYBOARD SHORTCUTS
    // ======================================================================
    logStep('--- SECTION 3: Keyboard Shortcuts ---');

    // Go to home first
    await safeGoto(page, BASE, 'Home page');
    await page.waitForTimeout(2000);

    // Test '/' shortcut -> navigate to /search
    logStep('Testing "/" shortcut...');
    // Make sure no input is focused
    await page.evaluate(() => document.activeElement?.blur());
    await page.waitForTimeout(300);
    await page.keyboard.press('/');
    await page.waitForTimeout(1500);
    const urlAfterSlash = page.url();
    logStep(`  URL after "/" press: ${urlAfterSlash}`);
    const navigatedToSearch = urlAfterSlash.includes('/search');
    logStep(`  Navigated to /search: ${navigatedToSearch}`);
    await screenshot(page, 'shortcut-slash-search');

    // Go back to home
    await safeGoto(page, BASE, 'Home (for Ctrl+K test)');
    await page.waitForTimeout(2000);

    // Test Ctrl+K -> command palette
    logStep('Testing Ctrl+K shortcut...');
    await page.keyboard.press('Control+k');
    await page.waitForTimeout(1000);
    await screenshot(page, 'shortcut-ctrlk-command-palette');

    // Check if command palette is visible
    const paletteOverlay = await page.$('div.fixed.inset-0[class*="z-"]');
    const paletteInput = await page.$('input[placeholder*="Search KBs"]');
    logStep(`  Command palette overlay visible: ${!!paletteOverlay}`);
    logStep(`  Command palette input found: ${!!paletteInput}`);

    if (paletteInput) {
      const plc = await paletteInput.getAttribute('placeholder');
      logStep(`  Palette placeholder: "${plc}"`);

      // Check listed items (KBs, podcasts, actions)
      const paletteItems = await page.$$('div.max-h-\\[380px\\] button');
      logStep(`  Palette items: ${paletteItems.length}`);
      for (let i = 0; i < Math.min(paletteItems.length, 5); i++) {
        const itemText = await paletteItems[i].textContent();
        logStep(`    Item ${i}: "${itemText.trim().replace(/\s+/g, ' ')}"`);
      }

      // Type a query
      logStep('  Typing "test" in palette...');
      await paletteInput.fill('test');
      await page.waitForTimeout(500);
      await screenshot(page, 'shortcut-palette-typed');

      const filteredItems = await page.$$('div.max-h-\\[380px\\] button');
      logStep(`  Filtered palette items: ${filteredItems.length}`);

      // Test ? semantic search mode
      logStep('  Testing "?artificial" for transcript search mode...');
      await paletteInput.fill('?artificial intelligence');
      await page.waitForTimeout(2000);
      await screenshot(page, 'shortcut-palette-semantic');

      const searchingText = await page.$('text=Searching transcripts');
      const noTranscriptMatches = await page.$('text=No transcript matches');
      const transcriptResults = await page.$$('div.max-h-\\[380px\\] button');
      logStep(`  Searching indicator: ${!!searchingText}, No matches: ${!!noTranscriptMatches}, Results: ${transcriptResults.length}`);
    }

    // Press Escape to close
    logStep('  Pressing Escape to close palette...');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    const paletteAfterEsc = await page.$('div.fixed.inset-0[class*="backdrop"]');
    logStep(`  Palette still visible after Escape: ${!!paletteAfterEsc}`);

    // ======================================================================
    // 4. OPML IMPORT
    // ======================================================================
    logStep('--- SECTION 4: OPML Import ---');

    await safeGoto(page, `${BASE}/profile`, 'Profile page');
    await page.waitForTimeout(2000);
    await screenshot(page, 'opml-profile-page');

    // Look for Import OPML button
    const opmlBtn = await page.$('button:has-text("Import OPML")');
    logStep(`  "Import OPML" button found on Profile page: ${!!opmlBtn}`);

    if (opmlBtn) {
      logStep('  Clicking Import OPML...');
      await opmlBtn.click();
      await page.waitForTimeout(1000);
      await screenshot(page, 'opml-modal-open');

      // Check modal content
      const modalHeader = await page.$('h3:has-text("Import OPML")');
      const fileInput = await page.$('input[type="file"]');
      const dropZone = await page.$('text=Choose .opml or .xml file');
      const instructions = await page.$('text=Import podcast subscriptions');

      logStep(`  Modal header: ${!!modalHeader}`);
      logStep(`  File input: ${!!fileInput}`);
      logStep(`  Drop zone text: ${!!dropZone}`);
      logStep(`  Instructions: ${!!instructions}`);

      if (fileInput) {
        const accept = await fileInput.getAttribute('accept');
        logStep(`  File input accepts: "${accept}"`);
      }

      // Close modal
      const closeBtn = await page.$('div.fixed button:has(svg)');
      if (closeBtn) {
        await closeBtn.click();
        await page.waitForTimeout(500);
        logStep('  Modal closed');
      }
    }

    // ======================================================================
    // 5. ERROR HANDLING & EDGE CASES
    // ======================================================================
    logStep('--- SECTION 5: Error Handling & Edge Cases ---');

    // Fake KB UUID
    logStep('Testing fake KB UUID...');
    await safeGoto(page, `${BASE}/kb/00000000-0000-0000-0000-000000000000`, 'Fake KB');
    await page.waitForTimeout(2500);
    await screenshot(page, 'error-fake-kb');
    const fakeKbUrl = page.url();
    logStep(`  Final URL: ${fakeKbUrl}`);
    const fakeKbContent = await page.textContent('body');
    if (fakeKbContent.includes('not found') || fakeKbContent.includes('Not Found') || fakeKbContent.includes('error')) {
      logStep('  Error/not-found message displayed');
    } else if (fakeKbContent.includes('Loading')) {
      logStep('  Stuck on loading state');
    } else {
      logStep(`  Page content snippet: "${fakeKbContent.slice(0, 200).replace(/\s+/g, ' ').trim()}"`);
    }

    // Fake podcast UUID
    logStep('Testing fake Podcast UUID...');
    await safeGoto(page, `${BASE}/podcast/00000000-0000-0000-0000-000000000000`, 'Fake Podcast');
    await page.waitForTimeout(2500);
    await screenshot(page, 'error-fake-podcast');
    const fakePodUrl = page.url();
    logStep(`  Final URL: ${fakePodUrl}`);
    const fakePodContent = await page.textContent('body');
    if (fakePodContent.includes('not found') || fakePodContent.includes('Not Found') || fakePodContent.includes('error')) {
      logStep('  Error/not-found message displayed');
    } else if (fakePodContent.includes('Loading')) {
      logStep('  Stuck on loading state');
    } else {
      logStep(`  Page content snippet: "${fakePodContent.slice(0, 200).replace(/\s+/g, ' ').trim()}"`);
    }

    // Nonexistent route
    logStep('Testing nonexistent route /nonexistent-route...');
    await safeGoto(page, `${BASE}/nonexistent-route`, 'Nonexistent route');
    await page.waitForTimeout(2000);
    await screenshot(page, 'error-nonexistent-route');
    const nonexUrl = page.url();
    logStep(`  Final URL: ${nonexUrl}`);
    const nonexContent = await page.textContent('body');
    if (nonexContent.includes('404') || nonexContent.includes('not found') || nonexContent.includes('Not Found')) {
      logStep('  404 page displayed');
    } else {
      logStep(`  Page content snippet: "${nonexContent.slice(0, 200).replace(/\s+/g, ' ').trim()}"`);
    }

    // Auth page
    logStep('Testing auth page /auth...');
    await safeGoto(page, `${BASE}/auth`, 'Auth page');
    await page.waitForTimeout(2000);
    await screenshot(page, 'error-auth-page');
    const authUrl = page.url();
    logStep(`  Final URL: ${authUrl}`);
    // Check for auth elements
    const authForm = await page.$('form');
    const authInput = await page.$('input[type="email"], input[type="password"]');
    const googleBtn = await page.$('button:has-text("Google")');
    const signInBtn = await page.$('button:has-text("Sign in"), button:has-text("Log in")');
    logStep(`  Auth form: ${!!authForm}, Email/password input: ${!!authInput}, Google button: ${!!googleBtn}, Sign in: ${!!signInBtn}`);

    // ======================================================================
    // 6. PROFILE PAGE
    // ======================================================================
    logStep('--- SECTION 6: Profile Page ---');

    await safeGoto(page, `${BASE}/profile`, 'Profile page');
    await page.waitForTimeout(2000);
    await screenshot(page, 'profile-full-page');

    // Check profile heading
    const profileH1 = await page.$('h1');
    if (profileH1) {
      const h1 = await profileH1.textContent();
      logStep(`  Page heading: "${h1.trim()}"`);
    }

    // Check account info section
    const accountSection = await page.$('text=Account');
    logStep(`  Account section: ${!!accountSection}`);

    const emailLabel = await page.$('text=Email');
    logStep(`  Email label: ${!!emailLabel}`);

    // Check sign out
    const signOutBtn = await page.$('button:has-text("Sign out")');
    logStep(`  Sign out button: ${!!signOutBtn}`);

    // Check subscriptions section
    const subsSection = await page.$('text=Feed Subscriptions');
    logStep(`  Feed Subscriptions section: ${!!subsSection}`);

    // Check danger zone
    const dangerZone = await page.$('text=Danger zone');
    logStep(`  Danger zone section: ${!!dangerZone}`);

    const deleteBtn = await page.$('button:has-text("Delete all my data")');
    logStep(`  Delete button: ${!!deleteBtn}`);

    // Check back button
    const backBtn = await page.$('button svg');
    logStep(`  Back button: ${!!backBtn}`);

    // ======================================================================
    // SUMMARY
    // ======================================================================
    logStep('--- TEST COMPLETE ---');
    logStep(`Console errors collected: ${consoleErrors.length}`);
    for (const err of consoleErrors) {
      logStep(`  [console.error] ${err.url} => ${err.text.slice(0, 200)}`);
    }
    logStep(`Network errors collected: ${networkErrors.length}`);
    for (const err of networkErrors) {
      logStep(`  [network] ${err.url} => ${err.failure}`);
    }
    logStep(`Screenshots taken: ${screenshotsTaken.length}`);
    for (const s of screenshotsTaken) {
      logStep(`  ${s}`);
    }

  } catch (err) {
    logStep(`FATAL ERROR: ${err.message}`);
    console.error(err);
    try {
      await screenshot(page, 'fatal-error');
    } catch {}
  } finally {
    await browser.close();
  }

  // Output full log as JSON for easy parsing
  console.log('\n=== STRUCTURED OUTPUT ===');
  console.log(JSON.stringify({
    log,
    consoleErrors,
    networkErrors,
    screenshotsTaken,
  }, null, 2));
})();
