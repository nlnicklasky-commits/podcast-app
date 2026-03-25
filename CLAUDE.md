# CLAUDE.md — Podcast Knowledge Base

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
- **AI/ML**: OpenAI — Whisper (transcription), text-embedding-3-small (embeddings), GPT-4o (insights), GPT-4o-mini (chat)
- **Podcast Discovery**: Podcast Index API (free, open podcast directory with RSS feeds)
- **Deployment**: Vercel (frontend, auto-deploy on push to GitHub)

### Why This Stack

- No Python, no virtual environments — entire stack is JavaScript
- Supabase handles DB, auth, storage, and vector search (pgvector) in one place
- Nick already uses Supabase for happened-live, so familiar territory
- OpenAI handles everything: Whisper for transcription, embeddings, GPT-4o/mini for insights and chat
- Edge Functions handle API calls to OpenAI + Podcast Index server-side (keeps keys safe)
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
├── vite.config.js
├── tailwind.config.js
└── postcss.config.js
```

## Database Schema (Supabase Postgres)

### Tables

**knowledge_bases**
- `id` (uuid, PK)
- `name` (text) — e.g., "AI Startups"
- `description` (text, nullable)
- `created_at` (timestamptz)
- `updated_at` (timestamptz)

**podcasts** (KB-independent — one row per unique episode)
- `id` (uuid, PK)
- `youtube_video_id` (text, unique, nullable) — for YouTube sources, used for deduplication
- `podcast_index_id` (bigint, nullable) — Podcast Index feed ID
- `episode_index_id` (bigint, nullable) — Podcast Index episode ID, used for deduplication
- `feed_url` (text, nullable) — RSS feed URL
- `enclosure_url` (text, nullable) — direct audio file URL from RSS feed
- `source` (text, nullable) — 'podcast_index' or null (YouTube)
- `url` (text) — original URL (YouTube URL or episode link)
- `title` (text, nullable)
- `channel` (text, nullable) — show name
- `duration_seconds` (int, nullable)
- `thumbnail_url` (text, nullable)
- `status` (text) — pending | downloading | transcribing | processing | ready | error | cancelled
- `progress` (real, default 0) — 0-100 overall processing progress, written by edge function
- `error_message` (text, nullable)
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

**conversations**
- `id` (uuid, PK)
- `knowledge_base_id` (uuid, FK → knowledge_bases)
- `title` (text, nullable)
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
- [x] OpenAI Whisper transcription
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

### Phase 3 — Embeddings & Search ✅ (embeddings) / 🔲 (search UI)
- [x] Generate embeddings via OpenAI text-embedding-3-small
- [x] Store in pgvector column on chunks table
- [ ] Semantic search within a knowledge base
- [ ] Search UI with results showing podcast source + timestamp

### Phase 4 — AI Insights ✅ (per-podcast) / 🔲 (KB-level)
- [x] GPT-4o integration for summarization (via Edge Function)
- [x] Auto-generate insights per podcast (summary, topics, key points, entities)
- [x] Insights panel in UI
- [ ] Knowledge base-level synthesis (themes across all podcasts)

### Phase 5 — Chat (RAG) ✅
- [x] RAG pipeline: query → vector search → context assembly → GPT-4o-mini response
- [x] Source citations with timestamps
- [x] Conversation history per knowledge base
- [x] Chat UI component

### Phase 6 — Polish & Productize (Later)
- [ ] Supabase Auth integration + RLS policies
- [ ] Responsive design / mobile support
- [ ] Export insights (markdown, PDF)
- [x] Vercel deployment (auto-deploy on push to GitHub)
- [ ] Usage limits / billing if multi-user

## Environment Variables

```
# Supabase (frontend — safe to expose)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key

# API Keys (server-side only — set as Supabase secrets, NOT in frontend)
OPENAI_API_KEY=your-openai-key
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
- **OpenAI for everything** — single API key handles transcription (Whisper), embeddings (text-embedding-3-small), insights (GPT-4o), and chat (GPT-4o-mini). Simpler than juggling multiple providers.
- **GPT-4o-mini for chat** — ~10x cheaper than GPT-4o, good enough for RAG queries. GPT-4o still used for insights (one-time per podcast).
- **pgvector over ChromaDB** — keeps vectors in the same Postgres database, one less service
- **Knowledge bases as first-class concept** — not a flat podcast list, but organized collections with their own chat and insights
- **Standalone Podcasts section** — podcasts exist independently and can be added to multiple KBs via junction table
- **Edge Functions for API calls** — keeps API keys server-side, handles heavy processing off the client
- **Supabase over custom backend** — no Express/FastAPI server to maintain, everything lives in Supabase

## Processing Pipeline

Everything runs in the cloud — no local tools needed. Click "Process" in the UI and it just works.

### Edge Function (`process-podcast` v14)

The entire pipeline runs in a single Supabase Edge Function:

1. **Download audio** — For Podcast Index episodes: downloads directly from RSS `enclosure_url`. For YouTube: calls Cobalt API (Railway) to get audio. (0-15%)
2. **Upload to Storage** — Uploads audio to Supabase Storage `podcast-audio` bucket as backup (15-30%)
3. **Transcribe** — Sends audio to OpenAI Whisper, stores transcript with timestamped segments (30-55%)
4. **Chunk** — Splits transcript into chunks (~500 tokens, sentence boundary respect) (55-60%)
5. **Embed** — Generates embeddings via OpenAI text-embedding-3-small (batches of 20) (60-90%)
6. **Insights** — GPT-4o generates summary, topics, key points, and entities (90-99%)
7. **Done** — Status set to `ready`, progress = 100%, Storage audio file cleaned up

Progress is written as actual 0-100% to `podcasts.progress` at each step. The frontend polls every 2 seconds and displays the real value.

Each step writes to the `processing_logs` table for real-time visibility. The function checks for `cancelled` status before each major step and aborts + cleans up partial data if cancelled.

### Edge Functions

| Function | Version | Purpose |
|----------|---------|---------|
| `process-podcast` | v14 | Full processing pipeline (download → transcribe → embed → insights) |
| `chat` | v5 | RAG chat — vector search + GPT-4o-mini response with citations |
| `podcast-search` | v2 | Search Podcast Index API for shows by term |
| `podcast-episodes` | v2 | Get episodes for a Podcast Index feed by feed ID |
| `youtube-search` | v4 | YouTube search via InnerTube API (kept as fallback, not used in primary UI) |

### Podcast Index API

- **API**: `https://api.podcastindex.org/api/1.0/`
- **Auth**: SHA-1 hash of (apiKey + apiSecret + unixTimestamp) sent as `Authorization` header
- **Endpoints used**: `/search/byterm` (show search), `/episodes/byfeedid` (episode listing)
- **Why**: Free, open podcast directory. RSS `enclosureUrl` fields provide direct public MP3 URLs — legally clean, no scraping.

### Cobalt (Railway) — YouTube Fallback Only

- **Service**: Cobalt v11 (`ghcr.io/imputnet/cobalt:11`)
- **Companion**: yt-session-generator (`ghcr.io/imputnet/yt-session-generator:webserver`)
- **Railway project**: `stellar-love` (id: 62063223-f85f-44ab-9ff6-f4bbc5402337)
- **Public URL**: `https://cobalt-production-8df9.up.railway.app`
- **API**: `POST /` with `{"url": "...", "downloadMode": "audio", "audioFormat": "mp3"}`
- **Note**: Only used when processing YouTube URLs (no `enclosure_url` on podcast record). Podcast Index episodes bypass Cobalt entirely.

### Supabase Storage

- **Bucket**: `podcast-audio` (private)
- **RLS**: anon can INSERT, SELECT, UPDATE, DELETE; service_role has full access
- Audio files are uploaded by the edge function, used for Whisper transcription, then deleted after processing

### Cancellation Flow

- User clicks "Cancel" → frontend sets podcast status to `cancelled` in DB and inserts a log entry
- Edge function polls `podcasts.status` before each step via `checkCancelled()`
- If cancelled, `cleanup()` deletes partial transcripts/chunks/insights and resets status to `pending`
- Edge function throws and exits

## Nick's Setup

- **OS**: Windows (PowerShell)
- **Project path**: `C:\Users\nlnic\Documents\Projects\podcast-app`
- **Supabase project**: `podcast-brain` (id: vxxmlieonejwyojenrsh)
- **Vercel project**: `podcast-app` (id: prj_WVKbPtlULb2KExWtJujJspTjibEG)
- **Railway project**: `stellar-love` — Cobalt + yt-session-generator (YouTube fallback)
- **Cobalt URL**: `https://cobalt-production-8df9.up.railway.app`
- **Domain**: `podbrain.space` (Vercel, with ImprovMX email forwarding for nick@podbrain.space)
- **GitHub branch**: `claude/podcast-knowledge-base-JqEHZ`
- **Budget**: Minimal API costs — OpenAI embeddings ~$0.02/1M tokens, Whisper and GPT-4o usage-based
