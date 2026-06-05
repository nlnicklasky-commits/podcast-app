const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const SCREENSHOT_DIR = path.join(__dirname, '..', 'test-results');
const BASE_URL = 'http://localhost:5173';

if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

const results = [];
const consoleMessages = [];
const pageErrors = [];
const networkRequests = [];

function log(step, status, detail = '') {
  results.push({ step, status, detail, timestamp: new Date().toISOString() });
  const icon = status === 'PASS' ? '[PASS]' : status === 'FAIL' ? '[FAIL]' : '[INFO]';
  console.log(`${icon} ${step}${detail ? ' - ' + detail : ''}`);
}

async function screenshot(page, name) {
  const filePath = path.join(SCREENSHOT_DIR, name);
  await page.screenshot({ path: filePath, fullPage: false });
  log(`Screenshot: ${name}`, 'INFO', filePath);
  return name;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  page.on('console', msg => {
    consoleMessages.push({ type: msg.type(), text: msg.text(), timestamp: new Date().toISOString() });
  });
  page.on('pageerror', err => {
    pageErrors.push({ message: err.message, timestamp: new Date().toISOString() });
    console.log(`[PAGE ERROR] ${err.message}`);
  });
  page.on('requestfinished', async req => {
    const url = req.url();
    if (url.includes('supabase') || url.includes('functions/v1')) {
      const resp = req.response ? await req.response() : null;
      networkRequests.push({
        url: url.substring(0, 200),
        method: req.method(),
        status: resp ? resp.status() : 'unknown',
        timestamp: new Date().toISOString(),
      });
    }
  });
  page.on('requestfailed', req => {
    networkRequests.push({
      url: req.url().substring(0, 200),
      method: req.method(),
      status: 'FAILED',
      failure: req.failure()?.errorText || 'unknown',
      timestamp: new Date().toISOString(),
    });
  });

  const screenshots = [];

  // Helpers for modal targeting
  const modal = () => page.locator('.fixed.inset-0 .fade-in');
  const modalHeader = () => modal().locator('.border-b').first();
  // The body area is the flex column inside the modal after the header
  const modalBodyArea = () => modal().locator('div.flex.flex-col.flex-1');

  try {
    // ============================================================
    // STEP 1: Navigate and load
    // ============================================================
    log('1. Navigate to home page', 'INFO');
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });

    try {
      await page.waitForSelector('text=PodBrain', { timeout: 10000 });
      log('1a. PodBrain wordmark visible', 'PASS');
    } catch (e) {
      log('1a. PodBrain wordmark visible', 'FAIL', e.message);
    }

    try {
      log('1b. Sidebar visible', await page.locator('aside').isVisible() ? 'PASS' : 'FAIL');
    } catch (e) {
      log('1b. Sidebar visible', 'FAIL', e.message);
    }

    try {
      await page.waitForFunction(() => !document.body.innerText.includes('Loading...'), { timeout: 15000 });
      log('1c. Content loaded (no spinner)', 'PASS');
    } catch (e) {
      log('1c. Content loaded', 'FAIL', 'Still loading after 15s');
    }

    screenshots.push(await screenshot(page, '01-home-loaded.png'));

    const hasHero = await page.locator('text=/Your library is/').isVisible().catch(() => false);
    log('1d. Home hero section', hasHero ? 'PASS' : 'FAIL');

    // ============================================================
    // STEP 2: Click Add Podcast
    // ============================================================
    log('2. Find and click Add Podcast', 'INFO');

    let found = false;
    for (const selector of [
      'main button:has-text("Add podcast")',
      'main button:has-text("Add your first podcast")',
    ]) {
      try {
        const btn = page.locator(selector).first();
        if (await btn.isVisible({ timeout: 2000 })) {
          await btn.click();
          log('2a. Clicked button', 'PASS', selector);
          found = true;
          break;
        }
      } catch (e) { /* try next */ }
    }
    if (!found) {
      log('2a. No button found, dispatching event', 'INFO');
      await page.evaluate(() => window.dispatchEvent(new CustomEvent('podbrain:add-podcast')));
    }

    screenshots.push(await screenshot(page, '02-add-podcast-clicked.png'));

    // ============================================================
    // STEP 3: Verify modal opens
    // ============================================================
    log('3. Verify AddPodcastModal opens', 'INFO');

    try {
      await modal().waitFor({ state: 'visible', timeout: 5000 });
      log('3a. Modal visible', 'PASS');
    } catch (e) {
      log('3a. Modal visible', 'FAIL', e.message);
    }

    try {
      const title = await modalHeader().locator('h3').textContent();
      log('3b. Modal title "Add Podcast"', title === 'Add Podcast' ? 'PASS' : 'FAIL', `"${title}"`);
    } catch (e) {
      log('3b. Modal title', 'FAIL', e.message);
    }

    try {
      await modal().locator('input[placeholder="Search for a podcast..."]').waitFor({ state: 'visible', timeout: 3000 });
      log('3c. Search input visible', 'PASS');
    } catch (e) {
      log('3c. Search input', 'FAIL', e.message);
    }

    try {
      const guide = modal().locator('text=Type a podcast name, host, or topic to search');
      log('3d. Guidance text', await guide.isVisible() ? 'PASS' : 'FAIL');
    } catch (e) {
      log('3d. Guidance text', 'FAIL', e.message);
    }

    screenshots.push(await screenshot(page, '03-modal-open.png'));

    // ============================================================
    // STEP 4: Short query (<2 chars)
    // ============================================================
    log('4. Short query test (<2 chars)', 'INFO');

    try {
      const input = modal().locator('input');
      await input.fill('a');
      await page.waitForTimeout(700);
      const still = await modal().locator('text=Type a podcast name, host, or topic to search').isVisible();
      log('4a. Single char: no search triggered', still ? 'PASS' : 'FAIL');
      screenshots.push(await screenshot(page, '04-short-query.png'));
    } catch (e) {
      log('4a. Short query', 'FAIL', e.message);
    }

    // ============================================================
    // STEP 5: Search "technology"
    // ============================================================
    log('5. Search "technology"', 'INFO');

    try {
      const input = modal().locator('input');
      await input.fill('');
      await input.fill('technology');

      try {
        await modal().locator('text=Searching...').waitFor({ state: 'visible', timeout: 3000 });
        log('5a. Search spinner', 'PASS');
        screenshots.push(await screenshot(page, '05-searching.png'));
      } catch (e) {
        log('5a. Search spinner', 'INFO', 'Too fast to catch');
      }

      // Wait for show results: look for images inside the modal (show artworks)
      await page.waitForFunction(() => {
        const m = document.querySelector('.fixed.inset-0 .fade-in');
        if (!m) return false;
        // In shows view, images exist inside show card buttons
        return m.querySelectorAll('img').length > 0;
      }, { timeout: 20000 });

      log('5b. Search results loaded', 'PASS');
      screenshots.push(await screenshot(page, '06-search-results.png'));
    } catch (e) {
      log('5b. Search results', 'FAIL', e.message);
      screenshots.push(await screenshot(page, '06-search-results-fail.png'));
    }

    // ============================================================
    // STEP 6: Show card structure
    // ============================================================
    log('6. Show card structure', 'INFO');

    try {
      // Show cards: buttons that contain an img inside the modal
      const cards = await page.evaluate(() => {
        const m = document.querySelector('.fixed.inset-0 .fade-in');
        if (!m) return [];
        const scroll = m.querySelector('.overflow-y-auto');
        if (!scroll) return [];
        const btns = scroll.querySelectorAll(':scope > button');
        return Array.from(btns).map(btn => {
          const img = btn.querySelector('img');
          const pEls = btn.querySelectorAll('p');
          return {
            hasImage: !!img,
            imgSrc: img?.src?.substring(0, 80) || '',
            title: pEls[0]?.textContent?.trim() || '',
            author: pEls[1]?.textContent?.trim() || '',
            meta: pEls[2]?.textContent?.trim() || '',
          };
        });
      });

      log('6a. Show card count', cards.length > 0 ? 'PASS' : 'FAIL', `${cards.length} cards`);

      if (cards.length > 0) {
        const c = cards[0];
        log('6b. Artwork image', c.hasImage ? 'PASS' : 'FAIL');
        log('6c. Title', c.title.length > 0 ? 'PASS' : 'FAIL', `"${c.title.substring(0, 60)}"`);
        log('6d. Author', c.author.length > 0 ? 'PASS' : 'FAIL', `"${c.author.substring(0, 60)}"`);
        log('6e. Episode count/meta', c.meta.includes('episode') ? 'PASS' : 'FAIL', `"${c.meta.substring(0, 80)}"`);
      }
    } catch (e) {
      log('6. Show cards', 'FAIL', e.message);
    }

    // ============================================================
    // STEP 7: Click show, browse episodes
    // ============================================================
    log('7. Click show to browse episodes', 'INFO');

    try {
      // Get first show card in the scrollable area
      const showTitle = await page.evaluate(() => {
        const m = document.querySelector('.fixed.inset-0 .fade-in');
        const scroll = m.querySelector('.overflow-y-auto');
        const firstBtn = scroll.querySelector(':scope > button');
        return firstBtn?.querySelector('p')?.textContent?.trim() || 'Unknown';
      });
      log('7a. Selected show', 'INFO', `"${showTitle.substring(0, 60)}"`);

      // Click the first show card using evaluate to bypass overlay issues
      await page.evaluate(() => {
        const m = document.querySelector('.fixed.inset-0 .fade-in');
        const scroll = m.querySelector('.overflow-y-auto');
        const firstBtn = scroll.querySelector(':scope > button');
        if (firstBtn) firstBtn.click();
      });

      // Wait for the view to transition (header changes from "Add Podcast")
      await page.waitForFunction(() => {
        const m = document.querySelector('.fixed.inset-0 .fade-in');
        if (!m) return false;
        const h3 = m.querySelector('h3');
        return h3 && h3.textContent !== 'Add Podcast';
      }, { timeout: 5000 });

      log('7b. Transitioned to episodes view', 'PASS');

      // Now wait for episodes to actually load (could take 30s+ for edge function cold start)
      // The "Loading episodes..." text should disappear
      try {
        screenshots.push(await screenshot(page, '07-episodes-loading.png'));

        const loaded = await page.waitForFunction(() => {
          const m = document.querySelector('.fixed.inset-0 .fade-in');
          if (!m) return false;
          // Loading done: no "Loading episodes..." text visible
          return !m.innerText.includes('Loading episodes...');
        }, { timeout: 45000 });

        log('7c. Episodes finished loading', 'PASS');
      } catch (e) {
        log('7c. Episodes loading timeout', 'FAIL', 'Still showing "Loading episodes..." after 45s - edge function may be slow/down');
      }

      screenshots.push(await screenshot(page, '08-episodes-loaded.png'));

    } catch (e) {
      log('7. Browse episodes', 'FAIL', e.message);
      screenshots.push(await screenshot(page, '08-episodes-fail.png'));
    }

    // ============================================================
    // STEP 8: Episode list structure
    // ============================================================
    log('8. Episode list structure', 'INFO');

    // Use page.evaluate to inspect the modal DOM directly
    const episodeData = await page.evaluate(() => {
      const m = document.querySelector('.fixed.inset-0 .fade-in');
      if (!m) return { error: 'no modal' };

      const h3 = m.querySelector('h3');
      const headerText = h3?.textContent?.trim() || '';

      // by author text
      const byText = Array.from(m.querySelectorAll('p')).find(p => p.textContent.startsWith('by '));
      const byAuthor = byText?.textContent?.trim() || '';

      // Header buttons count
      const headerArea = m.querySelector('.border-b');
      const headerBtns = headerArea ? headerArea.querySelectorAll('button').length : 0;

      // Episode items: look for buttons with text "Add" in the scrollable area
      const scroll = m.querySelector('.overflow-y-auto');
      const addBtns = scroll ? scroll.querySelectorAll('button') : [];
      const addBtnTexts = Array.from(addBtns).map(b => b.textContent.trim());
      const episodeAddBtns = addBtnTexts.filter(t => t.match(/^[\s\S]*Add$/));

      // Get episode details from the first episode
      const allEpTitles = scroll ? scroll.querySelectorAll('p.font-medium') : [];
      const firstEpTitle = allEpTitles[0]?.textContent?.trim() || '';

      // Look for transcript/audio indicators
      const hasTranscript = scroll ? scroll.innerHTML.includes('>Transcript<') : false;
      const hasAudio = scroll ? scroll.innerHTML.includes('>Audio<') : false;

      // Bulk footer - look for "Add All" in the entire modal (not just scroll area)
      const allButtons = m.querySelectorAll('button');
      const bulkInfo = {};
      for (const btn of allButtons) {
        const txt = btn.textContent.trim();
        if (txt.includes('Add All')) bulkInfo.addAll = txt;
        if (txt.includes('All Transcript')) bulkInfo.allTranscript = txt;
        if (txt.includes('Recent')) bulkInfo.recent = txt;
      }

      // Check for error message
      const errEl = m.querySelector('.text-\\[var\\(--error\\)\\]');
      const errorMsg = errEl?.textContent?.trim() || '';

      // Check for "No episodes found"
      const noEps = m.innerText.includes('No episodes found');

      return {
        headerText,
        byAuthor,
        headerBtns,
        episodeAddBtnCount: episodeAddBtns.length,
        firstEpTitle,
        hasTranscript,
        hasAudio,
        bulkInfo,
        errorMsg,
        noEps,
        modalText: m.innerText.substring(0, 500),
      };
    });

    if (episodeData.error) {
      log('8. Episode structure', 'FAIL', 'Modal not found');
    } else {
      log('8a. Header shows title', episodeData.headerText !== 'Add Podcast' ? 'PASS' : 'FAIL',
        `"${episodeData.headerText.substring(0, 60)}"`);
      log('8b. "by author" text', episodeData.byAuthor.length > 0 ? 'PASS' : 'FAIL',
        `"${episodeData.byAuthor}"`);
      log('8c. Header buttons (back+close)', episodeData.headerBtns >= 2 ? 'PASS' : 'FAIL',
        `${episodeData.headerBtns} buttons`);
      log('8d. Episodes with Add buttons', episodeData.episodeAddBtnCount > 0 ? 'PASS' : 'FAIL',
        `${episodeData.episodeAddBtnCount} Add buttons`);

      if (episodeData.episodeAddBtnCount === 0 && !episodeData.noEps) {
        log('8d-detail. Modal text', 'INFO', episodeData.modalText.substring(0, 200));
        if (episodeData.errorMsg) {
          log('8d-error. Error message in modal', 'INFO', episodeData.errorMsg);
        }
      }

      if (episodeData.episodeAddBtnCount > 0) {
        log('8e. First episode title', episodeData.firstEpTitle.length > 0 ? 'PASS' : 'FAIL',
          `"${episodeData.firstEpTitle.substring(0, 70)}"`);
        log('8f. Transcript/Audio indicators', (episodeData.hasTranscript || episodeData.hasAudio) ? 'PASS' : 'FAIL',
          episodeData.hasTranscript ? 'Transcript found' : episodeData.hasAudio ? 'Audio found' : 'Neither');
      }

      // Bulk footer
      log('9a. "Add All" button', episodeData.bulkInfo.addAll ? 'PASS' : 'FAIL',
        episodeData.bulkInfo.addAll || 'not found');
      log('9b. "All Transcript" button', episodeData.bulkInfo.allTranscript ? 'PASS' : 'FAIL',
        episodeData.bulkInfo.allTranscript || 'not found');
      log('9c. "Recent" dropdown', episodeData.bulkInfo.recent ? 'PASS' : 'FAIL',
        episodeData.bulkInfo.recent || 'not found');
    }

    screenshots.push(await screenshot(page, '09-episode-details.png'));

    // Test Recent dropdown if present
    if (episodeData.bulkInfo?.recent) {
      log('9d. Test Recent dropdown', 'INFO');
      try {
        await page.evaluate(() => {
          const m = document.querySelector('.fixed.inset-0 .fade-in');
          const btns = m.querySelectorAll('button');
          for (const btn of btns) {
            if (btn.textContent.trim().startsWith('Recent')) {
              btn.click();
              break;
            }
          }
        });
        await page.waitForTimeout(300);

        const dropdownOptions = await page.evaluate(() => {
          const m = document.querySelector('.fixed.inset-0 .fade-in');
          const abs = m.querySelector('.absolute');
          if (!abs) return [];
          return Array.from(abs.querySelectorAll('button')).map(b => b.textContent.trim());
        });

        log('9e. Dropdown options', dropdownOptions.length > 0 ? 'PASS' : 'FAIL',
          dropdownOptions.join(', ') || 'none');

        screenshots.push(await screenshot(page, '10-recent-dropdown.png'));

        // Close dropdown
        await page.evaluate(() => {
          const m = document.querySelector('.fixed.inset-0 .fade-in');
          const h3 = m.querySelector('h3');
          if (h3) h3.click();
        });
        await page.waitForTimeout(200);
      } catch (e) {
        log('9d. Recent dropdown', 'FAIL', e.message);
      }
    }

    // ============================================================
    // STEP 10: Back to shows
    // ============================================================
    log('10. Back to shows list', 'INFO');

    try {
      // Click the first button in header (back button)
      await page.evaluate(() => {
        const m = document.querySelector('.fixed.inset-0 .fade-in');
        const header = m.querySelector('.border-b');
        const firstBtn = header.querySelector('button');
        if (firstBtn) firstBtn.click();
      });
      await page.waitForTimeout(500);

      const headerText = await page.evaluate(() => {
        const m = document.querySelector('.fixed.inset-0 .fade-in');
        return m?.querySelector('h3')?.textContent?.trim() || '';
      });
      log('10a. Back to shows', headerText === 'Add Podcast' ? 'PASS' : 'FAIL', `Header: "${headerText}"`);

      const inputVal = await modal().locator('input').inputValue();
      log('10b. Query preserved', inputVal === 'technology' ? 'PASS' : 'FAIL', `"${inputVal}"`);

      const cardCount = await page.evaluate(() => {
        const m = document.querySelector('.fixed.inset-0 .fade-in');
        const scroll = m?.querySelector('.overflow-y-auto');
        return scroll ? scroll.querySelectorAll('img').length : 0;
      });
      log('10c. Show cards still present', cardCount > 0 ? 'PASS' : 'FAIL', `${cardCount} cards`);

      screenshots.push(await screenshot(page, '11-back-to-shows.png'));
    } catch (e) {
      log('10. Back navigation', 'FAIL', e.message);
    }

    // ============================================================
    // STEP 11: No results search
    // ============================================================
    log('11. No-results search', 'INFO');

    try {
      const input = modal().locator('input');
      await input.fill('');
      await input.fill('zzzxxx99nonexistent');
      await page.waitForTimeout(700);

      // Wait for search to complete
      try {
        await modal().locator('text=Searching...').waitFor({ state: 'visible', timeout: 2000 });
      } catch (e) { /* fast */ }
      try {
        await page.waitForFunction(() => {
          const m = document.querySelector('.fixed.inset-0 .fade-in');
          return m && !m.innerText.includes('Searching...');
        }, { timeout: 15000 });
      } catch (e) { /* */ }

      const noResults = await modal().locator('text=No podcasts found').isVisible().catch(() => false);
      log('11a. "No podcasts found"', noResults ? 'PASS' : 'FAIL');
      screenshots.push(await screenshot(page, '12-no-results.png'));
    } catch (e) {
      log('11. No results', 'FAIL', e.message);
    }

    // ============================================================
    // STEP 12: Close modal via X
    // ============================================================
    log('12. Close modal via X', 'INFO');

    try {
      await page.evaluate(() => {
        const m = document.querySelector('.fixed.inset-0 .fade-in');
        const header = m.querySelector('.border-b');
        const btns = header.querySelectorAll('button');
        btns[btns.length - 1].click(); // last button is X
      });
      await page.waitForTimeout(500);

      const gone = await page.evaluate(() => !document.querySelector('.fixed.inset-0 .fade-in'));
      log('12a. Modal closed', gone ? 'PASS' : 'FAIL');
      screenshots.push(await screenshot(page, '13-modal-closed.png'));
    } catch (e) {
      log('12. Close modal', 'FAIL', e.message);
    }

    // ============================================================
    // STEP 13: Backdrop click
    // ============================================================
    log('13. Backdrop click close', 'INFO');

    try {
      await page.evaluate(() => window.dispatchEvent(new CustomEvent('podbrain:add-podcast')));
      await modal().waitFor({ state: 'visible', timeout: 5000 });

      // Click top-left corner (outside modal card)
      await page.mouse.click(10, 10);
      await page.waitForTimeout(500);

      const gone = await page.evaluate(() => !document.querySelector('.fixed.inset-0 .fade-in'));
      log('13a. Backdrop click closes modal', gone ? 'PASS' : 'FAIL');
      screenshots.push(await screenshot(page, '14-backdrop-close.png'));
    } catch (e) {
      log('13. Backdrop close', 'FAIL', e.message);
    }

    // ============================================================
    // STEP 14: UX observations
    // ============================================================
    log('14. Visual/UX observations', 'INFO');

    await page.evaluate(() => window.dispatchEvent(new CustomEvent('podbrain:add-podcast')));
    await modal().waitFor({ state: 'visible', timeout: 5000 });

    try {
      const box = await modal().boundingBox();
      if (box) {
        log('14a. Modal dimensions', 'INFO',
          `${Math.round(box.width)}x${Math.round(box.height)}px at (${Math.round(box.x)}, ${Math.round(box.y)})`);
        log('14b. Centered', Math.abs(box.x + box.width / 2 - 640) < 50 ? 'PASS' : 'FAIL');
      }
    } catch (e) {
      log('14a. Dimensions', 'FAIL', e.message);
    }

    // Search for UX checks
    try {
      const input = modal().locator('input');
      await input.fill('technology');
      await page.waitForTimeout(700);
      await page.waitForFunction(() => {
        const m = document.querySelector('.fixed.inset-0 .fade-in');
        return m && m.querySelectorAll('img').length > 0;
      }, { timeout: 15000 });

      // Artwork loading
      const imgStats = await page.evaluate(() => {
        const m = document.querySelector('.fixed.inset-0 .fade-in');
        const imgs = m.querySelectorAll('img');
        let broken = 0;
        for (const img of imgs) { if (img.naturalWidth === 0) broken++; }
        return { total: imgs.length, broken };
      });
      log('14c. Artwork loaded', imgStats.broken === 0 ? 'PASS' : 'FAIL',
        `${imgStats.total} total, ${imgStats.broken} broken`);

      // Scrollability
      const scrollInfo = await page.evaluate(() => {
        const m = document.querySelector('.fixed.inset-0 .fade-in');
        const scroll = m?.querySelector('.overflow-y-auto');
        if (!scroll) return { scrollHeight: 0, clientHeight: 0, scrollable: false };
        return {
          scrollHeight: scroll.scrollHeight,
          clientHeight: scroll.clientHeight,
          scrollable: scroll.scrollHeight > scroll.clientHeight,
        };
      });
      log('14d. Scrollability', 'INFO',
        `content=${scrollInfo.scrollHeight}px, visible=${scrollInfo.clientHeight}px, scrollable=${scrollInfo.scrollable}`);

      // Line-clamp truncation
      const clampCount = await page.evaluate(() => {
        const m = document.querySelector('.fixed.inset-0 .fade-in');
        return m ? m.querySelectorAll('.line-clamp-1').length : 0;
      });
      log('14e. Text truncation (line-clamp-1)', 'INFO', `${clampCount} elements`);

      screenshots.push(await screenshot(page, '15-ux-observations.png'));
    } catch (e) {
      log('14. UX checks', 'FAIL', e.message);
    }

    // Close
    try {
      await page.evaluate(() => {
        const m = document.querySelector('.fixed.inset-0 .fade-in');
        if (m) {
          const header = m.querySelector('.border-b');
          const btns = header.querySelectorAll('button');
          btns[btns.length - 1].click();
        }
      });
      await page.waitForTimeout(300);
    } catch (e) { /* ignore */ }

    // ============================================================
    // STEP 15: Sidebar check
    // ============================================================
    log('15. Sidebar check', 'INFO');

    try {
      const sidebar = page.locator('aside');
      log('15a. Library nav', await sidebar.getByRole('button', { name: 'Library' }).isVisible() ? 'PASS' : 'FAIL');
      log('15b. Search nav', await sidebar.getByRole('button', { name: 'Search', exact: true }).isVisible() ? 'PASS' : 'FAIL');
      log('15c. Discover nav', await sidebar.getByRole('button', { name: 'Discover' }).isVisible() ? 'PASS' : 'FAIL');
      log('15d. KB section', await sidebar.locator('text=Knowledge Bases').isVisible() ? 'PASS' : 'FAIL');
      log('15e. Hours indexed', await sidebar.locator('text=/h indexed/').isVisible().catch(() => false) ? 'PASS' : 'FAIL');
      screenshots.push(await screenshot(page, '16-sidebar.png'));
    } catch (e) {
      log('15. Sidebar', 'FAIL', e.message);
    }

    screenshots.push(await screenshot(page, '17-final-state.png'));

  } catch (e) {
    log('UNEXPECTED ERROR', 'FAIL', e.message + '\n' + e.stack);
    screenshots.push(await screenshot(page, '99-error-state.png'));
  } finally {
    await browser.close();
  }

  // ============ Summary ============
  console.log('\n============ TEST SUMMARY ============');
  const passes = results.filter(r => r.status === 'PASS').length;
  const fails = results.filter(r => r.status === 'FAIL').length;
  const infos = results.filter(r => r.status === 'INFO').length;
  console.log(`PASS: ${passes} | FAIL: ${fails} | INFO: ${infos}`);
  console.log(`Screenshots: ${screenshots.length}`);
  console.log(`Console errors: ${consoleMessages.filter(m => m.type === 'error').length}`);
  console.log(`Page errors: ${pageErrors.length}`);
  console.log(`Network requests tracked: ${networkRequests.length}`);

  if (pageErrors.length > 0) {
    console.log('\n--- Page Errors ---');
    pageErrors.forEach(e => console.log(`  ${e.message}`));
  }

  if (fails > 0) {
    console.log('\n--- Failures ---');
    results.filter(r => r.status === 'FAIL').forEach(r =>
      console.log(`  ${r.step}: ${r.detail}`)
    );
  }

  // Network requests summary
  console.log('\n--- Edge Function Requests ---');
  networkRequests.filter(r => r.url.includes('functions/v1')).forEach(r =>
    console.log(`  ${r.method} ${r.url.split('functions/v1/')[1] || r.url} -> ${r.status}`)
  );

  const reportPath = path.join(SCREENSHOT_DIR, 'test-report.json');
  fs.writeFileSync(reportPath, JSON.stringify({
    results,
    consoleMessages,
    pageErrors,
    networkRequests,
    screenshots,
    summary: { passes, fails, infos },
  }, null, 2));
  console.log(`\nFull report: ${reportPath}`);
})();
