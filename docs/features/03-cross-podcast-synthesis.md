# Cross-Podcast Synthesis

## 1. Overview

Cross-Podcast Synthesis transforms a knowledge base from a collection of individually analyzed podcasts into a unified intelligence layer. Today, each podcast in a KB has its own insights (summary, topics, key points, entities), and the chat interface can answer questions across them via RAG. What's missing is the **proactive, structured analysis** that surfaces what no single podcast reveals on its own: recurring themes across episodes, points of disagreement between hosts, how ideas evolve over time, and gaps in coverage where the KB is silent.

This feature generates an "executive briefing" for each knowledge base -- a synthesis report that reads all per-podcast insights together and produces KB-level intelligence. It directly fulfills the "second brain" vision stated in CLAUDE.md: _"Cross-podcast synthesis: compare viewpoints, find agreements/disagreements, surface patterns."_ It also completes the Phase 4 roadmap item: _"Knowledge base-level synthesis (themes across all podcasts)."_

**Value proposition:** Without synthesis, the user must manually read every podcast's insights and mentally connect the dots. With synthesis, the system does that connective thinking automatically -- making the KB more than the sum of its parts.

---

## 2. User Stories

1. **As a KB owner**, I want to see a synthesis of all themes across my podcasts so I can understand what the collection covers without reading each summary individually.

2. **As a researcher**, I want to see where podcast hosts agree and disagree on specific topics so I can identify consensus vs. contested ideas.

3. **As a learner**, I want a timeline of how ideas evolve across episodes (sorted by publish date) so I can trace how thinking has shifted over time.

4. **As a KB owner**, I want the system to identify knowledge gaps -- topics mentioned but never deeply explored -- so I know what podcasts to add next.

5. **As a returning user**, I want to see when the synthesis was last generated and how many podcasts have been added since, so I know if the briefing is stale.

6. **As a power user**, I want to manually trigger synthesis regeneration after adding new podcasts, so I control when the (potentially costly) LLM call runs.

7. **As a user with a large KB (20+ podcasts)**, I want synthesis to complete within a reasonable time without hitting token limits, so the feature scales beyond small collections.

8. **As a user**, I want to compare two specific podcasts' viewpoints on a topic side-by-side, so I can see exactly where hosts diverge.

---

## 3. Design & Functionality

### UI/UX Design

**Synthesis Tab on KB Detail Page**

The `KnowledgeBase.jsx` page currently shows a header, meta row, and episode list in the main column, with `ChatPanel` in a side column. Synthesis lives as a new tab alongside the episode list -- toggled via a segmented control (`Episodes | Synthesis`) placed where the `SectionHeader` currently sits.

**Synthesis Report Layout**

The report renders as a vertical stack of cards, matching the existing `InsightsPanel` card pattern (`p-[18px] bg-[var(--surface)] border border-[var(--border)] rounded-[var(--r-lg)]`). Sections in order:

1. **Executive Summary** -- 2-3 paragraph narrative of what the KB covers, written in the same serif style as per-podcast summaries.
2. **Themes** -- Each theme as a `ThemeCard`: theme name, 1-2 sentence description, list of contributing podcasts (title + channel), and a relevance score (how many podcasts touch this theme). Rendered as expandable cards.
3. **Agreements** -- Points where 2+ podcasts converge. Each item shows the shared claim, the podcasts that support it, and a representative quote snippet from each.
4. **Disagreements** -- Points of tension. Each item shows the contested topic, the opposing positions, and which podcasts hold each position. Rendered with a split layout (position A left, position B right).
5. **Timeline** -- A vertical timeline showing how key ideas appear and evolve across episodes, ordered by podcast publish date. Each node shows the podcast, date, and the idea/claim introduced. Uses a simple left-bordered timeline (CSS, no charting library).
6. **Knowledge Gaps** -- Topics mentioned in passing but never explored in depth. Each gap shows the topic, where it was mentioned, and a suggested search query for finding podcasts to fill it.

**Visual Elements**

- **Topic frequency**: Horizontal bar chart next to each theme card showing how many podcasts cover it (pure CSS -- `width` percentage on a div, no chart library).
- **Entity overlap**: A simple table showing entities (people, companies) that appear in 2+ podcasts, with dots indicating which podcasts mention them. This replaces a full graph visualization, which would add a charting dependency.
- **Timeline**: CSS-only vertical timeline with left border, circles for nodes, and cards extending right.

**Staleness Indicator**

Above the report, a meta bar shows:
- "Last synthesized: [relative time]" (e.g., "3 days ago")
- "N podcasts in KB at generation / M podcasts now" -- if M > N, show a badge: "N new podcasts since last synthesis"
- "Regenerate" button (accent-colored, same style as "Add podcast" button)

**Regenerate Button with Progress**

Clicking "Regenerate synthesis" disables the button, replaces its label with a spinner + "Synthesizing...", and polls `kb_synthesis.status` every 3 seconds (matching the existing processing log polling pattern). On completion, the report re-renders with fresh data.

**Comparison Mode**

Accessible from the Disagreements section -- clicking "Compare" on a disagreement opens a modal or inline expansion showing the two (or more) positions side-by-side with the source podcast, host name, and the relevant chunk text. This reuses the existing modal pattern from `AddPodcastModal`.

### Behavior

**When Synthesis Runs**

- **Phase 1:** Manual trigger only. User clicks "Generate synthesis" (first time) or "Regenerate" (subsequent). This keeps costs predictable.
- **Phase 3:** Optional auto-trigger: when a new podcast reaches `ready` status and the synthesis is older than 24 hours, show a prompt banner ("Your synthesis is out of date. Regenerate?") rather than auto-running.

**Minimum Podcast Threshold**

Synthesis requires at least 2 podcasts with `status = 'ready'` in the KB. With fewer, the Synthesis tab shows an empty state: "Add at least 2 processed podcasts to generate a synthesis."

**Scaling Strategy: 2 Podcasts vs. 50 Podcasts**

- **Small KBs (2-8 podcasts):** All per-podcast insights (summary, topics, key_points, entities) are concatenated into a single LLM prompt. At ~500 tokens per podcast insight set, 8 podcasts is ~4,000 tokens of context -- well within limits.
- **Medium KBs (9-25 podcasts):** Same approach. At 25 podcasts, ~12,500 tokens of insight context. Still fits in a single call with Llama 3.3 70B's 128K context window.
- **Large KBs (26-50+ podcasts):** Two-pass strategy. First pass: group podcasts into batches of 15, generate a "batch summary" for each batch. Second pass: synthesize the batch summaries into the final report. Each pass is a separate LLM call. This caps input at ~7,500 tokens per call.

**Incremental Updates vs. Full Regeneration**

- **Phase 1-2:** Full regeneration only. The edge function re-reads all podcast insights and generates a fresh synthesis. Simple and correct.
- **Phase 3:** Incremental mode. Store which podcast IDs were included in the last synthesis (`podcast_ids_included` JSONB array). On regeneration, detect which podcasts are new. Feed the previous synthesis + new podcast insights to the LLM with an "update this synthesis with these new additions" prompt. Falls back to full regeneration if >30% of podcasts are new (the delta is too large for a reliable incremental update).

---

## 4. Architecture & Technical Specs

### Database Changes

**New table: `kb_synthesis`**

```sql
create table kb_synthesis (
  id uuid primary key default gen_random_uuid(),
  knowledge_base_id uuid not null references knowledge_bases(id) on delete cascade,
  synthesis_type text not null default 'full'
    check (synthesis_type in ('full', 'incremental')),
  status text not null default 'pending'
    check (status in ('pending', 'generating', 'ready', 'error')),
  content jsonb not null default '{}'::jsonb,
  podcast_count_at_generation int not null default 0,
  podcast_ids_included jsonb default '[]'::jsonb,
  error_message text,
  progress real default 0,
  generated_at timestamptz,
  created_at timestamptz default now()
);

create index idx_kb_synthesis_kb on kb_synthesis(knowledge_base_id);

-- Only keep the latest synthesis per KB (soft constraint via application logic,
-- but index supports fast lookup)
create index idx_kb_synthesis_latest on kb_synthesis(knowledge_base_id, created_at desc);
```

**Content JSONB schema:**

```jsonc
{
  "executive_summary": "string -- 2-3 paragraph narrative",
  "themes": [
    {
      "name": "string",
      "description": "string",
      "podcast_ids": ["uuid", "..."],
      "relevance_count": 5
    }
  ],
  "agreements": [
    {
      "claim": "string -- the shared position",
      "podcast_ids": ["uuid", "..."],
      "evidence": [
        { "podcast_id": "uuid", "snippet": "string" }
      ]
    }
  ],
  "disagreements": [
    {
      "topic": "string",
      "positions": [
        {
          "stance": "string",
          "podcast_ids": ["uuid", "..."],
          "snippet": "string"
        }
      ]
    }
  ],
  "timeline": [
    {
      "podcast_id": "uuid",
      "date": "ISO date string or null",
      "idea": "string -- the claim or idea introduced"
    }
  ],
  "gaps": [
    {
      "topic": "string",
      "mentioned_in": ["uuid", "..."],
      "suggested_query": "string -- for Podcast Index search"
    }
  ],
  "entity_overlap": [
    {
      "name": "string",
      "type": "person | company | product | concept",
      "podcast_ids": ["uuid", "..."]
    }
  ]
}
```

### Edge Function: `synthesize-kb`

**Input:**

```json
{ "knowledge_base_id": "uuid" }
```

**Processing Steps:**

1. **Validate** -- Confirm KB exists. Count podcasts with `status = 'ready'`. Reject if < 2.
2. **Create synthesis record** -- Insert into `kb_synthesis` with `status = 'generating'`, `progress = 0`.
3. **Gather insights** -- Query all `insights` rows for podcasts linked to this KB via `knowledge_base_podcasts` junction table. Also fetch podcast metadata (title, channel, `created_at` as a proxy for publish date).
4. **Assemble prompt** -- Build the LLM prompt from gathered data (see prompt strategy below).
5. **LLM call** -- Send to Groq Llama 3.3 70B with `response_format: { type: "json_object" }` and `max_tokens: 8192`.
6. **Parse + store** -- Parse JSON response, write to `kb_synthesis.content`. Set `status = 'ready'`, `generated_at = now()`, `progress = 100`.

**Error handling** follows the existing `process-podcast` pattern: catch errors, write to `kb_synthesis.status = 'error'` and `error_message`, return error response.

**Prompt Engineering Strategy**

The prompt receives per-podcast insight blocks, not raw transcripts. Each block is structured as:

```
=== Podcast: "{title}" by {channel} (added {created_at}) ===
Summary: {summary}
Topics: {topics as comma-separated list}
Key Points:
- {key_point_1}
- {key_point_2}
...
Entities: {name (type), name (type), ...}
```

At ~300-500 tokens per podcast, this keeps 25 podcasts under 12,500 tokens. The system prompt instructs the model to return the exact JSON schema defined above.

**Chunking Strategy for Large KBs (26+ podcasts)**

Two-pass synthesis:

1. **Pass 1 -- Batch summaries:** Split podcasts into groups of 15. For each group, send insights to LLM with prompt: "Summarize the themes, agreements, disagreements, and notable entities across these podcasts. Return JSON." Store intermediate results in memory (not DB).
2. **Pass 2 -- Final synthesis:** Send all batch summaries to LLM with the full synthesis prompt. This final call produces the complete `content` JSONB.

Progress tracking: Pass 1 accounts for 10-70%, Pass 2 for 70-100%. For single-pass (<=25 podcasts), the LLM call spans 10-95%.

**Token Budget and Cost Estimation**

| KB Size | Input Tokens | Output Tokens | Groq Llama 3.3 70B Cost | Latency |
|---------|-------------|--------------|------------------------|---------|
| 5 podcasts | ~3,000 | ~3,000 | ~$0.004 | ~5s |
| 15 podcasts | ~7,500 | ~5,000 | ~$0.008 | ~10s |
| 25 podcasts | ~12,500 | ~6,000 | ~$0.012 | ~15s |
| 50 podcasts (2-pass) | ~20,000 total | ~10,000 total | ~$0.020 | ~30s |

Groq pricing: $0.59/M input, $0.79/M output for Llama 3.3 70B. Costs are negligible even at 50 podcasts.

### Frontend Components

**`SynthesisPanel.tsx`**
- Top-level component rendered in the Synthesis tab.
- Fetches latest `kb_synthesis` row for the KB on mount.
- Shows empty state, generating state, or the synthesis report.
- Contains the "Regenerate" button and staleness indicator.
- Calls `synthesizeKB(knowledgeBaseId)` service function on trigger.
- Polls `kb_synthesis` row every 3s while `status = 'generating'`.

**`ThemeCard.tsx`**
- Renders a single theme: name, description, podcast list, relevance bar.
- Expandable -- collapsed shows name + count, expanded shows full detail.
- Receives theme object + podcast metadata map as props.

**`DisagreementView.tsx`**
- Renders a single disagreement with split layout.
- Left column: Position A (stance, podcast sources).
- Right column: Position B (stance, podcast sources).
- "Compare" button opens inline expansion with full chunk text.

**`TimelineView.tsx`**
- Vertical CSS timeline.
- Each node: podcast title, date, idea text.
- Sorted by podcast `created_at` (or explicit publish date if available).
- Pure CSS -- left border with positioned circles, no library dependency.

**Loading/Progress States**

- **First generation:** Empty state with prominent "Generate synthesis" CTA button. Below it, a brief explanation: "Analyze all podcasts together to find themes, agreements, and gaps."
- **Generating:** The report area shows a skeleton loader with the section headers visible but content replaced by animated placeholder bars. A progress percentage is shown in the staleness bar area, matching the existing `ProcessingProgress` component pattern.
- **Error:** Red-bordered card with error message and a "Retry" button.

---

## 5. Implementation Phases

### Phase 1: Basic Synthesis (Themes + Key Agreements) -- Manual Trigger

**Scope:**
- `kb_synthesis` table migration
- `synthesize-kb` edge function (single-pass only, <=25 podcasts)
- Prompt generates: `executive_summary`, `themes`, `agreements` only
- `SynthesisPanel` component with tab toggle on KB page
- `ThemeCard` component
- Agreements list (simple card layout, no side-by-side yet)
- "Generate / Regenerate" button with polling progress
- Staleness indicator
- Service function `synthesizeKB()` and `getSynthesis()`

**What's deferred:** Disagreements, timeline, gaps, entity overlap, large KB batching, incremental updates.

### Phase 2: Disagreements, Timeline, Knowledge Gaps

**Scope:**
- Expand prompt to generate: `disagreements`, `timeline`, `gaps`, `entity_overlap`
- `DisagreementView` component with side-by-side layout
- `TimelineView` component (CSS timeline)
- Knowledge gaps section with suggested search queries
- Entity overlap table
- Two-pass batching for KBs with 26+ podcasts
- Comparison modal for drilling into disagreements

### Phase 3: Incremental Updates, Auto-Trigger, Visual Enhancements

**Scope:**
- Incremental synthesis: detect new podcasts, update prompt, store `podcast_ids_included`
- Auto-trigger prompt banner when synthesis is stale (new podcasts added since last generation)
- Topic frequency bar charts (CSS)
- Polish: animations, transitions, responsive layout for Synthesis tab
- Export synthesis as markdown

---

## 6. Dependencies & Risks

**Dependencies:**
- Requires per-podcast insights to exist (`insights` table populated). Podcasts with `status != 'ready'` or missing insights rows are excluded from synthesis.
- Groq API availability and rate limits. The existing `process-podcast` and `chat` functions already depend on Groq, so no new vendor risk.
- `knowledge_base_podcasts` junction table must be populated correctly (already working in current codebase -- `listPodcasts()` in `services/podcasts.js` queries through it).

**Risks:**

| Risk | Severity | Mitigation |
|------|----------|------------|
| LLM returns malformed JSON | Medium | Wrap JSON.parse in try/catch. Fall back to `{ executive_summary: rawText }` (same pattern used in `process-podcast` line 644-646). Validate required fields before storing. |
| Large KBs exceed Groq rate limits | Low | Two-pass batching keeps individual calls small. Add 2s delay between batch calls. Groq's Llama 3.3 70B has generous rate limits. |
| Supabase Edge Function timeout (default 60s) | Medium | Synthesis for 50 podcasts with 2-pass could take 30-40s. This is within the 60s default. If needed, the function can be deployed with `--no-verify-jwt` and increased timeout via Supabase dashboard (up to 300s). |
| Staleness confusion -- user doesn't realize synthesis is outdated | Low | Staleness indicator with podcast count diff is prominently placed. Phase 3 adds a prompt banner. |
| Quality degrades with podcast count | Medium | Two-pass batching mitigates. Monitor output quality at 30+ podcasts and consider increasing `max_tokens` or adding a validation pass. |
| Insights missing for some podcasts (processing errors) | Low | Edge function counts podcasts with insights vs. total ready podcasts. If >20% are missing insights, show a warning in the UI before generating. |

---

## 7. Estimated Effort

| Phase | Work | Estimate |
|-------|------|----------|
| **Phase 1** | Migration + edge function + SynthesisPanel + ThemeCard + service layer + tab toggle | 3-4 days |
| **Phase 2** | Disagreements + Timeline + Gaps + entity overlap + two-pass batching + comparison modal | 3-4 days |
| **Phase 3** | Incremental updates + auto-trigger banner + visual polish + export | 2-3 days |
| **Total** | | **8-11 days** |

Phase 1 is the critical path. It delivers immediate value and validates the prompt engineering approach before investing in the more complex views.
