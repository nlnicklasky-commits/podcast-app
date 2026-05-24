# Feature 08: Multi-KB Chat

## 1. Overview

Multi-KB Chat extends PodBrain's RAG chat to query across two or more knowledge bases simultaneously. Today, chat is scoped to a single KB: the `chat` edge function requires one `knowledge_base_id`, calls `match_chunks` filtered to that KB's podcasts, and the `conversations` table has a non-nullable `knowledge_base_id` FK (see `supabase/functions/chat/index.ts`, line 104; `001_initial_schema.sql`, line 64).

**Why it matters.** The value of a "second brain" scales with cross-referencing. A user with an "AI Startups" KB and a "Policy & Regulation" KB cannot currently ask "How do AI founders' views on regulation compare with what policy experts recommend?" That query needs chunks from both KBs, with sources attributed back to their origin KB so the user knows which perspective came from where.

**Use cases:**
- Compare perspectives across domains ("What does my Health KB say about sleep vs. my Productivity KB?")
- Synthesize knowledge globally ("Across all my KBs, what are the most-discussed risks of AI?")
- Find contradictions ("Do any of my KBs disagree about the effectiveness of cold exposure?")
- Trace ideas across contexts ("Where does Naval Ravikant appear in my Startups KB vs. my Philosophy KB?")

---

## 2. User Stories

1. **As a user**, I want to select multiple KBs before asking a question, so I can get answers that draw from several topic areas at once.

2. **As a user**, I want an "All KBs" toggle so I can search my entire podcast library without manually selecting each KB.

3. **As a user**, I want each cited source to show which KB it belongs to, so I can tell which domain a piece of evidence came from.

4. **As a user**, I want to see source citations color-coded by KB, so I can visually scan which KBs contributed to an answer.

5. **As a user**, I want a dedicated global chat page accessible from the sidebar, so I can start a cross-KB conversation without navigating into a specific KB first.

6. **As a user**, I want my multi-KB conversations saved and accessible from the global chat page, so I can resume previous cross-KB research sessions.

7. **As a user**, I want the existing single-KB chat to continue working exactly as it does today, so this feature does not disrupt my current workflow.

8. **As a user**, I want the system to tell me when my selected KBs have no relevant results for my query, so I know to refine my question or select different KBs.

---

## 3. Design & Functionality

### UI/UX Design

**KB Selector (multi-select chips).** A horizontal chip bar above the chat input. Each chip displays the KB name with its `KBGlyph` icon. Clicking a chip toggles it on/off. An "All KBs" chip at the left acts as a select-all toggle -- selecting it activates all KBs; deselecting any individual KB deselects "All KBs." The selector includes a search/filter input when the user has more than 6 KBs, to keep the chip list manageable.

**"All KBs" behavior.** When active, the edge function receives `knowledge_base_ids: null` (or omits the field), signaling "search all." This avoids the frontend needing to enumerate every KB ID and automatically includes KBs created after the conversation started.

**Source attribution.** Each source citation in the assistant response includes three levels: `[KB Name] > Podcast Title @ Timestamp`. In the source pill below the response (currently rendered in `MessageBubble` in `ChatPanel.jsx`, lines 210-224), the KB name appears as a colored prefix badge.

**Color-coding.** Each selected KB is assigned a color from a fixed palette (8 colors, cycling). The color appears on: (a) the KB chip in the selector, (b) the `[N]` inline citation badges, and (c) the source list pills. The palette uses CSS custom properties so it works in both light and dark themes.

**Dedicated Global Chat page vs. enhancement.** Both:
- The existing `ChatPanel` embedded in `KnowledgeBase.jsx` (line 192) continues to work as single-KB chat, with the KB pre-selected and locked.
- A new `/chat` route hosts a full-page `GlobalChatPage` with the KB selector visible. Users reach it from a sidebar link.

**Conversation management.** Multi-KB conversations display in the global chat page's history sidebar. Each conversation card shows the KB chips that were active when the conversation was created. If the user changes the KB selection mid-conversation, the new selection applies to subsequent messages only (prior answers retain their original scope).

### Behavior

**Vector search strategy.** Single query, merged results. The edge function calls a new `match_chunks_multi` RPC that accepts an array of `knowledge_base_ids` (or null for all). Internally, this RPC joins `chunks` to `knowledge_base_podcasts` using an `IN` filter on KB IDs (or omits the filter for "all"). This is a single Postgres query -- no parallel per-KB calls needed, because pgvector's `<=>` operator and the join are handled in one pass. The RPC returns the same columns as `match_chunks` plus `knowledge_base_id` and `knowledge_base_name` on each row.

**Result ranking.** Similarity scores from pgvector's cosine distance are already normalized (0 to 1). No per-KB normalization is needed because all chunks use the same embedding model (`text-embedding-3-small`) and the same vector space. Results are ranked by raw similarity score across all KBs. The `MAX_CHUNKS` limit (currently 10) increases to 15 for multi-KB queries to ensure representation from multiple KBs, with a soft cap of 5 chunks per KB to prevent one KB from dominating.

**Context window management.** More KBs means potentially more context. Current budget: 10 chunks at ~500 tokens each = ~5,000 context tokens. For multi-KB, the limit rises to 15 chunks (~7,500 tokens). The system prompt template grows slightly to include KB names in source labels. Total context stays well within Groq Llama 3.3 70B's 128K context window, so this is not a binding constraint. The `CHAT_MAX_TOKENS` (2048) response limit remains unchanged.

**Conflicting information.** The system prompt is updated to instruct the model: "When sources from different knowledge bases present conflicting viewpoints, acknowledge both perspectives and attribute each to its originating knowledge base." The model already cites sources with `[Source N]` notation; the enhanced source metadata (which now includes KB name) gives the model enough information to attribute conflicting claims.

**Default behavior.** Opening chat from a specific KB page (the co-present panel in `KnowledgeBase.jsx`) pre-selects that single KB and hides the multi-select bar (identical to today's behavior). Opening the global chat page at `/chat` starts with no KBs selected and shows the selector. If the user navigates to `/chat?kb=<id>`, that KB is pre-selected but the selector is visible and editable.

---

## 4. Architecture & Technical Specs

### Database Changes

**Migration: `004_multi_kb_chat.sql`**

1. **Make `conversations.knowledge_base_id` nullable.** Multi-KB conversations are not scoped to one KB. Existing rows retain their FK. Null means "multi-KB or global."

```sql
ALTER TABLE conversations
  ALTER COLUMN knowledge_base_id DROP NOT NULL;
```

2. **Add junction table `conversation_knowledge_bases`.** Tracks which KBs are associated with a multi-KB conversation.

```sql
CREATE TABLE conversation_knowledge_bases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  knowledge_base_id uuid NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(conversation_id, knowledge_base_id)
);

CREATE INDEX idx_conv_kbs_conv ON conversation_knowledge_bases(conversation_id);
CREATE INDEX idx_conv_kbs_kb ON conversation_knowledge_bases(knowledge_base_id);
```

3. **New RPC `match_chunks_multi`.** Accepts an array of KB IDs (or null for all). Returns chunks with KB attribution.

```sql
CREATE OR REPLACE FUNCTION match_chunks_multi(
  query_embedding vector(1536),
  match_kb_ids uuid[] DEFAULT NULL,
  match_count int DEFAULT 15,
  match_threshold float DEFAULT 0.3
)
RETURNS TABLE (
  id uuid,
  podcast_id uuid,
  text text,
  start_time float,
  end_time float,
  token_count int,
  similarity float,
  knowledge_base_id uuid,
  knowledge_base_name text
)
LANGUAGE sql STABLE
AS $$
  SELECT DISTINCT ON (c.id)
    c.id,
    c.podcast_id,
    c.text,
    c.start_time,
    c.end_time,
    c.token_count,
    1 - (c.embedding <=> query_embedding) AS similarity,
    kb.id AS knowledge_base_id,
    kb.name AS knowledge_base_name
  FROM chunks c
  JOIN knowledge_base_podcasts kbp ON kbp.podcast_id = c.podcast_id
  JOIN knowledge_bases kb ON kb.id = kbp.knowledge_base_id
  WHERE 1 - (c.embedding <=> query_embedding) > match_threshold
    AND (match_kb_ids IS NULL OR kbp.knowledge_base_id = ANY(match_kb_ids))
  ORDER BY c.id, similarity DESC
$$;

-- Wrap in a final ordering by similarity
-- (DISTINCT ON requires ordering by the DISTINCT column first,
--  so we wrap to get similarity-based ordering)
```

Note: Because a podcast can belong to multiple KBs, the same chunk could appear multiple times. `DISTINCT ON (c.id)` deduplicates, keeping the highest-similarity match. A wrapper query or application-level sort handles final ordering by similarity and applies the `match_count` limit with per-KB soft caps.

### Edge Function: Modify `chat`

**File:** `supabase/functions/chat/index.ts`

**Request body changes (backward compatible):**

| Field | Current | New | Notes |
|-------|---------|-----|-------|
| `knowledge_base_id` | required (string) | optional (string) | Single-KB mode, unchanged behavior |
| `knowledge_base_ids` | -- | optional (string[]) | Multi-KB mode |
| `question` | required | required | Unchanged |
| `conversation_id` | optional | optional | Unchanged |

Logic: If `knowledge_base_ids` is provided and non-empty, use multi-KB mode. Else if `knowledge_base_id` is provided, use single-KB mode (call existing `match_chunks`). If neither is provided, return error.

**Multi-KB search flow:**

1. Embed the question (unchanged -- same OpenAI call).
2. Call `match_chunks_multi` RPC with `match_kb_ids` set to the provided array (or null for "all").
3. Build context with KB-attributed source labels: `[Source N: "Episode Title" by Show Name (KB: KB Name) at 1:23:45]`.
4. Enhanced system prompt:

```
You are a helpful podcast research assistant with access to multiple knowledge bases.
Answer questions based on the podcast transcript excerpts provided below.
Always cite your sources using [Source N] notation.
When sources from different knowledge bases present conflicting viewpoints,
acknowledge both perspectives and attribute each to its originating knowledge base.
If the context doesn't contain enough information to answer fully, say so.

Active knowledge bases: {kb_names_list}

Relevant podcast excerpts:
{context}
```

5. Call Groq (unchanged model and params).
6. Build enhanced source citations:

```typescript
{
  chunk_id: string,
  podcast_id: string,
  podcast_title: string,
  podcast_channel: string,
  knowledge_base_id: string,    // NEW
  knowledge_base_name: string,  // NEW
  text: string,
  start_time: number,
  end_time: number,
  similarity: number,
}
```

7. Save conversation. If `knowledge_base_ids` was used, set `conversations.knowledge_base_id` to null and insert rows into `conversation_knowledge_bases`.

**Token budget allocation.** For multi-KB queries, `MAX_CHUNKS` increases from 10 to 15. A post-query step enforces a soft cap: no single KB contributes more than `ceil(15 / num_selected_kbs)` chunks (e.g., 2 KBs = max 8 per KB, 3 KBs = max 5 per KB). If one KB has fewer matches, the surplus is redistributed to others.

### Frontend Components

**`KBSelector.jsx` (new component)**
- Props: `knowledgeBases: KB[]`, `selected: string[]`, `onChange: (ids: string[]) => void`, `disabled: boolean`
- Renders horizontal chip bar with "All KBs" toggle
- Each chip: KB name, `KBGlyph` mini icon, assigned color dot
- Search filter input appears when `knowledgeBases.length > 6`
- Color assignment: deterministic based on KB index in the sorted KB list (stable across renders)

**`GlobalChatPage.jsx` (new page, route `/chat`)**
- Full-page chat layout (no co-present panel split)
- Left sidebar: conversation history for multi-KB conversations (queries `conversations` where `knowledge_base_id IS NULL`)
- Main area: `KBSelector` at top, then message thread, then input
- Reads `?kb=<id>` query param to pre-select a KB if present
- Fetches KB list via existing `listKnowledgeBases()` service

**Enhanced `ChatPanel.jsx`**
- When used from `KnowledgeBase.jsx` (single-KB mode): no visible changes. The `knowledgeBaseId` prop is passed as before.
- Internal refactor: extract message rendering into a shared `ChatMessages` component that both `ChatPanel` and `GlobalChatPage` can use.
- `MessageBubble` gains KB attribution: if `source.knowledge_base_name` exists, render a colored KB badge before the podcast title in the source pill.

**Enhanced `MessageBubble` source pill (within ChatPanel.jsx, lines 210-224):**

Current:
```
[1] Episode Title                    1:23:45
```

Multi-KB:
```
[1] AI Startups > Episode Title      1:23:45
```

Where "AI Startups" is a colored badge matching the KB's assigned color.

### API Design

**Request (multi-KB):**
```json
{
  "knowledge_base_ids": ["uuid-1", "uuid-2"],
  "question": "Compare views on AI regulation",
  "conversation_id": null
}
```

**Request (single-KB, backward compatible):**
```json
{
  "knowledge_base_id": "uuid-1",
  "question": "What are the key takeaways?",
  "conversation_id": null
}
```

**Response (enhanced, backward compatible):**
```json
{
  "answer": "Based on the sources...",
  "sources": [
    {
      "chunk_id": "uuid",
      "podcast_id": "uuid",
      "podcast_title": "Episode Title",
      "podcast_channel": "Show Name",
      "knowledge_base_id": "uuid-1",
      "knowledge_base_name": "AI Startups",
      "text": "excerpt...",
      "start_time": 123.4,
      "end_time": 156.7,
      "similarity": 0.87
    }
  ],
  "conversation_id": "uuid"
}
```

Existing single-KB callers continue to send `knowledge_base_id` (singular). The response adds `knowledge_base_id` and `knowledge_base_name` to each source object -- these are new fields, so existing clients ignore them harmlessly.

**Service layer (`src/services/chat.js`) changes:**
- New function `sendMultiKBMessage(kbIds: string[], question: string, conversationId?: string)` that sends `knowledge_base_ids` instead of `knowledge_base_id`.
- `listConversations` gains an optional `global: boolean` param. When true, queries `conversations` where `knowledge_base_id IS NULL`.
- Existing `sendMessage` remains unchanged.

---

## 5. Implementation Phases

### Phase 1: Multi-KB Selection + Merged Vector Search
**Scope:** Backend plumbing and basic frontend integration.

- [ ] Migration `004_multi_kb_chat.sql`: nullable FK, junction table, `match_chunks_multi` RPC
- [ ] Update `chat` edge function to accept `knowledge_base_ids` array, call `match_chunks_multi`
- [ ] Add `sendMultiKBMessage` to `src/services/chat.js`
- [ ] Build `KBSelector` component (chip bar with multi-select)
- [ ] Build `GlobalChatPage` at `/chat` route with KB selector wired to `sendMultiKBMessage`
- [ ] Add `/chat` link to sidebar in `Layout.jsx`
- [ ] Verify single-KB chat is unaffected (backward compatibility)

### Phase 2: KB Attribution in Citations + Color Coding
**Scope:** Visual polish for source attribution.

- [ ] Update `MessageBubble` to render `knowledge_base_name` as colored badge in source pills
- [ ] Implement deterministic color palette assignment for KBs
- [ ] Update system prompt to instruct model on multi-KB attribution
- [ ] Add KB filter/grouping toggle on source list ("group by KB" vs. "rank by relevance")
- [ ] Persist `conversation_knowledge_bases` junction rows when creating multi-KB conversations

### Phase 3: Global Chat Page Polish + Conversation History
**Scope:** Complete the global chat experience.

- [ ] Conversation history sidebar in `GlobalChatPage` (list multi-KB conversations)
- [ ] Display active KB chips on each conversation card in history
- [ ] Support resuming multi-KB conversations (load `conversation_knowledge_bases` to restore KB selection)
- [ ] Support `?kb=<id>` query param for deep-linking from KB page to global chat
- [ ] "Open in global chat" button on single-KB `ChatPanel` to promote a conversation to multi-KB
- [ ] Empty state and onboarding for global chat ("Select knowledge bases to start")

---

## 6. Dependencies & Risks

**Dependencies:**
- `match_chunks` RPC must exist and work correctly (it does -- Phase 5 Chat is complete per CLAUDE.md)
- `knowledge_base_podcasts` junction table must exist (it does -- Phase 2.5 is complete)
- KBs need processed podcasts with embeddings to return results (existing pipeline handles this)

**Risks:**

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Chunk deduplication complexity.** A podcast in 2 KBs produces the same chunks. `match_chunks_multi` could return the same chunk twice with different KB attributions. | Duplicate context wastes tokens and confuses the model. | `DISTINCT ON (c.id)` in the RPC. Pick one KB attribution per chunk (the first KB alphabetically, or the one with highest relevance). |
| **Per-KB soft cap logic.** Ensuring balanced representation across KBs adds complexity to the RPC or the edge function. | One dominant KB could drown out smaller ones. | Implement in the edge function (TypeScript), not in SQL. Easier to tune and test. |
| **Context window growth.** 15 chunks at 500 tokens = 7,500 tokens of context. With system prompt and conversation history, total could reach ~12K tokens. | Not a real risk for Llama 3.3 70B (128K context), but Groq rate limits could be a factor for very long conversations. | Monitor token usage. The 20-message history cap (`MAX_HISTORY_MESSAGES`) already bounds this. |
| **Migration on nullable FK.** Making `conversations.knowledge_base_id` nullable changes a constraint on an existing table with live data. | Low risk -- all existing rows have a value, and `ALTER COLUMN DROP NOT NULL` is non-destructive. | Test migration on a Supabase branch database first. |
| **UI complexity.** The KB selector adds cognitive load, especially for users with many KBs. | Users might not understand when to use multi-KB vs. single-KB chat. | Default to single-KB when entering from a KB page. Only show the selector on the global chat page. Keep the co-present panel simple. |

---

## 7. Estimated Effort

| Phase | Scope | Estimate |
|-------|-------|----------|
| Phase 1 | Migration, RPC, edge function update, KBSelector, GlobalChatPage skeleton, routing | 6-8 hours |
| Phase 2 | KB attribution UI, color coding, system prompt tuning, conversation junction persistence | 4-5 hours |
| Phase 3 | Conversation history, resume flow, deep-linking, polish, empty states | 4-5 hours |
| **Total** | | **14-18 hours** |

All three phases can ship incrementally. Phase 1 is self-contained and delivers the core value (cross-KB querying). Phases 2 and 3 are polish that can be deferred or reprioritized.
