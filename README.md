# Podcast Knowledge Base

A personal "second brain" for podcast content. Add episodes, and then search or chat with your knowledge base to recall insights, find connections, and get answers grounded in specific episodes.

## Features

- **Add podcasts by URL**: Just paste a YouTube link and the system handles everything
- **Automatic transcription**: Uses OpenAI Whisper for accurate, local transcription
- **Semantic search**: Find relevant moments across all your podcasts
- **AI-powered chat** (coming soon): Ask questions and get answers with citations

## Tech Stack

- **Backend**: Python 3.11+ with FastAPI
- **Database**: SQLite (metadata) + ChromaDB (vectors)
- **Transcription**: OpenAI Whisper (local)
- **Embeddings**: sentence-transformers (all-MiniLM-L6-v2)
- **Frontend**: React + Vite + Tailwind CSS

## Quick Start

### Prerequisites

- Python 3.11+
- Node.js 18+
- ffmpeg (for audio processing)

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd podcast-app
```

2. Set up the development environment:
```bash
make setup
```

3. Configure your environment:
```bash
# Edit backend/.env and add your Anthropic API key (optional for Phase 1)
```

4. Start the development servers:
```bash
make dev
```

The API will be available at http://localhost:8000 and the frontend at http://localhost:5173.

## API Endpoints

### Podcasts

- `POST /api/podcasts` - Add a new podcast by URL
- `GET /api/podcasts` - List all podcasts (with pagination)
- `GET /api/podcasts/{id}` - Get podcast details with transcript
- `DELETE /api/podcasts/{id}` - Remove a podcast

### Search

- `POST /api/search` - Semantic search across transcripts

### Jobs

- `GET /api/jobs/{id}` - Check processing status

## Project Structure

```
podcast-app/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app
│   │   ├── config.py            # Settings
│   │   ├── routers/             # API endpoints
│   │   ├── services/            # Business logic
│   │   ├── models/              # Database models
│   │   └── workers/             # Background tasks
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/          # React components
│   │   ├── pages/               # Page components
│   │   ├── hooks/               # Custom hooks
│   │   └── services/            # API client
│   └── package.json
├── data/                        # Audio, ChromaDB, SQLite (gitignored)
├── scripts/                     # Utility scripts
└── Makefile                     # Development commands
```

## Configuration

Environment variables (see `backend/.env.example`):

| Variable | Default | Description |
|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | - | API key for Claude (Phase 2+) |
| `WHISPER_MODEL` | `base` | Whisper model size (tiny/base/small/medium/large) |
| `WHISPER_DEVICE` | `cpu` | Device for Whisper (cpu/cuda/mps) |
| `MAX_CONCURRENT_JOBS` | `2` | Max parallel processing jobs |
| `MAX_PODCAST_DURATION_HOURS` | `4` | Reject podcasts longer than this |

## Development

```bash
# Run backend only
make dev-backend

# Run frontend only
make dev-frontend

# Run tests
make test

# Clean data (careful!)
make clean-data
```

## Roadmap

- [x] Phase 1: Core Pipeline (MVP)
  - [x] Audio download from YouTube
  - [x] Whisper transcription
  - [x] Chunking and embedding
  - [x] Semantic search
  - [x] Basic UI

- [ ] Phase 2: Knowledge Extraction
  - [ ] AI-generated summaries
  - [ ] Topic extraction
  - [ ] Entity recognition

- [ ] Phase 3: Conversational Interface
  - [ ] RAG-powered chat
  - [ ] Source citations
  - [ ] Conversation history

## License

MIT
