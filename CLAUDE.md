# CLAUDE.md - Project Instructions for AI Assistants

## Project Overview

This is a **Podcast Knowledge Base** application - a personal "second brain" for podcast content. Users can add YouTube podcast URLs, and the system automatically downloads, transcribes, chunks, and embeds the content for semantic search.

## Tech Stack

- **Backend**: Python 3.11+ with FastAPI
- **Database**: SQLite (metadata) + ChromaDB (vectors)
- **Transcription**: OpenAI Whisper (local, "base" model)
- **Embeddings**: sentence-transformers (all-MiniLM-L6-v2)
- **LLM**: Anthropic Claude API (for Phase 2+)
- **Frontend**: React 18 + Vite + Tailwind CSS

## Quick Commands

```bash
# Setup (first time)
make setup

# Run development servers (backend + frontend)
make dev

# Run backend only (port 8000)
make dev-backend

# Run frontend only (port 5173)
make dev-frontend

# Run tests
make test

# Clean data files
make clean-data
```

## Project Structure

```
podcast-app/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI entry point
│   │   ├── config.py            # Pydantic settings
│   │   ├── dependencies.py      # Shared dependencies
│   │   ├── routers/             # API endpoints
│   │   │   ├── podcasts.py      # CRUD for podcasts
│   │   │   ├── search.py        # Semantic search
│   │   │   └── jobs.py          # Job status
│   │   ├── services/            # Business logic
│   │   │   ├── downloader.py    # yt-dlp wrapper
│   │   │   ├── transcriber.py   # Whisper integration
│   │   │   ├── chunker.py       # Text chunking
│   │   │   ├── embedder.py      # Embedding generation
│   │   │   └── vector_store.py  # ChromaDB operations
│   │   ├── models/
│   │   │   ├── database.py      # SQLAlchemy models
│   │   │   └── schemas.py       # Pydantic schemas
│   │   └── workers/
│   │       └── pipeline.py      # Background processing
│   ├── tests/
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/          # React components
│   │   ├── pages/               # Page components
│   │   ├── hooks/               # Custom React hooks
│   │   └── services/api.js      # API client
│   ├── package.json
│   └── vite.config.js
├── data/                        # Gitignored data storage
│   ├── audio/                   # Downloaded audio files
│   ├── chroma/                  # ChromaDB persistence
│   └── podcasts.db              # SQLite database
└── scripts/
    └── init_db.py               # Database initialization
```

## Key Files to Know

| File | Purpose |
|------|---------|
| `backend/app/main.py` | FastAPI app setup, CORS, routers |
| `backend/app/config.py` | All configuration via env vars |
| `backend/app/workers/pipeline.py` | Main processing pipeline |
| `backend/app/services/vector_store.py` | ChromaDB search operations |
| `frontend/src/services/api.js` | API client for frontend |
| `frontend/src/hooks/usePodcasts.js` | React hooks for podcast state |

## Database Schema

**Main Tables:**
- `podcasts` - Podcast metadata (title, channel, status, etc.)
- `transcripts` - Full transcripts with segments JSON
- `chunks` - Individual chunks for vector search
- `jobs` - Processing job status tracking
- `insights` - AI-generated summaries (Phase 2)
- `conversations` / `messages` - Chat history (Phase 3)

## API Endpoints

```
POST   /api/podcasts              # Add podcast by URL
GET    /api/podcasts              # List all (paginated)
GET    /api/podcasts/{id}         # Get details + transcript
DELETE /api/podcasts/{id}         # Remove podcast

POST   /api/search                # Semantic search
GET    /api/jobs/{id}             # Check job status
```

## Development Phases

### Phase 1 (Current - MVP)
- [x] YouTube audio download
- [x] Whisper transcription
- [x] Time-based chunking
- [x] Embedding + ChromaDB storage
- [x] Semantic search
- [x] Basic React UI

### Phase 2 (Knowledge Extraction)
- [ ] Claude integration for summarization
- [ ] Topic/entity extraction
- [ ] Smart chunking with sentence boundaries
- [ ] Insights panel in UI

### Phase 3 (Chat Interface)
- [ ] RAG pipeline for Q&A
- [ ] Conversation management
- [ ] Source citations
- [ ] Chat UI component

## Common Tasks

### Adding a New API Endpoint

1. Create/modify router in `backend/app/routers/`
2. Add Pydantic schemas in `backend/app/models/schemas.py`
3. Register router in `backend/app/main.py` if new file
4. Add frontend API method in `frontend/src/services/api.js`

### Adding a New Service

1. Create file in `backend/app/services/`
2. Import and use in `backend/app/workers/pipeline.py` or routers

### Modifying Database Schema

1. Update models in `backend/app/models/database.py`
2. Run `python scripts/init_db.py` to recreate tables (dev only)
3. For production, use Alembic migrations

## Environment Variables

Key settings in `backend/.env`:
- `ANTHROPIC_API_KEY` - Required for Phase 2+
- `WHISPER_MODEL` - tiny/base/small/medium/large
- `WHISPER_DEVICE` - cpu/cuda/mps
- `MAX_CONCURRENT_JOBS` - Parallel processing limit

## Testing

```bash
# Run all tests
cd backend && pytest

# Run with verbose output
cd backend && pytest -v

# Run specific test file
cd backend && pytest tests/test_api.py
```

## Troubleshooting

**Whisper model download**: First transcription may be slow as it downloads the model.

**ChromaDB errors**: Try `make clean-data` and restart.

**CORS issues**: Ensure frontend URL matches `FRONTEND_URL` in backend/.env.

**ffmpeg missing**: Install with `apt install ffmpeg` or `brew install ffmpeg`.
