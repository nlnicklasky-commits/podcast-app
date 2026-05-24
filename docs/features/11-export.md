# Export to Markdown/PDF

## 1. Overview

Export transforms PodBrain's internal data -- insights, transcripts, conversation threads, and KB-level summaries -- into portable documents that can be shared, archived, or used outside the app. The core use cases are:

- **Sharing research:** Send a colleague a polished summary of a KB's key findings without giving them PodBrain access.
- **Creating reports:** Compile insights from multiple podcasts into a structured document for a meeting, newsletter, or blog post.
- **Archiving:** Preserve a snapshot of a KB's state at a point in time, including all insights and conversation history, as a self-contained file.

PodBrain already stores structured data ideal for export: `insights.summary`, `insights.key_points`, `insights.topics`, `insights.entities` (all JSONB), `transcripts.full_text` with timestamped `segments`, and `messages.content` with `messages.sources` (cited chunks). Export assembles these into formatted Markdown or PDF.

---

## 2. User Stories

1. **As a researcher**, I want to export a single podcast's insights (summary, key points, topics, entities) as a Markdown file, so I can paste it into Notion or Obsidian for further annotation.

2. **As a knowledge base curator**, I want to export an entire KB's worth of podcast insights as a single document, so I can create a consolidated research brief.

3. **As a podcast listener**, I want to export a conversation thread from the chat panel as Markdown, so I can share the Q&A with someone who does not have PodBrain access.

4. **As a writer**, I want to export a full transcript with timestamps as plain text, so I can quote specific passages in an article with time references.

5. **As a professional**, I want to export a KB summary as PDF, so I can attach it to an email or presentation without requiring the recipient to render Markdown.

6. **As a user preparing to export**, I want to preview the document before downloading, so I can verify the content and formatting are correct.

7. **As a power user**, I want to select which sections to include (summary, key points, transcript, entities) in my export, so I can produce a focused document without irrelevant content.

---

## 3. Design & Functionality

### UI/UX Design

**Export button locations:**

| Location | Component | Scope | Button style |
|----------|-----------|-------|--------------|
| Podcast detail page header | `PodcastDetail.jsx` (action row, line 171) | Single podcast insights + transcript | Icon button next to "Add to KB" button |
| KB page header | `KnowledgeBase.jsx` (header area, line 96) | All podcast insights in the KB | Secondary button next to "Add podcast" |
| Chat panel header | `ChatPanel.jsx` (header row, line 74) | Active conversation thread | Icon button in the header's button group |
| Insights panel | `InsightsPanel.jsx` (top-right corner) | Single podcast insights only | Small icon button |

All export buttons open the same `ExportModal` component, pre-configured with the appropriate scope and defaults.

**Export format selection:**

Three formats, displayed as a segmented control in the modal:
- **Markdown** (.md) -- default. Raw Markdown text, ideal for Notion/Obsidian/GitHub.
- **PDF** (.pdf) -- formatted document with headings, margins, and page numbers.
- **Plain Text** (.txt) -- no formatting, no headers. Pure transcript or Q&A text for pasting.

**Export scope selection:**

The modal adapts based on where it was opened:

| Opened from | Default scope | Available scopes |
|-------------|---------------|------------------|
| Podcast detail | Single podcast insights | Insights only, Transcript only, Insights + Transcript |
| KB page | Full KB summary | All podcast insights, Single podcast picker, KB summary only |
| Chat panel | Active conversation | Current conversation, All conversations in KB |
| Insights panel | Single podcast insights | Insights only |

**Section customization (checkboxes):**

For podcast-level exports:
- [x] Summary
- [x] Key Points
- [ ] Topics (as tag list)
- [ ] Entities (as categorized list)
- [ ] Full Transcript (with timestamps)
- [ ] Full Transcript (without timestamps)

For conversation exports:
- [x] Messages (user + assistant)
- [x] Source citations
- [ ] Include source chunk text (expands citations into full quotes)

For KB-level exports:
- [x] KB name and description
- [x] Per-podcast summaries
- [ ] Per-podcast key points
- [ ] Cross-podcast topic index

**Export preview:**

A read-only panel on the right side of the modal (or below on mobile) shows a live-rendered preview of the document. For Markdown format, render the Markdown into HTML. For PDF, show the same rendered view with a note: "PDF layout may differ slightly." For plain text, show monospaced raw text.

The preview updates immediately when the user toggles sections or changes format.

### Behavior

**Markdown generation (template-based):**

Each export type uses a Markdown template assembled from database fields:

```markdown
# {podcast.title}
*{podcast.channel} -- {formatDate(podcast.created_at)}*
*Duration: {formatDuration(podcast.duration_seconds)}*

## Summary
{insights.summary}

## Key Points
1. {insights.key_points[0]}
2. {insights.key_points[1]}
...

## Topics
{insights.topics.join(', ')}

## People, Companies & Concepts
- **{entity.name}** ({entity.type})
...

## Transcript
**{formatTimestamp(segment.start)}** -- {segment.text}
...

---
*Exported from PodBrain on {date}*
```

For KB-level exports, each podcast gets its own H2 section under a top-level H1 with the KB name.

For conversation exports:

```markdown
# Chat: {conversation.title}
*Knowledge Base: {kb.name} -- Exported {date}*

**You:** {message.content}

**PodBrain:** {message.content}

> Sources:
> [1] {source.podcast_title} @ {formatTimestamp(source.start_time)}
> "{source.text}"
```

**PDF generation approach:**

Client-side using `html2pdf.js` (wraps html2canvas + jsPDF). The Markdown is first rendered to HTML using the preview renderer, then converted to PDF. This avoids needing a server-side Puppeteer setup, keeps the stack JS-only, and requires no edge function.

Why not server-side Puppeteer: Supabase Edge Functions run on Deno with limited binary support. Puppeteer requires a headless Chrome binary, which is not available in the Edge Function runtime. A separate service (Railway or Vercel serverless function) would add infrastructure complexity for a feature that works well client-side.

Why not `markdown-pdf` (npm): Depends on PhantomJS, which is deprecated. `html2pdf.js` is actively maintained and ~200KB gzipped.

**File naming convention:**

```
{scope}_{sanitized-name}_{YYYY-MM-DD}.{ext}

Examples:
  podcast_how-transformers-changed-ai_2026-05-24.md
  kb_ai-startups_2026-05-24.pdf
  chat_what-are-key-takeaways_2026-05-24.txt
```

Names are lowercased, spaces replaced with hyphens, special characters stripped. Max 80 characters before the date suffix.

**Batch export (all podcasts in a KB):**

When exporting all podcasts in a KB, the system queries all podcast IDs via `knowledge_base_podcasts` junction table, then batch-fetches insights and optionally transcripts. For large KBs (10+ podcasts), this produces a single document with a table of contents at the top:

```markdown
# AI Startups Knowledge Base

## Table of Contents
1. [How Transformers Changed AI](#how-transformers-changed-ai)
2. [The Future of AGI](#the-future-of-agi)
...

---

## How Transformers Changed AI
*The AI Podcast / Lex Fridman*
{insights...}

## The Future of AGI
*Gradient Dissent / Weights & Biases*
{insights...}
```

---

## 4. Architecture & Technical Specs

### PDF Generation Strategy

**Recommendation: `html2pdf.js` client-side.**

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| `html2pdf.js` (client) | Zero server cost, JS-only, works offline | Limited typography control, large PDFs may be slow, renders as image-based PDF | **Use this** |
| `jsPDF` direct (client) | Small bundle, text-based PDF | Manual layout (no HTML/CSS), tedious for complex documents | Too labor-intensive |
| Puppeteer edge function | Pixel-perfect PDF, real CSS | Not available in Supabase Edge Functions (no Chrome binary) | Not viable |
| Vercel serverless + Puppeteer | Pixel-perfect, serverless | Adds infra, cold starts, 50MB function size limit | Overkill for personal use |

Install: `npm install html2pdf.js --legacy-peer-deps`

Usage pattern:

```typescript
import html2pdf from 'html2pdf.js'

function generatePDF(htmlElement: HTMLElement, filename: string) {
  return html2pdf()
    .set({
      margin: [15, 15, 15, 15],
      filename,
      html2canvas: { scale: 2 },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    })
    .from(htmlElement)
    .save()
}
```

The preview panel's rendered HTML element is passed directly to `html2pdf`. This guarantees the PDF matches the preview.

### Markdown Templates

Templates are plain functions, not files. Each returns a string:

```typescript
// src/lib/exportTemplates.ts

export function podcastInsightsMarkdown(podcast, insights, options): string
export function podcastTranscriptMarkdown(podcast, transcript, options): string
export function kbSummaryMarkdown(kb, podcastsWithInsights, options): string
export function conversationMarkdown(conversation, messages, kbName, options): string
```

`options` controls which sections to include (matching the checkboxes in the modal). Templates use template literals, not a templating engine -- keeps dependencies at zero.

### Edge Function vs Client-Side

**All export logic runs client-side.** No edge function needed.

The data required for export (insights, transcripts, messages) is already fetched by existing service functions (`getInsights`, `getTranscript`, `getMessages` in `src/services/`). The frontend already has this data loaded when the user is on the relevant page. Export simply transforms it into a document format.

The only scenario that would require server-side processing is batch KB export where the user has not navigated to each podcast's detail page. In that case, the `ExportModal` fetches the missing data directly via Supabase queries before generating the document. This is still client-side -- no edge function involved.

### Frontend Components

| Component | Path | Responsibility |
|-----------|------|----------------|
| `ExportModal` | `src/components/ExportModal.jsx` | Modal shell: format selector, scope selector, section checkboxes, preview, download button |
| `ExportPreview` | `src/components/ExportPreview.jsx` | Renders Markdown to HTML for preview and PDF source. Uses a lightweight Markdown-to-HTML renderer |
| `FormatSelector` | Inline in `ExportModal` | Segmented control for Markdown / PDF / Plain Text |
| `SectionPicker` | Inline in `ExportModal` | Checkbox list for include/exclude sections |

**Markdown rendering for preview:**

Use a minimal Markdown-to-HTML function (custom, ~50 lines) that handles headings, bold, italic, lists, blockquotes, and horizontal rules. No need for a full library like `marked` or `react-markdown` -- the templates produce a constrained subset of Markdown.

Alternatively, add `marked` (~12KB gzipped) if template complexity grows:

```
npm install marked --legacy-peer-deps
```

**Download trigger:**

```typescript
function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
```

For Markdown and plain text, this function is called directly. For PDF, `html2pdf.js` handles the download via its `.save()` method.

---

## 5. Implementation Phases

### Phase 1: Single Podcast Export (Markdown + Plain Text)

- [ ] Create `src/lib/exportTemplates.ts` with `podcastInsightsMarkdown` and `podcastTranscriptMarkdown`
- [ ] Build `ExportModal` component with format selector and section checkboxes
- [ ] Build `ExportPreview` component with basic Markdown-to-HTML rendering
- [ ] Add export button to `PodcastDetail.jsx` action row
- [ ] Add export button to `InsightsPanel.jsx`
- [ ] Implement `downloadFile` utility for .md and .txt downloads
- [ ] Handle loading state (fetching insights/transcript if not already loaded)

**Estimated effort:** 1-2 days

### Phase 2: KB Batch Export + Conversation Export

- [ ] Create `kbSummaryMarkdown` and `conversationMarkdown` templates
- [ ] Add export button to `KnowledgeBase.jsx` header
- [ ] Add export button to `ChatPanel.jsx` header
- [ ] Implement batch data fetching for KB export (all podcasts' insights in one query)
- [ ] Add table of contents generation for KB exports
- [ ] Add scope selection UI in modal (adapts based on entry point)

**Estimated effort:** 1-2 days

### Phase 3: PDF Support + Polish

- [ ] Install and integrate `html2pdf.js`
- [ ] Wire up PDF generation from the preview panel's rendered HTML
- [ ] Add PDF-specific styling (page margins, font sizes, page break hints)
- [ ] Test large exports (10+ podcasts, 2-hour transcript) for performance
- [ ] Add "Generating PDF..." loading state with progress indication
- [ ] Mobile-responsive modal layout (preview below instead of beside)

**Estimated effort:** 1-2 days

---

## 6. Dependencies & Risks

**Dependencies:**

- **`html2pdf.js`** (npm) -- required for PDF export. ~200KB gzipped. No native dependencies. MIT licensed.
- **Existing service functions** -- `getInsights()`, `getTranscript()`, `getMessages()`, `listConversations()` from `src/services/`. All already exist and return the required data structures.
- **Insights and transcripts in DB** -- Export only works for podcasts with status `ready`. The modal should disable export for pending/processing podcasts.

**Risks:**

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Large transcript export (2+ hours) produces slow PDF generation | Medium | Medium | Add a character limit warning for transcripts over 50K words. Offer Markdown as the recommended format for large transcripts. Show a progress indicator during PDF generation. |
| `html2pdf.js` renders text as images (canvas-based), making PDFs large and non-searchable | High | Low | Acceptable for personal use. For text-searchable PDFs, could later switch to `@react-pdf/renderer` which produces native text PDFs, but at higher implementation cost. |
| Markdown preview does not exactly match PDF output | Medium | Low | Use the same HTML element for both preview and PDF source. Minor differences in page breaks are expected and documented in the UI. |
| KB batch export fetches all insights in one go, potentially slow for large KBs | Low | Low | Personal use -- unlikely to have 50+ podcasts in one KB. Add a warning for KBs with >20 podcasts. Fetch in batches of 10 if needed. |
| Conversation export with many messages produces very long documents | Low | Low | Cap at 100 messages per export. Show a "This conversation has N messages. Only the most recent 100 will be exported." notice. |

---

## 7. Estimated Effort

| Phase | Work | Effort |
|-------|------|--------|
| Phase 1 -- Single Podcast Export | Templates, ExportModal, ExportPreview, download utility | 1-2 days |
| Phase 2 -- KB + Conversation Export | Batch fetching, conversation templates, scope selection | 1-2 days |
| Phase 3 -- PDF Support | html2pdf.js integration, PDF styling, large export handling | 1-2 days |
| **Total** | | **3-6 days** |

New npm dependencies: 1 (`html2pdf.js`, Phase 3 only). Phases 1-2 are zero-dependency.

New edge functions: 0.

New database tables/columns: 0.

Files modified: `PodcastDetail.jsx`, `KnowledgeBase.jsx`, `ChatPanel.jsx`, `InsightsPanel.jsx` (add export buttons).

Files created: `ExportModal.jsx`, `ExportPreview.jsx`, `src/lib/exportTemplates.ts`.
