# Weekly Digest Generation

## 1. Overview

Weekly Digest Generation produces periodic, automated summaries of new podcast content across all knowledge bases -- a "What happened in your library this week" briefing. It synthesizes newly processed episodes into a single digest document containing per-KB summaries, cross-KB themes, notable insights, and an auto-generated "question of the week" designed to provoke deeper exploration.

**What it does:** A Supabase Edge Function (`generate-digest`) collects all podcasts that reached `status = 'ready'` since the last digest was generated, pulls their insights (summary, topics, key_points, entities from the `insights` table), and feeds them through Groq Llama 3.3 70B to produce a structured digest. The digest is stored in a new `digests` table and rendered on a dedicated `/digests` page.

**Why passive summaries matter for a second brain:** Active querying (chat, semantic search) requires the user to know what to ask. Digests surface patterns and connections the user might never think to search for. They turn PodBrain from a tool you go to into a tool that comes to you -- a crucial behavior shift for sustained engagement with a growing knowledge base. When Nick adds 5 episodes across 3 KBs in a week, the digest tells him "here is what you learned" without requiring him to revisit each episode individually.

**How it relates to existing features:**
- Builds on **per-podcast insights** (Phase 4) by aggregating them across time periods
- Complements **KB-level synthesis** (Phase 4, not yet built) -- digests are temporal slices, KB synthesis is topical
- Uses the same LLM pipeline as `process-podcast/index.ts` (Groq Llama 3.3 70B, JSON response format)

---

## 2. User Stories

1. **As a busy listener**, I want to receive a weekly summary of all new podcasts I have added and processed, so I can stay on top of my growing library without revisiting each episode.

2. **As a knowledge base curator**, I want each digest to include per-KB breakdowns, so I can see which topic areas received new content and which are stale.

3. **As a pattern seeker**, I want the digest to surface cross-KB themes (e.g., "AI regulation was discussed in both your 'AI Startups' and 'Policy' KBs this week"), so I can discover unexpected connections between topic areas.

4. **As an explorer**, I want each digest to include an auto-generated "question of the week" grounded in the new content, so I have a compelling reason to open the chat and dig deeper.

5. **As a user who sometimes falls behind**, I want to browse an archive of past digests in reverse chronological order, so I can catch up on weeks I missed.

6. **As a power user**, I want a "Generate now" button to trigger a digest on demand, so I do not have to wait for the scheduled run.

7. **As a user who controls their workflow**, I want to configure digest frequency (daily, weekly, biweekly, or off), so the feature adapts to my listening pace rather than spamming me during slow weeks.

8. **As a user reviewing a digest**, I want to click any podcast mentioned in the digest and navigate directly to its detail page, so I can jump from summary to source material in one click.

---

## 3. Design & Functionality

### UI/UX Design

**Digest Page Layout** (`/digests`)

```
+----------------------------------------------------------+
| DIGESTS                               [Generate Now]     |
+----------------------------------------------------------+
| Digest: May 18 - May 24, 2026                           |
| 7 new episodes across 3 knowledge bases                 |
|                                                          |
| +------------------------------------------------------+ |
| | THIS WEEK'S THEMES                                   | |
| | - AI safety frameworks gained traction in both...    | |
| | - Several guests discussed creator economy shifts... | |
| +------------------------------------------------------+ |
|                                                          |
| +------------------------------------------------------+ |
| | KB: AI STARTUPS (3 new episodes)                     | |
| | Summary paragraph...                                 | |
| | Episodes: [Episode 1] [Episode 2] [Episode 3]       | |
| +------------------------------------------------------+ |
|                                                          |
| +------------------------------------------------------+ |
| | KB: MARKETING TACTICS (2 new episodes)               | |
| | Summary paragraph...                                 | |
| +------------------------------------------------------+ |
|                                                          |
| +------------------------------------------------------+ |
| | STANDALONE EPISODES (2 episodes, not in any KB)      | |
| | Summary...                                           | |
| +------------------------------------------------------+ |
|                                                          |
| +------------------------------------------------------+ |
| | QUESTION OF THE WEEK                                 | |
| | "How do the AI safety concerns raised by Guest A    | |
| |  compare to the 'move fast' ethos described by...?" | |
| | [Ask this in Chat ->]                                | |
| +------------------------------------------------------+ |
|                                                          |
| +------------------------------------------------------+ |
| | KEY ENTITIES THIS WEEK                               | |
| | Sam Altman (3 mentions) | Anthropic (2) | ...       | |
| +------------------------------------------------------+ |
+----------------------------------------------------------+
| PREVIOUS DIGESTS                                         |
| > May 11 - May 17 (5 episodes, 2 KBs)                  |
| > May 4 - May 10 (3 episodes, 1 KB)                    |
+----------------------------------------------------------+
```

The page follows the existing design language: serif headings, `var(--surface)` card backgrounds, `var(--border)` borders, `var(--r-lg)` rounded corners, mono metadata labels -- consistent with `Home.jsx` and `KnowledgeBase.jsx`.

**Digest Content Sections**

1. **Header** -- date range, episode count, KB count
2. **Cross-KB Themes** -- 2-4 bullet points identifying patterns that span multiple KBs. Omitted if only one KB has new content.
3. **Per-KB Summaries** -- one card per KB with new episodes. Each includes a 2-3 sentence synthesis of that KB's new content, plus clickable episode links (navigating to `/kb/{kbId}/podcast/{podcastId}`).
4. **Standalone Episodes** -- episodes processed but not assigned to any KB, grouped together.
5. **Question of the Week** -- an auto-generated, thought-provoking question synthesized from the week's content. Includes a button that navigates to a KB's chat with the question pre-filled as a query parameter.
6. **Key Entities** -- aggregated entity mentions across all new episodes (from `insights.entities`), sorted by frequency.

**Digest Frequency Settings**

Accessible via a gear icon on the `/digests` page header. Options:
- **Off** -- no automatic generation
- **Daily** -- generates at midnight UTC if new episodes exist
- **Weekly** (default) -- generates every Sunday at midnight UTC
- **Biweekly** -- every other Sunday
- **Custom interval** -- N days

Settings stored in a `digest_settings` row (see Database Changes).

**"Generate Now" Button**

A manual trigger in the page header. Calls the `generate-digest` edge function directly. Disabled with a tooltip ("No new episodes since last digest") if no new episodes exist since `digests.period_end` of the most recent digest.

**Empty States**

- **No digests yet, no processed podcasts:** "Process some podcasts first, then generate your first digest."
- **No digests yet, has processed podcasts:** "You have N processed episodes. Generate your first digest to see a summary." + prominent "Generate Now" button.
- **No new content since last digest:** "All caught up. No new episodes since your last digest on {date}."

### Behavior

**Trigger Mechanisms**

1. **Scheduled (pg_cron):** A Postgres cron job calls the `generate-digest` edge function at the configured frequency. Before generating, the function checks whether any podcasts have `status = 'ready'` and `updated_at > last_digest.period_end`. If none, it skips silently and logs to `processing_logs`.
2. **Manual:** User clicks "Generate Now" on the `/digests` page. The frontend calls the edge function with `{ manual: true }`. Same generation logic, but ignores schedule.

**KBs With No New Content**

If a KB has no new episodes in the digest period, it is omitted entirely from the digest. The digest only covers KBs (and standalone episodes) that have fresh content. If zero KBs have new content, the function skips generation and returns `{ skipped: true, reason: "no_new_content" }`.

**Content Assembly Strategy**

The edge function gathers material in two stages:

1. **Data collection:** Query all podcasts where `status = 'ready'` and `updated_at` falls within the digest period. For each, fetch the corresponding row from `insights` (summary, topics, key_points, entities). Group podcasts by KB via the `knowledge_base_podcasts` junction table.

2. **LLM synthesis:** Send the collected insights to Groq Llama 3.3 70B with a structured prompt (see LLM Prompting Strategy). The prompt includes all per-podcast summaries, topics, and key points, organized by KB. The LLM returns a JSON object with the digest sections.

This two-stage approach avoids sending raw transcripts to the LLM. Since insights already exist per-podcast (generated during processing), the digest prompt operates on pre-distilled material -- keeping token usage manageable even for weeks with many new episodes.

**Historical Digest Archive**

All digests are persisted in the `digests` table. The `/digests` page shows the most recent digest in full, with a scrollable list of previous digests below (showing date range + episode count). Clicking a previous digest expands it in place or navigates to `/digests/{digestId}`.

---

## 4. Architecture & Technical Specs

### Database Changes

**New table: `digests`**

```sql
create table digests (
  id uuid primary key default gen_random_uuid(),
  period_start timestamptz not null,
  period_end timestamptz not null,
  episode_count int not null default 0,
  kb_count int not null default 0,
  content jsonb not null default '{}'::jsonb,
  -- content structure:
  -- {
  --   "cross_kb_themes": ["theme1", "theme2"],
  --   "kb_summaries": [
  --     { "kb_id": "uuid", "kb_name": "AI Startups", "summary": "...",
  --       "episode_ids": ["uuid1", "uuid2"], "episode_titles": ["ep1", "ep2"] }
  --   ],
  --   "standalone_summary": "...",
  --   "standalone_episode_ids": ["uuid"],
  --   "question_of_the_week": "...",
  --   "question_target_kb_id": "uuid",
  --   "top_entities": [{ "name": "Sam Altman", "type": "person", "count": 3 }]
  -- }
  trigger_type text not null default 'manual'
    check (trigger_type in ('scheduled', 'manual')),
  created_at timestamptz default now()
);

create index idx_digests_period on digests(period_end desc);
```

**New table: `digest_settings`**

```sql
create table digest_settings (
  id uuid primary key default gen_random_uuid(),
  frequency text not null default 'weekly'
    check (frequency in ('off', 'daily', 'weekly', 'biweekly', 'custom')),
  custom_interval_days int,  -- only used when frequency = 'custom'
  last_generated_at timestamptz,
  updated_at timestamptz default now()
);

-- Insert default settings row
insert into digest_settings (frequency) values ('weekly');
```

No changes to existing tables. The function queries `podcasts`, `insights`, `knowledge_base_podcasts`, and `knowledge_bases` read-only.

### Edge Function: `generate-digest`

**Input contract:**

```typescript
// POST /functions/v1/generate-digest
interface DigestRequest {
  manual?: boolean  // true if triggered by user click (ignores schedule check)
}
```

**Output contract:**

```typescript
interface DigestResponse {
  success: boolean
  digest_id?: string       // uuid of the generated digest
  skipped?: boolean        // true if no new content
  reason?: string          // "no_new_content" if skipped
  episode_count?: number
}
```

**Implementation outline:**

```typescript
// supabase/functions/generate-digest/index.ts
Deno.serve(async (req: Request) => {
  // 1. Read digest_settings to get frequency + last_generated_at
  // 2. Determine period: last_generated_at (or 7 days ago if first run) to now
  // 3. Query podcasts with status='ready' AND updated_at within period
  // 4. If zero results, return { skipped: true, reason: "no_new_content" }
  // 5. Fetch insights for each podcast
  // 6. Group by KB via knowledge_base_podcasts
  // 7. Build LLM prompt with all insights, organized by KB
  // 8. Call Groq Llama 3.3 70B with JSON response format
  // 9. Parse response, aggregate entity counts
  // 10. Insert into digests table
  // 11. Update digest_settings.last_generated_at
  // 12. Return { success: true, digest_id, episode_count }
})
```

**Error handling:** Follows the same pattern as `process-podcast/index.ts` -- error codes, structured error responses, try/catch with best-effort status updates.

### Scheduling (pg_cron)

Supabase supports `pg_cron` via the dashboard. The cron job calls the edge function via `pg_net`:

```sql
-- Weekly digest: every Sunday at midnight UTC
select cron.schedule(
  'weekly-digest',
  '0 0 * * 0',  -- Sunday midnight UTC
  $$
  select net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/generate-digest',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{"manual": false}'::jsonb
  );
  $$
);
```

When the user changes frequency in settings, the frontend calls a small helper edge function (or direct Supabase RPC) that drops and recreates the cron job with the new schedule expression. For "off", the cron job is unscheduled.

**Alternative:** If pg_cron proves complex to manage dynamically, fall back to a simpler approach: a single hourly cron job that checks `digest_settings.frequency` and `last_generated_at` at runtime, only generating if enough time has elapsed. This avoids dynamic cron management entirely.

### LLM Prompting Strategy

The digest prompt must synthesize across many podcasts without exceeding token limits. Strategy:

1. **Input:** Per-podcast insights (summary + topics + key_points), grouped by KB. Each podcast's summary is typically 100-200 words, key_points are 5-15 bullets. For a week with 10 new episodes, total input is roughly 3,000-5,000 tokens.

2. **Prompt structure:**

```
System: You synthesize podcast insights into weekly digest reports. Return valid JSON.

User:
Generate a weekly digest for the period {start} to {end}.

## Knowledge Base: "AI Startups" (3 new episodes)

### Episode: "The Future of AGI" by Lex Fridman
Summary: {insights.summary}
Topics: {insights.topics.join(', ')}
Key Points:
- {insights.key_points[0]}
- {insights.key_points[1]}
...

### Episode: "Scaling Laws" by Dwarkesh Patel
...

## Knowledge Base: "Health & Longevity" (2 new episodes)
...

## Standalone Episodes (not in any KB)
...

---

Return a JSON object with:
- "cross_kb_themes": array of 2-4 themes that span multiple KBs (omit if only 1 KB)
- "kb_summaries": array of objects with "kb_id", "kb_name", "summary" (2-3 sentences synthesizing that KB's new content)
- "standalone_summary": string summarizing standalone episodes (null if none)
- "question_of_the_week": a thought-provoking question grounded in this week's content that would benefit from cross-episode RAG exploration
- "question_target_kb_id": the kb_id most relevant to the question (for chat pre-fill)
```

3. **Token budget:** Input is pre-distilled insights, not raw transcripts. Even 20 episodes would produce ~8,000 input tokens. Groq Llama 3.3 70B has a 128K context window. `max_tokens` for the response: 2048 (matching the chat function's `CHAT_MAX_TOKENS`).

4. **Entity aggregation** is done in code, not by the LLM. The function counts entity mentions across all new episodes' `insights.entities` arrays and sorts by frequency. This is deterministic and cheaper than asking the LLM.

### Email Delivery (Stretch Goal)

Not in MVP. When implemented:

- **Service:** Resend (free tier: 100 emails/day, sufficient for personal use)
- **Trigger:** After digest is generated and saved, if email delivery is enabled in `digest_settings`, render the digest content as a simple HTML email and send via Resend API
- **Settings:** Add `email_enabled boolean default false` and `email_address text` to `digest_settings`
- **Template:** Minimal HTML email mirroring the in-app digest layout. Include deep links back to the app for each episode and the "Ask this in Chat" button

---

## 5. Implementation Phases

### Phase 1: Core Digest Generation

- [ ] Create `digests` and `digest_settings` tables (migration `00X_digests.sql`)
- [ ] Build `generate-digest` edge function (data collection + LLM synthesis + storage)
- [ ] Create `src/services/digests.js` service layer (list digests, get digest, trigger generation, get/update settings)
- [ ] Build `DigestsPage` (`src/pages/DigestsPage.jsx`) with digest rendering and "Generate Now" button
- [ ] Build `DigestCard` component for rendering a single digest's content sections
- [ ] Add `/digests` route to `App.jsx`
- [ ] Add "Digests" link to `Layout.jsx` navigation
- [ ] Handle empty states (no digests, no processed podcasts, no new content)

**Estimated effort:** 3-4 days

### Phase 2: Scheduling + Settings

- [ ] Set up pg_cron job for weekly digest generation via `pg_net`
- [ ] Build `DigestSettings` component (frequency selector, rendered inline on DigestsPage)
- [ ] Implement frequency change logic (update `digest_settings`, reschedule cron)
- [ ] Add "no new content" skip logic with logging
- [ ] Test scheduled generation end-to-end

**Estimated effort:** 1-2 days

### Phase 3: Polish + Archive Navigation

- [ ] Build digest archive list below the current digest (reverse chronological, clickable)
- [ ] Add `/digests/:digestId` route for deep-linking to a specific digest
- [ ] Add "Ask this in Chat" button on the question of the week (navigates to KB chat with query pre-filled via `?q=` param)
- [ ] Add episode click-through from digest to podcast detail page
- [ ] Add digest count badge to the nav link (unread digests since last visit, stored in localStorage)

**Estimated effort:** 1-2 days

### Phase 4: Email Delivery (Stretch)

- [ ] Integrate Resend SDK in a new edge function or extend `generate-digest`
- [ ] Build HTML email template from digest content
- [ ] Add email toggle + address field to `DigestSettings`
- [ ] Send email after successful digest generation

**Estimated effort:** 1 day

---

## 6. Dependencies & Risks

**Dependencies:**

- **Per-podcast insights (Phase 4, complete):** Digests synthesize from `insights` table rows. Every podcast included in a digest must have been fully processed with insights generated. The function filters for `status = 'ready'` to ensure this.
- **Groq API key:** Already configured as a Supabase secret (`GROQ_API_KEY`), used by `process-podcast` and `chat` edge functions. The digest function reuses the same key and model (`llama-3.3-70b-versatile`).
- **pg_cron + pg_net extensions:** Supabase Pro plan includes both. Must be enabled via the Supabase dashboard (Extensions page). If not available, fall back to an external cron service (e.g., cron-job.org hitting the edge function URL).

**Risks:**

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| pg_cron not available on current Supabase plan | Low | Medium | Verify before building Phase 2. Fallback: external cron service or manual-only generation. |
| LLM produces poor cross-KB themes for unrelated KBs | Medium | Low | Prompt instructs the LLM to omit cross-KB themes if KBs have no topical overlap. The section is optional. |
| Token limit exceeded for prolific weeks (20+ episodes) | Low | Medium | Input is pre-distilled insights, not transcripts. 20 episodes = ~8K tokens, well within Llama 3.3's 128K context. For extreme cases, truncate to the 30 most recent episodes. |
| Digest generation fails mid-way (LLM timeout) | Low | Medium | Follow `process-podcast` error handling pattern: catch, log error, return structured error response. Digest is not created if LLM fails. User can retry via "Generate Now". |
| Low engagement -- user forgets digests exist | Medium | Low | Nav badge for unread digests. Future: email delivery (Phase 4). |

---

## 7. Estimated Effort

| Phase | Work | Effort |
|-------|------|--------|
| Phase 1 -- Core generation | Edge function, DB tables, DigestsPage, DigestCard, routing | 3-4 days |
| Phase 2 -- Scheduling | pg_cron setup, DigestSettings, frequency management | 1-2 days |
| Phase 3 -- Polish | Archive navigation, deep links, chat pre-fill, nav badge | 1-2 days |
| Phase 4 -- Email (stretch) | Resend integration, HTML template, settings | 1 day |
| **Total** | | **6-9 days** |

Phases 1-3 are the core feature. Phase 4 is a stretch goal that can be deferred indefinitely -- in-app digests provide full value on their own.

Migration files needed: 1 (`digests` + `digest_settings` tables).

Edge functions to deploy: 1 new (`generate-digest`).

Existing files modified: `App.jsx` (add route), `Layout.jsx` (add nav link).
