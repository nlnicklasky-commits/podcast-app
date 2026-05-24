# Feature Plan: Clip & Highlight System

## 1. Overview

The Clip & Highlight System turns PodBrain into a true "second brain" for podcast content by letting users select ranges within a transcript and save them as **clips** -- reusable, searchable, citable excerpts with optional notes and tags. Clips are first-class objects: they appear as highlighted ranges in the transcript, surface in semantic search and RAG chat, can be organized into collections, and exported.

**Why it matters.** Today PodBrain processes podcasts into chunks and insights automatically, but the user has no way to mark the passages *they* care about. Clips close the loop between machine-generated knowledge (insights, chunks, embeddings) and human curation (personal highlights, annotations, and synthesis). The result is a personal annotation layer on top of the existing knowledge graph.

**Reference products:**

| Product | What we borrow |
|---------|---------------|
| **Kindle Highlights** | Select text in a reading view, save with optional note, browse all highlights in a library |
| **Readwise** | Tag-based organization, spaced resurfacing, export to markdown/Notion |
| **Notion Web Clipper** | Quick-save with metadata (source, timestamp), clip cards, collections |
| **Snipd** | Podcast-native clipping with timestamp ranges, AI-generated titles for clips |

---

## 2. User Stories

1. **As a listener reviewing a transcript,** I want to click-and-drag to select a passage and save it as a clip with one click, so I can capture ideas without breaking my reading flow.

2. **As a researcher building a knowledge base,** I want to add a note and tags to each clip so I can annotate why a passage matters and find it later by topic.

3. **As a power user with dozens of processed podcasts,** I want a Clips Library page where I can filter by knowledge base, podcast, and tag so I can browse all my highlights in one place.

4. **As a user reading a transcript,** I want to see previously saved clips highlighted inline (like Kindle's blue underlines) so I know which passages I already captured.

5. **As a user chatting with a knowledge base,** I want the RAG system to prioritize my clips when they overlap with retrieved chunks, and cite them distinctly (e.g., "[Clip]" badge), so my curated notes surface naturally in answers.

6. **As a user who just processed a podcast,** I want a "Quick-clip key points" button that auto-creates one clip per key point from the insights panel, so I get a head start without manual selection.

7. **As a user leaving PodBrain,** I want to export my clips as markdown (grouped by podcast or by tag) so I can import them into Notion, Obsidian, or a blog post.

8. **As a user revisiting old clips,** I want to edit a clip's note, add or remove tags, or delete the clip entirely, so my collection stays clean and current.

---

## 3. Design & Functionality

### 3.1 UI/UX Design

#### Text selection in transcript -- floating "Save Clip" tooltip

When the user click-drags across text in the `TranscriptView` component (the segment-based rendering at `PodcastDetail.jsx:303-319`), a floating tooltip appears above the selection:

```
 +----------------------------------+
 | Save Clip     [note icon] [tag]  |
 +----------------------------------+
```

- **Position:** anchored to the top-center of the selected range via `window.getSelection().getRangeAt(0).getBoundingClientRect()`.
- **Dismiss:** clicking outside the selection or pressing Escape.
- **Accessibility:** tooltip is keyboard-focusable; pressing Enter triggers "Save Clip."

#### Clip creation dialog

Clicking "Save Clip" opens a compact inline form (not a full modal -- stays in context):

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| Selected text | readonly textarea | auto | Pre-filled from selection; user cannot edit the text itself |
| Time range | readonly | auto | `start_time` -- `end_time` derived from the segments the selection spans |
| Note | textarea | no | Free-form annotation (max 500 chars) |
| Tags | tag input (comma-separated) | no | Autocomplete from existing tags across all clips |

Saving writes to the `clips` table and immediately renders the clip as an inline highlight in the transcript.

#### Clips sidebar/panel on podcast detail page

A new tab **"Clips"** is added to the existing tab bar alongside Insights, Transcript, and Processing (see `PodcastDetail.jsx:124-128`). This tab shows:

- Count of clips for this podcast
- List of `ClipCard` components sorted by `start_time`
- Each card shows: truncated text (2 lines), timestamp range, note preview, tags
- Clicking a card scrolls the Transcript tab to that passage and highlights it

#### Clips Library page

A new top-level route `/clips` accessible from the sidebar/layout. Contains:

- **Filter bar:** Knowledge Base dropdown, Podcast dropdown (filtered by selected KB), Tag multi-select, free-text search
- **Sort options:** newest first, oldest first, by podcast, by tag
- **Grid of ClipCards** with podcast source metadata (thumbnail, title, channel)
- **Bulk actions:** export selected, delete selected
- **Empty state:** "No clips yet. Open a podcast transcript and start highlighting."

#### Clip card design

```
+---------------------------------------------------+
| "The key insight here is that retrieval-          |
|  augmented generation doesn't just improve..."    |
|                                                    |
| [note icon] "This contradicts what Karpathy said" |
|                                                    |
| [AI Startups]  [rag]  [architecture]              |
|                                                    |
| The Lex Fridman Podcast  ·  12:34 - 13:02         |
+---------------------------------------------------+
```

- Clip text in serif font (matches transcript styling)
- Note in smaller muted text with icon prefix
- Tags as `<Tag variant="accent">` pills (reuses existing `Tag` component from `ui.jsx`)
- Source line: podcast title, channel, timestamp range in mono

#### Inline clip indicators in transcript view

Saved clips render as highlighted ranges in the transcript. Implementation:

- Each transcript segment's text is split at clip boundaries
- Clipped portions receive a background highlight: `bg-[var(--accent-faint)]` with a left border `border-l-2 border-[var(--accent)]`
- Hovering a highlighted range shows a mini tooltip with the clip's note (if any) and a "View clip" link
- Multiple overlapping clips stack highlights (darker shade for overlap regions)

#### Quick-add: auto-clip key points from insights

The InsightsPanel (see `InsightsPanel.jsx:47-63`) gains a "Clip All Key Points" button in the Key Points section header. Behavior:

- For each key point string, find the best-matching chunk(s) by text overlap
- Create a clip using the chunk's `start_time`/`end_time` and the key point text
- Tag each auto-clip with `auto:key-point`
- Show a toast: "Created N clips from key points"

### 3.2 Behavior

#### Selection mechanism

Two selection modes for different user preferences:

1. **Click-drag** (default): Standard browser text selection across segment `<p>` elements. The `ClipSelector` component listens for `mouseup` on the transcript container, reads `window.getSelection()`, and maps the selected DOM nodes back to transcript segment indices and character offsets.

2. **Click start + click end** (mobile-friendly fallback): User clicks a segment timestamp to mark the start, then clicks another to mark the end. The full text between those two segment boundaries becomes the clip. Indicated by visual "start pin" and "end pin" markers.

#### How clips relate to existing chunks

Clips and chunks are **independent but overlapping** data:

- A clip may span a partial chunk, a full chunk, or multiple chunks.
- Clips store their own `text`, `start_time`, and `end_time` -- they do not reference chunk IDs directly.
- When the chat function retrieves chunks, it cross-references clip boundaries by time range overlap to determine if a returned chunk falls within a user clip.
- Clip embeddings are generated independently (see Architecture section) so clips participate in vector search on their own terms.

#### Clip editing

- **Edit note:** inline edit on the ClipCard; saves on blur or Enter.
- **Edit tags:** click a tag to remove it; click "+ tag" to add. Autocomplete from global tag list.
- **Text is immutable** after creation (it's a snapshot of the transcript at a specific time range).
- **Time range is immutable** (derived from the transcript segments).

#### Clip deletion

- Single clip: click trash icon on ClipCard, confirm with inline "Delete? Yes / No" prompt (no modal).
- Bulk delete: checkbox selection in Clips Library, then "Delete selected" button with count confirmation.
- Deleting a clip also deletes its row in `clip_embeddings` (cascade).

#### Clips in chat

When the `chat` edge function (see `supabase/functions/chat/index.ts:164-180`) retrieves chunks via `match_chunks`, it performs a post-retrieval enrichment step:

1. Query `clips` where `podcast_id IN (retrieved podcast IDs)` and `start_time`/`end_time` overlap with any retrieved chunk's time range.
2. For each overlapping clip, attach the clip's `note` and `tags` as additional context in the system prompt.
3. In the source citations returned to the frontend, mark sources that overlap with clips with a `clip_id` and `clip_note` field.
4. The frontend renders these with a distinct "[Clip]" badge next to the citation number.

---

## 4. Architecture & Technical Specs

### 4.1 Database Changes

#### `clips` table

```sql
create table clips (
  id uuid primary key default gen_random_uuid(),
  podcast_id uuid not null references podcasts(id) on delete cascade,
  text text not null,
  start_time float not null,
  end_time float not null,
  note text,
  tags jsonb default '[]'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Indexes
create index idx_clips_podcast on clips(podcast_id);
create index idx_clips_time_range on clips(podcast_id, start_time, end_time);
create index idx_clips_tags on clips using gin(tags);
create index idx_clips_created on clips(created_at desc);

-- Updated_at trigger (reuses existing function from 001_initial_schema.sql)
create trigger clips_updated_at
  before update on clips
  for each row execute function update_updated_at();
```

**Column rationale:**

- `text`: the exact selected passage, stored as a snapshot. Not a computed view -- the transcript text won't change, and storing it directly makes clips self-contained for search and export.
- `start_time` / `end_time`: float seconds, matching the existing `chunks.start_time`/`chunks.end_time` convention. Derived from the Whisper segment timestamps during clip creation.
- `tags`: JSONB array of strings (e.g., `["rag", "architecture", "auto:key-point"]`). GIN-indexed for efficient `@>` containment queries.
- No `knowledge_base_id` column. Clips attach to podcasts, which are KB-independent (linked via `knowledge_base_podcasts` junction table). A clip on a podcast is visible in every KB that contains that podcast.

#### Clip embeddings strategy

**Decision: separate `embedding` column on `clips`, not a separate table.**

```sql
alter table clips add column embedding vector(1536);
create index idx_clips_embedding on clips using ivfflat (embedding vector_cosine_ops) with (lists = 50);
```

Rationale for embedding clips directly rather than reusing chunk embeddings:

- Clips are typically shorter or differently bounded than chunks (which are ~500 tokens with sentence-boundary splitting). A clip might be 2 sentences from the middle of a chunk.
- Clip text + note together capture the user's intent, which may differ from the chunk's semantic center.
- Embedding `text || ' ' || note` gives clips their own semantic identity in vector search.
- The cost is minimal: one OpenAI embedding call per clip creation (~$0.00002 per clip at current text-embedding-3-small pricing).

#### New RPC function: `match_clips`

```sql
create or replace function match_clips(
  query_embedding vector(1536),
  match_kb_id uuid,
  match_count int default 5,
  match_threshold float default 0.3
)
returns table (
  id uuid,
  podcast_id uuid,
  text text,
  start_time float,
  end_time float,
  note text,
  tags jsonb,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    c.id,
    c.podcast_id,
    c.text,
    c.start_time,
    c.end_time,
    c.note,
    c.tags,
    1 - (c.embedding <=> query_embedding) as similarity
  from clips c
  inner join knowledge_base_podcasts kbp
    on kbp.podcast_id = c.podcast_id
    and kbp.knowledge_base_id = match_kb_id
  where c.embedding is not null
    and 1 - (c.embedding <=> query_embedding) > match_threshold
  order by c.embedding <=> query_embedding
  limit match_count;
end;
$$;
```

### 4.2 Edge Function Changes

#### `chat` function modifications (v6)

The existing `chat` function (`supabase/functions/chat/index.ts`) is modified to include clip-aware retrieval:

1. **After step 2 (vector search for chunks):** Add a parallel call to `match_clips` with the same `query_embedding` and `knowledge_base_id`. Retrieve up to 5 matching clips.

2. **Step 4 (build context):** Interleave clip results with chunk results. Clips are labeled distinctly in the context:

```
[Clip Source 1: "Episode Title" at 12:34 - 13:02 | User note: "This contradicts Karpathy"]
<clip text>
```

3. **Step 7 (build source citations):** Add `is_clip: true`, `clip_id`, `clip_note`, and `clip_tags` fields to sources that originate from clips.

4. **Deduplication:** If a clip's time range fully overlaps with a retrieved chunk from the same podcast, prefer the clip (it has user annotation context). Remove the redundant chunk from the context window to stay within token limits.

#### New endpoint: clip embedding generation

Rather than a standalone edge function, embed clips client-side via the existing OpenAI embedding pattern:

- On clip creation, the frontend calls a thin new edge function `embed-clip` that:
  1. Reads the clip text + note from the request body
  2. Calls OpenAI `text-embedding-3-small` to generate the embedding
  3. Updates the `clips` row with the embedding vector
- This mirrors how `process-podcast` generates chunk embeddings, but for a single item.

Alternatively, for Phase 1 simplicity, clip embedding can be deferred (clips still appear in transcript highlights and the clips list -- they just won't surface in semantic search until Phase 2).

### 4.3 Frontend Components

#### New components

| Component | File | Purpose |
|-----------|------|---------|
| `ClipSelector` | `src/components/ClipSelector.jsx` | Wraps transcript text, listens for selection events, renders floating tooltip, handles clip creation form |
| `ClipCard` | `src/components/ClipCard.jsx` | Displays a single clip with text, note, tags, source info, edit/delete actions |
| `ClipsList` | `src/components/ClipsList.jsx` | Fetches and renders clips for a single podcast; used in the Clips tab on PodcastDetail |
| `ClipsLibrary` | `src/pages/ClipsLibrary.jsx` | Top-level page at `/clips`; filter bar + grid of ClipCards across all podcasts |
| `ClipIndicator` | `src/components/ClipIndicator.jsx` | Renders highlight overlays on transcript segments that fall within a saved clip's time range |
| `TagInput` | `src/components/TagInput.jsx` | Reusable tag input with autocomplete; used in clip creation and editing |

#### Modifications to existing components

**`TranscriptView` (in `PodcastDetail.jsx:279-328`):**
- Wrap the segment rendering loop with `ClipSelector` context
- For each segment, check if any saved clips overlap its time range
- If overlap exists, split the segment text at clip boundaries and wrap clipped portions with `ClipIndicator`
- Pass `onClipCreated` callback to refresh the clips list

**`PodcastDetail.jsx`:**
- Add a 4th tab: `{ id: 'clips', label: 'Clips', icon: <Icons.Bookmark size={12} /> }`
- Fetch clips count on load for the tab badge
- When Clips tab is active, render `<ClipsList podcastId={podcastId} />`

**`InsightsPanel.jsx`:**
- Add "Clip All" button to the Key Points section header
- On click, call `autoClipKeyPoints(podcastId, insights.key_points)` service function

**`ChatPanel.jsx` (in `MessageBubble`):**
- Check `source.is_clip` flag on each citation
- If true, render a `[Clip]` badge with distinct styling (e.g., yellow accent instead of blue)
- Show `clip_note` in the source tooltip

**`App.jsx`:**
- Add route: `<Route path="/clips" element={<ClipsLibrary />} />`

**`Layout.jsx`:**
- Add "Clips" link to the sidebar navigation

#### New service layer

**`src/services/clips.js`:**

```typescript
// CRUD
getClips(podcastId: string): Promise<Clip[]>
getClipsByKB(knowledgeBaseId: string): Promise<Clip[]>
getAllClips(filters?: ClipFilters): Promise<Clip[]>
createClip(clip: CreateClipInput): Promise<Clip>
updateClip(clipId: string, updates: UpdateClipInput): Promise<Clip>
deleteClip(clipId: string): Promise<void>
deleteClips(clipIds: string[]): Promise<void>

// Bulk operations
autoClipKeyPoints(podcastId: string, keyPoints: string[]): Promise<Clip[]>

// Tags
getAllTags(): Promise<string[]>

// Export
exportClips(clipIds: string[], format: 'markdown'): string
```

### 4.4 Search Integration

#### How clips surface in semantic search

Clips participate in search through two mechanisms:

1. **Direct vector match:** The `match_clips` RPC function returns clips whose embeddings are similar to the query. These appear in search results with a `[Clip]` badge, the user's note, and a link to the source podcast + timestamp.

2. **Chunk overlap enrichment:** When a chunk is returned by `match_chunks` and its time range overlaps with a saved clip, the search result is annotated with the clip's note and tags. This adds user-curated context to machine-generated chunks.

#### How clips enhance RAG chat responses

The chat system prompt is extended to instruct the model:

```
When a source is marked as [Clip], it represents a passage the user
previously highlighted as important. Give these sources extra weight
and mention the user's note if relevant.
```

This creates a feedback loop: the user's curation activity (clipping) directly improves the quality of future chat answers by signaling what matters to them.

---

## 5. Implementation Phases

### Phase 1: Basic clip creation + clips list per podcast
**Scope:** The core loop -- select text, save clip, view clips.

- [ ] Database migration: create `clips` table with indexes and trigger
- [ ] `src/services/clips.js`: `createClip`, `getClips`, `updateClip`, `deleteClip`
- [ ] `ClipSelector` component: `mouseup` listener on transcript, floating tooltip, inline creation form
- [ ] `ClipCard` component: display clip text, note, tags, timestamp, edit/delete
- [ ] `ClipsList` component: fetch and render clips for a podcast
- [ ] `ClipIndicator` component: highlight saved clip ranges in transcript segments
- [ ] Modify `TranscriptView` to integrate `ClipSelector` and `ClipIndicator`
- [ ] Add "Clips" tab to `PodcastDetail` page
- [ ] `TagInput` component with autocomplete

**Estimated effort:** 3-4 days

### Phase 2: Clips library, search, export
**Scope:** Cross-podcast clip management and discoverability.

- [ ] `ClipsLibrary` page with filter bar (KB, podcast, tag, text search)
- [ ] Add `/clips` route and sidebar navigation link
- [ ] Add `embedding` column to `clips` table
- [ ] `embed-clip` edge function (generate + store embedding on clip creation)
- [ ] `match_clips` RPC function for vector search
- [ ] Backfill embeddings for existing clips
- [ ] Markdown export: `exportClips()` service function + "Export" button in ClipsLibrary
- [ ] Bulk selection and bulk delete in ClipsLibrary

**Estimated effort:** 3-4 days

### Phase 3: Chat integration, auto-clip, collections
**Scope:** Clips as active participants in the RAG pipeline.

- [ ] Modify `chat` edge function (v6): parallel `match_clips` call, clip-aware context building, deduplication
- [ ] Update `ChatPanel` / `MessageBubble` to render `[Clip]` badges on clip-sourced citations
- [ ] "Clip All Key Points" button in `InsightsPanel`: `autoClipKeyPoints()` matching key points to chunks
- [ ] Clip collections (optional grouping layer above tags -- table: `clip_collections` with a junction `clip_collection_items`)
- [ ] Spaced resurfacing: daily "clip of the day" notification or dashboard widget (stretch)

**Estimated effort:** 4-5 days

---

## 6. Dependencies & Risks

### Dependencies

| Dependency | What it blocks | Mitigation |
|-----------|---------------|------------|
| Transcript segments with timestamps must exist | Clip creation requires `start_time`/`end_time` from Whisper segments | Clips tab only appears for podcasts with status `ready` |
| OpenAI text-embedding-3-small API | Clip embeddings for search | Phase 1 works without embeddings; search/chat integration deferred to Phase 2-3 |
| Existing `match_chunks` RPC function | Pattern for `match_clips` | Already deployed and working; same structure |
| `knowledge_base_podcasts` junction table | Scoping clips to a KB in search | Already exists; `match_clips` joins through it |

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| **DOM selection mapping is fragile.** Mapping `window.getSelection()` back to transcript segment indices across React's virtual DOM can break with re-renders or edge cases (partial word selection, selecting across segment boundaries). | Medium | High | Use `data-segment-index` and `data-char-offset` attributes on rendered segment text. Fall back to the click-start/click-end mode if drag selection fails. Write thorough unit tests for the selection-to-segment mapping logic. |
| **Overlapping clips create visual clutter.** If a user saves many clips in the same transcript region, the inline highlights become unreadable. | Low | Medium | Cap highlight nesting at 2 levels. For regions with 3+ overlapping clips, show a single highlight with a badge "(3 clips)" that opens a popover listing them. |
| **Chat token budget.** Adding clip context to the system prompt increases token count. If a user has many clips that overlap with retrieved chunks, the context window could exceed limits. | Medium | Medium | Cap clip context at 3 clips per chat query. Clips are injected after chunks; if total context exceeds 6000 tokens, drop the lowest-similarity clips first. |
| **Embedding cost at scale.** Each clip requires one embedding API call. A power user creating 100+ clips per podcast could add up. | Low | Low | At $0.02 per 1M tokens, 100 clips averaging 100 tokens each costs ~$0.0002. Negligible. Batch embedding calls where possible. |
| **No auth yet.** Clips are not user-scoped (no `user_id` column) because the app doesn't have auth. If/when multi-user is added, clips will need an `owner_id` and RLS policies. | Low (single-user now) | High (later) | Add a nullable `user_id` column in Phase 1 migration with a comment noting it's for future auth. This avoids a breaking migration later. |

---

## 7. Estimated Effort

| Phase | Scope | Days | Cumulative |
|-------|-------|------|------------|
| Phase 1 | Core clip CRUD, transcript selection UI, clips tab | 3-4 | 3-4 days |
| Phase 2 | Clips library, embeddings, search, export | 3-4 | 6-8 days |
| Phase 3 | Chat integration, auto-clip, collections | 4-5 | 10-13 days |
| **Total** | **Full feature** | **10-13 days** | |

**Assumptions:** Single developer (Nick), working with Claude Code for acceleration. Estimates include DB migration, edge function updates, frontend components, and light manual testing. Does not include automated test coverage or design polish beyond functional UI.

**Recommended approach:** Ship Phase 1 first, use it for a week to validate the selection UX and clip workflow, then proceed to Phase 2. Phase 3 (chat integration) depends on having enough clips saved to make the RAG enrichment meaningful.
