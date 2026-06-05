# Podcast Knowledge Base App — Feature Audit Report

**Run:** r-1749168000 | **Date:** 2026-06-05 | **Method:** Playwright automated testing (4 parallel QA workers + synthesis)
**Total screenshots:** 90 | **Total test assertions:** 42/42 pass (core flow) | **Bugs found:** 15 unique issues

---

## Executive Summary

The app's core happy path — searching podcasts via Podcast Index, adding episodes, viewing details and insights — works reliably. However, **three missing database tables** and **two CORS-blocked Edge Functions** break the semantic search, discover, and synthesis features entirely. Of 29 feature items across Phases 1-5, **20 are fully working, 4 partially working, and 5 broken**. The app is a solid MVP with a broken search/discovery layer.

**The top 4 fixes are all small-effort and would raise the overall score from 6/10 to 8/10.**

---

## Score Card

| Area | Score | Key Finding |
|------|-------|-------------|
| Home & Navigation | 7/10 | Renders well, mobile responsive. Missing `playback_progress` errors on every load. |
| KB Management | 8/10 | CRUD works end-to-end. Synthesis tab CTA will fail (missing table). |
| Podcast Search & Add | 9/10 | 42/42 pass. Modal UX polished. Stale artwork 404s. |
| Processing Pipeline | 9/10 | Full pipeline works. Logs detailed. No bulk process action. |
| Insights & Transcript | 8/10 | All 4 insight sections render. Timestamps not clickable. |
| Semantic Search | 1/10 | UI well-designed but CORS blocks all backend requests. |
| Discover | 0/10 | Entirely non-functional — CORS blocks everything. |
| Chat (RAG) | 6/10 | UI complete but message sending not tested; may share CORS issues. |
| **Overall** | **6/10** | Solid foundation, broken differentiating features. |

---

## Root Causes (4 systemic issues)

### 1. Missing database migrations (3 tables)
`playback_progress`, `search_history`, and `kb_syntheses` are referenced in code but don't exist in Supabase. Two aren't even documented in CLAUDE.md. Pattern: feature code written before migrations were applied.

### 2. CORS misconfiguration on newer Edge Functions
`semantic-search` and `podcast-discover` reject CORS preflight, while `podcast-search` and `podcast-episodes` work fine. Newer functions were deployed without CORS boilerplate.

### 3. Documentation drift
CLAUDE.md is stale: missing 1+ Edge Functions, 2 tables undocumented, Phase 6 items already implemented but not checked off.

### 4. No client-side UUID validation
Routes pass raw URL params to Supabase without validation, causing 400 errors and silent redirects.

---

## Prioritized Fix List

| # | Fix | Effort | Unblocks |
|---|-----|--------|----------|
| 1 | Add CORS headers to `semantic-search` + `podcast-discover` Edge Functions | S | Semantic search, Discover page, Command palette `?` mode |
| 2 | Run migration for `kb_syntheses` table | S | KB cross-podcast synthesis |
| 3 | Run migration for `playback_progress` table (or remove dead code) | S | Playback progress tracking, eliminates 2 console errors/page |
| 4 | Run migration for `search_history` table (or remove dead code) | S | Search history, eliminates 6 console errors per /search |
| 5 | Add 404 catch-all route | S | Proper error handling for unknown URLs |
| 6 | Add client-side UUID validation on KB/podcast routes | S | Clean error states for bad links |
| 7 | Fix nested `<button>` HTML violation in KBCard + PodcastRow | S | Valid HTML, accessibility |
| 8 | Add `onError` fallback for podcast artwork images | S | Graceful handling of 74+ stale artwork URLs |
| 9 | Fix sidebar keyboard hint to detect OS (Ctrl+K on Windows) | S | Correct hint on non-Mac platforms |
| 10 | Update CLAUDE.md documentation | M | Accurate project state |
| 11 | Make transcript timestamps clickable | M | Audio-transcript linking |
| 12 | Sync search URL params | S | Bookmarkable/shareable search state |

---

## Critical Bugs (P0)

**P0-1: CORS on `semantic-search` Edge Function** — All transcript search fails. The app's primary value proposition (search across podcasts with semantic similarity) is completely non-functional. Affects Search page, Command palette `?` mode. (Confirmed: t4 S-1, K-1)

**P0-2: CORS on `podcast-discover` Edge Function** — Discover page shows only error banner and "No shows found". Entire page non-functional. (Confirmed: t4 D-1, t2 Bug #5)

**P0-3: Missing `kb_syntheses` table** — "Generate Synthesis" button renders but will fail. KB-level cross-podcast synthesis is broken. (Confirmed: t3 BUG-D2)

## Major Bugs (P1)

**P1-1: Missing `playback_progress` table** — Console errors on every page load. Progress bars non-functional. (Confirmed: t1, t2, t3)

**P1-2: Missing `search_history` table** — 6 console errors per /search load. History feature broken. (Confirmed: t4 S-2)

**P1-3: Nested `<button>` in `<button>`** — HTML spec violation in KBCard and PodcastRow. Accessibility issue. (Confirmed: t1, t2, t3)

**P1-4: No 404 page** — Unknown routes render blank content area. (Confirmed: t4 E-3)

**P1-5: Silent redirect on invalid UUIDs** — No error state shown. 12-16 console errors per bad navigation. (Confirmed: t2 Bug #4, t4 E-1/E-2)

## Minor Issues (P2)

- 74 stale artwork 404s with no `onError` fallback (t1)
- Mac `⌘K` hint hardcoded on Windows (t2)
- Hours stat inconsistency: sidebar "64.4 h" vs hero "64 hours" (t2)
- Transcript timestamps not clickable (t3)
- Speed control gated behind auth unnecessarily (t3)
- Search URL params not synced (t4)
- Discover error has no retry button (t4)
- Processing progress card not collapsible for ready podcasts (t3)
- No bulk "Process All" on KB page (t3)

---

## Undocumented Features (positive findings)

10 features exist that aren't in CLAUDE.md's development phases:
1. Command Palette (Ctrl+K) with KB/podcast search and `?` semantic mode
2. OPML Import modal on Profile page
3. Full Profile page with account, sign-out, danger zone
4. Auth page with magic link + Google + GitHub
5. Keyboard shortcuts (`/` → search, `Ctrl+K` → palette)
6. Audio player with speed control (1x/1.25x/1.5x/2x)
7. Podcast Subscribe button
8. Export Insights (per-podcast markdown download)
9. "All Transcript" bulk add button
10. Mobile responsive layout (already working, marked as Phase 6 future)

---

## Feature-by-Feature Comparison (29 items)

| Phase | Feature | Status |
|-------|---------|--------|
| 1 | Project scaffolding | WORKING |
| 1 | Supabase setup (tables, pgvector) | PARTIALLY WORKING (3 tables missing) |
| 1 | KB CRUD | WORKING |
| 1 | Add by YouTube URL | NOT TESTED |
| 1 | Two-tab home UI | WORKING |
| 1 | Standalone podcasts section | WORKING |
| 1 | Podcast deduplication | WORKING |
| 2 | Audio download | WORKING |
| 2 | Full processing Edge Function | WORKING |
| 2 | Whisper transcription | WORKING |
| 2 | Chunking logic | WORKING |
| 2 | Store chunks with timestamps | WORKING |
| 2 | Real-time progress (0-100%) | WORKING |
| 2 | Processing status UI | WORKING |
| 2 | Processing logs | WORKING |
| 2 | Cancel processing | WORKING |
| 2.5 | Podcast Index API creds | WORKING |
| 2.5 | podcast-search Edge Function | WORKING |
| 2.5 | podcast-episodes Edge Function | WORKING |
| 2.5 | AddPodcastModal flow | WORKING |
| 2.5 | Direct RSS audio download | WORKING |
| 2.5 | Episode deduplication | WORKING |
| 2.5 | YouTube URL fallback | NOT TESTED |
| 3 | Generate embeddings | WORKING |
| 3 | Store in pgvector | WORKING |
| 3 | Semantic search | BROKEN (CORS) |
| 3 | Search UI | PARTIALLY WORKING (UI built, backend blocked) |
| 4 | GPT-4o insights | WORKING |
| 4 | Auto-generate insights | WORKING |
| 4 | Insights panel UI | WORKING |
| 4 | KB-level synthesis | BROKEN (missing table) |
| 5 | RAG pipeline | PARTIALLY WORKING (UI exists, untested) |
| 5 | Source citations | NOT TESTED |
| 5 | Conversation history | NOT TESTED |
| 5 | Chat UI | WORKING |

---

## QA Worker Reports

Full detailed reports with screenshots are available at:
- `out/r-1749168000/t1.md` — Podcast search/add flow (17 screenshots, 42/42 pass)
- `out/r-1749168000/t2.md` — Home, KB, navigation (19 screenshots, 6 bugs)
- `out/r-1749168000/t3.md` — Detail, insights, processing (37 screenshots, 5 bugs)
- `out/r-1749168000/t4.md` — Search, discover, edge cases (17 screenshots, 9 issues)
- `out/r-1749168000/t5.md` — Full gap analysis with root cause and priority list
