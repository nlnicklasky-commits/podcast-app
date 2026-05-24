# Semantic Search UI

## 1. Overview

Semantic Search exposes PodBrain's existing vector search infrastructure as a standalone, direct-access search interface -- separate from the conversational RAG chat. Users type a natural language query and receive a ranked list of transcript chunks with podcast source, timestamp, relevance score, and surrounding context.

**What it does:** Embeds the user's query via OpenAI `text-embedding-3-small`, runs cosine similarity against the `chunks` table's `vector(1536)` column using the existing `match_chunks` RPC, and returns raw results without passing them through an LLM. The user sees the actual transcript text, not a generated summary.

**Why it matters:** The existing chat (Phase 5, `chat/index.ts` edge function) synthesizes an LLM answer from retrieved chunks, which is useful for questions but hides the raw source material. Semantic Search solves a different problem: "Show me everywhere my podcasts discuss X." It is a research tool -- find, scan, and jump to specific moments across an entire knowledge base or the full podcast library.

**How it differs from chat:**

| Dimension | Chat (existing) | Semantic Search (new) |
|-----------|-----------------|----------------------|
| Output | LLM-generated answer with `[Source N]` citations | Raw chunk text, ranked by similarity |
| Latency | 3-8s (embedding + vector search + LLM generation) | <1s (embedding + vector search only) |
| Scope | Single knowledge base (`match_kb_id` param) | Single KB, cross-KB, or entire library |
| Cost per query | Embedding + Groq Llama 3.3 70B tokens | Embedding only (~$0.0001) |
| Use case | "What do experts think about X?" | "Find every mention of X" |
| Persistence | Saves to `conversations`/`messages` tables | Optional search history, no conversation state |

---

## 2. User Stories

1. **As a researcher**, I want to type a natural language query and see all relevant podcast moments ranked by relevance, so I can quickly find specific discussions without reading full transcripts.

2. **As a knowledge base curator**, I want to filter search results to a specific knowledge base or podcast, so I can focus on a particular topic domain.

3. **As a podcast listener**, I want to click a search result and jump directly to that timestamp in the podcast detail view, so I can read the full context around a match.

4. **As a power user**, I want to press `/` from anywhere in the app to open the search interface, so I can search without navigating away from my current view.

5. **As a repeat researcher**, I want to see my recent searches when I open the search page, so I can quickly re-run common queries without retyping them.

6. **As a user scanning results**, I want to see the relevance score and surrounding context for each chunk, so I can judge which results are worth exploring before clicking through.

7. **As a user with a large library**, I want paginated results with a "load more" button, so the interface remains fast even when dozens of chunks match my query.

---

## 3. Design & Functionality

### UI/UX Design

**Search Page Layout** (`/search`)

```
+----------------------------------------------------------+
| [/] Search bar (full width, autofocused)          [Filters v] |
+----------------------------------------------------------+
| Scope: [All Podcasts] [KB: AI Startups] [KB: Health...]  |
| Filters: min relevance 0.3  |  date range  |  podcast   |
+----------------------------------------------------------+
| 24 results for "transformer architecture"     0.4s       |
+----------------------------------------------------------+
| Result Card 1                                            |
| Result Card 2                                            |
| ...                                                      |
| [Load more results]                                      |
+----------------------------------------------------------+
| Recent Searches: "attention mechanism" | "diet studies"  |
+----------------------------------------------------------+
```

The search page is a full-page route, not a modal. The search bar sits at the top, visually similar to the `CommandPalette` component's input styling (see `src/components/CommandPalette.jsx` line 78: `Icons.Search` icon + text input + `esc` hint) but occupying the full content width.

**Result Card Design**

Each result card displays:
- **Podcast name** and **show/channel** (from `podcasts.title` and `podcasts.channel`, joined via `chunks.podcast_id`)
- **Timestamp** (from `chunks.start_time`, formatted via `formatTimestamp()` from `src/lib/utils.js`)
- **Chunk text** with the query terms contextually highlighted (bold spans around semantically relevant phrases -- note: since this is vector search not keyword search, highlighting is best-effort using the original query tokens)
- **Relevance score** displayed as a percentage badge (e.g., "92% match") derived from the `similarity` value returned by `match_chunks`
- **Knowledge base tag(s)** showing which KB(s) contain this podcast (via `knowledge_base_podcasts` junction table)

```
+----------------------------------------------------------+
| [92%]  The AI Podcast / Lex Fridman                      |
|        @ 14:32                                           |
|                                                          |
| "...the transformer architecture fundamentally changed   |
|  how we think about sequence modeling. The self-attention |
|  mechanism allows the model to look at all positions..." |
|                                                          |
| KB: AI Startups  |  1h 23m episode  |  Added Mar 12      |
+----------------------------------------------------------+
```

Card styling follows the existing `PodcastRow` component pattern in `KnowledgeBase.jsx` (line 206): surface background, border, rounded corners, hover accent border.

**Filter Controls**

Filters sit in a collapsible row below the search bar:
- **Scope selector** -- pill toggle: "All Podcasts" (searches entire library) or a specific knowledge base (dropdown populated from `knowledge_bases` table)
- **Podcast filter** -- optional dropdown to narrow to a single podcast within the selected scope
- **Minimum relevance** -- slider or dropdown (0.3 to 0.9, default 0.3 matching the existing `SIMILARITY_THRESHOLD` in `chat/index.ts` line 19)
- **Date range** -- optional from/to date pickers filtering on `podcasts.created_at`

Filters are collapsed by default on mobile, shown inline on desktop.

**Click-to-Navigate**

Clicking a result card navigates to the podcast detail page with the timestamp as a query parameter:
- If the chunk belongs to a KB: `/kb/{kbId}/podcast/{podcastId}?t={startTime}`
- If accessed from "All Podcasts" scope: `/podcast/{podcastId}?t={startTime}`

The `PodcastDetail` page will need to read the `?t=` query param and scroll/highlight the corresponding transcript segment. This is a minor enhancement to the existing page.

**Empty States**

- **Initial state (no query):** "Search across all your podcast transcripts. Type a question or topic above." + recent searches if any exist.
- **Loading state:** Skeleton cards (3 shimmer placeholders) with the same dimensions as result cards. Display immediately on query submission.
- **No results:** "No matches found for '{query}'. Try broader terms or lower the relevance threshold." with a button to reset filters.
- **No processed podcasts:** "No podcasts have been processed yet. Process a podcast to enable search." with a link to the home page.

**Keyboard Shortcuts**

- `/` -- focuses the search input from anywhere in the app (global listener on `Layout` component, matching the `CommandPalette` pattern which uses `Cmd+K`)
- `Escape` -- clears the search input and blurs it
- `Enter` -- triggers search immediately (bypasses debounce)
- `Arrow Down/Up` -- navigates between result cards
- `Enter` on focused card -- navigates to that podcast at timestamp

### Behavior

**Debounced Search**

Search fires 300ms after the user stops typing, implemented via a `useDebounce` hook. Minimum query length: 3 characters (shorter queries produce poor embeddings). If the user presses Enter, the search fires immediately regardless of debounce timer.

**Result Ranking and Pagination**

Results are ordered by descending `similarity` score (cosine similarity from `match_chunks`). Default page size: 20 results. "Load more" button appends the next page using cursor-based pagination (offset parameter to the edge function). No infinite scroll -- explicit load-more keeps the interface predictable.

**Search History**

The 20 most recent searches are stored in a `search_history` table (see Database Changes below). Displayed as clickable pills below the search bar when no query is active. Clicking a pill populates the search bar and triggers the search. A small "x" on each pill allows deletion.

---

## 4. Architecture & Technical Specs

### Database Changes

**New table: `search_history`**

```sql
create table search_history (
  id uuid primary key default gen_random_uuid(),
  query text not null,
  result_count int not null default 0,
  scope_type text not null default 'all'
    check (scope_type in ('all', 'knowledge_base', 'podcast')),
  scope_id uuid,  -- FK to knowledge_bases or podcasts depending on scope_type
  created_at timestamptz default now()
);

create index idx_search_history_created on search_history(created_at desc);
```

No new columns on existing tables. The `chunks` table already has `embedding vector(1536)` and the `match_chunks` RPC already handles similarity search. The junction table `knowledge_base_podcasts` already supports scoping chunks to a KB.

**New RPC: `match_chunks_global`**

The existing `match_chunks` RPC requires a `match_kb_id` parameter (scoped to one KB). Semantic Search needs an "All Podcasts" mode that searches across the entire library. A new RPC variant is needed:

```sql
create or replace function match_chunks_global(
  query_embedding vector(1536),
  match_count int default 20,
  match_threshold float default 0.3,
  match_offset int default 0
)
returns table (
  id uuid,
  podcast_id uuid,
  text text,
  start_time float,
  end_time float,
  token_count int,
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
      c.token_count,
      1 - (c.embedding <=> query_embedding) as similarity
    from chunks c
    inner join podcasts p on p.id = c.podcast_id
    where p.status = 'ready'
      and 1 - (c.embedding <=> query_embedding) > match_threshold
    order by c.embedding <=> query_embedding
    limit match_count
    offset match_offset;
end;
$$;
```

The existing `match_chunks` RPC should also be updated to accept `match_offset` for pagination support.

### Edge Function: `semantic-search`

A new edge function, separate from `chat/index.ts`. The chat function (see `supabase/functions/chat/index.ts`) does: embed query --> vector search --> build context string --> send to Groq Llama 3.3 70B --> save conversation. Semantic search skips everything after vector search.

**Input contract:**

```typescript
// POST /functions/v1/semantic-search
interface SearchRequest {
  query: string             // natural language search query (min 3 chars)
  scope?: {
    type: 'all' | 'knowledge_base' | 'podcast'
    id?: string             // uuid of KB or podcast, required if type != 'all'
  }
  limit?: number            // default 20, max 50
  offset?: number           // for pagination, default 0
  threshold?: number        // min similarity, default 0.3, range [0.1, 0.95]
}
```

**Output contract:**

```typescript
interface SearchResponse {
  results: SearchResult[]
  total_estimated: number   // approximate count for pagination UI
  query_time_ms: number     // wall-clock time for transparency
}

interface SearchResult {
  chunk_id: string
  podcast_id: string
  podcast_title: string
  podcast_channel: string
  thumbnail_url: string | null
  text: string              // full chunk text (not truncated like chat's SOURCE_PREVIEW_LENGTH)
  start_time: number
  end_time: number
  similarity: number        // 0-1 cosine similarity
  knowledge_base_ids: string[]   // which KBs contain this podcast
  knowledge_base_names: string[] // KB names for display
}
```

**Key differences from chat's search step:**

| Aspect | `chat/index.ts` | `semantic-search` |
|--------|-----------------|-------------------|
| LLM call | Yes (Groq, lines 222-268) | No |
| Text truncation | `SOURCE_PREVIEW_LENGTH = 200` chars (line 18) | Full chunk text |
| Max results | `MAX_CHUNKS = 10` (line 17) | Configurable, default 20, max 50 |
| Scope | Single KB only (`match_kb_id`) | Global, per-KB, or per-podcast |
| Pagination | None | Offset-based |
| Conversation save | Yes (lines 289-307) | No |
| KB metadata | Not returned | Returns `knowledge_base_ids` and names |
| Response time | 3-8s | <1s |

**Implementation outline:**

```typescript
// supabase/functions/semantic-search/index.ts
Deno.serve(async (req: Request) => {
  // 1. Parse & validate request body
  // 2. Embed query via OpenAI text-embedding-3-small (reuse same pattern as chat/index.ts lines 127-149)
  // 3. Call match_chunks or match_chunks_global RPC depending on scope
  // 4. Batch-fetch podcast metadata (title, channel, thumbnail_url)
  // 5. Batch-fetch KB associations via knowledge_base_podcasts + knowledge_bases
  // 6. Optionally save to search_history
  // 7. Return SearchResponse
})
```

### Frontend Components

**New components:**

| Component | Path | Purpose |
|-----------|------|---------|
| `SearchPage` | `src/pages/SearchPage.jsx` | Full-page route component with search bar, filters, results |
| `SearchResultCard` | `src/components/SearchResultCard.jsx` | Individual result card with podcast info, timestamp, chunk text, score |
| `SearchFilters` | `src/components/SearchFilters.jsx` | Collapsible filter bar (scope, relevance, date range, podcast) |
| `SearchHistory` | `src/components/SearchHistory.jsx` | Recent searches pill list below search bar |

**Router change** (in `src/App.jsx`):

```jsx
// Add to existing Routes:
<Route path="/search" element={<SearchPage />} />
```

**State management approach:**

All state lives in `SearchPage` via `useState` and `useEffect` hooks -- consistent with the rest of the app (no Redux, no context providers). State shape:

```typescript
// SearchPage internal state
const [query, setQuery] = useState('')
const [debouncedQuery, setDebouncedQuery] = useState('')
const [results, setResults] = useState<SearchResult[]>([])
const [loading, setLoading] = useState(false)
const [error, setError] = useState<string | null>(null)
const [scope, setScope] = useState({ type: 'all' })
const [threshold, setThreshold] = useState(0.3)
const [offset, setOffset] = useState(0)
const [hasMore, setHasMore] = useState(false)
const [searchHistory, setSearchHistory] = useState([])
const [queryTimeMs, setQueryTimeMs] = useState<number | null>(null)
```

A custom `useDebounce(value, delay)` hook handles the 300ms debounce. The search service function follows the same pattern as `src/services/chat.js` (fetch to edge function with bearer token).

**Global keyboard shortcut:**

Add a `/` keydown listener in `src/components/Layout.jsx` that navigates to `/search` and autofocuses the input. Guard against firing when the user is already in an input/textarea.

### API Design

**Service layer** (`src/services/search.js`):

```typescript
export async function semanticSearch(params: {
  query: string
  scope?: { type: string; id?: string }
  limit?: number
  offset?: number
  threshold?: number
}): Promise<SearchResponse>

export async function getSearchHistory(limit?: number): Promise<SearchHistoryEntry[]>

export async function deleteSearchHistoryEntry(id: string): Promise<void>

export async function clearSearchHistory(): Promise<void>
```

**Error handling:**

| Scenario | Edge function response | Frontend behavior |
|----------|----------------------|-------------------|
| Query too short (<3 chars) | 400 `MISSING_PARAM` | Inline validation, don't call API |
| No embeddings exist | 200, empty `results` array | "No results" empty state |
| OpenAI embedding fails | 500 `EMBEDDING_FAILED` | Error banner with retry button |
| Supabase RPC fails | 500 `SEARCH_FAILED` | Error banner with retry button |
| Network error | No response | "Connection error. Check your network." |

---

## 5. Implementation Phases

### Phase 1: MVP (basic search + results list)

**Scope:** End-to-end search working with minimal UI.

- [ ] Create `match_chunks_global` Postgres RPC (migration `004_semantic_search.sql`)
- [ ] Add `match_offset` parameter to existing `match_chunks` RPC
- [ ] Build `semantic-search` edge function (embed + vector search + metadata join)
- [ ] Create `src/services/search.js` service layer
- [ ] Build `SearchPage` with search bar and results list
- [ ] Build `SearchResultCard` component
- [ ] Add `/search` route to `App.jsx`
- [ ] Add search icon/link to `Layout.jsx` navigation
- [ ] Handle loading, empty, and error states

**Estimated effort:** 2-3 days

### Phase 2: Filters, pagination, keyboard shortcuts

**Scope:** Production-quality search experience.

- [ ] Build `SearchFilters` component (scope selector, relevance slider, date range)
- [ ] Implement offset-based pagination with "Load more" button
- [ ] Add debounced search with `useDebounce` hook
- [ ] Add `/` global keyboard shortcut in `Layout.jsx`
- [ ] Add arrow key navigation between result cards
- [ ] Add `?t=` query param support to `PodcastDetail` page for timestamp deep-linking
- [ ] Responsive layout (filters collapse on mobile)

**Estimated effort:** 2 days

### Phase 3: Search history, analytics, related chunks

- [ ] Create `search_history` table (migration `005_search_history.sql`)
- [ ] Build `SearchHistory` component (recent search pills)
- [ ] Save searches automatically on successful results
- [ ] Add "Find similar" button on each result card (re-searches using that chunk's text as the query)
- [ ] Add search to `CommandPalette` (typing in command palette with a `?` prefix triggers semantic search inline)
- [ ] Track search analytics: popular queries, avg result count, click-through rate (future instrumentation)

**Estimated effort:** 1-2 days

---

## 6. Dependencies & Risks

**Dependencies:**

- **Existing `match_chunks` RPC** -- must exist in Supabase and be callable via `.rpc()`. Currently used by `chat/index.ts` (line 164). The RPC is not defined in the migration files checked into git (likely created via Supabase dashboard). This needs to be captured in a migration for reproducibility.
- **OpenAI API key** -- already configured as a Supabase secret (`OPENAI_API_KEY`), used by the chat function. Semantic search reuses the same key for `text-embedding-3-small`.
- **Processed podcasts** -- search only works on podcasts with status `ready` that have chunks with embeddings. The feature is useless if no podcasts are processed. The empty state should guide users to process podcasts first.
- **pgvector extension** -- already enabled (migration `001_initial_schema.sql` line 2: `create extension if not exists vector`).

**Risks:**

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Slow queries on large chunk tables (>100K chunks) | Low (personal use) | Medium | Add IVFFlat or HNSW index on `chunks.embedding` if query time exceeds 500ms. Currently no vector index exists -- pgvector does exact brute-force scan. |
| OpenAI embedding API latency spikes | Medium | Low | Embedding a single short query is fast (~100ms typical). Add timeout (2s, matching chat function's `TIMEOUT_EMBEDDING`). Cache repeated query embeddings client-side in `sessionStorage`. |
| `match_chunks` RPC not in version control | High | Medium | Document the RPC definition in a new migration before building the feature. Without it, the function cannot be reproduced on a fresh Supabase project. |
| Relevance quality -- semantic search returning low-quality matches | Medium | Medium | Default threshold of 0.3 is deliberately permissive (same as chat). Allow user to raise it via the filter slider. Consider raising default to 0.4 for search since there is no LLM to filter noise. |
| Cross-KB search returning duplicate chunks | Low | Low | Chunks are KB-independent (one row per chunk per podcast). The same podcast in multiple KBs does not create duplicate chunks. Junction table handles the many-to-many relationship. |

---

## 7. Estimated Effort

| Phase | Work | Effort |
|-------|------|--------|
| Phase 1 -- MVP | Edge function, service layer, SearchPage, SearchResultCard, routing | 2-3 days |
| Phase 2 -- Filters & Polish | SearchFilters, pagination, debounce, keyboard shortcuts, timestamp deep-linking | 2 days |
| Phase 3 -- History & Extras | search_history table, SearchHistory component, "find similar", command palette integration | 1-2 days |
| **Total** | | **5-7 days** |

All phases can be built and deployed incrementally. Phase 1 is fully functional on its own. Phases 2 and 3 are additive polish.

Migration files needed: 1 (Phase 1 RPC + Phase 3 search_history table can share one migration, or split into two for cleaner history).

Edge functions to deploy: 1 new (`semantic-search`).

Existing files modified: `App.jsx` (add route), `Layout.jsx` (add nav link + `/` shortcut), `PodcastDetail.jsx` (read `?t=` param).
