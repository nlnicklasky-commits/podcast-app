# Groq Migration Plan

**Goal:** Move transcription, insights, and chat off OpenAI and onto Groq's free tier. Keep embeddings on OpenAI (Groq doesn't host embedding models, and OpenAI's embeddings are already near-free).

**Expected impact:** ~95% reduction in OpenAI variable cost, ~10–20x faster transcription, no infra changes. Quality should be comparable on insights (Llama 3.3 70B vs GPT-4o), slightly better on speed for chat (Llama 3.3 70B vs GPT-4o-mini).

**Status:** Planned, not started. Tracked via TaskList tasks #1–#10.

---

## Scope

| Workload | Before | After | Where it lives |
|---|---|---|---|
| Transcription | OpenAI `whisper-1` | Groq `whisper-large-v3` | `process-podcast/index.ts` ~line 200 |
| Insights | OpenAI `gpt-4o` | Groq `llama-3.3-70b-versatile` | `process-podcast/index.ts` ~line 321 |
| Chat (RAG) | OpenAI `gpt-4o-mini` | Groq `llama-3.3-70b-versatile` | `chat/index.ts` (not yet in repo) |
| Embeddings | OpenAI `text-embedding-3-small` | **unchanged** — stays on OpenAI | `process-podcast/index.ts` ~line 273 |

OpenAI key stays in secrets (for embeddings). Groq key is added alongside.

---

## Prerequisites

1. Groq account at https://console.groq.com (free tier, no credit card required)
2. Supabase CLI logged in to project `podcast-brain` (id `vxxmlieonejwyojenrsh`)
3. The `chat` edge function source available locally (currently only `process-podcast` is in the repo)

---

## Step-by-step

### Step 1 — Sign up for Groq and create an API key

1. Visit https://console.groq.com and sign up (Google or GitHub auth is fastest)
2. Go to **API Keys** in the left nav
3. Click **Create API Key**, name it `podcast-brain`
4. Copy the key (starts with `gsk_...`) — you'll only see it once

### Step 2 — Add the key to Supabase secrets

In PowerShell, from the project root:

```powershell
supabase secrets set GROQ_API_KEY=gsk_your_key_here --project-ref vxxmlieonejwyojenrsh
```

Verify:

```powershell
supabase secrets list --project-ref vxxmlieonejwyojenrsh
```

You should see `GROQ_API_KEY` alongside `OPENAI_API_KEY`, `PODCAST_INDEX_KEY`, `PODCAST_INDEX_SECRET`.

### Step 3 — Pull the chat edge function into the repo

Currently only `process-podcast` exists under `supabase/functions/` locally. The deployed `chat`, `podcast-search`, `podcast-episodes`, and `youtube-search` functions live only on Supabase. Pull `chat` down so we can edit it:

```powershell
cd C:\Users\nlnic\Documents\Projects\podcast-app
supabase functions download chat --project-ref vxxmlieonejwyojenrsh
```

Optional but recommended — pull the others too so they're tracked in git:

```powershell
supabase functions download podcast-search --project-ref vxxmlieonejwyojenrsh
supabase functions download podcast-episodes --project-ref vxxmlieonejwyojenrsh
supabase functions download youtube-search --project-ref vxxmlieonejwyojenrsh
```

### Step 4 — Swap Whisper to Groq in `process-podcast`

File: `supabase/functions/process-podcast/index.ts`

Around line 25, **add** the Groq key alongside the existing OpenAI key:

```ts
const openaiKey = Deno.env.get("OPENAI_API_KEY");
if (!openaiKey) throw new Error("OPENAI_API_KEY not set");
const groqKey = Deno.env.get("GROQ_API_KEY");
if (!groqKey) throw new Error("GROQ_API_KEY not set");
```

Around line 198–211, **change** the Whisper block:

```ts
// Before
formData.append("model", "whisper-1");
// ...
const whisperResponse = await fetch(
  "https://api.openai.com/v1/audio/transcriptions",
  {
    method: "POST",
    headers: { Authorization: `Bearer ${openaiKey}` },
    body: formData,
  },
);
```

To:

```ts
// After
formData.append("model", "whisper-large-v3");
// ...
const whisperResponse = await fetch(
  "https://api.groq.com/openai/v1/audio/transcriptions",
  {
    method: "POST",
    headers: { Authorization: `Bearer ${groqKey}` },
    body: formData,
  },
);
```

**Notes:**
- Groq's Whisper endpoint is OpenAI-compatible. `response_format: "verbose_json"` and `timestamp_granularities[]: "segment"` both work the same way.
- File size limit on Groq is currently 25 MB (same as OpenAI Whisper). The existing code path already produces MP3s well under this for typical podcasts.
- Update the log message on line 196 from `"Sending audio to OpenAI Whisper..."` to `"Sending audio to Groq Whisper..."`.

### Step 5 — Swap GPT-4o insights to Llama 3.3 70B on Groq

File: `supabase/functions/process-podcast/index.ts`, around line 304–340.

**Change** the insights generation block:

```ts
// Before
await log("processing", "Generating insights with GPT-4o...");
// ...
const insightResponse = await fetch(
  "https://api.openai.com/v1/chat/completions",
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openaiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o",
      max_tokens: 4096,
      response_format: { type: "json_object" },
      messages: [ /* ... */ ],
    }),
  },
);
```

To:

```ts
// After
await log("processing", "Generating insights with Llama 3.3 70B on Groq...");
// ...
const insightResponse = await fetch(
  "https://api.groq.com/openai/v1/chat/completions",
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${groqKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      max_tokens: 4096,
      response_format: { type: "json_object" },
      messages: [ /* ... unchanged ... */ ],
    }),
  },
);
```

**Notes:**
- Llama 3.3 70B on Groq supports `response_format: { type: "json_object" }`. Keep the existing prompts unchanged.
- Update the error message string from `"OpenAI insights error"` to `"Groq insights error"` for clearer logs.
- Embeddings block (lines 264–298) stays exactly as-is. Do not touch it.

### Step 6 — Local deploy and test against one fresh podcast

From the project root:

```powershell
supabase functions deploy process-podcast --project-ref vxxmlieonejwyojenrsh
```

Then in the app UI:

1. Add a fresh podcast episode (Podcast Index search → pick a short ~20 min episode)
2. Click **Process**
3. Watch the processing logs — Whisper step should finish in seconds, not minutes
4. Once `ready`, open the podcast detail view and inspect:
   - **Summary** — is it coherent? Comparable to past GPT-4o output?
   - **Topics** — reasonable count (5–10), accurate?
   - **Key points** — substantive, not generic?
   - **Entities** — captures real people/companies mentioned?

Pick a prior podcast (processed on GPT-4o) and compare side-by-side. Acceptable bar: roughly comparable in coverage and specificity. If insights feel noticeably hollow, revert to GPT-4o for insights only and keep Groq for transcription + chat.

### Step 7 — Swap chat function to Groq

File: `supabase/functions/chat/index.ts` (pulled down in Step 3).

Find the OpenAI chat completions call (will look similar to the insights block). Change:

- URL: `https://api.openai.com/v1/chat/completions` → `https://api.groq.com/openai/v1/chat/completions`
- Auth: `Bearer ${openaiKey}` → `Bearer ${groqKey}` (and add the same `groqKey` env read at top of file)
- Model: `gpt-4o-mini` → `llama-3.3-70b-versatile`
- Keep `messages`, `temperature`, and any other params unchanged

### Step 8 — Test chat

Deploy the chat function:

```powershell
supabase functions deploy chat --project-ref vxxmlieonejwyojenrsh
```

In the app, open an existing KB chat and ask:

1. A factual question that should pull from one specific podcast ("what did [host] say about [topic]")
2. A synthesis question across multiple podcasts ("how do these podcasts disagree about X")
3. A vague open-ended question ("what's interesting in this knowledge base")

Verify each response:
- Cites sources with podcast id + timestamp (existing RAG plumbing should be untouched)
- Reads coherently
- Returns noticeably faster than before (Llama 3.3 70B on Groq is ~250–500 tok/s vs ~50 tok/s for GPT-4o-mini)

### Step 9 — Final deploy + verify

If everything passed, both functions are already deployed. Run a quick health check:

```powershell
supabase functions list --project-ref vxxmlieonejwyojenrsh
```

Confirm both `process-podcast` and `chat` show recent deploy timestamps.

### Step 10 — Update CLAUDE.md

Edit `CLAUDE.md` to reflect the new reality. Specifically:

- **Tech Stack → AI/ML** line: change to `Groq — Whisper-Large-v3 (transcription), Llama 3.3 70B (insights + chat). OpenAI — text-embedding-3-small (embeddings only).`
- **API Keys table**: add a `Groq` row with `GROQ_API_KEY`, mark OpenAI as embeddings-only
- **Processing Pipeline section**: update step 3 ("Transcribe") and step 6 ("Insights") to mention Groq + Llama 3.3 70B
- **Edge Functions table**: bump `process-podcast` to v15, `chat` to v6
- **Key Decisions**: add a bullet — "Groq for transcription and LLM workloads — open-weight models (Llama, Whisper) on their LPU hardware. Free tier covers personal use. Hedge against OpenAI cost and lock-in; models can be moved to any hoster if needed."

### Step 11 — Commit

Stage and commit:

```powershell
cd C:\Users\nlnic\Documents\Projects\podcast-app
git add supabase/functions/process-podcast/index.ts
git add supabase/functions/chat/
git add CLAUDE.md
git add docs/groq-migration.md
git commit -m "Migrate transcription + LLM to Groq (Whisper-Large-v3 + Llama 3.3 70B). Embeddings stay on OpenAI."
```

Nick pushes manually per project convention.

---

## Rollback

If quality regresses after the swap, the rollback is one-line per call site:

- Whisper: switch model back to `whisper-1` and URL back to `api.openai.com/v1/audio/transcriptions`, auth back to `openaiKey`
- Insights: switch model back to `gpt-4o`, URL back to OpenAI, auth back to `openaiKey`
- Chat: same swap, model back to `gpt-4o-mini`

Old transcripts, chunks, embeddings, and insights in the DB are unaffected — only the *generation* of new ones changes.

Partial rollback is fine: e.g. keep Groq Whisper (huge speed win), revert insights to GPT-4o if Llama quality lags.

---

## What's intentionally *not* in this migration

- **Embeddings** stay on OpenAI. Re-embedding ~all chunks to switch to a different dimensionality is real work and saves ~$5/year. Not worth it now.
- **Queue / worker pattern** is a separate effort (Phase B of the broader scale plan). Groq alone may make a queue unnecessary at current volume; revisit after we feel the new speed.
- **Cost tracking table** is a separate effort. With Groq's free tier covering personal use, this becomes less urgent — defer until volume warrants it.
- **Vector index on chunks.embedding** is a separate quick win, tracked outside this plan.

---

## Reference — Groq free tier limits (as of writing)

These shift periodically. Current published limits at https://console.groq.com/docs/rate-limits.

| Model | RPM | RPD | TPD |
|---|---|---|---|
| `whisper-large-v3` | ~20 | ~2,000 | ~28,800 audio-seconds/day (≈8 hours of audio) |
| `llama-3.3-70b-versatile` | ~30 | ~1,000 | ~100,000 tokens/day |
| `llama-3.1-8b-instant` | ~30 | ~14,400 | ~500,000 tokens/day |

**Per-podcast burn on Llama 3.3 70B**: roughly 14,000 tokens (12K input + 2K output) for insights. That's ~7 podcasts of insights/day on the free tier before throttling.

**Per chat query**: ~3,000–4,000 tokens.

**Paid tier overflow** (if hit): Llama 3.3 70B is $0.59/M input + $0.79/M output, Whisper-Large-v3 is ~$0.04/hour of audio. A 100-podcast backfill costs roughly $5 all-in.

---

## Open questions to revisit after rollout

1. Does Llama 3.3 70B insights quality match GPT-4o on long transcripts? If yes, we've eliminated GPT-4o spend entirely. If no, where's the gap (specificity? entity extraction? summary depth?) and is it worth keeping GPT-4o just for insights?
2. Should the chat function downshift to `llama-3.1-8b-instant` for shorter queries to preserve 70B headroom? Could route by query length.
3. Is the 8-hours-of-audio/day Whisper free-tier ceiling ever going to bite for backfill? If yes, paid tier at $0.04/hour is a non-issue.
