const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const RESULTS_DIR = path.join(__dirname, '..', 'test-results');
const BASE_URL = 'http://localhost:5173';

if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });

let stepNum = 0;
const log = [];
const consoleErrors = [];
const bugs = [];
const screenshots = [];

function logStep(msg) {
  stepNum++;
  const prefix = `[Step ${String(stepNum).padStart(2, '0')}]`;
  console.log(`${prefix} ${msg}`);
  log.push(`${prefix} ${msg}`);
}
function logBug(severity, desc) {
  bugs.push({ severity, desc });
  console.log(`  BUG [${severity}]: ${desc}`);
  log.push(`  BUG [${severity}]: ${desc}`);
}
function logInfo(msg) {
  console.log(`  -> ${msg}`);
  log.push(`  -> ${msg}`);
}
async function shot(page, desc) {
  const num = String(screenshots.length + 1).padStart(2, '0');
  const name = `home-${num}-${desc}.png`;
  await page.screenshot({ path: path.join(RESULTS_DIR, name), fullPage: true });
  screenshots.push(name);
  logInfo(`Screenshot: ${name}`);
  return name;
}

// Helper: dismiss any overlay / command palette that might be open
async function dismissOverlays(page) {
  // Press Escape a couple times to close any modal/palette
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => {
    consoleErrors.push(`PAGE ERROR: ${err.message}`);
  });

  try {
    // ========================================================
    // 1. HOME PAGE LOAD
    // ========================================================
    logStep('Navigate to home page');
    const navStart = Date.now();
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
    logInfo(`Page loaded in ${Date.now() - navStart}ms`);

    logStep('Wait for app to finish loading');
    try {
      await page.waitForSelector('aside', { timeout: 10000 });
      // Wait for "Loading..." to disappear if present
      try {
        await page.waitForFunction(
          () => {
            const mainEl = document.querySelector('main');
            return mainEl && !mainEl.textContent.includes('Loading...');
          },
          { timeout: 10000 }
        );
      } catch (_) { /* no loading state or already loaded */ }
    } catch (e) {
      logInfo(`Sidebar wait: ${e.message}`);
    }
    await page.waitForTimeout(1500);
    await shot(page, 'initial-load');

    // Check layout
    logStep('Verify layout: sidebar left, main right');
    const sidebarBox = await page.$eval('aside', el => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    }).catch(() => null);
    const mainBox = await page.$eval('main', el => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    }).catch(() => null);

    if (sidebarBox && sidebarBox.w > 0) {
      logInfo(`PASS: Sidebar visible (${sidebarBox.w}x${sidebarBox.h} at x=${sidebarBox.x})`);
    } else {
      logBug('critical', 'Sidebar not visible');
    }
    if (mainBox && mainBox.w > 0) {
      logInfo(`PASS: Main content visible (${mainBox.w}x${mainBox.h} at x=${mainBox.x})`);
    } else {
      logBug('critical', 'Main content not visible');
    }
    if (sidebarBox && mainBox && sidebarBox.x < mainBox.x) {
      logInfo('PASS: Sidebar is to the left of main content');
    } else if (sidebarBox && mainBox) {
      logBug('major', `Layout wrong: sidebar x=${sidebarBox.x}, main x=${mainBox.x}`);
    }

    // KB section
    logStep('Check Knowledge Bases section on home');
    const kbHeader = await page.$('text=Knowledge Bases');
    logInfo(`KB section header: ${kbHeader ? 'FOUND' : 'MISSING'}`);
    const kbCardCount = await page.$$eval(
      'button h3',
      els => els.map(e => e.textContent)
    ).catch(() => []);
    logInfo(`KB cards found: ${kbCardCount.length} — names: ${kbCardCount.join(', ')}`);

    // Recent podcasts
    logStep('Check Recent Podcasts section');
    const podHeader = await page.$('text=Recent podcasts');
    logInfo(`Recent podcasts header: ${podHeader ? 'FOUND' : 'MISSING'}`);
    const podcastTitles = await page.$$eval(
      'main div.truncate',
      els => els.map(e => e.textContent)
    ).catch(() => []);
    logInfo(`Podcast items: ${podcastTitles.length}`);
    podcastTitles.forEach((t, i) => logInfo(`  ${i + 1}. ${t}`));

    // Console errors
    logStep('Check console errors on load');
    if (consoleErrors.length > 0) {
      logInfo(`${consoleErrors.length} console error(s):`);
      consoleErrors.forEach((e, i) => logInfo(`  ${i + 1}: ${e.substring(0, 200)}`));
    } else {
      logInfo('PASS: No console errors');
    }

    // ========================================================
    // 2. SIDEBAR
    // ========================================================
    logStep('Verify sidebar contents');
    const sidebarKB = await page.$('aside >> text=Knowledge Bases');
    const navLibrary = await page.$('aside >> text=Library');
    const navSearch = await page.$('aside >> text=Search');
    const navDiscover = await page.$('aside >> text=Discover');
    const hoursText = await page.$eval('aside', el => {
      const m = el.textContent.match(/[\d.]+\s*h\s*indexed/);
      return m ? m[0] : null;
    }).catch(() => null);
    const poweredBy = await page.$('aside >> text=Powered by Podcast Index');

    logInfo(`Sidebar "Knowledge Bases" label: ${sidebarKB ? 'FOUND' : 'MISSING'}`);
    logInfo(`Library nav: ${navLibrary ? 'FOUND' : 'MISSING'}`);
    logInfo(`Search nav: ${navSearch ? 'FOUND' : 'MISSING'}`);
    logInfo(`Discover nav: ${navDiscover ? 'FOUND' : 'MISSING'}`);
    logInfo(`Hours stat: ${hoursText || 'MISSING'}`);
    logInfo(`Powered by link: ${poweredBy ? 'FOUND' : 'MISSING'}`);
    if (!sidebarKB) logBug('major', 'Sidebar missing KB section');
    if (!navLibrary) logBug('major', 'Sidebar missing Library link');
    if (!navSearch) logBug('major', 'Sidebar missing Search link');
    if (!navDiscover) logBug('major', 'Sidebar missing Discover link');
    await shot(page, 'sidebar-contents');

    // Nav link testing: use page.goto to avoid the "/" shortcut issue,
    // but ALSO test click behavior to detect the bug
    logStep('Click Library nav and verify route');
    await navLibrary.click();
    await page.waitForTimeout(500);
    logInfo(`URL after Library click: ${page.url()}`);
    const libOk = page.url() === BASE_URL + '/' || page.url() === BASE_URL;
    logInfo(libOk ? 'PASS: Library -> /' : `FAIL: Library -> ${page.url()}`);

    logStep('Click Search nav and verify route');
    // Clicking "Search" text triggers the '/' shortcut handler in Layout.jsx
    // because the click removes focus from the button, and the browser sees '/'
    // Let's test the actual click behavior
    await dismissOverlays(page);
    await navSearch.click({ timeout: 5000 });
    await page.waitForTimeout(800);
    const searchUrl = page.url();
    logInfo(`URL after Search click: ${searchUrl}`);
    if (searchUrl.endsWith('/search')) {
      logInfo('PASS: Search navigates to /search');
    } else {
      logBug('minor', `Search click navigated to ${searchUrl} instead of /search — command palette likely intercepted`);
      // Check if command palette opened instead
      const paletteVisible = await page.$('input[placeholder*="Search KBs"]');
      if (paletteVisible) {
        logInfo('NOTE: Command palette opened instead of navigating to /search — "/" shortcut conflict');
        logBug('major', 'Clicking "Search" in sidebar triggers "/" keyboard shortcut, opening command palette instead of navigating');
      }
    }
    await dismissOverlays(page);
    await shot(page, 'after-search-click');

    logStep('Click Discover nav and verify route');
    await dismissOverlays(page);
    // Use force click to bypass any overlay remnants
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1000);
    const discoverBtn = await page.$('aside >> text=Discover');
    if (discoverBtn) {
      await discoverBtn.click({ timeout: 5000 });
      await page.waitForTimeout(800);
      const discUrl = page.url();
      logInfo(`URL after Discover click: ${discUrl}`);
      if (discUrl.endsWith('/discover')) {
        logInfo('PASS: Discover navigates to /discover');
      } else {
        logBug('minor', `Discover click navigated to ${discUrl} instead of /discover`);
      }
      await shot(page, 'discover-page');
    }

    // ========================================================
    // 2b. SIDEBAR MOBILE
    // ========================================================
    logStep('Test sidebar on narrow viewport (375px)');
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1000);
    await page.setViewportSize({ width: 375, height: 800 });
    await page.waitForTimeout(800);
    await shot(page, 'mobile-viewport');

    // Check sidebar hidden
    const sidebarMobileBox = await page.$eval('aside', el => {
      const r = el.getBoundingClientRect();
      return { x: r.x, w: r.width, right: r.right };
    }).catch(() => null);
    if (sidebarMobileBox && sidebarMobileBox.right <= 0) {
      logInfo('PASS: Sidebar hidden off-screen on mobile');
    } else if (sidebarMobileBox) {
      logInfo(`Sidebar position on mobile: x=${sidebarMobileBox.x}, right=${sidebarMobileBox.right}`);
      if (sidebarMobileBox.x < 0) {
        logInfo('PASS: Sidebar is off-screen (translated left)');
      } else {
        logBug('minor', 'Sidebar visible on mobile when it should be hidden');
      }
    }

    // Check hamburger
    const hamburger = await page.$('button:has(svg path[d*="M4 6h16"])');
    if (hamburger) {
      logInfo('PASS: Hamburger menu button found');
      await hamburger.click();
      await page.waitForTimeout(600);
      await shot(page, 'mobile-sidebar-open');

      const sidebarOpenBox = await page.$eval('aside', el => {
        const r = el.getBoundingClientRect();
        return { x: r.x, w: r.width };
      }).catch(() => null);
      if (sidebarOpenBox && sidebarOpenBox.x >= 0) {
        logInfo('PASS: Sidebar slides in on hamburger click');
      } else {
        logBug('major', 'Sidebar did not open after hamburger click');
      }

      // Check overlay
      const overlay = await page.$('div.fixed.inset-0');
      logInfo(`Mobile overlay: ${overlay ? 'FOUND' : 'not detected'}`);

      // Close sidebar
      await page.keyboard.press('Escape');
      await page.waitForTimeout(400);
      // If Escape didn't close, click somewhere outside
      const stillOpen = await page.$eval('aside', el => el.getBoundingClientRect().x >= 0).catch(() => false);
      if (stillOpen) {
        // Try clicking overlay or navigating
        await page.click('main', { force: true }).catch(() => {});
        await page.waitForTimeout(400);
      }
      await shot(page, 'mobile-sidebar-closed');
    } else {
      logBug('major', 'Hamburger menu NOT found on mobile');
    }

    // Reset viewport
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.waitForTimeout(500);

    // ========================================================
    // 3. KNOWLEDGE BASE CRUD
    // ========================================================
    logStep('Test KB creation: find New KB button');
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1500);

    let newKBBtn = await page.$('text=New KB');
    if (!newKBBtn) newKBBtn = await page.$('text=Create your first knowledge base');
    if (!newKBBtn) newKBBtn = await page.$('aside button[title="New KB"]');

    if (newKBBtn) {
      const btnText = await newKBBtn.textContent();
      logInfo(`PASS: New KB button found: "${btnText.trim()}"`);

      logStep('Click New KB and verify modal');
      await newKBBtn.click();
      await page.waitForTimeout(600);

      const modalTitle = await page.$('text=New Knowledge Base');
      if (modalTitle) {
        logInfo('PASS: CreateKBModal opened');
        await shot(page, 'create-kb-modal');

        const nameInput = await page.$('input[placeholder*="AI Startups"]');
        const descArea = await page.$('textarea[placeholder*="topics"]');
        const createBtn = await page.$('button:has-text("Create")');
        const cancelBtn = await page.$('button:has-text("Cancel")');
        logInfo(`Name input: ${nameInput ? 'FOUND' : 'MISSING'}`);
        logInfo(`Description textarea: ${descArea ? 'FOUND' : 'MISSING'}`);
        logInfo(`Create button: ${createBtn ? 'FOUND' : 'MISSING'}`);
        logInfo(`Cancel button: ${cancelBtn ? 'FOUND' : 'MISSING'}`);
        if (!nameInput) logBug('major', 'Modal missing name input');

        // Fill and create
        logStep('Fill KB form and create');
        const testName = `QA Test ${Date.now()}`;
        if (nameInput) await nameInput.fill(testName);
        if (descArea) await descArea.fill('Automated QA test KB');
        logInfo(`Filled name: "${testName}"`);

        if (createBtn) {
          const createErrsBefore = consoleErrors.length;
          await createBtn.click();
          await page.waitForTimeout(2500);

          const modalGone = !(await page.$('text=New Knowledge Base'));
          if (modalGone) {
            logInfo('PASS: Modal closed after creation');
          } else {
            logBug('major', 'Modal stayed open after Create click');
            await shot(page, 'modal-stuck');
          }

          const createErrs = consoleErrors.slice(createErrsBefore);
          if (createErrs.length > 0) {
            logInfo(`Console errors during creation: ${createErrs.length}`);
            createErrs.forEach(e => logInfo(`  ${e.substring(0, 150)}`));
          }

          // Check sidebar
          await page.waitForTimeout(500);
          const inSidebar = await page.$(`aside >> text=${testName}`);
          logInfo(`New KB in sidebar: ${inSidebar ? 'FOUND' : 'NOT FOUND'}`);

          // Check main content
          const inMain = await page.$(`text=${testName}`);
          logInfo(`New KB in main: ${inMain ? 'FOUND' : 'NOT FOUND'}`);

          await shot(page, 'after-kb-creation');

          // Click into KB
          logStep('Click into new KB page');
          const kbLink = await page.$(`text=${testName}`);
          if (kbLink) {
            await kbLink.click();
            await page.waitForTimeout(2000);
            logInfo(`URL: ${page.url()}`);
            if (page.url().includes('/kb/')) {
              logInfo('PASS: Navigated to KB detail');
            }
            await shot(page, 'kb-detail');
          }
        }
      } else {
        logBug('critical', 'CreateKBModal did not open');
        await shot(page, 'modal-not-open');
      }
    } else {
      logBug('critical', 'No New KB button found');
    }

    // ========================================================
    // 4. PODCAST CARDS ON HOME
    // ========================================================
    logStep('Check podcast card rendering');
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1500);

    // Get podcast card info
    const cardDetails = await page.$$eval('main button[class*="flex items-center gap"]', buttons => {
      return buttons.slice(0, 5).map(btn => {
        const img = btn.querySelector('img');
        const title = btn.querySelector('div.truncate, div[class*="truncate"]');
        const channel = btn.querySelector('div[class*="dim"]');
        const monoSpans = btn.querySelectorAll('span[class*="mono"]');
        return {
          hasThumb: !!img,
          thumbSrc: img?.src?.substring(0, 60) || null,
          title: title?.textContent || null,
          channel: channel?.textContent || null,
          monoTexts: Array.from(monoSpans).map(s => s.textContent),
        };
      });
    }).catch(() => []);

    logInfo(`Podcast cards examined: ${cardDetails.length}`);
    cardDetails.forEach((c, i) => {
      logInfo(`  Card ${i + 1}: title="${c.title}" channel="${c.channel}" thumb=${c.hasThumb} mono=[${c.monoTexts.join(', ')}]`);
    });

    if (cardDetails.length > 0) {
      // Check StatusPip presence (the status-pip is a small circle span)
      const statusPips = await page.$$eval('main button span[class*="rounded-full"], main button span:has-text("pending"), main button span:has-text("ready")', els => els.length).catch(() => 0);
      logInfo(`Status indicators detected: ${statusPips}`);

      // Check arrow indicators
      const arrows = await page.$$eval('main button svg', els => els.length).catch(() => 0);
      logInfo(`SVG icons in cards: ${arrows}`);

      await shot(page, 'podcast-cards');

      // Click first podcast
      logStep('Click first podcast card');
      const firstPod = await page.$('main button[class*="flex items-center gap"]');
      if (firstPod) {
        const podTitle = cardDetails[0]?.title || 'first';
        logInfo(`Clicking: "${podTitle}"`);
        await firstPod.click();
        await page.waitForTimeout(2000);
        logInfo(`URL: ${page.url()}`);
        if (page.url().includes('/podcast/')) {
          logInfo('PASS: Navigated to podcast detail');
        } else {
          logBug('minor', `Podcast click went to ${page.url()}`);
        }
        await shot(page, 'podcast-detail');

        // Navigate back
        logStep('Navigate back to home');
        await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 15000 });
        await page.waitForTimeout(1000);
        logInfo(`Back at: ${page.url()}`);
      }
    } else {
      logInfo('No podcast cards to test (empty library)');
      await shot(page, 'no-podcasts');
    }

    // ========================================================
    // 5. COMMAND PALETTE
    // ========================================================
    logStep('Test Command Palette (Ctrl+K)');
    await dismissOverlays(page);
    await page.waitForTimeout(300);
    // Focus on main to avoid input interference
    await page.click('main', { position: { x: 500, y: 400 } }).catch(() => {});
    await page.waitForTimeout(200);
    await page.keyboard.press('Control+k');
    await page.waitForTimeout(600);

    const paletteInput = await page.$('input[placeholder*="Search KBs"]');
    if (paletteInput) {
      logInfo('PASS: Command palette opened');
      const placeholder = await paletteInput.getAttribute('placeholder');
      logInfo(`Palette placeholder: "${placeholder}"`);
      await shot(page, 'command-palette-open');

      // Close with Escape
      await page.keyboard.press('Escape');
      await page.waitForTimeout(400);
      const still = await page.$('input[placeholder*="Search KBs"]');
      const stillVisible = still ? await still.boundingBox() : null;
      if (!stillVisible) {
        logInfo('PASS: Palette closed with Escape');
      } else {
        logBug('minor', 'Palette still visible after Escape');
      }
    } else {
      // Try other selectors
      const anyPaletteInput = await page.$('input[placeholder*="search"], input[placeholder*="Search"]');
      if (anyPaletteInput) {
        logInfo('Command palette found with alternate selector');
        await shot(page, 'command-palette-open');
        await page.keyboard.press('Escape');
        await page.waitForTimeout(400);
      } else {
        logBug('major', 'Command palette did not open on Ctrl+K');
        await shot(page, 'palette-not-open');
      }
    }
    await dismissOverlays(page);

    // ========================================================
    // 6. ROUTE TESTING
    // ========================================================
    logStep('Route: / (home)');
    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1000);
    const homeH1 = await page.$eval('h1', el => el.textContent).catch(() => null);
    logInfo(`URL: ${page.url()} | h1: "${homeH1?.substring(0, 60) || 'none'}"`);
    await shot(page, 'route-home');

    logStep('Route: /search');
    await page.goto(`${BASE_URL}/search`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1000);
    const searchContent = await page.$eval('main', el => el.textContent.substring(0, 100).trim()).catch(() => 'empty');
    logInfo(`URL: ${page.url()} | content: "${searchContent}"`);
    await shot(page, 'route-search');

    logStep('Route: /discover');
    await page.goto(`${BASE_URL}/discover`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1000);
    const discContent = await page.$eval('main', el => el.textContent.substring(0, 100).trim()).catch(() => 'empty');
    logInfo(`URL: ${page.url()} | content: "${discContent}"`);
    await shot(page, 'route-discover');

    logStep('Route: /profile');
    await page.goto(`${BASE_URL}/profile`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1000);
    const profContent = await page.$eval('main', el => el.textContent.substring(0, 100).trim()).catch(() => 'empty');
    logInfo(`URL: ${page.url()} | content: "${profContent}"`);
    await shot(page, 'route-profile');

    logStep('Route: /kb/nonexistent-uuid');
    const errBefore1 = consoleErrors.length;
    await page.goto(`${BASE_URL}/kb/nonexistent-uuid`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1500);
    const kbBadContent = await page.$eval('main', el => el.textContent.substring(0, 150).trim()).catch(() => 'empty');
    logInfo(`URL: ${page.url()} | content: "${kbBadContent}"`);
    const kbBadErrs = consoleErrors.slice(errBefore1);
    if (kbBadErrs.length) logInfo(`Console errors: ${kbBadErrs.length}`);
    kbBadErrs.forEach(e => logInfo(`  ${e.substring(0, 150)}`));
    await shot(page, 'route-kb-bad');

    logStep('Route: /podcast/nonexistent-uuid');
    const errBefore2 = consoleErrors.length;
    await page.goto(`${BASE_URL}/podcast/nonexistent-uuid`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1500);
    const podBadContent = await page.$eval('main', el => el.textContent.substring(0, 150).trim()).catch(() => 'empty');
    logInfo(`URL: ${page.url()} | content: "${podBadContent}"`);
    const podBadErrs = consoleErrors.slice(errBefore2);
    if (podBadErrs.length) logInfo(`Console errors: ${podBadErrs.length}`);
    podBadErrs.forEach(e => logInfo(`  ${e.substring(0, 150)}`));
    await shot(page, 'route-podcast-bad');

    // ========================================================
    // SUMMARY
    // ========================================================
    console.log('\n========================================');
    console.log('TEST RUN COMPLETE');
    console.log(`Steps: ${stepNum} | Screenshots: ${screenshots.length} | Errors: ${consoleErrors.length} | Bugs: ${bugs.length}`);
    console.log('========================================');
    bugs.forEach((b, i) => console.log(`  ${i + 1}. [${b.severity}] ${b.desc}`));
    console.log('========================================\n');

    fs.writeFileSync(
      path.join(RESULTS_DIR, 'test-report.json'),
      JSON.stringify({ timestamp: new Date().toISOString(), stepsExecuted: stepNum, screenshotsTaken: screenshots, consoleErrors, bugs, log }, null, 2)
    );
    console.log('Report: test-results/test-report.json');

  } catch (e) {
    console.error('FATAL:', e.message);
    log.push(`FATAL: ${e.message}`);
    try { await shot(page, 'fatal-error'); } catch (_) {}
    fs.writeFileSync(
      path.join(RESULTS_DIR, 'test-report.json'),
      JSON.stringify({ timestamp: new Date().toISOString(), fatalError: e.message, stepsExecuted: stepNum, screenshotsTaken: screenshots, consoleErrors, bugs, log }, null, 2)
    );
  } finally {
    await browser.close();
  }
})();
