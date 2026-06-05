const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const RESULTS_DIR = path.join(__dirname, '..', 'test-results');
const BASE_URL = 'http://localhost:5173';
let screenshotIdx = 21; // Continue from previous test
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
  fs.mkdirSync(RESULTS_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push({ text: msg.text(), url: page.url() });
    }
  });
  page.on('pageerror', err => {
    consoleErrors.push({ text: err.message, url: page.url() });
  });

  const HUBERMAN_KB_ID = 'b24c747b-d762-42f6-b3be-7968f5faf0c1';
  const READY_PODCAST_ID = '8cab4553-10be-43aa-8435-c0ef8c6358e0';

  try {
    // ============================================================
    // TEST A: Ready podcast — Insights Panel (with data)
    // ============================================================
    console.log('\n=== TEST A: Ready Podcast Detail Page ===');
    const podcastUrl = `${BASE_URL}/kb/${HUBERMAN_KB_ID}/podcast/${READY_PODCAST_ID}`;
    await page.goto(podcastUrl, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(3000);
    await screenshot(page, 'ready-podcast-detail');

    // Document header info
    const title = await page.$eval('h1', el => el.textContent).catch(() => 'NOT FOUND');
    log(`Title: ${title}`);

    // Check status
    const bodyText = await page.textContent('body');
    if (bodyText.includes('ready')) {
      log('Status: ready (confirmed)');
    }

    // Check if ProcessingProgress shows "All done!" and 100%
    if (bodyText.includes('All done')) {
      log('Processing progress shows "All done!"');
    }
    if (bodyText.includes('100%')) {
      log('Progress shows 100%');
    }

    // Check for Process/Retry buttons (should NOT be visible for ready status)
    const processBtn = await page.$('button:has-text("Process")');
    const retryBtn = await page.$('button:has-text("Retry")');
    log(`Process button on ready podcast: ${!!processBtn} (should be false)`);
    log(`Retry button on ready podcast: ${!!retryBtn} (should be false)`);
    if (processBtn) {
      finding('major', 'Process button on ready podcast', 'Process button should not be visible when status is ready');
    }

    // ============================================================
    // Insights tab on ready podcast
    // ============================================================
    console.log('\n=== TEST A.1: Insights on Ready Podcast ===');
    const insightsTab = await page.$('button:has-text("Insights")');
    if (insightsTab) {
      await insightsTab.click();
      await page.waitForTimeout(2500);
      await screenshot(page, 'ready-insights-tab');

      const insightsText = await page.textContent('body');

      // Check for summary
      if (insightsText.includes('Summary')) {
        log('Summary section present');
        // Get summary text
        const summaryEl = await page.$('.serif.text-\\[16px\\]');
        if (summaryEl) {
          const summaryContent = await summaryEl.textContent();
          log(`Summary text (first 150 chars): ${summaryContent.substring(0, 150)}`);
        }
      } else if (insightsText.includes('No insights generated yet')) {
        finding('major', 'No insights on ready podcast', 'Ready podcast should have insights but shows empty state');
      }

      // Check for key points
      if (insightsText.includes('Key points')) {
        log('Key points section present');
        // Count key points by the numbered items
        const keyPointItems = await page.$$eval('span.mono', els => {
          return els.filter(el => /^\d{2}$/.test(el.textContent.trim())).length;
        }).catch(() => 0);
        log(`Key points count: ${keyPointItems}`);
      }

      // Check for topics
      if (insightsText.includes('Topics')) {
        log('Topics section present');
        // Count topic tags - look for tag-like elements after "Topics"
        // Topics are rendered using Tag component
        const topicCount = await page.evaluate(() => {
          const topicsHeader = Array.from(document.querySelectorAll('div')).find(el =>
            el.textContent.trim() === 'Topics'
          );
          if (!topicsHeader) return 0;
          const parent = topicsHeader.closest('div[class*="p-"]');
          if (!parent) return 0;
          const tags = parent.querySelectorAll('[class*="tag"], [class*="Tag"], span[class*="px-"]');
          return tags.length;
        }).catch(() => 0);
        log(`Topic tags rendered: ${topicCount}`);
      }

      // Check for entities (People, Companies & Concepts)
      if (insightsText.includes('People, Companies')) {
        log('Entities section present');
        // Count entity items
        const entityCount = await page.evaluate(() => {
          const entHeader = Array.from(document.querySelectorAll('div')).find(el =>
            el.textContent.includes('People, Companies') && el.textContent.includes('Concepts')
          );
          if (!entHeader) return 0;
          const parent = entHeader.closest('div[class*="p-"]');
          if (!parent) return 0;
          return parent.querySelectorAll('span[title]').length;
        }).catch(() => 0);
        log(`Entity count: ${entityCount}`);

        // Check entity type colors
        const entityTypes = await page.evaluate(() => {
          const spans = document.querySelectorAll('span[title]');
          const types = new Set();
          spans.forEach(s => { if (s.title) types.add(s.title); });
          return Array.from(types);
        }).catch(() => []);
        log(`Entity types found: ${JSON.stringify(entityTypes)}`);
      }

      // Check for Export button
      const exportBtn = await page.$('button:has-text("Export")');
      if (exportBtn) {
        log('Export insights button present');
      } else {
        finding('minor', 'No export button on insights', 'Export button not found on insights panel');
      }

      // Scroll down to see all insights
      await page.evaluate(() => window.scrollBy(0, 600));
      await page.waitForTimeout(500);
      await screenshot(page, 'ready-insights-scrolled');

      await page.evaluate(() => window.scrollBy(0, 600));
      await page.waitForTimeout(500);
      await screenshot(page, 'ready-insights-scrolled-more');
    }

    // ============================================================
    // Transcript tab on ready podcast
    // ============================================================
    console.log('\n=== TEST A.2: Transcript on Ready Podcast ===');
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);

    const transcriptTab = await page.$('button:has-text("Transcript")');
    if (transcriptTab) {
      await transcriptTab.click();
      await page.waitForTimeout(2500);
      await screenshot(page, 'ready-transcript-tab');

      const transcriptText = await page.textContent('body');

      if (transcriptText.includes('Full Transcript')) {
        log('Transcript content present');

        // Check word count
        const wordCountMatch = transcriptText.match(/([\d,]+)\s*words/);
        if (wordCountMatch) {
          log(`Word count: ${wordCountMatch[1]}`);
        } else {
          log('No word count displayed');
        }

        // Check for timestamp segments
        const timestampElements = await page.evaluate(() => {
          const monoEls = document.querySelectorAll('.mono.text-\\[11px\\]');
          const timestamps = [];
          monoEls.forEach(el => {
            if (/\d+:\d+:\d+/.test(el.textContent)) {
              timestamps.push(el.textContent.trim());
            }
          });
          return timestamps.slice(0, 10);
        }).catch(() => []);
        log(`Timestamps (first 10): ${JSON.stringify(timestampElements)}`);

        if (timestampElements.length > 0) {
          log('Segmented transcript with timestamps confirmed');
        } else {
          // Check for fallback full_text rendering
          const plainTranscript = await page.$('p.text-sm.dim');
          if (plainTranscript) {
            log('Transcript renders as plain text (no segments)');
            finding('minor', 'No timestamped segments', 'Transcript displays as plain text without timestamp segments');
          }
        }

        // Check segment grid layout
        const segmentGrids = await page.$$('.grid.gap-4');
        log(`Segment grid elements: ${segmentGrids.length}`);

        // Scroll to see more transcript content
        await page.evaluate(() => window.scrollBy(0, 800));
        await page.waitForTimeout(500);
        await screenshot(page, 'ready-transcript-scrolled');

        // Check for timestamp highlighting (with ?t= param)
        // Navigate with a timestamp param to test highlight
        await page.goto(`${podcastUrl}?t=120`, { waitUntil: 'networkidle', timeout: 15000 });
        await page.waitForTimeout(2000);
        // Click transcript tab
        const transcriptTab2 = await page.$('button:has-text("Transcript")');
        if (transcriptTab2) {
          await transcriptTab2.click();
          await page.waitForTimeout(2000);

          // Check for highlighted segment
          const highlighted = await page.$('[class*="accent-faint"]');
          if (highlighted) {
            log('Timestamp highlight working with ?t= param');
          } else {
            log('No highlighted segment found with ?t=120');
          }
          await screenshot(page, 'ready-transcript-highlight');
        }

      } else if (transcriptText.includes('No transcript available')) {
        finding('major', 'No transcript on ready podcast', 'Ready podcast shows no transcript available');
      }
    }

    // ============================================================
    // Processing tab on ready podcast
    // ============================================================
    console.log('\n=== TEST A.3: Processing Tab on Ready Podcast ===');
    await page.goto(podcastUrl, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(2000);

    const processingTab = await page.$('button:has-text("Processing")');
    if (processingTab) {
      await processingTab.click();
      await page.waitForTimeout(2000);
      await screenshot(page, 'ready-processing-tab');

      const procText = await page.textContent('body');

      // Check for log entries
      const hasLogEntries = procText.includes('downloading') ||
                            procText.includes('transcribing') ||
                            procText.includes('processing') ||
                            procText.includes('ready') ||
                            procText.includes('Started') ||
                            procText.includes('Complete');
      log(`Processing log has entries: ${hasLogEntries}`);

      // Check for timestamps in logs
      const logTimestamps = await page.evaluate(() => {
        const els = document.querySelectorAll('.mono');
        const times = [];
        els.forEach(el => {
          if (/\d{1,2}:\d{2}:\d{2}/.test(el.textContent) || /\d{4}-\d{2}-\d{2}/.test(el.textContent)) {
            times.push(el.textContent.trim());
          }
        });
        return times.slice(0, 5);
      }).catch(() => []);
      log(`Log timestamps: ${JSON.stringify(logTimestamps)}`);

      // Scroll to see all logs
      await page.evaluate(() => window.scrollBy(0, 500));
      await page.waitForTimeout(500);
      await screenshot(page, 'ready-processing-tab-scrolled');
    }

    // ============================================================
    // Audio player on ready podcast
    // ============================================================
    console.log('\n=== TEST A.4: Audio Player on Ready Podcast ===');
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);

    const audioEl = await page.$('audio');
    if (audioEl) {
      log('Audio element found on ready podcast');

      const audioSrc = await audioEl.getAttribute('src');
      log(`Audio source: ${audioSrc ? audioSrc.substring(0, 100) : 'none'}`);

      // Check native audio controls
      const hasControls = await audioEl.getAttribute('controls');
      log(`Has native controls: ${hasControls !== null}`);

      // Check preload
      const preload = await audioEl.getAttribute('preload');
      log(`Preload: ${preload}`);

      // Speed button (requires auth)
      const speedBtn = await page.$('button[title="Playback speed"]');
      if (speedBtn) {
        const speedText = await speedBtn.textContent();
        log(`Speed button text: ${speedText}`);
      } else {
        log('Speed button not visible (requires authentication)');
      }

      await screenshot(page, 'ready-audio-player');
    } else {
      log('No audio element on ready podcast');
    }

    // ============================================================
    // TEST B: Huberman KB with data — Synthesis, Chat, Episodes
    // ============================================================
    console.log('\n=== TEST B: Huberman KB Features ===');
    await page.goto(`${BASE_URL}/kb/${HUBERMAN_KB_ID}`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(2500);
    await screenshot(page, 'huberman-kb-full');

    const kbText = await page.textContent('body');

    // Check counts
    log(`KB shows: ${kbText.includes('33 podcasts') ? '33 podcasts' : 'check count'}`);
    log(`KB shows: ${kbText.includes('13 ready') ? '13 ready' : 'check ready count'}`);

    // Check Export All button (should be visible with ready podcasts)
    const exportAllBtn = await page.$('button:has-text("Export All"), button:has-text("Export")');
    if (exportAllBtn) {
      const exportText = await exportAllBtn.textContent();
      log(`Export button text: ${exportText}`);
    }

    // --- Episodes tab ---
    console.log('\n=== TEST B.1: Episodes List ===');
    const episodesTab = await page.$('button:has-text("Episodes")');
    if (episodesTab) {
      await episodesTab.click();
      await page.waitForTimeout(1500);

      // Count episode rows
      const episodeRows = await page.evaluate(() => {
        // PodcastRow components are buttons with specific structure
        const rows = document.querySelectorAll('button.flex.gap-3');
        return rows.length;
      }).catch(() => 0);
      log(`Episode rows rendered: ${episodeRows}`);

      // Check for thumbnails
      const thumbnails = await page.$$('button.flex.gap-3 img');
      log(`Thumbnails in episode list: ${thumbnails.length}`);

      // Check for status pips
      const readyPips = (kbText.match(/ready/g) || []).length;
      const pendingPips = (kbText.match(/pending/g) || []).length;
      log(`Ready status mentions: ${readyPips}`);
      log(`Pending status mentions: ${pendingPips}`);

      // Check for duration display
      const durations = kbText.match(/\d+h \d+m|\d+m/g) || [];
      log(`Duration displays found: ${durations.length}`);

      // Check for progress bars on processing items
      const progressBars = await page.$$('div[class*="bg-\\[var\\(--accent\\)\\]"]');
      log(`Progress bar elements: ${progressBars.length}`);

      // Check for delete/remove buttons (appear on hover)
      const removeButtons = await page.$$('button[title="Remove"]');
      log(`Remove buttons: ${removeButtons.length}`);

      // Scroll to see all episodes
      await page.evaluate(() => window.scrollBy(0, 1500));
      await page.waitForTimeout(500);
      await screenshot(page, 'huberman-episodes-scrolled');
    }

    // --- Synthesis tab ---
    console.log('\n=== TEST B.2: Synthesis Tab (with data) ===');
    const synthesisTab = await page.$('button:has-text("Synthesis")');
    if (synthesisTab) {
      await synthesisTab.click();
      await page.waitForTimeout(3000);
      await screenshot(page, 'huberman-synthesis-tab');

      const synthText = await page.textContent('body');

      if (synthText.includes('Themes across episodes')) {
        log('Synthesis has themes!');

        // Count theme cards
        const themeCount = await page.evaluate(() => {
          const headers = document.querySelectorAll('h3.serif');
          return headers.length;
        }).catch(() => 0);
        log(`Theme/cross-ref cards: ${themeCount}`);

        // Check for theme titles
        const themeTitles = await page.evaluate(() => {
          const headers = document.querySelectorAll('h3.serif');
          return Array.from(headers).map(h => h.textContent).slice(0, 5);
        }).catch(() => []);
        log(`Theme titles (first 5): ${JSON.stringify(themeTitles)}`);

        // Check for cross-references section
        if (synthText.includes('Agreements, Disagreements')) {
          log('Cross-references section found');

          // Check for type badges
          const hasAgreement = synthText.includes('Agreement');
          const hasDisagreement = synthText.includes('Disagreement');
          const hasComplement = synthText.includes('Complement');
          log(`Agreement: ${hasAgreement}, Disagreement: ${hasDisagreement}, Complement: ${hasComplement}`);
        }

        // Check for regenerate button
        const regenBtn = await page.$('button:has-text("Regenerate")');
        log(`Regenerate button: ${!!regenBtn}`);

        // Check for export button
        const synthExport = await page.$('button:has-text("Export")');
        log(`Synthesis export button: ${!!synthExport}`);

        // Check for episode tags on themes
        const episodeTags = await page.evaluate(() => {
          const allTags = document.querySelectorAll('[class*="tag"], [class*="Tag"], span[class*="px-2"]');
          return allTags.length;
        }).catch(() => 0);
        log(`Episode/topic tags: ${episodeTags}`);

        // Scroll to see more synthesis
        await page.evaluate(() => window.scrollBy(0, 800));
        await page.waitForTimeout(500);
        await screenshot(page, 'huberman-synthesis-scrolled');

        await page.evaluate(() => window.scrollBy(0, 800));
        await page.waitForTimeout(500);
        await screenshot(page, 'huberman-synthesis-scrolled-more');

      } else if (synthText.includes('Generate Synthesis')) {
        log('Synthesis not yet generated, Generate button available');
        const genBtn = await page.$('button:has-text("Generate Synthesis")');
        if (genBtn) {
          const isDisabled = await genBtn.isDisabled();
          log(`Generate Synthesis button disabled: ${isDisabled}`);
        }
      } else if (synthText.includes('Add and process at least')) {
        log('Synthesis requires more ready podcasts');
      } else {
        log('Synthesis in unknown state');
        finding('major', 'Synthesis state unclear', `Synthesis content: ${synthText.substring(0, 200)}`);
      }
    }

    // --- Chat Panel ---
    console.log('\n=== TEST B.3: Chat Panel (Huberman KB) ===');
    // Chat panel is always visible on desktop as a side column
    const chatHeader = await page.$('text=Ask Huberman');
    if (chatHeader) {
      log('Chat panel header "Ask Huberman" found');
    } else {
      const chatAny = await page.$('text=Ask');
      log(`Chat panel "Ask" header: ${!!chatAny}`);
    }

    // Check starter prompts
    const starterPrompts = await page.evaluate(() => {
      const btns = document.querySelectorAll('button');
      const starters = [];
      btns.forEach(btn => {
        const text = btn.textContent;
        if (text.includes('key takeaways') || text.includes('viewpoints') ||
            text.includes('latest episodes') || text.includes('Find quotes')) {
          starters.push(text.trim());
        }
      });
      return starters;
    }).catch(() => []);
    log(`Starter prompts found: ${starterPrompts.length}`);
    for (const sp of starterPrompts) {
      log(`  Starter: ${sp.substring(0, 60)}`);
    }

    // Check textarea
    const chatTextarea = await page.$('textarea[placeholder*="Ask about these podcasts"]');
    if (chatTextarea) {
      log('Chat textarea found with correct placeholder');
    } else {
      const anyTextarea = await page.$('textarea');
      log(`Any textarea: ${!!anyTextarea}`);
    }

    // Check keyboard shortcut hint
    const kbHint = await page.textContent('body');
    if (kbHint.includes('send') && kbHint.includes('newline')) {
      log('Keyboard shortcut hints present (send / newline)');
    }
    if (kbHint.includes('scoped to KB')) {
      log('"scoped to KB" indicator present');
    }

    await screenshot(page, 'huberman-chat-panel');

    // ============================================================
    // TEST C: KB name editing
    // ============================================================
    console.log('\n=== TEST C: KB Name Editing ===');
    // The KB name is clickable to edit
    const kbNameH1 = await page.$('h1.serif');
    if (kbNameH1) {
      const nameText = await kbNameH1.textContent();
      log(`KB name (clickable): ${nameText}`);
      // Don't actually edit — just verify the cursor pointer is there
      const cursorStyle = await kbNameH1.evaluate(el => {
        const computed = getComputedStyle(el);
        return computed.cursor;
      });
      log(`KB name cursor style: ${cursorStyle}`);
    }

    // ============================================================
    // TEST D: Add podcast button on KB page
    // ============================================================
    console.log('\n=== TEST D: Add Podcast from KB ===');
    const addPodBtn = await page.$('button:has-text("Add podcast")');
    if (addPodBtn) {
      log('Add podcast button present');
      await addPodBtn.click();
      await page.waitForTimeout(1500);
      await screenshot(page, 'kb-add-podcast-modal');

      // Check modal content
      const modalText = await page.textContent('body');
      if (modalText.includes('Search') || modalText.includes('search')) {
        log('Add podcast modal has search functionality');
      }

      // Check for search input
      const searchInput = await page.$('input[type="search"], input[placeholder*="Search"], input[placeholder*="search"]');
      if (searchInput) {
        log('Search input found in add podcast modal');
      }

      // Close modal
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    }

    // ============================================================
    // TEST E: Cross-navigation — podcast in KB context
    // ============================================================
    console.log('\n=== TEST E: Cross-navigation ===');
    // Navigate to a ready podcast within KB context
    await page.goto(`${BASE_URL}/kb/${HUBERMAN_KB_ID}`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(2000);

    // Click a ready podcast
    const allBtns = await page.$$('button.flex.gap-3');
    for (const btn of allBtns) {
      const text = await btn.textContent().catch(() => '');
      if (text.includes('ready')) {
        await btn.click();
        await page.waitForTimeout(2000);
        break;
      }
    }

    if (page.url().includes('/podcast/')) {
      log(`Navigated to podcast in KB context: ${page.url()}`);

      // Check breadcrumb says "Back to Knowledge Base"
      const breadcrumb = await page.$('a:has-text("Back to Knowledge Base")');
      if (breadcrumb) {
        log('Breadcrumb shows "Back to Knowledge Base" (correct for KB context)');
      } else {
        const altBreadcrumb = await page.$('a:has-text("All Podcasts")');
        if (altBreadcrumb) {
          finding('minor', 'Wrong breadcrumb in KB context', 'Breadcrumb shows "All Podcasts" instead of "Back to Knowledge Base" when navigating from KB');
        }
      }

      // Check linked KBs
      const linkedKBs = await page.$('text=In:');
      if (linkedKBs) {
        log('Linked KBs badge visible');
      }

      await screenshot(page, 'podcast-in-kb-context');
    }

    // ============================================================
    // SUMMARY
    // ============================================================
    console.log('\n\n=== READY PODCAST TEST SUMMARY ===');
    console.log(`Screenshots taken: ${screenshots.length}`);
    console.log(`Console errors: ${consoleErrors.length}`);
    console.log(`Findings: ${findings.length}`);
    for (const f of findings) {
      console.log(`  [${f.severity}] ${f.title}: ${f.detail}`);
    }
    for (const e of consoleErrors.slice(0, 10)) {
      console.log(`  [console-error] ${e.text.substring(0, 200)} (on ${e.url})`);
    }

    // Append results
    const results = {
      screenshots,
      consoleErrors,
      findings,
    };
    fs.writeFileSync(
      path.join(RESULTS_DIR, 'detail-ready-results.json'),
      JSON.stringify(results, null, 2),
    );
    console.log('\nResults written to test-results/detail-ready-results.json');

  } catch (err) {
    console.error('FATAL ERROR:', err.message);
    console.error(err.stack);
    await screenshot(page, 'fatal-error').catch(() => {});
  } finally {
    await browser.close();
  }
})();
