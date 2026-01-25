"""Podcast CRUD API endpoints."""

import logging
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.dependencies import get_db
from app.models.database import Podcast, Transcript, Chunk, Job, generate_uuid
from app.models.schemas import (
    PodcastCreate,
    PodcastResponse,
    PodcastCreateResponse,
    PodcastListResponse,
    PodcastDetailResponse,
    TranscriptResponse,
    ChunkResponse,
)
from app.services.downloader import validate_youtube_url
from app.services.vector_store import delete_podcast_chunks
from app.workers.pipeline import process_podcast

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("", response_model=PodcastCreateResponse, status_code=202)
async def create_podcast(
    podcast_data: PodcastCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """
    Add a new podcast by URL.

    This queues the podcast for processing (download, transcribe, embed).
    """
    # Validate URL
    if not validate_youtube_url(podcast_data.url):
        raise HTTPException(status_code=400, detail="Invalid YouTube URL")

    # Check if podcast already exists
    existing = db.query(Podcast).filter(Podcast.url == podcast_data.url).first()
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"Podcast already exists with ID: {existing.id}"
        )

    # Create podcast record
    podcast = Podcast(
        id=generate_uuid(),
        url=podcast_data.url,
        source_type="youtube",
        status="pending",
    )
    db.add(podcast)

    # Create job record
    job = Job(
        id=generate_uuid(),
        podcast_id=podcast.id,
        status="queued",
        current_step="queued",
        progress=0,
    )
    db.add(job)
    db.commit()

    logger.info(f"Created podcast {podcast.id} and job {job.id}")

    # Queue background processing
    background_tasks.add_task(process_podcast, podcast.id, job.id)

    return PodcastCreateResponse(
        id=podcast.id,
        job_id=job.id,
        status="pending",
        message="Podcast queued for processing",
    )


@router.get("", response_model=PodcastListResponse)
async def list_podcasts(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    status: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
):
    """
    List all podcasts with pagination.
    """
    query = db.query(Podcast)

    if status:
        query = query.filter(Podcast.status == status)

    # Get total count
    total = query.count()

    # Apply pagination
    offset = (page - 1) * page_size
    podcasts = query.order_by(Podcast.created_at.desc()).offset(offset).limit(page_size).all()

    return PodcastListResponse(
        items=[PodcastResponse.model_validate(p) for p in podcasts],
        total=total,
        page=page,
        page_size=page_size,
        has_more=(offset + len(podcasts)) < total,
    )


@router.get("/{podcast_id}", response_model=PodcastDetailResponse)
async def get_podcast(
    podcast_id: str,
    db: Session = Depends(get_db),
):
    """
    Get podcast details including transcript.
    """
    podcast = db.query(Podcast).filter(Podcast.id == podcast_id).first()
    if not podcast:
        raise HTTPException(status_code=404, detail="Podcast not found")

    # Build response with relationships
    response_data = {
        "id": podcast.id,
        "url": podcast.url,
        "source_type": podcast.source_type,
        "title": podcast.title,
        "channel": podcast.channel,
        "duration_seconds": podcast.duration_seconds,
        "published_at": podcast.published_at,
        "thumbnail_url": podcast.thumbnail_url,
        "status": podcast.status,
        "error_message": podcast.error_message,
        "created_at": podcast.created_at,
        "updated_at": podcast.updated_at,
        "transcript": None,
        "chunks": [],
    }

    # Add transcript if available
    if podcast.transcript:
        response_data["transcript"] = TranscriptResponse.model_validate(podcast.transcript)

    # Add chunks if available
    if podcast.chunks:
        response_data["chunks"] = [ChunkResponse.model_validate(c) for c in podcast.chunks]

    return PodcastDetailResponse(**response_data)


@router.delete("/{podcast_id}", status_code=204)
async def delete_podcast(
    podcast_id: str,
    db: Session = Depends(get_db),
):
    """
    Delete a podcast and all its data.
    """
    podcast = db.query(Podcast).filter(Podcast.id == podcast_id).first()
    if not podcast:
        raise HTTPException(status_code=404, detail="Podcast not found")

    # Delete from vector store
    try:
        delete_podcast_chunks(podcast_id)
    except Exception as e:
        logger.warning(f"Error deleting chunks from vector store: {e}")

    # Delete podcast (cascade will handle transcript, chunks, jobs)
    db.delete(podcast)
    db.commit()

    logger.info(f"Deleted podcast {podcast_id}")
