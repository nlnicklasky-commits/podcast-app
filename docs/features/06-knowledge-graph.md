# Feature 06: Knowledge Graph Visualization

## 1. Overview

A visual, interactive graph that maps how entities (people, companies, concepts, products) connect across podcasts within a knowledge base. Nodes represent entities extracted during the insights step (`insights.entities` JSONB column). Edges represent co-occurrence -- two entities mentioned in the same podcast or the same chunk. Clicking a node opens a side panel showing every mention with podcast source and timestamp. The graph turns a KB's raw entity data into a navigable ecosystem map, revealing hidden connections that text-based browsing cannot surface.

**Data foundation:** The `insights` table already stores `entities` as JSONB arrays of `{ name, type }` objects (types: `person`, `company`, `product`, `concept`). The `chunks` table stores timestamped text segments with embeddings. Both are keyed by `podcast_id`, and podcasts are linked to KBs via the `knowledge_base_podcasts` junction table. No new LLM calls are required for basic graph generation -- it is a computation over existing data.

---

## 2. User Stories

1. **As a user**, I want to see a visual graph of all entities in my KB so I can understand how people, companies, and concepts interconnect across episodes.
2. **As a user**, I want to click an entity node and see every podcast and timestamp where it was mentioned so I can quickly navigate to the relevant content.
3. **As a user**, I want to filter the graph by entity type (people only, companies only, etc.) so I can focus on one dimension of the ecosystem.
4. **As a user**, I want to filter out low-frequency entities (minimum mention threshold) so the graph stays readable with large KBs.
5. **As a user**, I want to search for a specific entity by name and have the graph zoom to and highlight it so I can locate nodes in dense graphs.
6. **As a user**, I want edge thickness to reflect co-occurrence strength so I can visually identify the strongest relationships at a glance.
7. **As a user**, I want node size to reflect mention frequency so I can immediately see which entities are most discussed.
8. **As a user**, I want to toggle between a single-KB view and a cross-KB view so I can compare entity landscapes across different topic areas.

---

## 3. Design & Functionality

### UI/UX Design

**Layout:** Full-width panel accessible via a new "Graph" tab on the Knowledge Base page (alongside the existing episode list and chat panel). On smaller screens, the graph expands to fill the viewport with the chat panel hidden.

**Graph rendering:**
- Force-directed layout using a physics simulation
- Nodes are shaped by type:
  - `person` -- circle
  - `company` -- rounded square
  - `product` -- hexagon
  - `concept` -- diamond
- Node colors use the same OKLCH palette already in `InsightsPanel.jsx`:
  - `person`: `oklch(0.72 0.12 230)` (blue)
  - `company`: `oklch(0.72 0.12 150)` (green)
  - `product`: `oklch(0.72 0.13 50)` (orange)
  - `concept`: `oklch(0.75 0.13 75)` (yellow)
- Node size scales logarithmically with total mention count (across all podcasts in KB)
- Edge thickness scales linearly with co-occurrence count
- Edge color: `var(--border)` at 40% opacity to avoid visual clutter

**Interaction:**
- **Click node** -- opens a slide-in side panel (right side, 360px) listing every mention:
  - Grouped by podcast (title + channel)
  - Each mention shows the chunk text snippet (first 150 chars) and timestamp link
  - Clicking a mention navigates to the podcast detail page at the relevant transcript segment
- **Hover node** -- tooltip with entity name, type, total mentions, and number of connected entities
- **Hover edge** -- tooltip showing the two entity names and co-occurrence count
- **Zoom/pan** -- mouse wheel to zoom, drag to pan (standard graph navigation)
- **Search** -- search input above the graph; typing filters visible nodes by name substring match and auto-focuses the camera on matches
- **Filters** (toolbar above graph):
  - Entity type toggles (person / company / product / concept) -- each a pill button
  - Minimum mentions slider (range: 1 to max mention count in KB)
  - KB selector dropdown for cross-KB view (default: current KB only)

**Empty state:** If the KB has fewer than 2 entities, show a message: "Process more podcasts to build the knowledge graph. At least 2 entities are needed."

### Behavior

**Graph generation:** Client-side computation from existing `insights.entities` data. No pre-computation or materialized views needed at MVP scale (under ~50 podcasts per KB). Steps:

1. Query all insights rows for podcasts in the KB (via junction table join)
2. Flatten all entities across all podcasts
3. Deduplicate entities by normalized name (see below)
4. Build adjacency: two entities share an edge if they appear in the same podcast's entity list. Edge weight = number of podcasts where both appear.
5. Optionally (Phase 2): chunk-level co-occurrence -- two entities share an edge if both are mentioned in the same chunk text (requires text search against chunks, heavier computation)

**Entity deduplication:** Same person or concept can appear with different names across podcasts (e.g., "Elon Musk" vs "Musk" vs "elon musk"). Deduplication strategy:
- **Phase 1:** Case-insensitive exact match + trim whitespace. Group by lowercase name.
- **Phase 2:** Fuzzy matching using Levenshtein distance (threshold: 2 edits for names under 15 chars). Run as a one-time batch when generating the graph.
- **Phase 3 (optional):** LLM-assisted alias resolution -- send ambiguous name clusters to GPT-4o-mini for confirmation ("Are 'Musk' and 'Elon Musk' the same entity?"). Cache results in a new `entity_aliases` table.

**Performance with large graphs (100+ entities):**
- Limit visible nodes to top N by mention count (default N=75, user-adjustable)
- Use WebGL renderer (react-force-graph supports this) for 500+ node graphs
- Debounce filter/search operations (300ms)
- Memoize graph data computation with `useMemo` keyed on insights data

---

## 4. Architecture & Technical Specs

### Database Changes

No new tables required for Phase 1. Graph is computed client-side from existing `insights.entities`.

**Phase 2 additions (when performance requires it):**

```sql
-- Materialized view for entity co-occurrence (pre-computed edges)
CREATE MATERIALIZED VIEW entity_graph AS
WITH kb_entities AS (
  SELECT
    kbp.knowledge_base_id,
    i.podcast_id,
    jsonb_array_elements(i.entities) AS entity
  FROM insights i
  JOIN knowledge_base_podcasts kbp ON kbp.podcast_id = i.podcast_id
),
entity_pairs AS (
  SELECT
    a.knowledge_base_id,
    a.entity->>'name' AS entity_a,
    a.entity->>'type' AS type_a,
    b.entity->>'name' AS entity_b,
    b.entity->>'type' AS type_b,
    a.podcast_id
  FROM kb_entities a
  JOIN kb_entities b
    ON a.knowledge_base_id = b.knowledge_base_id
    AND a.podcast_id = b.podcast_id
    AND a.entity->>'name' < b.entity->>'name'
)
SELECT
  knowledge_base_id,
  entity_a,
  type_a,
  entity_b,
  type_b,
  COUNT(DISTINCT podcast_id) AS co_occurrence_count
FROM entity_pairs
GROUP BY knowledge_base_id, entity_a, type_a, entity_b, type_b;

CREATE UNIQUE INDEX idx_entity_graph_pk
  ON entity_graph(knowledge_base_id, entity_a, entity_b);
```

Refresh strategy: `REFRESH MATERIALIZED VIEW CONCURRENTLY entity_graph;` triggered after each podcast reaches `ready` status (add to the end of `process-podcast` edge function).

**Phase 3 additions (entity alias resolution):**

```sql
CREATE TABLE entity_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_name text NOT NULL,
  alias text NOT NULL,
  entity_type text,
  confirmed boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  UNIQUE(canonical_name, alias)
);
```

### Graph Generation Logic

**Phase 1: Client-side only.**

New service function in `src/services/graph.js`:

```typescript
interface GraphNode {
  id: string            // normalized entity name
  name: string          // display name (most common casing)
  type: 'person' | 'company' | 'product' | 'concept'
  mentions: number      // total across all podcasts in KB
  podcasts: string[]    // podcast IDs where mentioned
}

interface GraphEdge {
  source: string        // node id
  target: string        // node id
  weight: number        // co-occurrence count
  podcasts: string[]    // podcast IDs where both appear
}

async function buildKBGraph(knowledgeBaseId: string): Promise<{
  nodes: GraphNode[]
  edges: GraphEdge[]
}>
```

Implementation:
1. Fetch all insights for the KB's podcasts (single query via junction join)
2. Normalize entity names (lowercase, trim)
3. Aggregate: count mentions, track podcast IDs per entity
4. Build edges: for each podcast, create edges between all entity pairs in that podcast's entity list
5. Return `{ nodes, edges }` for the graph renderer

**Phase 2: Edge Function for heavy computation.**

New Supabase Edge Function `build-graph` that:
1. Queries the materialized view
2. Returns pre-computed `{ nodes, edges }` JSON
3. Called on-demand when user opens the Graph tab, with a client-side cache (5-minute TTL)

### Frontend

**Library: `react-force-graph-2d`** (recommended -- see comparison below).

New components:
- `src/components/KnowledgeGraph.jsx` -- main graph container
  - Wraps `ForceGraph2D` from `react-force-graph`
  - Custom node rendering (shape by type, size by mentions)
  - Custom edge rendering (thickness by weight)
  - Handles zoom, pan, click, hover
- `src/components/GraphFilters.jsx` -- filter toolbar (entity type toggles, mention threshold slider, search)
- `src/components/EntityPanel.jsx` -- slide-in panel for entity detail (mentions list with podcast sources and timestamps)

State management: local component state via `useState` + `useReducer` for filter state. No global state library needed.

New hook: `useGraphData(knowledgeBaseId)` -- fetches insights, computes graph, memoizes result.

### Visualization Library Comparison

| Criteria | D3.js | vis.js | react-force-graph |
|---|---|---|---|
| React integration | Manual (imperative DOM) | Manual (imperative DOM) | Native React component |
| Bundle size | ~70KB (force module only) | ~250KB | ~45KB (wraps d3-force) |
| WebGL support | Via custom implementation | Via vis-network | Built-in (2D canvas + 3D WebGL) |
| Custom node shapes | Full control (SVG paths) | Limited presets | Canvas draw callback (full control) |
| Performance (500+ nodes) | Good with canvas | Good | Excellent (canvas/WebGL) |
| Interactivity | Manual event binding | Built-in but rigid | Built-in click/hover/zoom/pan |
| Learning curve | Steep | Moderate | Low |
| Maintenance | Active (community) | Active | Active |
| TypeScript support | `@types/d3` | Included | Included |

**Recommendation: `react-force-graph-2d`**

Best fit for this project because:
1. Native React component -- no imperative DOM manipulation, fits the existing functional component pattern
2. Smallest bundle size of the three
3. Canvas-based rendering with WebGL upgrade path for large graphs
4. Built-in zoom/pan/click/hover -- no manual event wiring
5. Custom node painting via `nodeCanvasObject` callback gives full control over shape/color/size
6. Used by GitHub (for repo dependency graphs) and other production apps at scale
7. Install: `npm install react-force-graph` (the 2D module is the default export)

---

## 5. Implementation Phases

### Phase 1: Basic Graph (3-4 days)
- [ ] Install `react-force-graph` dependency
- [ ] Create `useGraphData` hook (fetch insights, compute nodes + edges client-side)
- [ ] Create `KnowledgeGraph` component with force-directed layout
- [ ] Custom node rendering (shape by type, size by mentions, color by type)
- [ ] Custom edge rendering (thickness by weight)
- [ ] Click-to-select node highlighting
- [ ] Add "Graph" tab to Knowledge Base page

### Phase 2: Interaction & Filtering (2-3 days)
- [ ] `GraphFilters` component (entity type toggles, mention threshold slider)
- [ ] Search-to-focus functionality
- [ ] Hover tooltips on nodes and edges
- [ ] `EntityPanel` slide-in with mention details (podcast + timestamp links)
- [ ] Navigation from mention to podcast detail page

### Phase 3: Entity Deduplication (2 days)
- [ ] Case-insensitive name normalization in graph builder
- [ ] Fuzzy matching (Levenshtein) for near-duplicate names
- [ ] UI indicator for merged entities (show alias count in tooltip)

### Phase 4: Performance & Scale (1-2 days)
- [ ] Materialized view migration + refresh trigger in `process-podcast`
- [ ] Top-N node limit with "show more" toggle
- [ ] WebGL renderer toggle for 500+ node graphs
- [ ] Client-side caching of graph data

### Phase 5: Cross-KB View (1 day)
- [ ] KB selector dropdown in filter toolbar
- [ ] Multi-KB query in `useGraphData` hook
- [ ] Color-coding or grouping by source KB

---

## 6. Dependencies & Risks

**Dependencies:**
- `react-force-graph` npm package (~45KB, MIT license)
- Existing `insights.entities` data quality -- graph is only as good as the entity extraction from the Groq Llama 3.3 70B model (currently used in `process-podcast` at line 584-613 of `supabase/functions/process-podcast/index.ts`)
- The `knowledge_base_podcasts` junction table for KB-scoped queries

**Risks:**

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Entity extraction inconsistency (same entity named differently) | High | Medium | Phase 3 deduplication; consider adding entity normalization to the insights prompt |
| Performance with 100+ podcasts per KB | Medium | Medium | Materialized view (Phase 4); top-N limit; WebGL renderer |
| Sparse graphs (few connections) for small KBs | Medium | Low | Show meaningful empty state; require minimum 3 processed podcasts |
| Entity type misclassification (person tagged as company) | Medium | Low | LLM extraction is imperfect; add manual override in EntityPanel |
| Canvas rendering inconsistency across browsers | Low | Low | `react-force-graph` handles cross-browser canvas well; test on Chrome + Firefox |

---

## 7. Estimated Effort

| Phase | Effort | Cumulative |
|---|---|---|
| Phase 1: Basic Graph | 3-4 days | 3-4 days |
| Phase 2: Interaction & Filtering | 2-3 days | 5-7 days |
| Phase 3: Entity Deduplication | 2 days | 7-9 days |
| Phase 4: Performance & Scale | 1-2 days | 8-11 days |
| Phase 5: Cross-KB View | 1 day | 9-12 days |

**MVP (Phases 1-2): ~5-7 days.** This delivers a usable, interactive graph with filtering and entity detail panels.

**Full feature (Phases 1-5): ~9-12 days.** Adds deduplication, performance optimization, and cross-KB comparison.

No new API keys, no new edge functions (at MVP), no new external services. The feature builds entirely on existing data in the `insights` table.
