# Suggested Questions

## 1. Overview

Suggested Questions replaces the hardcoded starter prompts in `ChatPanel.jsx` (line 64: `starters` array containing generic strings like "What are the key takeaways?") with content-aware questions generated from the actual podcast content. The current starters are static and identical regardless of what the KB contains -- they are a placeholder. This feature makes them intelligent.

**Two levels of suggested questions:**

1. **Podcast-level:** Generated per podcast during processing. Specific to that episode's content. Shown on the podcast detail page. Example: "How does the guest compare transformer architectures to RNNs for sequence modeling?"

2. **KB-level:** Generated per knowledge base. Span themes across all podcasts in the KB. Shown in the ChatPanel when no conversation is active. Example: "What do the guests across these episodes agree on about the future of AI regulation?"

**Why this matters:** The chat panel's value depends on users asking good questions. Generic starters like "Summarize the latest episodes" do not teach the user what the KB *actually* contains. Content-specific questions serve as a discovery mechanism -- they show the user what is interesting before they even ask.

---

## 2. User Stories

1. **As a user opening a KB chat for the first time**, I want to see 5-8 suggested questions that reflect the actual content of my podcasts, so I can immediately start exploring without having to think of a question.

2. **As a user viewing a processed podcast**, I want to see 5-10 suggested questions specific to that episode on the podcast detail page, so I can quickly dive into the most interesting parts of the content.

3. **As a user**, I want to click a suggested question and have it sent to the chat as my message, so I can get an answer without retyping anything.

4. **As a user who has added more podcasts to a KB**, I want the KB-level suggested questions to update to reflect the new content, so the suggestions stay relevant as the KB grows.

5. **As a user who finds the suggestions stale**, I want a "Refresh suggestions" button that generates new questions, so I can get fresh entry points into the content.

6. **As a user scanning suggested questions**, I want each question to show a topic tag (e.g., "AI Ethics", "Fundraising") so I can quickly identify which questions relate to my current interest.

7. **As a researcher**, I want suggested questions to be thought-provoking and specific (not generic), so they surface insights I would not have thought to ask about on my own.

---

## 3. Design & Functionality

### UI/UX Design

**Podcast-level suggested questions (podcast detail page):**

Shown in a new section within the Insights tab of `PodcastDetail.jsx`, below the existing insights panels (summary, key points, topics, entities rendered by `InsightsPanel.jsx`). Alternatively, shown as a standalone card at the bottom of the insights view:

```
+----------------------------------------------------------+
| SUMMARY                                                   |
| {insights.summary}                                        |
+----------------------------------------------------------+
| KEY POINTS                                                |
| 01  {key_point_1}                                        |
| 02  {key_point_2}                                        |
+----------------------------------------------------------+
| ASK ABOUT THIS EPISODE                      [Refresh]    |
+----------------------------------------------------------+
| "How does the guest's view on transformer    [AI Models] |
|  scaling laws compare to Chinchilla results?"            |
+----------------------------------------------------------+
| "What funding challenges did the company     [Startups]  |
|  face before their Series A?"                            |
+----------------------------------------------------------+
| "What does the host mean by 'emergent        [AI Safety] |
|  capabilities' and why is it concerning?"                 |
+----------------------------------------------------------+
```

Each question card has:
- The question text in serif italic (matching the current `starters` styling in `ChatPanel.jsx`, line 101)
- A topic tag in the top-right corner (accent-colored pill, matching the `Tag` component in `ui.jsx`)
- A click handler that navigates to the KB chat and sends the question

**KB-level suggested questions (ChatPanel empty state):**

Replaces the hardcoded `starters` array in `ChatPanel.jsx` (line 64). When no conversation is active and no messages exist, the chat panel shows KB-level suggested questions instead of the generic starters:

```
+------------------------------------------+
| ASK {KB_NAME}                            |
+------------------------------------------+
| Try                                      |
|                                          |
| "What do the guests across these         |
|  episodes agree on about AI regulation?" |
|                                          |
| "Compare the fundraising strategies      |
|  discussed in episodes 1 and 3"          |
|                                          |
| "What contrarian views were expressed     |
|  about large language models?"           |
|                                          |
| [Refresh suggestions]                    |
+------------------------------------------+
```

The visual style matches the current starters exactly (line 98-107: border, rounded, serif italic, hover accent border) but the content is dynamic.

**"Refresh suggestions" button:**

A small text button below the question list. Clicking it calls the generation function again and replaces the current suggestions. Shows a brief loading spinner while generating (1-3 seconds for LLM call).

**Click question -> auto-send to chat:**

Clicking a podcast-level question:
1. Navigates to the KB page (if the podcast is in a KB)
2. Sends the question to the ChatPanel's `send()` function
3. The ChatPanel creates a new conversation with that question

Clicking a KB-level question:
1. Calls `send(questionText)` directly (same as clicking a current starter, line 99)

### Behavior

**Question generation timing:**

Three options were evaluated:

| Option | When | Pros | Cons |
|--------|------|------|------|
| A: During `process-podcast` pipeline | After insights step (90-99%) | Questions ready immediately when processing finishes. Zero additional latency for the user. | Adds 2-4s to the processing pipeline. Tightly couples question generation with processing. |
| B: Separate edge function, called after processing | Frontend calls after status becomes `ready` | Decoupled from pipeline. Can regenerate independently. | Extra API call after processing. User sees "ready" but questions are not yet available for a few seconds. |
| C: Client-side generation on first view | When user opens insights or chat for the first time | No server cost until needed. Lazy generation. | 2-4s delay when user first views. Bad UX -- user sees loading spinner where questions should be. |

**Recommendation: Option A (during processing) for podcast-level questions, Option B (separate edge function) for KB-level questions.**

Rationale:
- Podcast-level questions depend on the same transcript and insights data that the pipeline has already computed. Adding a step to the pipeline is natural and avoids an extra API call. The 2-4s added to a pipeline that already takes 60-120s is negligible.
- KB-level questions depend on multiple podcasts' content, which changes whenever a podcast is added or removed. These must be regenerated independently from any single podcast's processing pipeline.

**Question quality criteria:**

The LLM prompt instructs the model to generate questions that are:
- **Specific:** Reference actual topics, people, or claims from the content. Not "What was discussed?" but "How does the guest defend their position on X?"
- **Answerable:** The RAG pipeline must be able to answer the question from the transcript chunks. No speculative questions.
- **Thought-provoking:** Go beyond surface-level recall. Compare viewpoints, identify tensions, explore implications.
- **Diverse:** Cover different topics and segments of the podcast. Not five questions about the same thing.

**Question count:**
- Podcast-level: 5-8 questions per podcast (aim for 6).
- KB-level: 5-8 questions per KB (aim for 5, since they are cross-podcast synthesis questions).

**KB questions update when podcasts are added/removed:**

When a podcast is added to or removed from a KB:
1. The `knowledge_base_podcasts` junction table changes.
2. The frontend invalidates the KB-level questions by checking if the question count or associated podcast IDs have changed.
3. New questions are generated lazily: the ChatPanel checks if questions exist for the current KB podcast set. If not (or if the podcast set has changed since the last generation), it calls the generation edge function.

Detection mechanism: store the list of podcast IDs that were included when questions were generated. On each ChatPanel load, compare the current podcast IDs in the KB with the stored list. If they differ, regenerate.

---

## 4. Architecture & Technical Specs

### Generation Strategy

**Podcast-level: Option A -- integrated into `process-podcast` pipeline.**

After the insights step (line 648 in `process-podcast/index.ts`: `await supabase.from("insights").insert(...)`) and before setting status to `ready`, add a question generation step:

```typescript
// After insights generation, before "Done" section

await log("processing", "Generating suggested questions...");

const questionPrompt = `Based on this podcast transcript and the following insights, generate 6 specific, thought-provoking questions that a listener could ask about this episode. Each question should:
- Reference specific topics, people, or claims from the content
- Be answerable from the transcript
- Cover different parts of the episode
- Go beyond simple recall (compare, analyze, evaluate)

Return a JSON object with a "questions" array, where each item has:
- "text": the question string
- "topic": a short topic tag (1-3 words) for the question

Podcast title: ${pod.title}
Insights summary: ${insights.summary}
Key points: ${JSON.stringify(insights.key_points)}
Topics: ${JSON.stringify(insights.topics)}

Transcript (first 40,000 chars):
${fullText.slice(0, 40_000)}`;

const questionResponse = await fetchWithTimeout(
  "https://api.groq.com/openai/v1/chat/completions",
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${groqKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: INSIGHTS_MODEL,  // llama-3.3-70b-versatile
      max_tokens: 1024,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "You generate insightful questions about podcast episodes. Return valid JSON." },
        { role: "user", content: questionPrompt },
      ],
    }),
    timeout: TIMEOUT_INSIGHTS,
  },
);
```

This reuses the same Groq model (`llama-3.3-70b-versatile`) and API key already configured for insights. The additional cost is ~$0.001 per podcast (short output, 1024 max tokens).

**KB-level: Option B -- separate edge function `generate-questions`.**

```typescript
// supabase/functions/generate-questions/index.ts

// Input:
interface GenerateQuestionsRequest {
  knowledge_base_id: string
  force?: boolean  // regenerate even if questions exist
}

// Process:
// 1. Fetch all podcast IDs in the KB via knowledge_base_podcasts
// 2. Fetch insights (summary + topics) for each podcast
// 3. Concatenate summaries + topics into a context string
// 4. Call Groq with a prompt asking for 5 cross-podcast synthesis questions
// 5. Store questions in suggested_questions table
// 6. Store the podcast ID set for invalidation detection

// Output:
interface GenerateQuestionsResponse {
  questions: SuggestedQuestion[]
  podcast_ids: string[]  // the set of podcasts included in generation
}
```

### Database Changes

**New column on `insights` table (podcast-level questions):**

```sql
ALTER TABLE insights
  ADD COLUMN suggested_questions jsonb DEFAULT '[]'::jsonb;
```

Shape: `[{ "text": "...", "topic": "..." }, ...]`

Storing questions as a JSONB column on the existing `insights` row avoids a new table. Each podcast has exactly one `insights` row, and questions are 1:1 with insights. No join needed.

**New table: `kb_suggested_questions` (KB-level questions):**

```sql
CREATE TABLE kb_suggested_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  knowledge_base_id uuid NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
  questions jsonb NOT NULL DEFAULT '[]'::jsonb,
  podcast_ids uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  UNIQUE(knowledge_base_id)
);
```

- `questions`: same shape as podcast-level: `[{ "text": "...", "topic": "..." }]`
- `podcast_ids`: array of podcast UUIDs that were included when questions were generated. Used for invalidation: if the current KB podcast set differs from this array, questions are stale.
- `UNIQUE(knowledge_base_id)`: one row per KB, upserted on regeneration.

Why a separate table instead of a column on `knowledge_bases`: keeps the `knowledge_bases` table clean (it is a simple CRUD table). The questions data includes metadata (`podcast_ids`) that does not belong on the KB row.

### LLM Prompting Strategy

**What makes a good suggested question:**

The prompt engineering is critical. Bad prompts produce generic questions like "What was the main topic?" Good prompts produce questions like "How does the guest reconcile their optimism about AI safety with the alignment concerns raised by Stuart Russell?"

**Podcast-level prompt template:**

```
You are analyzing a podcast episode to generate suggested questions for a research assistant chatbot. The chatbot has access to the full transcript and can answer questions by finding relevant passages.

Generate exactly 6 questions that:
1. Are SPECIFIC to this episode's content -- mention actual names, companies, concepts discussed
2. Are ANSWERABLE from the transcript -- the chatbot must be able to find supporting text
3. Are THOUGHT-PROVOKING -- not "What was discussed?" but "How does X compare to Y?" or "What evidence does the guest give for Z?"
4. Cover DIFFERENT topics and segments -- do not cluster around one theme
5. Use NATURAL language -- questions a curious person would actually ask

Each question should have a topic tag (1-3 words) that categorizes it.

Bad examples (too generic):
- "What was the main topic of the episode?"
- "Who was the guest?"
- "What were the key takeaways?"

Good examples:
- "How does the guest's experience at Google DeepMind inform their view on open-source AI models?" [topic: "Open Source AI"]
- "What specific metrics did they use to measure the success of their Series A fundraising?" [topic: "Fundraising"]
```

**KB-level prompt template:**

```
You are analyzing a collection of podcast episodes in a knowledge base called "{kb_name}". Generate 5 cross-episode synthesis questions that:
1. Draw connections BETWEEN episodes -- compare guests' viewpoints, find patterns, identify disagreements
2. Are ANSWERABLE from the combined transcripts
3. Are THOUGHT-PROVOKING -- surface non-obvious insights
4. Reference specific episodes or guests by name when possible

Here are the episodes and their summaries:
{for each podcast: title, channel, summary, topics}
```

### Frontend Components

| Component | Path | Responsibility |
|-----------|------|----------------|
| `SuggestedQuestions` | `src/components/SuggestedQuestions.jsx` | Renders a list of question cards with topic tags. Used in both InsightsPanel and ChatPanel contexts. |
| `QuestionCard` | Inline in `SuggestedQuestions` | Single question card: text, topic tag, click handler |

**`SuggestedQuestions` props:**

```typescript
interface SuggestedQuestionsProps {
  questions: Array<{ text: string; topic: string }>
  onQuestionClick: (questionText: string) => void
  onRefresh: () => void
  loading: boolean
  level: 'podcast' | 'kb'  // affects header text
}
```

**Integration into `ChatPanel.jsx`:**

Replace the hardcoded `starters` array (line 64) with dynamic KB-level questions:

```jsx
// Before (current):
const starters = [
  'What are the key takeaways?',
  'Compare different viewpoints',
  'Summarize the latest episodes',
  'Find quotes about a specific topic',
]

// After:
const [suggestedQuestions, setSuggestedQuestions] = useState([])
const [suggestionsLoading, setSuggestionsLoading] = useState(true)

useEffect(() => {
  loadKBQuestions(knowledgeBaseId)
    .then(setSuggestedQuestions)
    .finally(() => setSuggestionsLoading(false))
}, [knowledgeBaseId])
```

If no KB-level questions exist yet (e.g., new KB, generation not triggered), fall back to the existing hardcoded starters. This ensures the chat panel always has something to show.

**Integration into `InsightsPanel.jsx`:**

Add a `SuggestedQuestions` section after the entities panel:

```jsx
{insights.suggested_questions?.length > 0 && (
  <SuggestedQuestions
    questions={insights.suggested_questions}
    onQuestionClick={(q) => {
      // Navigate to KB chat and send question
      // Uses the first linked KB, or the current KB if in a KB context
    }}
    onRefresh={() => regeneratePodcastQuestions(podcastId)}
    loading={regenerating}
    level="podcast"
  />
)}
```

### Caching/Invalidation

**Podcast-level questions:** Generated once during processing. Cached in the `insights.suggested_questions` column. Never automatically invalidated (the transcript does not change after processing). "Refresh" button calls a lightweight edge function that regenerates just the questions column for that podcast's insights row.

**KB-level questions:** Cached in `kb_suggested_questions` table with the `podcast_ids` array. Invalidation check on every `ChatPanel` mount:

```typescript
async function loadKBQuestions(kbId: string) {
  // 1. Fetch current podcast IDs in the KB
  const currentPodcastIds = await getKBPodcastIds(kbId)

  // 2. Fetch stored questions + their podcast_ids
  const stored = await getStoredKBQuestions(kbId)

  // 3. Compare sets
  if (stored && arraysEqual(stored.podcast_ids.sort(), currentPodcastIds.sort())) {
    return stored.questions  // cache hit
  }

  // 4. Cache miss -- regenerate
  const fresh = await generateKBQuestions(kbId)
  return fresh.questions
}
```

This means the first user to open the ChatPanel after adding/removing a podcast triggers a regeneration (~3s delay). Subsequent visits use the cached version until the podcast set changes again.

---

## 5. Implementation Phases

### Phase 1: Podcast-Level Questions (in processing pipeline)

- [ ] Add `suggested_questions` JSONB column to `insights` table (migration)
- [ ] Add question generation step to `process-podcast/index.ts` (after insights, before "Done")
- [ ] Update `getInsights()` service to include `suggested_questions` in the select
- [ ] Build `SuggestedQuestions` component with `QuestionCard`
- [ ] Integrate into `InsightsPanel.jsx` after entities section
- [ ] Wire click handler to navigate to KB chat and send question
- [ ] Test with a real processed podcast

**Estimated effort:** 1-2 days

### Phase 2: KB-Level Questions (replace chat starters)

- [ ] Create `kb_suggested_questions` table (migration)
- [ ] Build `generate-questions` edge function for KB-level generation
- [ ] Create `src/services/questions.js` service layer (load, regenerate, invalidation check)
- [ ] Replace hardcoded `starters` in `ChatPanel.jsx` with dynamic questions
- [ ] Add invalidation logic (compare podcast_ids on mount)
- [ ] Add fallback to generic starters when no questions exist
- [ ] Add loading state while questions generate

**Estimated effort:** 2-3 days

### Phase 3: Refresh + Polish

- [ ] Add "Refresh suggestions" button to both podcast and KB question lists
- [ ] Build lightweight edge function for podcast-level question regeneration (or reuse `generate-questions` with a `podcast_id` param)
- [ ] Add topic tags to question cards
- [ ] Animate question card appearance (fade-in, staggered)
- [ ] Handle edge cases: KB with 0 ready podcasts, podcast with failed insights
- [ ] Mobile-responsive question card layout (full width, smaller text)

**Estimated effort:** 1 day

---

## 6. Dependencies & Risks

**Dependencies:**

- **Groq API (llama-3.3-70b-versatile)** -- already configured as a Supabase secret (`GROQ_API_KEY`), used by both `process-podcast` and `chat` edge functions. Podcast-level question generation reuses the same model and key. Cost per podcast: ~$0.001 (1024 max output tokens).
- **Insights data** -- podcast-level questions are generated *after* insights. If insights generation fails, questions are skipped. The pipeline should handle this gracefully (log a warning, continue to "ready" status without questions).
- **`process-podcast` edge function** -- modifying the pipeline to add a step. Current version is v14 (per CLAUDE.md). The question generation step must not break the existing pipeline or change the progress percentages significantly.
- **`ChatPanel.jsx` starters** -- direct replacement of lines 64-69. The current starters array is the only thing that changes in the ChatPanel for Phase 2.

**Risks:**

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| LLM generates generic questions despite specific prompt | Medium | Medium | Iterate on prompt engineering. Include specific content (key_points, entities) in the prompt context. Test with diverse podcast content. If quality is poor, switch to GPT-4o-mini (OpenAI) which may follow instructions more precisely. |
| Adding a step to the processing pipeline increases failure surface | Low | Medium | Wrap question generation in a try/catch. If it fails, log the error, store empty `suggested_questions`, and continue to "ready". Questions are non-critical -- a podcast is still useful without them. |
| KB-level question generation is slow for large KBs (20+ podcasts) | Low | Low | The prompt only sends summaries and topics (not full transcripts). 20 summaries fit easily within the context window. Generation time: 2-4s regardless of KB size. |
| Questions become stale after podcast removal but before ChatPanel is opened | Low | Low | Stale questions are still usable (they reference content that was in the KB). The invalidation check on ChatPanel mount ensures fresh questions within seconds of viewing. |
| "Refresh" button spammed, causing multiple concurrent LLM calls | Low | Low | Disable the refresh button while loading. Add a 30-second cooldown between refreshes. |
| Questions reference content that the RAG pipeline cannot find (hallucinated specifics) | Medium | Medium | The prompt instructs the model to only ask about content present in the transcript. Include key_points and entities in the prompt so the model references verified facts. Test with real data. |

---

## 7. Estimated Effort

| Phase | Work | Effort |
|-------|------|--------|
| Phase 1 -- Podcast-Level | Migration, pipeline step, SuggestedQuestions component, InsightsPanel integration | 1-2 days |
| Phase 2 -- KB-Level | Migration, edge function, service layer, ChatPanel integration, invalidation | 2-3 days |
| Phase 3 -- Refresh + Polish | Refresh button, topic tags, edge cases, animation | 1 day |
| **Total** | | **4-6 days** |

New npm dependencies: 0.

New edge functions: 1 (`generate-questions` for KB-level, Phase 2).

Database migrations: 2 (Phase 1: add column to `insights`, Phase 2: create `kb_suggested_questions` table).

Files modified: `process-podcast/index.ts` (add pipeline step), `ChatPanel.jsx` (replace starters), `InsightsPanel.jsx` (add questions section).

Files created: `SuggestedQuestions.jsx`, `src/services/questions.js`, `supabase/functions/generate-questions/index.ts`.
