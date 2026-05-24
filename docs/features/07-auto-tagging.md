# Feature 07: Auto-Tagging & Smart Suggestions

## 1. Overview

When a podcast finishes processing, the system automatically generates tags from the extracted topics and suggests relevant knowledge bases where the episode might also belong. Tags appear on podcast cards and detail pages, enabling tag-based filtering across the library. KB suggestions surface as actionable notifications: "This episode about longevity would also fit in your Health & Wellness KB."

**Data foundation:** The `insights` table already stores `topics` as a JSONB array of strings (e.g., `["artificial intelligence", "startup funding", "venture capital"]`) extracted by Llama 3.3 70B during processing (line 613 of `process-podcast/index.ts`). Tags are derived directly from these topics -- no additional LLM call is needed for basic tagging. KB suggestions use topic overlap between a podcast's tags and the aggregate topic profile of each KB.

---

## 2. User Stories

1. **As a user**, I want podcasts to be automatically tagged after processing so I don't have to manually categorize every episode.
2. **As a user**, I want to see tags on podcast cards in the episode list so I can scan topics at a glance without opening each episode.
3. **As a user**, I want to filter my podcast list by tag so I can find all episodes about a specific topic.
4. **As a user**, I want to accept or reject auto-generated tags so I can correct mistakes and curate my taxonomy.
5. **As a user**, I want to add my own manual tags to any podcast so I can apply personal categories the LLM missed.
6. **As a user**, I want the system to suggest relevant KBs after processing an episode so I can organize content into the right collections without manually checking each KB.
7. **As a user**, I want similar tags to be merged automatically (e.g., "AI" and "Artificial Intelligence") so my tag space stays clean.
8. **As a user**, I want to see a tag cloud or frequency breakdown per KB so I can understand the topic distribution of my collection.

---

## 3. Design & Functionality

### UI/UX Design

**Tags on podcast cards** (in `PodcastRow` within `KnowledgeBase.jsx` and the Home page podcast list):
- Display up to 3 tags below the podcast title/channel line
- Tags use the existing `<Tag>` component from `src/components/ui.jsx` with `variant="accent"`
- Overflow indicator: "+N more" pill if the podcast has more than 3 tags
- Auto-tags have a subtle dashed border; manually added tags have a solid border (visual distinction)

**Tags on podcast detail page** (`PodcastDetail.jsx`):
- Full tag list shown below the header metadata, above the processing progress section
- Each tag has an "x" button for removal and a checkmark icon for auto-tags that haven't been reviewed
- "Add tag" button opens an inline input with autocomplete (suggests existing tags from the user's library)
- Tag status: `auto` (unreviewed), `accepted` (user confirmed), `manual` (user-created)

**Tag management flow:**
- Auto-tags appear immediately after processing completes
- Tags default to `auto` status
- User can click a tag to toggle it to `accepted`, or click "x" to reject it (sets `rejected: true`, hides from display but keeps record)
- Manual tags are added via the inline input with autocomplete

**"Suggested KBs" notification:**
- After processing completes, if matching KBs are found, a notification banner appears at the top of the podcast detail page
- Banner text: "This episode about [top topic] might also fit in: [KB name 1], [KB name 2]"
- Each KB name is a clickable button that triggers `addPodcastToKB()` (from `src/services/podcasts.js`, line 53)
- "Dismiss" button hides the banner and marks suggestions as dismissed in DB
- Only suggests KBs the podcast is NOT already linked to

**Tag-based filtering (podcast list views):**
- New filter row above the episode list on the KB page and the Home page podcasts tab
- Horizontal scrolling tag pills showing all unique tags in the current view
- Click a tag pill to filter; click again to deselect
- Multiple tag selection supported (AND logic: show podcasts matching ALL selected tags)
- Active filters shown as pills with "x" to clear

**Tag cloud per KB:**
- New "Topics" section in the KB page, below the episode list header
- Renders tags sized by frequency (larger text = more podcasts with that tag)
- Clickable -- clicking a tag in the cloud activates the filter for that tag
- Collapsible section (default: collapsed) to keep the page clean

### Behavior

**Tag extraction pipeline:**
- **Primary source:** `insights.topics` array (already extracted during processing). Each topic string becomes a tag.
- **Normalization step** (runs before saving tags):
  1. Lowercase + trim whitespace
  2. Deduplicate exact matches
  3. Merge known synonyms from a static synonym map (see below)
  4. Limit to 10 tags per podcast (take the first 10 after dedup; insights prompt already requests 5-10 topics)

**Synonym map** (static, shipped with the app, extensible):
```typescript
const TAG_SYNONYMS: Record<string, string> = {
  'ai': 'artificial intelligence',
  'ml': 'machine learning',
  'vc': 'venture capital',
  'saas': 'software as a service',
  'dx': 'developer experience',
  'ux': 'user experience',
  'ui': 'user interface',
  'llm': 'large language models',
  'gpt': 'large language models',
  'defi': 'decentralized finance',
  'web3': 'blockchain',
  'crypto': 'cryptocurrency',
}
```
The canonical form (right side) is stored. The map is a `const` in a utility file, not in the database, so it ships with the frontend and can be extended without a migration.

**KB suggestion algorithm:**

When a podcast finishes processing:
1. Get the podcast's tag set (from newly generated tags)
2. For each KB the podcast is NOT already in:
   a. Get the aggregate topic profile: union of all tags from all podcasts in that KB
   b. Compute Jaccard similarity: `|intersection| / |union|` of the podcast's tags and the KB's tag set
3. Rank KBs by Jaccard score
4. Suggest KBs with score >= 0.3 (at least 30% topic overlap)
5. Maximum 3 suggestions per podcast

This runs client-side after the processing status poll detects `status: 'ready'`. No edge function needed -- the computation uses data already fetched or easily queryable.

**Tag normalization (merge similar tags):**
- Phase 1: Static synonym map (above)
- Phase 2: Periodic batch job (client-side utility function) that:
  1. Queries all unique tags across the library
  2. Applies Levenshtein distance (threshold: 2) to find near-duplicates
  3. Presents merge suggestions to the user in a settings/admin UI
  4. User confirms merges, which updates all podcast_tags rows

---

## 4. Architecture & Technical Specs

### Database Changes

**New table: `podcast_tags`**

```sql
CREATE TABLE podcast_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  podcast_id uuid NOT NULL REFERENCES podcasts(id) ON DELETE CASCADE,
  tag text NOT NULL,
  source text NOT NULL DEFAULT 'auto'
    CHECK (source IN ('auto', 'manual')),
  status text NOT NULL DEFAULT 'auto'
    CHECK (status IN ('auto', 'accepted', 'rejected')),
  created_at timestamptz DEFAULT now(),
  UNIQUE(podcast_id, tag)
);

CREATE INDEX idx_podcast_tags_podcast ON podcast_tags(podcast_id);
CREATE INDEX idx_podcast_tags_tag ON podcast_tags(tag);
CREATE INDEX idx_podcast_tags_status ON podcast_tags(status)
  WHERE status != 'rejected';
```

**New table: `kb_suggestions`**

```sql
CREATE TABLE kb_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  podcast_id uuid NOT NULL REFERENCES podcasts(id) ON DELETE CASCADE,
  knowledge_base_id uuid NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
  score real NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'dismissed')),
  created_at timestamptz DEFAULT now(),
  UNIQUE(podcast_id, knowledge_base_id)
);

CREATE INDEX idx_kb_suggestions_podcast ON kb_suggestions(podcast_id);
CREATE INDEX idx_kb_suggestions_status ON kb_suggestions(status)
  WHERE status = 'pending';
```

**No changes to existing tables.** Tags are stored separately from `insights.topics` because:
1. Tags have per-podcast lifecycle (accept/reject/manual add) that topics don't
2. Tags are normalized; topics are raw LLM output
3. Tags are queried for filtering; topics are display-only inside the insights panel

### Tag Generation Pipeline

**Option A (recommended): Extend `process-podcast` edge function.**

Add a new step after insights generation (after line 654 in `process-podcast/index.ts`):

```typescript
// 6b. Generate tags from insights topics
const topics: string[] = insights.topics || [];
const normalizedTags = normalizeTags(topics); // lowercase, dedup, synonym merge

const tagRows = normalizedTags.slice(0, 10).map(tag => ({
  podcast_id: pod.id,
  tag,
  source: 'auto',
  status: 'auto',
}));

if (tagRows.length > 0) {
  await supabase.from('podcast_tags').upsert(tagRows, {
    onConflict: 'podcast_id,tag',
    ignoreDuplicates: true,
  });
}

await log("processing", `Generated ${tagRows.length} auto-tags.`);
```

This runs server-side inside the existing pipeline, adding negligible time (single DB insert, no LLM call).

**Option B (alternative): Post-processing client-side trigger.**

After the frontend detects `status: 'ready'`, it fetches insights, extracts topics, normalizes, and writes tags. Downside: requires the frontend to be open when processing completes. Option A is preferred.

### KB Similarity Matching

Client-side computation in a new service function:

```typescript
// src/services/suggestions.ts

interface KBSuggestion {
  knowledgeBaseId: string
  knowledgeBaseName: string
  score: number
  overlappingTags: string[]
}

async function suggestKBsForPodcast(
  podcastId: string,
  excludeKBIds: string[]
): Promise<KBSuggestion[]> {
  // 1. Get podcast's tags
  const podcastTags = await getPodcastTags(podcastId)
  const podcastTagSet = new Set(podcastTags.map(t => t.tag))

  // 2. Get all KBs with their aggregate tags
  const allKBs = await getAllKBsWithTags()

  // 3. Filter out KBs the podcast is already in
  const candidateKBs = allKBs.filter(kb => !excludeKBIds.includes(kb.id))

  // 4. Compute Jaccard similarity
  const suggestions = candidateKBs
    .map(kb => {
      const kbTagSet = new Set(kb.tags)
      const intersection = [...podcastTagSet].filter(t => kbTagSet.has(t))
      const union = new Set([...podcastTagSet, ...kbTagSet])
      const score = union.size > 0 ? intersection.length / union.size : 0
      return {
        knowledgeBaseId: kb.id,
        knowledgeBaseName: kb.name,
        score,
        overlappingTags: intersection,
      }
    })
    .filter(s => s.score >= 0.3)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)

  return suggestions
}
```

**Why Jaccard over cosine similarity of embeddings?** Tags are discrete categorical labels, not continuous vectors. Jaccard is the natural metric for set overlap, is trivially fast, and requires no additional embedding calls. If richer semantic matching is needed later (Phase 3), we can embed each KB's concatenated tags and compute cosine similarity against the podcast's tag embedding using the existing `text-embedding-3-small` pipeline.

### Frontend Components

**New components:**
- `src/components/TagList.jsx` -- renders tags on podcast cards and detail page. Props: `tags[]`, `editable: boolean`, `onRemove()`, `onAdd()`, `onAccept()`.
- `src/components/TagFilter.jsx` -- horizontal scrolling filter bar with tag pills. Props: `availableTags[]`, `selectedTags[]`, `onChange()`.
- `src/components/TagInput.jsx` -- inline autocomplete input for adding manual tags. Props: `existingTags[]`, `onSubmit()`.
- `src/components/KBSuggestionBanner.jsx` -- notification banner for KB suggestions. Props: `suggestions[]`, `onAccept()`, `onDismiss()`.
- `src/components/TagCloud.jsx` -- frequency-weighted tag display for KB overview. Props: `tags: {tag: string, count: number}[]`, `onTagClick()`.

**New service file:** `src/services/tags.js`
- `getPodcastTags(podcastId)` -- fetch tags for a podcast
- `addTag(podcastId, tag)` -- insert a manual tag
- `updateTagStatus(podcastId, tag, status)` -- accept/reject
- `removeTag(podcastId, tag)` -- delete tag row
- `getKBTags(knowledgeBaseId)` -- aggregate all tags for a KB's podcasts
- `getAllTags()` -- all unique tags in the library (for autocomplete)

**New hook:** `usePodcastTags(podcastId)` -- fetches and caches tags, provides mutation functions.

---

## 5. Implementation Phases

### Phase 1: Tag Generation & Storage (2 days)
- [ ] Create `podcast_tags` migration
- [ ] Add tag normalization utility (`normalizeTags` with synonym map)
- [ ] Extend `process-podcast` edge function to generate tags after insights step
- [ ] Create `src/services/tags.js` with CRUD functions
- [ ] Backfill tags for already-processed podcasts (one-time script that reads `insights.topics` and writes to `podcast_tags`)

### Phase 2: Tag Display (2 days)
- [ ] Create `TagList` component
- [ ] Add tags to `PodcastRow` component in KB page (max 3 + overflow)
- [ ] Add full tag list to `PodcastDetail` page header
- [ ] Add tags to the Home page podcast list

### Phase 3: Tag Management (1-2 days)
- [ ] Accept/reject auto-tag interactions
- [ ] `TagInput` component with autocomplete for manual tags
- [ ] Tag removal flow
- [ ] `usePodcastTags` hook

### Phase 4: Tag Filtering (2 days)
- [ ] Create `TagFilter` component (horizontal scroll, multi-select)
- [ ] Integrate into KB page episode list
- [ ] Integrate into Home page podcasts tab
- [ ] Filter logic: query `podcast_tags` table, intersect with podcast list

### Phase 5: KB Suggestions (2-3 days)
- [ ] Create `kb_suggestions` migration
- [ ] Implement `suggestKBsForPodcast` service function (Jaccard similarity)
- [ ] Create `KBSuggestionBanner` component
- [ ] Trigger suggestion computation when processing completes (in the status poll effect in `PodcastDetail.jsx`, line 61-90)
- [ ] Accept/dismiss interactions (accept calls `addPodcastToKB`, dismiss marks as dismissed)

### Phase 6: Tag Cloud & Polish (1 day)
- [ ] Create `TagCloud` component
- [ ] Add collapsible tag cloud section to KB page
- [ ] Tag count badge on filter bar showing active filter count

---

## 6. Dependencies & Risks

**Dependencies:**
- Existing `insights.topics` data quality -- tags are only as good as the LLM's topic extraction. Current prompt (line 613 of `process-podcast/index.ts`) requests "5-10 main topics discussed (strings)" which produces reasonable tags.
- The `knowledge_base_podcasts` junction table for computing KB topic profiles
- The `<Tag>` UI component from `src/components/ui.jsx` (already exists, used in `InsightsPanel.jsx`)

**Risks:**

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| LLM produces inconsistent topic granularity (too broad or too narrow) | High | Medium | Synonym map normalizes common variants; user can reject/edit tags |
| Tag explosion -- too many unique tags across large libraries | Medium | Medium | Normalize aggressively; limit to 10 per podcast; Phase 2 fuzzy merge |
| KB suggestions feel noisy or irrelevant with low-overlap KBs | Medium | Low | 0.3 Jaccard threshold filters weak matches; max 3 suggestions; easy dismiss |
| Backfill script for existing podcasts misses edge cases | Low | Low | Run as a one-time migration with dry-run mode first |
| Autocomplete latency with 1000+ unique tags | Low | Low | Query with `ILIKE` prefix match + `LIMIT 10`; client-side cache |

---

## 7. Estimated Effort

| Phase | Effort | Cumulative |
|---|---|---|
| Phase 1: Tag Generation & Storage | 2 days | 2 days |
| Phase 2: Tag Display | 2 days | 4 days |
| Phase 3: Tag Management | 1-2 days | 5-6 days |
| Phase 4: Tag Filtering | 2 days | 7-8 days |
| Phase 5: KB Suggestions | 2-3 days | 9-11 days |
| Phase 6: Tag Cloud & Polish | 1 day | 10-12 days |

**MVP (Phases 1-4): ~7-8 days.** Delivers auto-tagging, display, management, and filtering -- the core loop.

**Full feature (Phases 1-6): ~10-12 days.** Adds KB suggestions and tag cloud visualization.

No new API keys required. No new external services. The only new dependency is the synonym map (a static constant). Tag generation adds a single DB insert to the existing processing pipeline -- negligible cost.
