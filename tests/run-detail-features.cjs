const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const RESULTS_DIR = path.join(__dirname, '..', 'test-results');
const BASE_URL = 'http://localhost:5173';
let screenshotIdx = 0;
const findings = [];
const consoleErrors = [];
const screenshots = [];

async function screenshot(page, desc) {
  screenshotIdx++;
  const num = String(screenshotIdx).padStart(2, '0');
  const name = `detail-${num}-${desc}.png`;
  const filePath = path.join(RESULTS_DIR, name);
  await page.screenshot({ path: filePath, fullPage: true });
  screenshots.push(name);
  console.log(`  [screenshot] ${name}`);
  return name;
}

function finding(severity, title, detail) {
  findings.push({ severity, title, detail });
  console.log(`  [${severity}] ${title}: ${detail}`);
}

function log(msg) {
  console.log(`  > ${msg}`);
}

(async () => {
  // Ensure results dir
  fs.mkdirSync(RESULTS_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  // Capture console errors
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push({ text: msg.text(), url: page.url() });
    }
  });
  page.on('pageerror', err => {
    consoleErrors.push({ text: err.message, url: page.url() });
  });

  try {
    // ============================================================
    // STEP 1: Navigate to home and find podcasts
    // ============================================================
    console.log('\n=== STEP 1: Navigate to home page ===');
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(2000); // Let Supabase auth settle
    await screenshot(page, 'home-page');

    // Check if auth redirect happened
    const currentUrl = page.url();
    log(`Current URL after load: ${currentUrl}`);
    if (currentUrl.includes('/auth')) {
      finding('critical', 'Auth wall', 'App redirected to /auth — cannot test without credentials');
      await screenshot(page, 'auth-wall');
      // Try to see what's on the auth page
      const authContent = await page.textContent('body');
      log(`Auth page content (first 200 chars): ${authContent.substring(0, 200)}`);
    }

    // Wait for loading to finish
    try {
      await page.waitForFunction(() => {
        const body = document.body.textContent;
        return !body.includes('Loading...') || body.length > 50;
      }, { timeout: 8000 });
    } catch (e) {
      log('Page may still be loading or stuck on Loading...');
    }

    await screenshot(page, 'home-after-load');

    // Check for KBs
    const kbCards = await page.$$('button:has(h3)');
    log(`Found ${kbCards.length} KB cards on home page`);

    // Check for podcasts in "Recent podcasts" section
    let podcastLinks = [];
    // Podcasts are in button elements that navigate to /podcast/:id
    const allButtons = await page.$$('button');
    for (const btn of allButtons) {
      const text = await btn.textContent().catch(() => '');
      // Look for podcast rows (they have status pips like "ready", "pending", etc.)
      if (text.includes('ready') || text.includes('pending') || text.includes('processing') || text.includes('error')) {
        const isInPodcastSection = true; // In the recent podcasts area
        podcastLinks.push(btn);
      }
    }
    log(`Found ${podcastLinks.length} potential podcast entries`);

    // Try to find podcast links via navigation pattern
    let foundPodcast = false;
    let podcastUrl = null;
    let kbUrl = null;
    let kbId = null;

    // Method 1: Click on a KB card if available, then find a podcast inside it
    if (kbCards.length > 0) {
      log('Found KB cards, clicking first one...');
      // Extract the KB name first
      const firstKBName = await kbCards[0].$eval('h3', el => el.textContent).catch(() => 'unknown');
      log(`First KB name: ${firstKBName}`);
      await kbCards[0].click();
      await page.waitForTimeout(2000);
      kbUrl = page.url();
      log(`Navigated to KB page: ${kbUrl}`);

      // Extract KB id from URL
      const kbMatch = kbUrl.match(/\/kb\/([a-f0-9-]+)/);
      if (kbMatch) {
        kbId = kbMatch[1];
        log(`KB ID: ${kbId}`);
      }

      await screenshot(page, 'kb-page');

      // Look for podcast rows in the KB
      await page.waitForTimeout(1000);
      const kbPodcastRows = await page.$$('button.flex.gap-3');
      log(`Found ${kbPodcastRows.length} podcast row candidates in KB`);

      // Try to find clickable podcast rows
      const podcastButtons = await page.$$('button:has(img), button:has(div.grid)');
      log(`Found ${podcastButtons.length} podcast button candidates`);

      if (podcastButtons.length > 0) {
        // Click the first podcast
        await podcastButtons[0].click();
        await page.waitForTimeout(2000);
        const detailUrl = page.url();
        if (detailUrl.includes('/podcast/')) {
          foundPodcast = true;
          podcastUrl = detailUrl;
          log(`Navigated to podcast detail: ${detailUrl}`);
        }
      }
    }

    // Method 2: If no podcast found via KB, go back home and try clicking recent podcasts
    if (!foundPodcast) {
      log('No podcast found via KB, going back home...');
      await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(2000);

      // Look for podcast items in recent list
      // The recent podcasts are buttons with thumbnail images
      const recentBtns = await page.$$('button:has(img[src])');
      log(`Found ${recentBtns.length} buttons with images (potential podcasts)`);

      for (const btn of recentBtns) {
        const title = await btn.textContent().catch(() => '');
        // Skip KB cards (they have h3 elements)
        const hasH3 = await btn.$('h3').catch(() => null);
        if (!hasH3 && title.length > 5) {
          log(`Clicking podcast button with text: ${title.substring(0, 60)}...`);
          await btn.click();
          await page.waitForTimeout(2000);
          const url = page.url();
          if (url.includes('/podcast/')) {
            foundPodcast = true;
            podcastUrl = url;
            log(`Found podcast detail page: ${url}`);
            break;
          } else {
            // Might have gone to a KB page with podcasts
            if (url.includes('/kb/')) {
              kbUrl = url;
              const kbMatch = url.match(/\/kb\/([a-f0-9-]+)/);
              if (kbMatch) kbId = kbMatch[1];
              // Look for podcasts inside
              const innerBtns = await page.$$('button:has(img[src])');
              for (const ib of innerBtns) {
                const hasH3Inner = await ib.$('h3').catch(() => null);
                if (!hasH3Inner) {
                  await ib.click();
                  await page.waitForTimeout(2000);
                  if (page.url().includes('/podcast/')) {
                    foundPodcast = true;
                    podcastUrl = page.url();
                    break;
                  }
                }
              }
            }
            if (foundPodcast) break;
            await page.goBack();
            await page.waitForTimeout(1000);
          }
        }
      }
    }

    // Method 3: If still no podcast, check if there are any at all by inspecting text
    if (!foundPodcast) {
      await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(2000);
      const bodyText = await page.textContent('body');
      if (bodyText.includes('No podcasts yet')) {
        finding('critical', 'No podcasts in DB', 'The home page shows "No podcasts yet" — no podcast data available to test detail features');
      } else if (bodyText.includes('add your first podcast')) {
        finding('critical', 'Empty library', 'Library appears empty — 0 hours deep');
      } else {
        finding('major', 'Cannot find podcast navigation', `Body text (first 300 chars): ${bodyText.substring(0, 300)}`);
      }
      await screenshot(page, 'no-podcasts-found');
    }

    // ============================================================
    // STEP 2: Podcast Detail Page
    // ============================================================
    console.log('\n=== STEP 2: Podcast Detail Page ===');
    if (foundPodcast) {
      await screenshot(page, 'podcast-detail-full');

      // Document what renders
      const title = await page.$eval('h1', el => el.textContent).catch(() => 'NOT FOUND');
      log(`Title: ${title}`);

      // Channel & date
      const metaInfo = await page.$$eval('.mono.mute', els => els.map(el => el.textContent)).catch(() => []);
      log(`Meta info elements: ${JSON.stringify(metaInfo.slice(0, 5))}`);

      // Thumbnail
      const thumbnail = await page.$('img[class*="w-\\[88px\\]"]');
      const thumbnailAlt = thumbnail ? await page.$('img').then(i => i?.getAttribute('alt')).catch(() => '') : null;
      log(`Thumbnail present: ${!!thumbnail}`);

      // Status pip
      const statusText = await page.$eval('[class*="StatusPip"], [class*="status"]', el => el.textContent).catch(() => 'NOT FOUND');
      log(`Status element text: ${statusText}`);

      // Duration
      const bodyText = await page.textContent('body');
      const durationMatch = bodyText.match(/(\d+:\d+:\d+|\d+:\d+|[\d.]+ hrs?)/);
      log(`Duration found: ${durationMatch ? durationMatch[0] : 'NOT FOUND'}`);

      // Check tabs
      const tabButtons = await page.$$('button:has(svg)');
      const tabTexts = [];
      for (const tab of tabButtons) {
        const text = await tab.textContent().catch(() => '');
        if (['Insights', 'Transcript', 'Processing'].some(t => text.includes(t))) {
          tabTexts.push(text.trim());
        }
      }
      log(`Tabs found: ${JSON.stringify(tabTexts)}`);

      if (tabTexts.length === 0) {
        finding('major', 'No tabs found', 'Could not locate Insights/Transcript/Processing tabs');
      }

      // Check for each tab
      // Click Insights tab
      const insightsTab = await page.$('button:has-text("Insights")');
      if (insightsTab) {
        await insightsTab.click();
        await page.waitForTimeout(1500);
        await screenshot(page, 'tab-insights');
        log('Insights tab clicked');
      }

      // Click Transcript tab
      const transcriptTab = await page.$('button:has-text("Transcript")');
      if (transcriptTab) {
        await transcriptTab.click();
        await page.waitForTimeout(1500);
        await screenshot(page, 'tab-transcript');
        log('Transcript tab clicked');
      }

      // Click Processing tab
      const processingTab = await page.$('button:has-text("Processing")');
      if (processingTab) {
        await processingTab.click();
        await page.waitForTimeout(1500);
        await screenshot(page, 'tab-processing');
        log('Processing tab clicked');
      }
    } else {
      log('Skipping podcast detail tests — no podcast found');
      finding('critical', 'Podcast detail tests skipped', 'No podcast navigable from the home page');
    }

    // ============================================================
    // STEP 3: Insights Panel
    // ============================================================
    console.log('\n=== STEP 3: Insights Panel ===');
    if (foundPodcast) {
      const insightsTab = await page.$('button:has-text("Insights")');
      if (insightsTab) {
        await insightsTab.click();
        await page.waitForTimeout(2000);
      }

      const insightsContent = await page.textContent('body');

      // Check for "No insights" empty state
      if (insightsContent.includes('No insights generated yet')) {
        log('Insights empty state shown — no insights available');
        finding('minor', 'No insights data', 'Podcast has no insights — empty state shows correctly');
        await screenshot(page, 'insights-empty');
      } else if (insightsContent.includes('Loading insights')) {
        log('Insights still loading...');
        await page.waitForTimeout(3000);
        await screenshot(page, 'insights-loading');
      } else {
        // Check for summary
        const summarySection = await page.$('text=Summary');
        if (summarySection) {
          log('Summary section found');
          const summaryText = await page.evaluate(() => {
            const el = document.querySelector('p.serif');
            return el ? el.textContent.substring(0, 200) : 'NOT FOUND';
          });
          log(`Summary text (first 200 chars): ${summaryText}`);
        } else {
          log('No Summary section found');
        }

        // Check for key points
        const keyPointsSection = await page.$('text=Key points');
        if (keyPointsSection) {
          const keyPointsCount = await page.$$eval('[class*="flex gap-3"]', els =>
            els.filter(el => el.querySelector('.mono.text-\\[11px\\]')).length
          ).catch(() => 0);
          log(`Key points section found, approximately ${keyPointsCount} items`);
        }

        // Check for topics
        const topicsSection = await page.$('text=Topics');
        if (topicsSection) {
          log('Topics section found');
          // Count topic tags
          const topicTags = await page.$$('text=Topics >> .. >> [class*="Tag"]');
          log(`Topic tags found: ${topicTags.length}`);
        }

        // Check for entities
        const entitiesSection = await page.$('text=People, Companies');
        if (entitiesSection) {
          log('Entities section found');
        }

        // Check for export button
        const exportBtn = await page.$('button:has-text("Export")');
        if (exportBtn) {
          log('Export button found on insights');
        }

        await screenshot(page, 'insights-content');
      }
    }

    // ============================================================
    // STEP 4: Processing UI
    // ============================================================
    console.log('\n=== STEP 4: Processing UI ===');
    if (foundPodcast) {
      // Check for Process button
      const processBtn = await page.$('button:has-text("Process")');
      const retryBtn = await page.$('button:has-text("Retry")');
      const cancelBtn = await page.$('button:has-text("Cancel")');
      const startingBtn = await page.$('button:has-text("Starting")');

      log(`Process button: ${!!processBtn}`);
      log(`Retry button: ${!!retryBtn}`);
      log(`Cancel button: ${!!cancelBtn}`);
      log(`Starting button: ${!!startingBtn}`);

      if (processBtn) {
        const isDisabled = await processBtn.isDisabled();
        log(`Process button disabled: ${isDisabled}`);
      }

      // Check for ProcessingProgress component (always visible as a card)
      // It's in a div with bg-[var(--surface)] containing step tracker
      const progressSection = await page.$('text=Download >> .. >> .. >> ..');
      if (progressSection) {
        log('Processing progress step tracker found');
      }

      // Check for step labels: Download, Transcribe, Process, Ready
      const bodyText = await page.textContent('body');
      const stepLabels = ['Download', 'Transcribe', 'Process', 'Ready'];
      for (const label of stepLabels) {
        const found = bodyText.includes(label);
        log(`Step label "${label}": ${found ? 'present' : 'missing'}`);
      }

      // Check for percentage display
      const percentMatch = bodyText.match(/(\d+)%/);
      if (percentMatch) {
        log(`Progress percentage shown: ${percentMatch[0]}`);
      }

      // Check for status message
      const statusMessages = ['Waiting to start', 'Downloading audio', 'Transcribing', 'Generating embeddings', 'All done', 'Something went wrong'];
      for (const msg of statusMessages) {
        if (bodyText.includes(msg)) {
          log(`Status message found: "${msg}"`);
        }
      }

      // Click Processing tab to see logs
      const processingTab = await page.$('button:has-text("Processing")');
      if (processingTab) {
        await processingTab.click();
        await page.waitForTimeout(1500);
        await screenshot(page, 'processing-tab-content');

        const processingContent = await page.textContent('body');
        // Check for processing log entries
        const hasLogs = processingContent.includes('downloading') ||
                        processingContent.includes('transcribing') ||
                        processingContent.includes('processing') ||
                        processingContent.includes('No processing');
        log(`Processing tab has log content: ${hasLogs}`);
      }

      await screenshot(page, 'processing-ui');
    }

    // ============================================================
    // STEP 5: Transcript Viewer
    // ============================================================
    console.log('\n=== STEP 5: Transcript Viewer ===');
    if (foundPodcast) {
      const transcriptTab = await page.$('button:has-text("Transcript")');
      if (transcriptTab) {
        await transcriptTab.click();
        await page.waitForTimeout(2000);

        const transcriptContent = await page.textContent('body');

        if (transcriptContent.includes('No transcript available')) {
          log('Transcript empty state shown — process podcast first');
          finding('minor', 'No transcript data', 'Podcast has no transcript — empty state shown correctly');
          await screenshot(page, 'transcript-empty');
        } else if (transcriptContent.includes('Full Transcript')) {
          log('Transcript content found!');

          // Check for word count
          const wordCountMatch = transcriptContent.match(/([\d,]+)\s*words/);
          if (wordCountMatch) {
            log(`Word count displayed: ${wordCountMatch[1]}`);
          }

          // Check for timestamps
          const timestamps = await page.$$('.mono.text-\\[11px\\]');
          const timestampTexts = [];
          for (const ts of timestamps.slice(0, 5)) {
            const text = await ts.textContent().catch(() => '');
            if (text.match(/\d+:\d+/)) {
              timestampTexts.push(text.trim());
            }
          }
          log(`Timestamps found: ${JSON.stringify(timestampTexts)}`);

          // Check if timestamps are clickable/linkable
          const hasTimestampLinks = await page.$$('a[href*="?t="]');
          log(`Clickable timestamp links: ${hasTimestampLinks.length}`);

          // Check for segmented transcript rendering
          const segments = await page.$$('.grid.gap-4.grid-cols-\\[70px_1fr\\]');
          log(`Transcript segments rendered: ${segments.length}`);

          // If no segments, check for full_text fallback
          if (segments.length === 0) {
            const plainText = await page.$('p.text-sm.dim');
            log(`Plain text fallback: ${!!plainText}`);
          }

          await screenshot(page, 'transcript-content');

          // Scroll down to see more
          await page.evaluate(() => window.scrollBy(0, 800));
          await page.waitForTimeout(500);
          await screenshot(page, 'transcript-scrolled');
        } else {
          log('Unknown transcript state');
          await screenshot(page, 'transcript-unknown');
        }
      } else {
        finding('major', 'No Transcript tab', 'Transcript tab button not found');
      }
    }

    // ============================================================
    // STEP 6: Audio Playback
    // ============================================================
    console.log('\n=== STEP 6: Audio Playback ===');
    if (foundPodcast) {
      // Navigate back to detail page top
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(500);

      // Check for audio element
      const audioEl = await page.$('audio');
      if (audioEl) {
        log('Audio element found');

        const audioSrc = await audioEl.getAttribute('src');
        log(`Audio src: ${audioSrc ? audioSrc.substring(0, 80) + '...' : 'none'}`);

        const hasControls = await audioEl.getAttribute('controls');
        log(`Native controls: ${hasControls !== null}`);

        const preload = await audioEl.getAttribute('preload');
        log(`Preload attribute: ${preload}`);

        // Check for speed control button
        const speedBtn = await page.$('button:has-text("1x"), button:has-text("1.25x"), button:has-text("1.5x"), button:has-text("2x")');
        if (speedBtn) {
          const speedText = await speedBtn.textContent();
          log(`Speed control found: ${speedText}`);

          // Note: speed button only shows when user is authenticated
          // Check if it's clickable
          const isEnabled = await speedBtn.isEnabled();
          log(`Speed button enabled: ${isEnabled}`);
        } else {
          log('Speed control button not visible (may require authentication)');
        }

        // Check for resume indicator
        const resumeText = await page.$('text=Resume from');
        if (resumeText) {
          log('Resume from indicator found');
        }

        // Check for completed indicator
        const completedText = await page.$('text=Completed');
        if (completedText) {
          log('Completed indicator found');
        }

        await screenshot(page, 'audio-player');
      } else {
        log('No audio element found');

        // Check if this is because there's no enclosure_url
        const bodyText = await page.textContent('body');
        if (bodyText.includes('Audio Only') || bodyText.includes('RSS Transcript')) {
          log('Source type indicator present');
        }
        finding('minor', 'No audio player', 'Audio element not rendered — podcast may not have enclosure_url');
        await screenshot(page, 'no-audio-player');
      }
    }

    // ============================================================
    // STEP 7: Add to KB Modal
    // ============================================================
    console.log('\n=== STEP 7: Add to KB Modal ===');
    if (foundPodcast) {
      // Go back to the standalone podcast URL (without KB prefix)
      const podcastIdMatch = podcastUrl.match(/podcast\/([a-f0-9-]+)/);
      if (podcastIdMatch) {
        const standalonePath = `/podcast/${podcastIdMatch[1]}`;
        await page.goto(`${BASE_URL}${standalonePath}`, { waitUntil: 'networkidle', timeout: 15000 });
        await page.waitForTimeout(2000);
        await screenshot(page, 'standalone-podcast-page');
      }

      const addToKBBtn = await page.$('button:has-text("Add to KB")');
      if (addToKBBtn) {
        log('Add to KB button found');
        await addToKBBtn.click();
        await page.waitForTimeout(1500);
        await screenshot(page, 'add-to-kb-modal');

        // Check modal content
        const modalContent = await page.textContent('body');
        if (modalContent.includes('knowledge base') || modalContent.includes('KB') || modalContent.includes('Add to')) {
          log('Add to KB modal appears to be open');

          // Check for KB list in modal
          const modalButtons = await page.$$('[role="dialog"] button, .fixed button, div[class*="fixed"] button');
          log(`Modal buttons found: ${modalButtons.length}`);
        }

        // Close modal — press Escape
        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);
      } else {
        finding('minor', 'No Add to KB button', '+ Add to KB button not found on podcast detail');
      }
    }

    // ============================================================
    // STEP 8: KB Page Features
    // ============================================================
    console.log('\n=== STEP 8: KB Page Features ===');

    // Navigate to a KB page
    if (kbUrl) {
      await page.goto(kbUrl, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(2000);
    } else {
      // Go home and find a KB
      await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(2000);

      const kbCardsHome = await page.$$('button:has(h3)');
      if (kbCardsHome.length > 0) {
        await kbCardsHome[0].click();
        await page.waitForTimeout(2000);
        kbUrl = page.url();
        const kbMatch = kbUrl.match(/\/kb\/([a-f0-9-]+)/);
        if (kbMatch) kbId = kbMatch[1];
      }
    }

    if (page.url().includes('/kb/')) {
      log(`On KB page: ${page.url()}`);
      await screenshot(page, 'kb-page-full');

      // Check KB header
      const kbTitle = await page.$eval('h1', el => el.textContent).catch(() => 'NOT FOUND');
      log(`KB Title: ${kbTitle}`);

      // Check meta row
      const bodyText = await page.textContent('body');
      const podCountMatch = bodyText.match(/(\d+)\s*podcasts?/);
      const readyMatch = bodyText.match(/(\d+)\s*ready/);
      log(`Podcast count: ${podCountMatch ? podCountMatch[0] : 'NOT FOUND'}`);
      log(`Ready count: ${readyMatch ? readyMatch[0] : 'NOT FOUND'}`);

      // Check section tabs
      const episodesTab = await page.$('button:has-text("Episodes")');
      const synthesisTab = await page.$('button:has-text("Synthesis")');
      log(`Episodes tab: ${!!episodesTab}`);
      log(`Synthesis tab: ${!!synthesisTab}`);

      // Check for Export All button
      const exportAllBtn = await page.$('button:has-text("Export")');
      log(`Export All button: ${!!exportAllBtn}`);

      // Check for Add podcast button
      const addPodBtn = await page.$('button:has-text("Add podcast")');
      log(`Add podcast button: ${!!addPodBtn}`);

      // --- Episodes tab ---
      if (episodesTab) {
        await episodesTab.click();
        await page.waitForTimeout(1000);
        await screenshot(page, 'kb-episodes-tab');

        // Count podcast rows
        const podRows = await page.$$('button.flex.gap-3');
        log(`Episode rows in KB: ${podRows.length}`);

        // Check for empty state
        if (bodyText.includes('No podcasts yet') && podRows.length === 0) {
          log('KB episodes empty state shown');
        }

        // Check episode row content
        if (podRows.length > 0) {
          const firstRowText = await podRows[0].textContent().catch(() => '');
          log(`First episode row text (first 100 chars): ${firstRowText.substring(0, 100)}`);
        }
      }

      // --- Synthesis tab ---
      if (synthesisTab) {
        await synthesisTab.click();
        await page.waitForTimeout(2000);
        await screenshot(page, 'kb-synthesis-tab');

        const synthContent = await page.textContent('body');

        if (synthContent.includes('Cross-Podcast Synthesis') && synthContent.includes('Add and process at least')) {
          log('Synthesis empty state — not enough ready podcasts');
          finding('minor', 'Synthesis empty state', 'Fewer than 2 ready podcasts — synthesis generation disabled');
        } else if (synthContent.includes('Generate Synthesis')) {
          log('Synthesis generation button available');
          const genBtn = await page.$('button:has-text("Generate Synthesis")');
          if (genBtn) {
            const isDisabled = await genBtn.isDisabled();
            log(`Generate Synthesis button disabled: ${isDisabled}`);
          }
        } else if (synthContent.includes('Themes across episodes') || synthContent.includes('Cross-Podcast Synthesis')) {
          log('Synthesis content exists!');

          // Check themes
          const themeCards = await page.$$('[class*="p-\\[18px\\]"]:has(h3)');
          log(`Theme cards found: ${themeCards.length}`);

          // Check cross-references
          const hasAgreements = synthContent.includes('Agreement');
          const hasDisagreements = synthContent.includes('Disagreement');
          const hasComplements = synthContent.includes('Complement');
          log(`Agreement refs: ${hasAgreements}, Disagreement refs: ${hasDisagreements}, Complement refs: ${hasComplements}`);

          // Check for regenerate button
          const regenBtn = await page.$('button:has-text("Regenerate")');
          log(`Regenerate button: ${!!regenBtn}`);

          // Check for export button in synthesis
          const synthExportBtn = await page.$('button:has-text("Export")');
          log(`Synthesis export button: ${!!synthExportBtn}`);
        }
      } else {
        finding('major', 'No Synthesis tab', 'Synthesis tab not found on KB page');
      }

      // --- Chat Panel ---
      console.log('\n=== Chat Panel ===');
      // Chat panel is a side column on desktop (md+)
      const chatPanel = await page.$('text=Ask');
      if (chatPanel) {
        log('Chat panel found (Ask header visible)');
        await screenshot(page, 'kb-chat-panel');

        // Check for textarea/input
        const chatInput = await page.$('textarea[placeholder*="Ask"]');
        if (chatInput) {
          log('Chat input textarea found');

          // Check for starter prompts
          const starters = ['What are the key takeaways?', 'Compare different viewpoints'];
          for (const starter of starters) {
            const starterBtn = await page.$(`button:has-text("${starter}")`);
            if (starterBtn) {
              log(`Starter prompt found: "${starter}"`);
            }
          }

          // Check for send button
          const sendBtn = await page.$('button[type="submit"]');
          log(`Send button: ${!!sendBtn}`);

          // Check if send button is disabled when empty
          if (sendBtn) {
            const isDisabled = await sendBtn.isDisabled();
            log(`Send button disabled (empty input): ${isDisabled}`);
          }

          // Check for new chat button
          const newChatBtn = await page.$('button[title="New chat"]');
          log(`New chat button: ${!!newChatBtn}`);

          // Check for history button
          const historyBtn = await page.$('button[title="History"]');
          log(`History button: ${!!historyBtn}`);

          // Test typing in the chat
          await chatInput.fill('Test question');
          await page.waitForTimeout(500);
          await screenshot(page, 'kb-chat-with-input');

          // Check if send button is now enabled
          if (sendBtn) {
            const isNowEnabled = await sendBtn.isEnabled();
            log(`Send button enabled (with input): ${isNowEnabled}`);
          }

          // Clear input
          await chatInput.fill('');
        } else {
          finding('minor', 'No chat input', 'Chat textarea not found');
        }
      } else {
        // On narrow viewport, chat might be hidden behind a button
        const chatToggle = await page.$('button:has-text("Chat")');
        if (chatToggle) {
          log('Chat toggle button found (mobile view)');
          await chatToggle.click();
          await page.waitForTimeout(1000);
          await screenshot(page, 'kb-chat-mobile');
        } else {
          log('Chat panel not visible — checking viewport');
          finding('minor', 'Chat panel not visible', 'Chat panel may be hidden at current viewport width');
        }
      }

      // --- Mobile chat toggle test ---
      // Resize to mobile to test mobile chat overlay
      await page.setViewportSize({ width: 375, height: 667 });
      await page.waitForTimeout(500);
      await screenshot(page, 'kb-mobile-view');

      const mobileChatBtn = await page.$('button:has-text("Chat")');
      if (mobileChatBtn) {
        log('Mobile chat button found');
        await mobileChatBtn.click();
        await page.waitForTimeout(1000);
        await screenshot(page, 'kb-chat-mobile-overlay');

        // Check for back button in mobile chat
        const backBtn = await page.$('button:has(svg)');
        log(`Back button in mobile chat: ${!!backBtn}`);
      }

      // Reset viewport
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.waitForTimeout(500);

    } else {
      finding('critical', 'No KB page accessible', 'Could not navigate to any KB page');
    }

    // ============================================================
    // STEP 9: Edge Cases & Additional Observations
    // ============================================================
    console.log('\n=== STEP 9: Edge Cases ===');

    // Test breadcrumb navigation on podcast detail
    if (podcastUrl) {
      await page.goto(podcastUrl, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(1500);

      // Check breadcrumb
      const breadcrumb = await page.$('a:has-text("All Podcasts"), a:has-text("Back to Knowledge Base")');
      if (breadcrumb) {
        const breadcrumbText = await breadcrumb.textContent();
        log(`Breadcrumb text: ${breadcrumbText}`);
      } else {
        finding('minor', 'No breadcrumb', 'Back navigation breadcrumb not found');
      }

      // Check for linked KBs display
      const linkedKBs = await page.$('text=In:');
      if (linkedKBs) {
        log('Linked KBs section found');
      }

      // Check for external link
      const externalLink = await page.$('a:has-text("Open Episode"), a:has-text("Open Source")');
      if (externalLink) {
        const href = await externalLink.getAttribute('href');
        log(`External link found: ${href ? href.substring(0, 80) : 'no href'}`);
      }
    }

    // Check for audio confirmation dialog (only on pending podcasts without transcript_url)
    // This requires a pending podcast — we can check if the UI structure is in place
    log('Audio confirmation dialog: cannot test without triggering Process on a podcast without RSS transcript');

    // ============================================================
    // FINAL: Summary
    // ============================================================
    console.log('\n\n=== TEST SUMMARY ===');
    console.log(`Screenshots taken: ${screenshots.length}`);
    console.log(`Console errors: ${consoleErrors.length}`);
    console.log(`Findings: ${findings.length}`);
    for (const f of findings) {
      console.log(`  [${f.severity}] ${f.title}: ${f.detail}`);
    }
    for (const e of consoleErrors) {
      console.log(`  [console-error] ${e.text.substring(0, 200)} (on ${e.url})`);
    }

    // Write results JSON for deliverable
    const results = {
      screenshots,
      consoleErrors,
      findings,
      podcastFound: foundPodcast,
      podcastUrl,
      kbUrl,
      kbId,
    };
    fs.writeFileSync(
      path.join(RESULTS_DIR, 'detail-results.json'),
      JSON.stringify(results, null, 2),
    );
    console.log('\nResults written to test-results/detail-results.json');

  } catch (err) {
    console.error('FATAL ERROR:', err.message);
    console.error(err.stack);
    await screenshot(page, 'fatal-error').catch(() => {});
  } finally {
    await browser.close();
  }
})();
