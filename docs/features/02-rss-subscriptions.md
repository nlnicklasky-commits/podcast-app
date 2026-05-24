# Feature Plan: RSS Feed Subscriptions

## 1. Overview

PodBrain currently operates as a manual curation tool -- you search for a podcast, pick an episode, and add it. Every piece of knowledge in the system is there because someone explicitly put it there. RSS Feed Subscriptions change this from manual curation to **passive knowledge accumulation**.

When you subscribe to a podcast show's RSS feed, PodBrain periodically checks for new episodes and (optionally) auto-processes them through the full pipeline: download, transcribe, chunk, embed, extract insights. New episodes flow into the target knowledge base automatically. The knowledge base grows on its own.

**Why it matters:** The most valuable podcasts release weekly or daily. Missing episodes means gaps in the knowledge graph. Subscriptions eliminate that gap -- the system captures everything, even when you are not actively using the app. It transforms PodBrain from a tool you use into a system that works for you.

---

## 2. User Stories

1. **As a user, I want to subscribe to a podcast show from the search results** so that new episodes are automatically tracked without me remembering to check.

2. **As a user, I want to assign a subscription to a knowledge base** so that new episodes land in the right topic collection automatically (e.g., every new episode of "Lex Fridman Podcast" goes to my "AI Research" KB).

3. **As a user, I want to toggle auto-processing per subscription** so that some feeds just collect episodes (reviewed manually) while others run the full pipeline automatically.

4. **As a user, I want to see a list of all my subscriptions with status indicators** (last checked, episodes pending review, feed health) so I know the system is working.

5. **As a user, I want to see a "new episodes" badge in the sidebar** so I know when unreviewed episodes have arrived without navigating to each KB.

6. **As a user, I want to unsubscribe from a feed** and choose whether to keep or remove the episodes already added.

7. **As a user, I want to pause a subscription temporarily** (e.g., during a vacation or budget-conscious period) without losing my settings.

8. **As a user, I want the system to handle feed errors gracefully** -- if a feed URL changes or goes dead, I should be notified rather than silently losing updates.

---

## 3. Design & Functionality

### UI/UX Design

#### Subscribe Button on Show Search Results

In the existing `AddPodcastModal` show search results (the list rendered by `shows.map()` in `AddPodcastModal.jsx`), each show card gains a **"Subscribe"** button alongside the existing click-to-browse-episodes behavior.

- Clicking "Subscribe" opens a lightweight popover/drawer:
  - **Target Knowledge Base** -- dropdown of existing KBs (required)
  - **Auto-process** -- toggle, default ON
  - **Confirm** button
- The show card then displays a small "Subscribed" badge so the user does not subscribe twice.

#### Subscriptions List Page

New route: `/subscriptions` (added to `App.jsx`).

Accessible from a new **"Subscriptions"** nav item in the sidebar (`Layout.jsx`), placed below "Library" and above the "Knowledge Bases" section.

The page displays a card list with each subscription showing:

| Field | Source |
|-------|--------|
| Show artwork + title | Stored from Podcast Index at subscribe time |
| Target KB name | FK to `knowledge_bases` |
| Auto-process status | Toggle directly in the card |
| Last polled | `last_polled_at` timestamp, displayed as relative time ("3h ago") |
| Last new episode | `last_episode_date`, displayed as date ("May 18, 2026") |
| Episodes pending | Count of episodes added but not yet processed (status != `ready`) |
| Feed health | `status` field: `active`, `paused`, `error` -- color-coded dot indicator |

Each card has a kebab menu with: **Pause**, **Edit settings**, **Unsubscribe**.

#### Per-Subscription Settings (Edit Drawer)

Opened from the subscription card kebab menu or during initial subscribe:

- **Target Knowledge Base** -- can be reassigned (new episodes go to the new KB; existing episodes stay where they are)
- **Auto-process** -- on/off toggle
- **Max episodes per poll** -- numeric input, default 5 (prevents cost spikes if a feed dumps 100 backlog items)
- **Episode age filter** -- only add episodes newer than N days (prevents backfilling entire archives on subscribe). Default: 30 days.

#### "New Episodes" Badge in Sidebar

The sidebar KB list (in `Layout.jsx`) already shows an episode count per KB. When a subscription adds episodes that have not been viewed (i.e., the user has not navigated to that KB since the episode was added):

- A small numeric badge appears next to the KB name (e.g., "AI Research **3**")
- The badge uses the accent color and clears when the user visits the KB page
- Tracked via a `last_viewed_at` field on the subscription or a lightweight `subscription_events` approach

#### Unsubscribe Flow

Clicking "Unsubscribe" from the kebab menu opens a confirmation dialog:

- **Option A: Keep episodes** -- removes the subscription row, keeps all podcast rows and junction links
- **Option B: Remove episodes** -- removes the subscription row AND removes all podcast rows that were added by this subscription (tracked via `added_by_subscription_id` on `knowledge_base_podcasts`)

---

### Behavior

#### Polling Frequency

- **Default interval:** Every 6 hours (4 times/day)
- **Not user-configurable in Phase 1.** Configurable per-subscription in Phase 2 with options: 1h, 3h, 6h, 12h, 24h.
- Feeds are polled in batches, staggered by `last_polled_at` ascending (oldest-checked first) to spread load.

#### New Episode Detection

When the `poll-subscriptions` function runs for a given subscription:

1. Call Podcast Index `/episodes/byfeedid` with the feed's `podcast_index_id`, using the `since` parameter set to `last_episode_date` (Unix timestamp) to fetch only newer episodes.
2. For each returned episode, check `episode_index_id` against the `podcasts` table (existing dedup logic in `addPodcastFromIndex`).
3. If the episode is new AND passes the age filter (`datePublished` > now - `max_episode_age_days`):
   - Insert a row into `podcasts` with `source: 'podcast_index'`, `status: 'pending'`.
   - Insert a row into `knowledge_base_podcasts` linking to the subscription's target KB, with `added_by_subscription_id` set.
   - If `auto_process` is ON and the count of newly added episodes this poll is within `max_episodes_per_poll`: invoke `process-podcast` for this episode.
4. Update `last_polled_at` to now, `last_episode_date` to the most recent episode's publish date.

#### Auto-Process vs. Manual Review

- **Auto-process ON:** New episodes are immediately sent to the `process-podcast` edge function. The user sees them appear in their KB with processing progress.
- **Auto-process OFF:** New episodes are added to the KB with `status: 'pending'`. They appear in the KB's podcast list with a "Process" button, same as manually-added episodes today. A "pending review" count increments the sidebar badge.

#### Episode Deduplication

Fully handled by the existing `episode_index_id` unique check in `addPodcastFromIndex` (`src/services/podcasts.js`, line 225). The polling function uses the same code path. No new dedup logic needed.

#### Feed Error Handling

- If a poll fails (HTTP error, timeout, malformed response), increment `consecutive_errors` on the subscription row.
- After 3 consecutive errors: set subscription `status` to `error`, stop polling it.
- After 10 consecutive errors: set `status` to `dead`.
- On any successful poll: reset `consecutive_errors` to 0.
- Error status is surfaced on the subscription card with the specific error message (`last_error_message`).
- The user can manually retry or re-activate a failed subscription from the UI.

---

## 4. Architecture & Technical Specs

### Database Changes

#### New Table: `subscriptions`

```sql
create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  
  -- Feed identity (from Podcast Index)
  podcast_index_feed_id bigint not null,
  feed_url text not null,
  show_title text not null,
  show_author text,
  show_artwork text,
  
  -- Target
  knowledge_base_id uuid not null references knowledge_bases(id) on delete cascade,
  
  -- Settings
  auto_process boolean not null default true,
  max_episodes_per_poll int not null default 5,
  max_episode_age_days int not null default 30,
  poll_interval_hours int not null default 6,
  
  -- State
  status text not null default 'active'
    check (status in ('active', 'paused', 'error', 'dead')),
  last_polled_at timestamptz,
  last_episode_date timestamptz,
  consecutive_errors int not null default 0,
  last_error_message text,
  episodes_added int not null default 0,
  
  -- Timestamps
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  
  -- Prevent duplicate subscriptions to the same feed
  unique(podcast_index_feed_id)
);

-- Indexes
create index idx_subscriptions_status on subscriptions(status);
create index idx_subscriptions_kb on subscriptions(knowledge_base_id);
create index idx_subscriptions_next_poll 
  on subscriptions(last_polled_at) 
  where status = 'active';

-- Updated_at trigger (reuse existing function)
create trigger subscriptions_updated_at
  before update on subscriptions
  for each row execute function update_updated_at();
```

#### Modification to `knowledge_base_podcasts`

Add a nullable FK to track which subscription added an episode (for cleanup on unsubscribe):

```sql
alter table knowledge_base_podcasts 
  add column added_by_subscription_id uuid 
  references subscriptions(id) on delete set null;
```

### Edge Functions

#### New: `poll-subscriptions`

A new edge function invoked by pg_cron. Responsibilities:

1. Query all subscriptions with `status = 'active'` and `last_polled_at` older than `poll_interval_hours` (or null).
2. For each subscription (batched, max 10 per invocation to stay within Supabase Edge Function time limits):
   - Call Podcast Index `/episodes/byfeedid` with `since` = `last_episode_date` Unix timestamp.
   - Filter episodes by `max_episode_age_days`.
   - Deduplicate against existing `podcasts.episode_index_id`.
   - Insert new podcasts and junction rows.
   - If `auto_process` is true, invoke `process-podcast` for each new episode (via `net.http_post` or direct edge function call), up to `max_episodes_per_poll`.
   - Update subscription state (`last_polled_at`, `last_episode_date`, `episodes_added`, `consecutive_errors`).
3. On error for a specific subscription: increment `consecutive_errors`, set `last_error_message`, continue to next subscription.

**Input:** None (scheduled invocation) or `{ subscription_id }` for manual single-feed poll.

**Runtime budget:** The function processes subscriptions sequentially within a single invocation. With 10 feeds per run and ~2s per Podcast Index API call, total runtime is ~20-30s -- well within the Supabase Edge Function 150s default limit.

#### Existing: `podcast-episodes` (no changes)

The `podcast-episodes` function (`supabase/functions/podcast-episodes/index.ts`) already fetches episodes by feed ID with RSS transcript parsing. The `poll-subscriptions` function reuses the same Podcast Index API call pattern (the `podcastIndexFetch` helper) but does not call `podcast-episodes` directly -- it uses its own simpler fetch since it does not need RSS transcript parsing during polling (transcripts are resolved at processing time).

#### Existing: `process-podcast` (no changes)

The `process-podcast` function is invoked as-is for auto-processed episodes. The subscription system calls it with `{ podcast_id }` the same way the frontend does today.

### Scheduling Mechanism

#### pg_cron + pg_net (Supabase-native)

Use Supabase's built-in `pg_cron` extension (available on all paid plans) combined with `pg_net` for HTTP calls. This avoids any external scheduler dependency.

```sql
-- Enable extensions (pg_cron is already enabled on Supabase by default)
create extension if not exists pg_net with schema extensions;

-- Schedule the poll-subscriptions edge function every 15 minutes
-- The function itself checks per-subscription intervals internally
select cron.schedule(
  'poll-podcast-subscriptions',
  '*/15 * * * *',  -- every 15 minutes
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') 
           || '/functions/v1/poll-subscriptions',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'
      )
    ),
    body := '{}'::jsonb
  );
  $$
);
```

**Why every 15 minutes if the default interval is 6 hours?** The cron job runs frequently but is lightweight -- it exits immediately if no subscriptions are due. This provides flexibility: a subscription with a 1-hour interval gets checked within 15 minutes of being due, not forced to wait for the next 6-hour cycle.

#### Polling Stagger Logic

Inside `poll-subscriptions`, the query to find due subscriptions:

```sql
select * from subscriptions
where status = 'active'
  and (
    last_polled_at is null 
    or last_polled_at < now() - (poll_interval_hours || ' hours')::interval
  )
order by last_polled_at asc nulls first
limit 10;
```

This ensures oldest-checked feeds are polled first, and the `limit 10` prevents overloading a single invocation.

#### Error Handling and Retry

- Network failures on Podcast Index API: caught per-subscription, logged to `last_error_message`, `consecutive_errors` incremented.
- Edge function crash: pg_cron fires again in 15 minutes. No state corruption because each subscription's state is updated atomically.
- Rate limit from Podcast Index: the API is generous (no published rate limit for authenticated users per [API docs](https://podcastindex-org.github.io/docs-api/)), but the stagger logic (max 10 feeds per invocation, 15-minute cadence) keeps request volume low.

### Frontend Components

#### New Components

| Component | File | Purpose |
|-----------|------|---------|
| `SubscriptionsPage` | `src/pages/Subscriptions.jsx` | Route-level page listing all subscriptions |
| `SubscriptionCard` | `src/components/SubscriptionCard.jsx` | Individual subscription display with status, actions, inline auto-process toggle |
| `SubscribeDrawer` | `src/components/SubscribeDrawer.jsx` | Drawer/popover for configuring a new subscription (target KB, auto-process, age filter) |
| `UnsubscribeDialog` | `src/components/UnsubscribeDialog.jsx` | Confirmation dialog with keep/remove episodes options |

#### New Service

| File | Purpose |
|------|---------|
| `src/services/subscriptions.js` | CRUD operations against `subscriptions` table, manual poll trigger |

#### Modifications to Existing Components

| Component | Change |
|-----------|--------|
| `Layout.jsx` | Add "Subscriptions" nav item below "Library". Add new-episode badge logic to KB list items. |
| `AddPodcastModal.jsx` | Add "Subscribe" button on each show card in search results (next to the existing click-to-browse behavior). |
| `App.jsx` | Add route: `<Route path="/subscriptions" element={<Subscriptions />} />` |

#### Route Additions

```
/subscriptions           — Subscriptions list page
```

### Notification System

#### Phase 1: In-App Badge Only

- Numeric badge on KB sidebar items showing count of unreviewed episodes (added by subscription since user's last visit to that KB).
- Tracked by comparing `knowledge_base_podcasts.created_at` against a `last_viewed_at` timestamp stored in `localStorage` per KB ID.
- No backend notification infrastructure needed.

#### Phase 3 (Future): Email Digest

- Daily or weekly email summarizing new episodes across all subscriptions.
- Requires Supabase Auth (user email) and an email provider (Resend or Supabase's built-in email).
- Out of scope for initial implementation.

---

## 5. Implementation Phases

### Phase 1: Subscribe/Unsubscribe + Manual Poll (~3-4 days)

- [ ] Database migration: create `subscriptions` table, add `added_by_subscription_id` to `knowledge_base_podcasts`
- [ ] `src/services/subscriptions.js` -- CRUD operations (create, list, update, delete subscription)
- [ ] `SubscribeDrawer` component -- subscribe flow from show search results
- [ ] `SubscriptionsPage` + `SubscriptionCard` -- list and manage subscriptions
- [ ] `UnsubscribeDialog` component with keep/remove episodes options
- [ ] Sidebar nav item for Subscriptions in `Layout.jsx`
- [ ] "Subscribe" button on show cards in `AddPodcastModal.jsx`
- [ ] Manual "Check Now" button per subscription that calls `podcast-episodes` and runs the new-episode detection logic client-side
- [ ] Route addition in `App.jsx`

### Phase 2: Automated Polling + Auto-Process (~2-3 days)

- [ ] `poll-subscriptions` edge function -- server-side polling logic
- [ ] pg_cron + pg_net scheduling SQL (migration file)
- [ ] Store Supabase project URL and service role key in Vault secrets
- [ ] Auto-process integration: `poll-subscriptions` invokes `process-podcast` for new episodes when `auto_process = true`
- [ ] Subscription state management: `last_polled_at`, `last_episode_date`, `consecutive_errors` updates
- [ ] Feed error handling: auto-pause after 3 consecutive failures

### Phase 3: Notifications + Feed Health (~1-2 days)

- [ ] New-episode badge on KB sidebar items in `Layout.jsx`
- [ ] `last_viewed_at` tracking in localStorage
- [ ] Feed health indicators on subscription cards (active/error/dead color dots)
- [ ] Manual retry for errored subscriptions
- [ ] Pause/resume subscription toggle

**Total estimated effort: 6-9 days**

---

## 6. Dependencies & Risks

### Dependencies

| Dependency | Risk Level | Mitigation |
|------------|-----------|------------|
| **pg_cron extension** | Low | Available on all Supabase paid plans. Already documented and stable (v1.6.4). The free tier also supports it. |
| **pg_net extension** | Low | Required for HTTP calls from pg_cron. Included in Supabase by default. |
| **Podcast Index API availability** | Low | Free API with no published rate limits for authenticated users. The stagger logic keeps request volume well under any reasonable threshold (max ~40 API calls/hour even with 10 subscriptions). |
| **Supabase Vault** | Low | Needed to store `service_role_key` for pg_cron -> Edge Function auth. Standard Supabase feature. |

### Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|-----------|------------|
| **OpenAI cost from auto-processing** | High | Medium | `max_episodes_per_poll` cap (default 5) prevents runaway costs. Episode age filter prevents backfill spikes. Pause capability lets user throttle spend. At current Whisper pricing (~$0.006/min), a 1-hour episode costs ~$0.36 for transcription + ~$0.01 for embeddings + ~$0.03 for GPT-4o insights = ~$0.40/episode. 10 subscriptions x 1 episode/week = ~$4/week. |
| **Edge function timeout** | Medium | Low | `poll-subscriptions` processes max 10 feeds per invocation (~20-30s). Well under the 150s Supabase limit. If a single Podcast Index API call hangs, the 30s timeout (matching existing `TIMEOUT_PODCAST_INDEX`) prevents the whole run from stalling. |
| **Feed URL changes** | Low | Low | Podcast Index maintains feed mappings. If a feed moves, the `podcast_index_feed_id` remains stable -- only the resolved URL changes. The `consecutive_errors` mechanism catches dead feeds. |
| **Concurrent processing overload** | Medium | Low | If 5 subscriptions each auto-process 5 episodes simultaneously, that is 25 concurrent `process-podcast` invocations. Supabase Edge Functions have concurrency limits. Mitigation: `poll-subscriptions` processes feeds sequentially and spaces out `process-podcast` calls, or queues them with a short delay. |
| **pg_cron max concurrent jobs (32)** | Low | Low | The design uses a single cron job that internally handles all subscriptions. Only 1 of the 32 slots is consumed. |

---

## 7. Estimated Effort

| Phase | Scope | Effort |
|-------|-------|--------|
| Phase 1 | Subscribe/unsubscribe UI, manual poll, CRUD, routing | 3-4 days |
| Phase 2 | `poll-subscriptions` edge function, pg_cron setup, auto-process integration | 2-3 days |
| Phase 3 | Sidebar badges, feed health UI, pause/resume | 1-2 days |
| **Total** | | **6-9 days** |

Effort assumes a single developer working full-time. Phase 1 is the largest chunk because it includes the new page, multiple components, and the service layer. Phase 2 is backend-heavy but builds on established patterns (the existing edge function architecture and Podcast Index API integration). Phase 3 is polish.

The feature builds entirely on existing infrastructure: Supabase Postgres, Edge Functions, Podcast Index API, and the `process-podcast` pipeline. No new external services or API keys are needed.
