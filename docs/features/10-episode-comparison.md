# Episode Comparison View

## 1. Overview

Episode Comparison View lets the user select 2-3 episodes and generate a structured, side-by-side analysis: where the speakers agree, where they disagree, what is unique to each episode, and where their perspectives complement each other. Every claim in the comparison cites a specific episode and timestamp.

**What it does:** The user picks episodes from any KB or the global podcast list, clicks "Compare these," and the system reads each episode's insights and key transcript chunks, sends them to Groq Llama 3.3 70B with a structured comparison prompt, and renders the result in a side-by-side layout with collapsible sections and source citations.

**Why this is valuable:** Debate and interview podcasts often cover the same topic from different angles. Manually cross-referencing two hour-long transcripts is impractical. A structured comparison surfaces the signal: "Guest A says regulation is premature, Guest B says it is already too late" -- with timestamps so the user can verify. This is the "second brain" doing analytical work a human would need hours to perform manually.

**How it relates to existing features:**
- Extends the per-podcast **insights** (Phase 4) by reasoning across multiple episodes
- Complements **chat** (Phase 5) -- chat answers specific questions, comparison performs broad structural analysis
- Reuses the same LLM infrastructure as `process-podcast/index.ts` (Groq Llama 3.3 70B, JSON response format)
- Leverages **chunks with timestamps** from the processing pipeline for source citations

---

## 2. User Stories

1. **As a critical thinker**, I want to compare two episodes on the same topic and see where the speakers agree and disagree, so I can form a more balanced perspective.

2. **As a researcher**, I want the comparison to cite specific timestamps for each claim, so I can verify the analysis against the original audio.

3. **As a knowledge base curator**, I want to select episodes for comparison directly from a KB's episode list, so the workflow stays within the context I am already browsing.

4. **As a user with diverse interests**, I want the system to handle gracefully when I compare episodes on very different topics, telling me "these episodes have minimal overlap" instead of fabricating false connections.

5. **As a user who finds a valuable comparison**, I want to save the result so I can reference it later without regenerating, since LLM calls are not free.

6. **As a user sharing insights**, I want to export a comparison as markdown, so I can paste it into notes, a blog post, or send it to a colleague.

7. **As a user exploring connections**, I want the comparison to highlight "complementary insights" -- ideas that are not contradictory but that together tell a richer story than either episode alone.

8. **As an efficiency-conscious user**, I want cached comparisons to load instantly when I revisit the same episode pair, so I am not charged for redundant LLM calls.

---

## 3. Design & Functionality

### UI/UX Design

**Episode Picker**

The comparison flow starts with episode selection. Two entry points:

1. **From KB episode list (`KnowledgeBase.jsx`):** A "Compare" toggle button in the section header switches the episode list into selection mode. Checkboxes appear on each `PodcastRow`. A floating action bar appears at the bottom: "{N} selected -- Compare these" (enabled when 2-3 episodes are selected, only episodes with `status = 'ready'` are selectable).

2. **From a dedicated `/compare` page:** A standalone page with an episode picker. The user searches/browses episodes across all KBs and the standalone podcast list, selects 2-3, and clicks "Compare." The picker reuses the `AddPodcastModal` search/browse UI pattern but scoped to already-processed local episodes rather than Podcast Index.

**Comparison Layout**

```
+----------------------------------------------------------+
| COMPARISON                          [Export MD] [Delete]  |
| Episode A vs Episode B (vs Episode C)                    |
| Generated May 24, 2026                                   |
+----------------------------------------------------------+
|                                                          |
| EPISODES COMPARED                                        |
| +------------------+  +------------------+               |
| | [thumb] Ep A     |  | [thumb] Ep B     |              |
| | Show Name        |  | Show Name        |              |
| | 1h 23m           |  | 45m              |              |
| | [View ->]        |  | [View ->]        |              |
| +------------------+  +------------------+               |
|                                                          |
| +------------------------------------------------------+ |
| | OVERLAP ASSESSMENT                                   | |
| | "These episodes share significant topical overlap    | |
| |  around AI safety and regulatory frameworks..."      | |
| +------------------------------------------------------+ |
|                                                          |
| +------------------------------------------------------+ |
| | AGREEMENTS                                           | |
| | 1. Both guests agree that current AI regulation     | |
| |    is insufficient for frontier models.              | |
| |    [Ep A @ 14:32] [Ep B @ 23:11]                   | |
| |                                                      | |
| | 2. Both emphasize the importance of...              | |
| |    [Ep A @ 34:50] [Ep B @ 8:02]                    | |
| +------------------------------------------------------+ |
|                                                          |
| +------------------------------------------------------+ |
| | DISAGREEMENTS                                        | |
| | 1. On timeline: Guest A predicts AGI within 5 years | |
| |    while Guest B considers this "irresponsible      | |
| |    speculation."                                     | |
| |    [Ep A @ 45:10] [Ep B @ 31:44]                   | |
| +------------------------------------------------------+ |
|                                                          |
| +------------------------------------------------------+ |
| | UNIQUE TO "The Future of AGI"                        | |
| | - Discusses compute scaling laws in detail...        | |
| |   [@ 52:30]                                         | |
| +------------------------------------------------------+ |
|                                                          |
| +------------------------------------------------------+ |
| | UNIQUE TO "AI Policy Roundtable"                     | |
| | - Covers EU AI Act implementation timeline...        | |
| |   [@ 15:20]                                         | |
| +------------------------------------------------------+ |
|                                                          |
| +------------------------------------------------------+ |
| | COMPLEMENTARY INSIGHTS                               | |
| | 1. Ep A's technical analysis of model capabilities  | |
| |    provides context for Ep B's policy prescriptions. | |
| |    Together they suggest regulation should be...     | |
| +------------------------------------------------------+ |
+----------------------------------------------------------+
```

Each section is a collapsible card following the `InsightsPanel.jsx` pattern: `var(--surface)` background, `var(--border)` border, `var(--r-lg)` corners, uppercase mono section headers.

**Timestamp Citations**

Each claim includes clickable timestamp badges. Clicking `[Ep A @ 14:32]` navigates to `/podcast/{podcastId}?t=852` (or `/kb/{kbId}/podcast/{podcastId}?t=852` if within a KB context). The badge uses the `Tag` component from `ui.jsx` with `variant="accent"`.

**"Compare these" Button Placement**

- On the KB episode list: appears in the floating selection bar at the bottom of the viewport when comparison mode is active
- On the PodcastDetail page: a secondary action button "Compare with..." that opens the episode picker modal pre-populated with the current episode as the first selection

**Save/Export Controls**

- **Save:** Comparisons are persisted automatically to the `comparisons` table on generation. The user never has to manually save.
- **Export:** An "Export MD" button in the comparison header copies a markdown-formatted version of the comparison to the clipboard (or downloads as a `.md` file). The markdown includes episode titles, all sections, and timestamp links.
- **Delete:** A trash icon button removes the comparison from the database.

**Empty / Edge States**

- **Fewer than 2 episodes ready:** "Compare" button is disabled with a tooltip: "Process at least 2 episodes to compare."
- **Low overlap detected by LLM:** The "Overlap Assessment" section explicitly states the episodes have minimal topical overlap. Agreements/disagreements sections may be empty or contain a single "No significant agreements found" message. Unique-to-each and complementary sections still populate.
- **Comparison already exists for this pair:** Show the cached result with a "Regenerate" button (re-runs the LLM, overwrites the cached version).

### Behavior

**Comparison Generation Process**

1. User selects 2-3 episodes (all must have `status = 'ready'`).
2. Frontend calls the `compare-episodes` edge function with the episode IDs.
3. Edge function checks for a cached comparison (same set of episode IDs, regardless of order).
4. If cached, returns the stored result immediately.
5. If not cached:
   a. Fetch `insights` rows for all selected episodes (summary, topics, key_points, entities).
   b. Fetch the top 10 most representative chunks per episode (by embedding centroid similarity or simply the first/middle/last chunks to capture the episode's arc).
   c. Assemble the comparison prompt and send to Groq Llama 3.3 70B.
   d. Parse the JSON response, store in `comparisons` table, return to frontend.
6. Frontend renders the comparison in the `ComparisonView` component.

**Handling Very Different Topics**

The LLM prompt explicitly instructs the model to assess topical overlap first and to report honestly when episodes do not share common ground. The prompt includes:

> "If the episodes discuss largely unrelated topics, state this clearly in the overlap_assessment field. It is acceptable for the agreements and disagreements arrays to be empty. Focus the unique_insights sections on what each episode covers that the other does not."

This prevents the LLM from hallucinating false connections.

**Comparison Caching**

Comparisons are cached in the database. The cache key is the sorted set of episode IDs (so comparing [A, B] and [B, A] hits the same cache). Cache is permanent -- the user can manually regenerate via the "Regenerate" button, which deletes the old comparison and creates a new one. There is no automatic expiration because the underlying insights do not change after processing.

---

## 4. Architecture & Technical Specs

### Database Changes

**New table: `comparisons`**

```sql
create table comparisons (
  id uuid primary key default gen_random_uuid(),
  episode_ids uuid[] not null,          -- sorted array of 2-3 podcast IDs
  episode_ids_hash text not null unique, -- deterministic hash for cache lookup
  content jsonb not null default '{}'::jsonb,
  -- content structure:
  -- {
  --   "overlap_assessment": "string describing topical overlap level",
  --   "agreements": [
  --     { "point": "...", "citations": [
  --       { "episode_id": "uuid", "episode_title": "...", "timestamp": 872, "quote": "..." }
  --     ]}
  --   ],
  --   "disagreements": [
  --     { "point": "...", "citations": [...] }
  --   ],
  --   "unique_insights": [
  --     { "episode_id": "uuid", "episode_title": "...", "insights": [
  --       { "point": "...", "timestamp": 3150, "quote": "..." }
  --     ]}
  --   ],
  --   "complementary": [
  --     { "point": "...", "citations": [...] }
  --   ]
  -- }
  created_at timestamptz default now()
);

create index idx_comparisons_hash on comparisons(episode_ids_hash);
```

The `episode_ids_hash` is a deterministic hash of the sorted episode UUIDs (e.g., `md5(sorted_ids.join(','))`). This enables O(1) cache lookup regardless of selection order.

No changes to existing tables. The function reads from `podcasts`, `insights`, and `chunks` (read-only).

### Edge Function: `compare-episodes`

**Input contract:**

```typescript
// POST /functions/v1/compare-episodes
interface CompareRequest {
  episode_ids: string[]    // 2-3 podcast UUIDs
  regenerate?: boolean     // if true, ignore cache and regenerate
}
```

**Output contract:**

```typescript
interface CompareResponse {
  comparison_id: string
  cached: boolean          // true if served from cache
  content: ComparisonContent
}

interface ComparisonContent {
  overlap_assessment: string
  agreements: ComparisonPoint[]
  disagreements: ComparisonPoint[]
  unique_insights: UniqueInsight[]
  complementary: ComparisonPoint[]
}

interface ComparisonPoint {
  point: string
  citations: Citation[]
}

interface Citation {
  episode_id: string
  episode_title: string
  timestamp: number      // seconds
  quote: string          // brief transcript excerpt supporting the claim
}

interface UniqueInsight {
  episode_id: string
  episode_title: string
  insights: {
    point: string
    timestamp: number
    quote: string
  }[]
}
```

**Implementation outline:**

```typescript
// supabase/functions/compare-episodes/index.ts
Deno.serve(async (req: Request) => {
  // 1. Parse & validate: require 2-3 episode_ids, all must exist with status='ready'
  // 2. Sort episode_ids, compute hash
  // 3. Check comparisons table for cached result (unless regenerate=true)
  // 4. If cached, return immediately
  // 5. Fetch insights for each episode
  // 6. Fetch representative chunks for each episode (top 10 by position)
  // 7. Build comparison prompt (see LLM Prompting Strategy)
  // 8. Call Groq Llama 3.3 70B with JSON response format
  // 9. Parse response, validate structure
  // 10. If regenerating, delete old comparison row
  // 11. Insert into comparisons table
  // 12. Return comparison
})
```

**Validation:**

| Check | Error |
|-------|-------|
| Fewer than 2 or more than 3 episode IDs | 400 `INVALID_PARAM` |
| Any episode ID not found in `podcasts` | 404 `NOT_FOUND` |
| Any episode not `status = 'ready'` | 422 `NOT_READY` |
| Duplicate episode IDs | 400 `INVALID_PARAM` |

### LLM Prompting Strategy

**Prompt structure:**

```
System: You are a podcast analysis expert. You compare podcast episodes
and produce structured JSON comparisons. Always ground claims in specific
content from the episodes. If episodes have minimal topical overlap,
state this honestly -- do not fabricate connections.

User:
Compare the following {N} podcast episodes. For each claim, cite the
specific episode and approximate timestamp.

## Episode 1: "{title}" by {channel} ({duration})
### Insights
Summary: {insights.summary}
Topics: {insights.topics.join(', ')}
Key Points:
{insights.key_points.map(kp => '- ' + kp).join('\n')}
### Key Transcript Excerpts
[{chunk.start_time}s] {chunk.text}
[{chunk.start_time}s] {chunk.text}
...

## Episode 2: "{title}" by {channel} ({duration})
...

---

Return a JSON object with:
- "overlap_assessment": 1-2 sentences assessing how much topical overlap
  exists between the episodes
- "agreements": array of points where speakers/episodes agree. Each has
  "point" (the agreed-upon idea) and "citations" (array of
  { "episode_id", "episode_title", "timestamp" (seconds), "quote"
    (brief supporting excerpt) })
- "disagreements": same structure, points where they differ or contradict
- "unique_insights": array per episode of insights only that episode
  covers. Each has "episode_id", "episode_title", and "insights" array
  of { "point", "timestamp", "quote" }
- "complementary": points where episodes provide complementary (not
  contradictory) perspectives that together form a richer understanding.
  Same citation structure as agreements.

Guidelines:
- 3-8 items per section is ideal. Quality over quantity.
- Timestamps should be approximate, referencing the nearest transcript
  excerpt provided.
- If overlap is minimal, agreements and disagreements may be empty arrays.
- Do not invent quotes. Use only content from the excerpts provided.
```

**Output format:** JSON object mode (`response_format: { type: "json_object" }`), matching the `process-podcast` insights generation pattern (line 605 of `process-podcast/index.ts`).

### Frontend Components

| Component | Path | Purpose |
|-----------|------|---------|
| `ComparisonView` | `src/pages/ComparisonView.jsx` | Full-page route rendering a comparison result |
| `EpisodePicker` | `src/components/EpisodePicker.jsx` | Modal for selecting 2-3 episodes to compare (search + browse processed episodes) |
| `ComparisonSection` | `src/components/ComparisonSection.jsx` | Collapsible card for one comparison section (agreements, disagreements, etc.) |
| `CitationBadge` | `src/components/CitationBadge.jsx` | Clickable timestamp badge `[Ep A @ 14:32]` that navigates to the podcast at that timestamp |

**Router changes** (in `src/App.jsx`):

```jsx
<Route path="/compare" element={<ComparisonView />} />
<Route path="/compare/:comparisonId" element={<ComparisonView />} />
```

**Integration with existing pages:**

- `KnowledgeBase.jsx`: Add "Compare" toggle button to the Episodes section header. When active, show checkboxes on `PodcastRow` components and a floating action bar.
- `PodcastDetail.jsx`: Add "Compare with..." button to the actions row (line 171). Opens `EpisodePicker` with the current episode pre-selected.

### Token Budget

Comparing 3 long podcasts (each 1-2 hours, 10,000+ word transcripts):

| Component | Tokens (approx) |
|-----------|-----------------|
| Per-episode insights (summary + topics + key_points) | ~500 per episode |
| Per-episode chunks (10 chunks x ~300 tokens each) | ~3,000 per episode |
| System prompt + instructions | ~400 |
| **Total input (3 episodes)** | **~11,000** |
| **Max output** | **4,096** (`INSIGHTS_MAX_TOKENS`) |
| **Total per comparison** | **~15,000** |

Groq Llama 3.3 70B has a 128K context window. 15K tokens is well within limits. Even comparing 3 episodes with very long transcripts stays under 20K tokens because only 10 representative chunks per episode are included, not the full transcript.

**Cost:** Groq pricing for Llama 3.3 70B is approximately $0.59/M input tokens and $0.79/M output tokens. A single comparison costs roughly $0.01. With caching, repeated views are free.

---

## 5. Implementation Phases

### Phase 1: Core Comparison (2 episodes)

- [ ] Create `comparisons` table (migration `00X_comparisons.sql`)
- [ ] Build `compare-episodes` edge function (insights + chunks retrieval, LLM prompt, JSON parsing, caching)
- [ ] Create `src/services/comparisons.js` service layer (create comparison, get comparison, list comparisons, delete comparison)
- [ ] Build `ComparisonView` page with all sections (overlap, agreements, disagreements, unique, complementary)
- [ ] Build `ComparisonSection` collapsible card component
- [ ] Build `CitationBadge` component with timestamp navigation
- [ ] Add `/compare` and `/compare/:comparisonId` routes to `App.jsx`
- [ ] Implement `?t=` query param support in `PodcastDetail.jsx` for timestamp deep-links (if not already done by semantic search feature)

**Estimated effort:** 3-4 days

### Phase 2: Episode Picker + Integration

- [ ] Build `EpisodePicker` modal component (browse processed episodes, search by title, filter by KB)
- [ ] Add comparison mode to `KnowledgeBase.jsx` (checkboxes, floating action bar, "Compare these" button)
- [ ] Add "Compare with..." button to `PodcastDetail.jsx`
- [ ] Support 3-episode comparisons (extend prompt and layout for the third episode)
- [ ] Loading state with skeleton UI during LLM generation

**Estimated effort:** 2-3 days

### Phase 3: Cache, Export, and Polish

- [ ] Implement cache lookup via `episode_ids_hash` with instant load for cached comparisons
- [ ] Add "Regenerate" button for cached comparisons
- [ ] Build markdown export (copy to clipboard + download as `.md`)
- [ ] Add comparison history page or section (list past comparisons with episode titles and dates)
- [ ] Handle edge case: one of the compared episodes is deleted (show comparison with a "deleted episode" marker)
- [ ] Responsive layout (stack side-by-side cards vertically on mobile)

**Estimated effort:** 1-2 days

---

## 6. Dependencies & Risks

**Dependencies:**

- **Per-podcast insights (Phase 4, complete):** The comparison relies on `insights` rows existing for each selected episode. Only episodes with `status = 'ready'` are selectable.
- **Chunks with timestamps:** The comparison uses chunks from the `chunks` table for source citations. These are generated during the processing pipeline (step 4 of `process-podcast`).
- **Groq API key:** Already configured as a Supabase secret (`GROQ_API_KEY`), used by existing edge functions.
- **`?t=` timestamp param on PodcastDetail:** May already be implemented by the semantic search feature (Feature 01, Phase 2). If not, needs to be added in Phase 1 of this feature.

**Risks:**

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| LLM hallucinates false agreements/disagreements | Medium | High | Prompt explicitly instructs "do not invent quotes" and requires citations. Review early outputs manually. Include a disclaimer: "AI-generated analysis -- verify claims against source material." |
| Comparison quality poor for episodes with minimal overlap | Low | Low | Prompt handles this gracefully by design. The overlap_assessment field warns the user, and empty sections are acceptable. |
| LLM response does not parse as valid JSON | Low | Medium | Same fallback as `process-podcast/index.ts` (line 643): try JSON.parse, if it fails, wrap raw text in a minimal structure. |
| Token budget exceeded for exceptionally long episodes | Very Low | Low | Chunks are limited to 10 per episode. Even with maximum chunk sizes, total stays under 20K tokens. Could reduce to 7 chunks per episode if needed. |
| Cache invalidation if a podcast is reprocessed | Low | Low | Comparisons reference episode IDs, not insight IDs. If an episode is reprocessed (insights regenerated), cached comparisons become stale. Acceptable for personal use -- "Regenerate" button handles this. |
| User expects real-time streaming of comparison generation | Low | Low | Comparison generation takes 5-15 seconds via Groq. Show a clear loading state with progress indication. Streaming is not worth the complexity for a one-shot generation. |

---

## 7. Estimated Effort

| Phase | Work | Effort |
|-------|------|--------|
| Phase 1 -- Core comparison | Edge function, DB table, ComparisonView, ComparisonSection, CitationBadge, routing | 3-4 days |
| Phase 2 -- Episode picker + integration | EpisodePicker modal, KB comparison mode, PodcastDetail integration, 3-episode support | 2-3 days |
| Phase 3 -- Cache, export, polish | Caching, regeneration, markdown export, comparison history, responsive layout | 1-2 days |
| **Total** | | **6-9 days** |

Phase 1 is fully functional for 2-episode comparisons via direct URL. Phase 2 makes it discoverable from existing pages. Phase 3 adds efficiency and polish.

Migration files needed: 1 (`comparisons` table).

Edge functions to deploy: 1 new (`compare-episodes`).

Existing files modified: `App.jsx` (add routes), `KnowledgeBase.jsx` (comparison mode), `PodcastDetail.jsx` (compare button + `?t=` param).
