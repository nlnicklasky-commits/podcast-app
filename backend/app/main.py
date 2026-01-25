"""FastAPI application entry point."""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.models.database import init_db
from app.routers import podcasts, search, jobs

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager."""
    # Startup
    logger.info("Starting up Podcast Knowledge Base API...")
    init_db()
    logger.info("Database initialized")

    # Ensure data directories exist
    settings.audio_dir
    settings.chroma_dir
    logger.info("Data directories ready")

    yield

    # Shutdown
    logger.info("Shutting down...")


app = FastAPI(
    title="Podcast Knowledge Base API",
    description="A personal second brain for podcast content. Add episodes, search, and chat with your knowledge base.",
    version="1.0.0",
    lifespan=lifespan,
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url, "http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(podcasts.router, prefix="/api/podcasts", tags=["Podcasts"])
app.include_router(search.router, prefix="/api/search", tags=["Search"])
app.include_router(jobs.router, prefix="/api/jobs", tags=["Jobs"])


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "name": "Podcast Knowledge Base API",
        "version": "1.0.0",
        "status": "running"
    }


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "healthy"}
