# CLAUDE.md — Podcast Knowledge Base

## Vision

A personal "second brain" for podcast content. Create **knowledge bases** around topics, fill them with podcasts, and the system extracts insights, themes, and key points — then lets you ask questions across everything using an LLM with full source citations.

### Core Concept

- A **knowledge base** is a collection of podcasts grouped by topic (e.g., "AI Startups", "Health & Longevity", "Marketing Tactics")
- Add YouTube podcast URLs to a knowledge base
- System automatically: downloads audio → transcribes → chunks → embeds → extracts insights
- Each knowledge base has its own chat interface where you can ask questions and get LLM-powered answers grounded in the actual podcast content
- Cross-podcast synthesis: compare viewpoints, find agreements/disagreements, surface patterns

### Who It's For

Built for Nick (personal use first), with potential to productize later. Architecture should support multi-user auth down the road but doesn't need it yet.

## Tech Stack

- **Frontend**: React 18 + Vite + Tailwind CSS + React Router
- **Backend/Database**: Supabase (Postgres, Auth, Edge Functions, Storage)
- **Transcription**: Deepgram API (fast, accurate, no local ML setup)
- **Embeddings**: OpenAI `text-embedding-3-small` via Supabase `pgvector`
- **LLM**: Anthropic Claude API (for chat, summarization, insight extraction)
- **Deployment**: Vercel (frontend) — later

### Why This Stack

- No Python, no virtual environments — entire stack is JavaScript
- Supabase handles DB, auth, storage, and vector search (pgvector) in one place
- Nick already uses Supabase for happened-live, so familiar territory
- Deepgram API replaces local Whisper — better accuracy, no GPU needed, works on Windows
- Edge Functions handle API calls to Deepgram/Claude server-side (keeps keys safe)

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
│   └── functions/         # Edge Functions (transcribe, embed, chat)
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

**podcasts** (KB-independent — one row per unique YouTube video)
- `id` (uuid, PK)
- `youtube_video_id` (text, unique) — extracted from URL, used for deduplication
- `url` (text) — YouTube URL
- `title` (text, nullable)
- `channel` (text, nullable)
- `duration_seconds` (int, nullable)
- `thumbnail_url` (text, nullable)
- `status` (text) — pending | downloading | transcribing | processing | ready | error
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
- `segments` (jsonb) — timestamped segments from Deepgram
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

## Development Phases

### Phase 1 — Foundation (MVP)
- [ ] Project scaffolding (React + Vite + Tailwind + Supabase client)
- [ ] Supabase project setup (tables, pgvector extension, RLS policies)
- [ ] Knowledge base CRUD (create, list, rename, delete)
- [ ] Add podcast by YouTube URL (metadata fetch via oEmbed API)
- [ ] Basic UI: knowledge base list → podcast list → detail view

### Phase 2 — Transcription Pipeline
- [ ] Supabase Edge Function: download audio from YouTube URL
- [ ] Deepgram API integration for transcription
- [ ] Chunking logic (time-based with sentence boundary respect)
- [ ] Store chunks with timestamps in Supabase
- [ ] Processing status UI (progress indicator per podcast)

### Phase 3 — Embeddings & Search
- [ ] Generate embeddings via OpenAI API
- [ ] Store in pgvector column on chunks table
- [ ] Semantic search within a knowledge base
- [ ] Search UI with results showing podcast source + timestamp

### Phase 4 — AI Insights
- [ ] Claude API integration for summarization
- [ ] Auto-generate insights per podcast (summary, topics, key points, entities)
- [ ] Knowledge base-level synthesis (themes across all podcasts)
- [ ] Insights panel in UI

### Phase 5 — Chat (RAG)
- [ ] RAG pipeline: query → vector search → context assembly → Claude response
- [ ] Source citations with timestamps
- [ ] Conversation history per knowledge base
- [ ] Chat UI component

### Phase 6 — Polish & Productize (Later)
- [ ] Supabase Auth integration
- [ ] Responsive design / mobile support
- [ ] Export insights (markdown, PDF)
- [ ] Vercel deployment
- [ ] Usage limits / billing if multi-user

## Environment Variables

```
# Supabase (frontend — safe to expose)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key

# API Keys (server-side only — used in Supabase Edge Functions, NOT in frontend)
DEEPGRAM_API_KEY=your-deepgram-key
OPENAI_API_KEY=your-openai-key
ANTHROPIC_API_KEY=your-anthropic-key
```

## Quick Commands

```bash
# Install dependencies
npm install

# Run dev server (port 5173)
npm run dev

# Build for production
npm run build
```

## Key Decisions

- **No Python** — entire stack is JavaScript to avoid venv/pip issues on Windows
- **Deepgram over local Whisper** — API call vs. running ML models locally. Costs ~$0.0043/min but worth it for simplicity and accuracy. Free tier = 45 hrs/month
- **pgvector over ChromaDB** — keeps vectors in the same Postgres database, one less service
- **Knowledge bases as first-class concept** — not a flat podcast list, but organized collections with their own chat and insights
- **Edge Functions for API calls** — keeps API keys server-side, handles heavy processing off the client
- **Supabase over custom backend** — no Express/FastAPI server to maintain, everything lives in Supabase

## Nick's Setup

- **OS**: Windows (PowerShell)
- **Project path**: `C:\Users\nlnic\Documents\Projects\podcast-app`
- **Existing Supabase projects**: `briefforge-api` (id: vuxrphtwewgbnsracxom) — may create new project for this
- **Budget**: Minimal API costs — Deepgram free tier, OpenAI embeddings ~$0.02/1M tokens, Claude API usage-based
