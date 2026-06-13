# Security Cutover Runbook

How to take the app from "anon-open, no RLS" to "auth-scoped, RLS-enforced" without
locking the owner out or breaking processing/cron/dedup. Read this before running 014.

Project: `podcast-brain` (Supabase id `vxxmlieonejwyojenrsh`). Owner: `nl.nicklasky@gmail.com`.

## Why the order matters

There are (were) **0 user accounts**, and the deployed frontend ran fully anonymous
(the old `AuthGate` rendered through with no session). So:

- You cannot enable RLS first: with `auth.uid() = user_id` policies and an anon app,
  every query returns 0 rows and the app bricks.
- You cannot backfill ownership first: there is no `user_id` to backfill to until the
  owner signs up.

Therefore: harden what is safe-while-anon -> owner signs up -> deploy the JWT-aware
frontend -> only THEN enable RLS + revoke anon grants.

## Status

- [x] **Phase 1 - `013_security_phase1_hardening.sql` APPLIED to prod.**
  Added `user_id` columns + `feed_subscriptions`; fixed/created the `delete_*` RPCs;
  created `delete_all_user_data`; pinned function `search_path`; revoked anon EXECUTE
  on the delete RPCs; dropped the 4 anon storage policies. The anon app kept working.
- [x] **Frontend + edge functions hardened in the branch** (not yet deployed).
- [ ] **Phase 2** - owner signup (YOU).
- [ ] **Phase 3** - deploy JWT-aware frontend (YOU push) + edge functions (I deploy).
- [ ] **Phase 4** - `014_security_phase2_lockdown.sql` (backfill + RLS + revoke anon).

## Phase 2 - Owner signs up (YOU)

1. After the new frontend is deployed (Phase 3) OR on a local `npm run dev`, go to
   `/auth` and sign up / log in as `nl.nicklasky@gmail.com`. This mints the first
   `auth.users` row that everything gets backfilled to.
2. Confirm the account exists:
   ```sql
   select id, email from auth.users where email = 'nl.nicklasky@gmail.com';
   ```

## Phase 3 - Deploy the JWT-aware frontend + edge functions

The new frontend requires login, stamps `user_id` on inserts, and forwards the
session JWT to edge functions. The hardened edge functions reject anonymous callers,
so they must deploy together with (or just before) the frontend - NOT against the old
anon app.

1. **YOU push** the branch so Vercel auto-deploys the new frontend.
2. **Edge functions** (deploy via Supabase MCP or `supabase functions deploy`):
   `chat`, `semantic-search`, `synthesize-kb`, `process-podcast`, `poll-subscriptions`.
   - Set `verify_jwt` per `supabase/config.toml`: true for chat/semantic-search/
     synthesize-kb (+ catalog lookups); false for process-podcast (dual service/user
     path) and poll-subscriptions (cron secret).
   - **Before overwriting each function, diff the deployed version against the local
     source** (the repo drifted from prod once already) so no deployed fix is lost.
   - Set the `CRON_SECRET` secret if you want `poll-subscriptions` re-enabled, and
     point the scheduler at it with an `X-Cron-Secret` header.
3. Smoke test as the logged-in owner: create KB, add a podcast (standalone AND into a
   KB), process, chat, semantic search, synthesize, playback resume, subscribe.

## Phase 4 - Lock down (`014`) - point of no return for anon

Run ONLY after Phase 2 + Phase 3 are done and the new frontend is live.

1. Apply `supabase/migrations/014_security_phase2_lockdown.sql`. It:
   - **Section B** backfills all pre-auth rows to the owner (self-resolves by email;
     aborts loudly if the owner has not signed up).
   - **Section D** enables RLS on every content table with the ownership policies.
   - **Section E** `REVOKE ALL ... FROM anon` (the line that actually closes anon),
     re-grants `authenticated` the gated verbs, keeps `service_role` full access, and
     revokes anon EXECUTE on `match_chunks`/`match_chunks_global`.
2. Re-smoke-test as the owner (everything should still work - you own all rows).
3. Confirm anon is closed: with the bare anon key, `select * from knowledge_bases`
   returns 0 rows / permission denied.
4. Run the security advisors and confirm the `rls_disabled_in_public` and
   `rls_enabled_no_policy` findings have cleared:
   ```
   (Supabase MCP) get_advisors type=security
   ```

## Emergency rollback (if Phase 4 breaks prod)

Run in one go to return to the pre-cutover anon-open state in minutes:

```sql
-- Re-disable RLS on every content table
ALTER TABLE knowledge_bases DISABLE ROW LEVEL SECURITY;
ALTER TABLE conversations DISABLE ROW LEVEL SECURITY;
ALTER TABLE search_history DISABLE ROW LEVEL SECURITY;
ALTER TABLE feed_subscriptions DISABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_base_podcasts DISABLE ROW LEVEL SECURITY;
ALTER TABLE messages DISABLE ROW LEVEL SECURITY;
ALTER TABLE kb_syntheses DISABLE ROW LEVEL SECURITY;
ALTER TABLE podcasts DISABLE ROW LEVEL SECURITY;
ALTER TABLE transcripts DISABLE ROW LEVEL SECURITY;
ALTER TABLE chunks DISABLE ROW LEVEL SECURITY;
ALTER TABLE insights DISABLE ROW LEVEL SECURITY;
ALTER TABLE processing_logs DISABLE ROW LEVEL SECURITY;
-- DO NOT disable playback_progress RLS - it was already on and working pre-cutover.

-- Re-open grants (emergency only)
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
```
Then roll the Vercel deploy back to the pre-cutover build and reset the edge functions
to `verify_jwt = false`. (Take a DB backup / note the PITR timestamp before Phase 4.)

## Post-cutover follow-ups (not blockers)

- **`semantic-search` scope `'all'`** does an unfiltered global vector search - fine for
  a single tenant, but it leaks chunks across users. Scope it by owned KBs before
  onboarding a second user. (Already flagged in-code.)
- **`src/services/podcastIndex.js`** still authenticates the catalog lookups
  (podcast-search/-episodes/-discover/resolve-feeds) with the public anon key rather
  than the session JWT. Read-only catalog data, no owned-data leak, but route it
  through `callEdgeFunction` for consistency when convenient.
- **`feed_subscriptions` has no target KB** - `poll-subscriptions` can detect new
  episodes but cannot auto-link them to a KB yet. Add a `knowledge_base_id` (or a
  default "Subscriptions" KB) before relying on auto-ingest.
