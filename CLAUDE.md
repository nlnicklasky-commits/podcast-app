# Podcast Knowledge Base — Personal Second Brain

> **Bootstrapped by the setup agent** in `C:\Users\nlnic\Documents\Pre-project Builders`. Settings and this CLAUDE.md were copied and customized from the starter kit.

## Agent Rules

- **Always load skills**: At the start of every session, read the `clawdmd` and `hooksmith` skills. These inform how to maintain this file and how to use hooks for deterministic enforcement.
- **Git workflow**: Claude commits changes but does NOT push. Nick pushes manually.

## Vision

A personal "second brain" for podcast content. Create **knowledge bases** around topics, fill them with podcasts, and the system extracts insights, themes, and key points — then lets you ask questions across everything using an LLM with full source citations.

### Core Concept

- A **knowledge base** is a collection of podcasts grouped by topic (e.g., "AI Startups", "Health & Longevity", "Marketing Tactics")
- Search for podcasts via Podcast Index, or paste a YouTube URL as a fallback
- System automatically: downloads audio → transcribes → chunks → embeds → extracts insights
- Each knowledge base has its own chat interface where you can ask questions and get LLM-powered answers grounded in the actual podcast content
- Cross-podcast synthesis: compare viewpoints, find agreements/disagreements, surface patterns

### Who It's For

Built for Nick (personal use first), with potential to productize later. Architecture should support multi-user auth down the road but doesn't need it yet.

## Tech Stack

- **Frontend**: React 19 + Vite 8 + Tailwind CSS 4 + React Router 7
- **Backend/Database**: Supabase (Postgres, Auth, Edge Functions, Storage)
- **AI/ML**: OpenAI — GPT-4o-mini (insights), text-embedding-3-small (embeddings); Groq — Whisper (transcription), Llama 3.3 70B (chat)
- **Podcast Discovery**: Podcast Index API (free, open podcast directory with RSS feeds)
- **Deployment**: Vercel (frontend, auto-deploy on push to GitHub)

### Why This Stack

- No Python, no virtual environments — entire stack is JavaScript
- Supabase handles DB, auth, storage, and vector search (pgvector) in one place
- Nick already uses Supabase for happened-live, so familiar territory
- Groq for transcription (Whisper — faster and cheaper than OpenAI Whisper) and chat (Llama 3.3 70B — free tier, fast inference)
- OpenAI for embeddings (text-embedding-3-small) and insights (GPT-4o-mini)
- Edge Functions handle API calls to OpenAI, Groq, + Podcast Index server-side (keeps keys safe)
- Podcast Index provides legally clean RSS feed audio URLs — no scraping or YouTube TOS issues

## Project Structure

```
podcast-app/
├── src/
│   ├── components/        # Reusable UI components
│   ├── pages/             # Route-level page components
│   ├── hooks/             # Custom React hooks
│   ├── lib/               # Supabase client, utilities
│   ├── services/          # API service layer
│   ├── App.jsx
│   ├── main.jsx
│   └── index.css
├── supabase/
│   ├── migrations/        # SQL migrations
│   └── functions/         # Edge Functions (process-podcast, chat, podcast-search, podcast-episodes)
├── public/
├── CLAUDE.md
├── package.json
└── vite.config.js
```

## Database Schema (Supabase Postgres)

### Tables

**knowledge_bases**
- `id` (uuid, PK)
- `name` (text) — e.g., "AI Startups"
- `description` (text, nullable)
- `user_id` (uuid, nullable, FK → auth.users) — owner; NULL for pre-auth data
- `created_at` (timestamptz)
- `updated_at` (timestamptz)

**podcasts** (KB-independent — one row per unique episode)
- `id` (uuid, PK)
- `youtube_video_id` (text, unique, nullable) — for YouTube sources, used for deduplication
- `podcast_index_id` (bigint, nullable) — Podcast Index feed ID
- `episode_index_id` (bigint, nullable) — Podcast Index episode ID, used for deduplication
- `feed_url` (text, nullable) — RSS feed URL
- `enclosure_url` (text, nullable) — direct audio file URL from RSS feed
- `source` (text) — 'podcast_index' or 'youtube'
- `url` (text) — original URL (YouTube URL or episode link)
- `title` (text, nullable)
- `channel` (text, nullable) — show name
- `duration_seconds` (int, nullable)
- `thumbnail_url` (text, nullable)
- `status` (text) — pending | downloading | transcribing | processing | ready | error | cancelled
- `progress` (real, default 0) — 0-100 overall processing progress, written by edge function
- `error_message` (text, nullable)
- `transcript_url` (text, nullable) — URL to RSS transcript if available
- `user_id` (uuid, nullable, FK → auth.users) — owner; NULL for pre-auth data
- `created_at` (timestamptz)
- `updated_at` (timestamptz)

**knowledge_base_podcasts** (junction table — many-to-many)
- `id` (uuid, PK)
- `knowledge_base_id` (uuid, FK → knowledge_bases)
- `podcast_id` (uuid, FK → podcasts)
- `created_at` (timestamptz)
- UNIQUE(knowledge_base_id, podcast_id)

**transcripts**
- `id` (uuid, PK)
- `podcast_id` (uuid, FK → podcasts)
- `full_text` (text)
- `segments` (jsonb) — timestamped segments from OpenAI Whisper
- `word_count` (int)
- `created_at` (timestamptz)

**chunks** (KB-independent — shared across KBs via podcast linkage)
- `id` (uuid, PK)
- `podcast_id` (uuid, FK → podcasts)
- `text` (text)
- `start_time` (float, nullable)
- `end_time` (float, nullable)
- `token_count` (int)
- `embedding` (vector(1536)) — pgvector
- `created_at` (timestamptz)

**insights**
- `id` (uuid, PK)
- `podcast_id` (uuid, FK → podcasts)
- `summary` (text)
- `topics` (jsonb) — extracted topics
- `key_points` (jsonb) — bullet points
- `entities` (jsonb) — people, companies, etc.
- `created_at` (timestamptz)

**kb_syntheses** (cross-podcast synthesis per KB)
- `id` (uuid, PK)
- `knowledge_base_id` (uuid, FK → knowledge_bases, CASCADE delete)
- `themes` (jsonb, default '[]') — cross-episode themes
- `cross_references` (jsonb, default '[]') — agreements, disagreements, complements
- `generated_at` (timestamptz)

**conversations**
- `id` (uuid, PK)
- `knowledge_base_id` (uuid, FK → knowledge_bases)
- `title` (text, nullable)
- `user_id` (uuid, nullable, FK → auth.users) — owner; NULL for pre-auth data
- `created_at` (timestamptz)

**messages**
- `id` (uuid, PK)
- `conversation_id` (uuid, FK → conversations)
- `role` (text) — user | assistant
- `content` (text)
- `sources` (jsonb, nullable) — cited chunks with timestamps
- `created_at` (timestamptz)

**processing_logs**
- `id` (uuid, PK)
- `podcast_id` (uuid, FK → podcasts)
- `step` (text) — downloading | transcribing | processing | ready | error | cancelled
- `message` (text)
- `created_at` (timestamptz)

**search_history**
- `id` (uuid, PK)
- `query` (text)
- `result_count` (int)
- `scope_type` (text) — 'knowledge_base' or 'global'
- `scope_id` (uuid, nullable) — KB id if scoped
- `user_id` (uuid, nullable, FK → auth.users)
- `created_at` (timestamptz)

**playback_progress**
- `id` (uuid, PK)
- `user_id` (uuid, FK → auth.users, CASCADE delete)
- `podcast_id` (uuid, FK → podcasts, CASCADE delete)
- `position_seconds` (double precision, NOT NULL)
- `duration_seconds` (double precision, nullable)
- `playback_speed` (double precision, nullable)
- `completed` (boolean, default false)
- `created_at` (timestamptz)
- `updated_at` (timestamptz)

**feed_subscriptions**
- `id` (uuid, PK)
- `user_id` (uuid, FK → auth.users, CASCADE delete)
- `feed_id` (bigint) — Podcast Index feed ID
- `feed_url` (text)
- `feed_title` (text)
- `feed_artwork` (text)
- `feed_author` (text)
- `auto_process` (boolean, default false)
- `is_active` (boolean, default true)
- `created_at` (timestamptz)
- `updated_at` (timestamptz)

## Security Model

### Ownership Classes

Tables fall into three ownership classes that determine how they are gated:

- **USER-OWNED** - `knowledge_bases`, `conversations`, `search_history`, `playback_progress`, `feed_subscriptions`. Gated by RLS `auth.uid() = user_id`. Each row belongs to exactly one user.
- **KB / PARENT-SCOPED** - `knowledge_base_podcasts`, `messages`, `kb_syntheses`. No direct `user_id`; gated by an EXISTS-join to an owned parent (e.g. a message is visible only if its conversation is owned by the caller).
- **SHARED CATALOG** - `podcasts`, `transcripts`, `chunks`, `insights`, `processing_logs`. No `user_id`. Readable by any authenticated user, written only by service-role edge functions. Keeping these shared (not per-user) preserves episode deduplication - one transcribed episode is reused across every KB and user that references it.

### Edge Functions and Authorization

Edge functions run with the service-role key (which bypasses RLS), so they must enforce ownership themselves. The shared helper `supabase/functions/_shared/auth.ts` exports `resolveCaller(req) -> { userId, isService }`:

- Service-role callers (internal/cron) get `{ userId: null, isService: true }`.
- A valid end-user JWT resolves to `{ userId, isService: false }` and the function scopes all queries to that user.
- Missing/invalid token gets `{ userId: null, isService: false }` (denied).

Gateway-level `verify_jwt` (see `supabase/config.toml`):

- **`true`** for `chat`, `semantic-search`, `synthesize-kb`, and the catalog/lookup functions (`podcast-search`, `podcast-episodes`, `podcast-discover`, `resolve-feeds`, `youtube-search`) - anonymous callers are rejected before the function runs.
- **`false`** for `process-podcast` (dual service/user path - self-enforces in-handler) and `poll-subscriptions` (cron; gated by `CRON_SECRET`).

### Security Migrations

- **`013_security_phase1_hardening.sql`** - APPLIED to prod. Safe while the app is still anonymous: adds the missing `user_id` ownership columns (nullable), creates `feed_subscriptions`, fixes/creates the `delete_*` RPCs, pins `search_path` on flagged functions, revokes anon `EXECUTE` on the delete RPCs, and drops the anon storage policies on the private `podcast-audio` bucket. Does NOT enable RLS or revoke anon table grants.
- **`014_security_phase2_lockdown.sql`** - APPLIED to prod (2026-06-13). Owner account created, all pre-auth rows backfilled, RLS enabled on all 13 tables with appropriate policies, anon grants revoked, authenticated + service_role re-granted.

## Development Phases

### Phase 1 — Foundation (MVP) ✅
- [x] Project scaffolding (React + Vite + Tailwind + Supabase client)
- [x] Supabase project setup (tables, pgvector extension)
- [x] Knowledge base CRUD (create, list, rename, delete)
- [x] Add podcast by YouTube URL (metadata fetch via oEmbed API)
- [x] Basic UI: two-tab home (Knowledge Bases + Podcasts) → podcast list → detail view
- [x] Standalone podcasts section — podcasts exist independently, can be added to multiple KBs
- [x] Podcast deduplication via `youtube_video_id` + junction table

### Phase 2 — Processing Pipeline ✅
- [x] Audio download (RSS direct or Cobalt for YouTube fallback) — no local tools needed
- [x] Supabase Edge Function: download → transcription → chunking → embeddings → insights
- [x] Groq Whisper transcription (whisper-large-v3)
- [x] Chunking logic (time-based with sentence boundary respect)
- [x] Store chunks with timestamps in Supabase
- [x] Real-time progress tracking (0-100% written by edge function, polled every 2s)
- [x] Processing status UI (step tracker, progress bar, persistent elapsed timer from DB logs)
- [x] Processing logs (terminal-style, polls every 3s)
- [x] Cancel processing (sets DB status to 'cancelled', edge function polls and aborts)

### Phase 2.5 — Podcast Index Integration ✅
- [x] Podcast Index API credentials (key + secret via Supabase secrets)
- [x] Edge Function: podcast-search (search shows by term)
- [x] Edge Function: podcast-episodes (list episodes by feed ID)
- [x] AddPodcastModal: search shows → browse episodes → add episode
- [x] Direct RSS audio download (enclosure_url) — no Cobalt/YouTube needed
- [x] Episode deduplication via `episode_index_id`
- [x] YouTube URL paste retained as fallback

### Phase 3 - Embeddings & Search (done)
- [x] Generate embeddings via OpenAI text-embedding-3-small
- [x] Store in pgvector column on chunks table
- [x] Semantic search within a knowledge base (semantic-search edge fn + services/search.js)
- [x] Search UI with results showing podcast source + timestamp (SearchPage.jsx, SemanticSearchResult.jsx)

### Phase 4 — AI Insights ✅
- [x] GPT-4o-mini integration for summarization (via Edge Function)
- [x] Auto-generate insights per podcast (summary, topics, key points, entities)
- [x] Insights panel in UI
- [x] Knowledge base-level synthesis (themes across all podcasts)

### Phase 5 — Chat (RAG) ✅
- [x] RAG pipeline: query → vector search → context assembly → Groq Llama 3.3 70B response
- [x] Source citations with timestamps
- [x] Conversation history per knowledge base
- [x] Chat UI component

### Phase 6 — Polish & Productize
- [x] Supabase Auth integration + RLS policies - Auth UI (AuthPage, AuthGate, JWT forwarding) fully built; migration 013 (phase 1 hardening) + migration 014 (RLS lockdown on all 13 tables) both applied to prod; owner account backfilled
- [x] Responsive design / mobile support (mobile nav, bottom-sheet modals, 44px touch targets)
- [x] Export insights - markdown (src/lib/export.js), PDF + plain text (ExportModal.jsx + ExportPreview.jsx + exportTemplates.js + html2pdf.js)
- [x] Vercel deployment (auto-deploy on push to GitHub)
- [x] Usage tracking (src/services/usage.js + UsageCard.jsx on ProfilePage) — groundwork for future billing/limits

## Environment Variables

```
# Supabase (frontend — safe to expose)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key

# API Keys (server-side only — set as Supabase secrets, NOT in frontend)
OPENAI_API_KEY=your-openai-key
GROQ_API_KEY=your-groq-key
PODCAST_INDEX_KEY=your-podcast-index-key
PODCAST_INDEX_SECRET=your-podcast-index-secret
```

## Quick Commands

```bash
# Install dependencies
npm install

# Run dev server (port 5173)
npm run dev

# Build for production
npm run build

# Process a podcast — click "Process" in the UI. Everything runs server-side.
```

## Key Decisions

- **No Python in the stack** — entire stack is JavaScript
- **Podcast Index as primary source** — free, open API with direct RSS audio URLs. Legally clean (RSS feeds are public), no scraping, no YouTube TOS issues. Perfect for productizing later.
- **YouTube as fallback only** — users can still paste YouTube URLs, which use Cobalt (Railway) for audio extraction. But Podcast Index search is the recommended path.
- **Multi-provider AI** — OpenAI for embeddings (text-embedding-3-small) and insights (GPT-4o-mini). Groq for transcription (Whisper large-v3, faster and cheaper than OpenAI Whisper) and chat (Llama 3.3 70B, free tier with fast inference). Two API keys, but each provider plays to its strengths.
- **GPT-4o-mini for insights** — good enough for one-time-per-podcast summarization at low cost. Groq Llama 3.3 70B handles the high-volume chat queries on the free tier.
- **pgvector over ChromaDB** — keeps vectors in the same Postgres database, one less service
- **Knowledge bases as first-class concept** — not a flat podcast list, but organized collections with their own chat and insights
- **Standalone Podcasts section** — podcasts exist independently and can be added to multiple KBs via junction table
- **Edge Functions for API calls** — keeps API keys server-side, handles heavy processing off the client
- **Supabase over custom backend** — no Express/FastAPI server to maintain, everything lives in Supabase

## Processing Pipeline

Everything runs in the cloud — no local tools needed. Click "Process" in the UI and it just works.

### Edge Function (`process-podcast` v14)

The entire pipeline runs in a single Supabase Edge Function:

1. **Download audio** - Downloads directly from the RSS `enclosure_url`. The function has NO Cobalt/YouTube code path; a podcast without an `enclosure_url` errors out ("Only podcasts with RSS enclosure URLs are supported"). (0-15%)
2. **Upload to Storage** — Uploads audio to Supabase Storage `podcast-audio` bucket as backup (15-30%)
3. **Transcribe** — Sends audio to Groq Whisper (whisper-large-v3), stores transcript with timestamped segments (30-55%)
4. **Chunk** — Splits transcript into chunks (~500 tokens, sentence boundary respect) (55-60%)
5. **Embed** — Generates embeddings via OpenAI text-embedding-3-small (batches of 20) (60-90%)
6. **Insights** — GPT-4o-mini generates summary, topics, key points, and entities (90-99%)
7. **Done** — Status set to `ready`, progress = 100%, Storage audio file cleaned up

Progress is written as actual 0-100% to `podcasts.progress` at each step. The frontend polls every 2 seconds and displays the real value.

Each step writes to the `processing_logs` table for real-time visibility. The function checks for `cancelled` status before each major step and aborts + cleans up partial data if cancelled.

### Edge Functions

| Function | Version | Purpose |
|----------|---------|---------|
| `process-podcast` | v14 | Full processing pipeline (download -> transcribe -> embed -> insights). `verify_jwt=false`; self-enforces ownership in-handler via `resolveCaller`. |
| `chat` | v5 | RAG chat - vector search + Groq Llama 3.3 70B response with citations. Verifies JWT, enforces per-user ownership. |
| `podcast-search` | v2 | Search Podcast Index API for shows by term |
| `podcast-episodes` | v2 | Get episodes for a Podcast Index feed by feed ID |
| `youtube-search` | v4 | YouTube search via InnerTube API. DEPLOYED-ONLY - no source in this repo. Legacy fallback, not used in primary UI. |
| `synthesize-kb` | v1 | KB-level cross-podcast synthesis - themes, agreements, disagreements via GPT-4o-mini. Verifies JWT, enforces per-user ownership. |
| `semantic-search` | v1 | Vector similarity search across chunks within a KB or globally. Verifies JWT, enforces per-user ownership. |
| `poll-subscriptions` | v1 | Check feed subscriptions for new episodes and trigger processing. `verify_jwt=false`; cron, gated by `CRON_SECRET`, self-enforces in-handler. |
| `resolve-feeds` | v1 | Resolve RSS feed URLs and extract feed metadata |
| `podcast-discover` | v1 | Discover trending/recommended podcasts via Podcast Index |

### Podcast Index API

- **API**: `https://api.podcastindex.org/api/1.0/`
- **Auth**: SHA-1 hash of (apiKey + apiSecret + unixTimestamp) sent as `Authorization` header
- **Endpoints used**: `/search/byterm` (show search), `/episodes/byfeedid` (episode listing)
- **Why**: Free, open podcast directory. RSS `enclosureUrl` fields provide direct public MP3 URLs — legally clean, no scraping.

### Cobalt (Railway) - Legacy / Not In Current Pipeline

- **Status**: LEGACY. The current `process-podcast` function has no Cobalt/YouTube code - it downloads only from the RSS `enclosure_url`. The Railway service may still be running, but this code path was removed from the pipeline. Connection details are retained below for reference only.
- **Service**: Cobalt v11 (`ghcr.io/imputnet/cobalt:11`)
- **Companion**: yt-session-generator (`ghcr.io/imputnet/yt-session-generator:webserver`)
- **Railway project**: `stellar-love` (id: 62063223-f85f-44ab-9ff6-f4bbc5402337)
- **Public URL**: `https://cobalt-production-8df9.up.railway.app`
- **API**: `POST /` with `{"url": "...", "downloadMode": "audio", "audioFormat": "mp3"}`

### Supabase Storage

- **Bucket**: `podcast-audio` (private)
- **RLS**: anon can INSERT, SELECT, UPDATE, DELETE; service_role has full access
- Audio files are uploaded by the edge function, used for Groq Whisper transcription, then deleted after processing

### Cancellation Flow

- User clicks "Cancel" → frontend sets podcast status to `cancelled` in DB and inserts a log entry
- Edge function polls `podcasts.status` before each step via `checkCancelled()`
- If cancelled, `cleanup()` deletes partial transcripts/chunks/insights and resets status to `pending`
- Edge function throws and exits

## Environment

- **OS:** Windows 11 — PowerShell is the local shell. Do not assume macOS/Linux paths or tools on the client side.
- **User path:** C:\Users\nlnic\
- **Plan:** Claude Max subscription. NOT using the Anthropic API key. Do not reference ANTHROPIC_API_KEY or attempt API-key-based workflows.
- **Model:** Opus (set in .claude/settings.json)
- **GitHub:** github.com/nlnicklasky-commits — all repos live under this org
- **Email:** nl.nicklasky@gmail.com
- **SSH key (DigitalOcean):** C:\Users\nlnic\.ssh\digitalocean

## API Keys & Services

All secrets live in `.env` or `.env.local` at project root (gitignored). NEVER hardcode keys in source files or this CLAUDE.md.

| Service | Env Var(s) | What it's for |
|---------|-----------|---------------|
| **Supabase** | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Database, auth, RLS, realtime. Project: `podcast-brain` (id: vxxmlieonejwyojenrsh) |
| **OpenAI** | `OPENAI_API_KEY` | text-embedding-3-small (embeddings), GPT-4o-mini (insights). Server-side only via Edge Functions. |
| **Groq** | `GROQ_API_KEY` | Whisper large-v3 (transcription), Llama 3.3 70B (chat). Server-side only via Edge Functions. |
| **Podcast Index** | `PODCAST_INDEX_KEY`, `PODCAST_INDEX_SECRET` | Show search and episode listing via Podcast Index API. Server-side only via Edge Functions. |
| **Notion** | `NOTION_API_KEY` | Shared across all projects. Used for logging, tracking, project state. Notion is the source of truth. |
| **Vercel** | Vercel CLI auth | Deployment platform. Vercel org: `nick-laskys-projects`. Deploy with `vercel --prod`. Project: `podcast-app` (id: prj_WVKbPtlULb2KExWtJujJspTjibEG) |
| **Railway** | Railway CLI auth | Cobalt + yt-session-generator deployment for YouTube fallback. Project: `stellar-love` (id: 62063223-f85f-44ab-9ff6-f4bbc5402337). Public URL: `https://cobalt-production-8df9.up.railway.app` |

## Conventions

- **Frontend is JavaScript (JSX)** - functional components with hooks. No TypeScript, no `prop-types`. Service-layer functions are JSDoc-typed.
- **Edge functions are TypeScript (Deno)** - the `supabase/functions/**` code is TS.
- Functional React components with hooks only — no class components, no Redux
- TailwindCSS for all styling — no CSS modules, no styled-components
- Prettier + ESLint for formatting (auto-run via hooks)
- Use `npm install --legacy-peer-deps` if peer dependency conflicts arise
- Supabase queries: use `.limit(1)` instead of `.single()` to avoid errors on empty results
- All generated images in SVG format when possible

### Shared Frontend Helpers

- `src/services/_auth.js` - `requireUserId()`, `getAccessToken()`
- `src/services/_edge.js` - `callEdgeFunction(name, body, opts)` (forwards the JWT to edge functions)
- `src/components/ui.jsx` - exports `Button` and `EmptyState` (plus `StatusPip`, `KBGlyph`, `SectionHeader`, `Tag`)
- `src/components/ConfirmDialog.jsx` - reusable confirm dialog
- `src/lib/AudioContext.jsx` - `useAudioTime()` for the live playhead

## Working with Nick

- Give full, copy-pasteable commands. Never abbreviate or say "just SSH in" — paste the complete command with flags, paths, and env expansions in PowerShell-ready form.
- Be concise. Don't summarize what he just told you back to him.
- Notion is the source of truth for project state, roadmap, and data pipeline status. Search Notion before making assumptions about project status.
- When a step is slow or long-running, explain what's happening and set expectations on timing.
- Prefer practical, working code over theoretical explanations.

## Hooks (active via .claude/settings.json)

- **Five Whys Stop hook** — After each response, an Opus sub-agent applies Five Whys to your prompt, identifies root intent, and if meaningful improvements exist, rewrites an optimized continuation that Claude works on automatically. Max one cycle per prompt.
- **Session context injection** — On session start/resume/compact, key environment info is re-injected so Claude never forgets the basics.
- **Notification** — Windows notification when Claude needs attention.

## Nick's Setup

- **OS**: Windows (PowerShell)
- **Project path**: `C:\Users\nlnic\Documents\Projects\podcast-app`
- **Supabase project**: `podcast-brain` (id: vxxmlieonejwyojenrsh)
- **Vercel project**: `podcast-app` (id: prj_WVKbPtlULb2KExWtJujJspTjibEG)
- **Railway project**: `stellar-love` — Cobalt + yt-session-generator (YouTube fallback)
- **Cobalt URL**: https://cobalt-production-8df9.up.railway.app
## Verification

- `scripts/verify.ps1 -Quick` = lint + typecheck. Runs automatically via the global Stop hook whenever a session edits files - failures must be fixed, not bypassed.
- `scripts/verify.ps1` (full) = quick checks + tests + production build. Run before committing, deploying, or calling a milestone done, and report the result.
- Playwright e2e (when present) is NOT part of verify - run it manually when UI flows change.
