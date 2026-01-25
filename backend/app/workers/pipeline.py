"""Background processing pipeline for podcast ingestion."""

import asyncio
import logging
from datetime import datetime
from pathlib import Path
from typing import Optional

from sqlalchemy.orm import Session

from app.config import get_settings
from app.models.database import Podcast, Transcript, Chunk, Job, SessionLocal
from app.services.downloader import download_audio, delete_audio_file, DownloadError
from app.services.transcriber import transcribe_audio, segments_to_list, TranscriptionError
from app.services.chunker import chunk_by_time, Chunk as ChunkData
from app.services.vector_store import add_chunks

logger = logging.getLogger(__name__)
settings = get_settings()

# Track active jobs for concurrency limiting
_active_jobs: set[str] = set()
_job_lock = asyncio.Lock()


async def can_start_job() -> bool:
    """Check if we can start a new job based on concurrency limit."""
    async with _job_lock:
        return len(_active_jobs) < settings.max_concurrent_jobs


async def register_job(job_id: str) -> bool:
    """Register a job as active. Returns False if at capacity."""
    async with _job_lock:
        if len(_active_jobs) >= settings.max_concurrent_jobs:
            return False
        _active_jobs.add(job_id)
        return True


async def unregister_job(job_id: str) -> None:
    """Unregister a job when complete."""
    async with _job_lock:
        _active_jobs.discard(job_id)


def update_job_status(
    db: Session,
    job_id: str,
    status: str,
    current_step: Optional[str] = None,
    progress: Optional[int] = None,
    error_message: Optional[str] = None,
) -> None:
    """Update job status in database."""
    job = db.query(Job).filter(Job.id == job_id).first()
    if job:
        job.status = status
        if current_step is not None:
            job.current_step = current_step
        if progress is not None:
            job.progress = progress
        if error_message is not None:
            job.error_message = error_message
        if status == "running" and job.started_at is None:
            job.started_at = datetime.utcnow()
        if status in ("completed", "failed"):
            job.completed_at = datetime.utcnow()
        db.commit()


def update_podcast_status(
    db: Session,
    podcast_id: str,
    status: str,
    error_message: Optional[str] = None,
) -> None:
    """Update podcast status in database."""
    podcast = db.query(Podcast).filter(Podcast.id == podcast_id).first()
    if podcast:
        podcast.status = status
        if error_message is not None:
            podcast.error_message = error_message
        podcast.updated_at = datetime.utcnow()
        db.commit()


async def process_podcast(podcast_id: str, job_id: str) -> None:
    """
    Main pipeline to process a podcast.

    Steps:
    1. Download audio
    2. Transcribe audio
    3. Chunk transcript
    4. Generate embeddings and store in ChromaDB
    """
    db = SessionLocal()

    try:
        # Register job
        if not await register_job(job_id):
            logger.warning(f"Job {job_id} waiting for capacity")
            # Wait for capacity
            while not await can_start_job():
                await asyncio.sleep(5)
            await register_job(job_id)

        # Get podcast
        podcast = db.query(Podcast).filter(Podcast.id == podcast_id).first()
        if not podcast:
            logger.error(f"Podcast {podcast_id} not found")
            return

        logger.info(f"Starting processing pipeline for podcast {podcast_id}")

        # Step 1: Download
        update_job_status(db, job_id, "running", "downloading", 10)
        update_podcast_status(db, podcast_id, "downloading")

        try:
            result = await download_audio(podcast.url, podcast_id)

            # Update podcast with metadata
            podcast.title = result.title
            podcast.channel = result.channel
            podcast.duration_seconds = result.duration_seconds
            podcast.published_at = result.published_at
            podcast.thumbnail_url = result.thumbnail_url
            podcast.audio_path = str(result.audio_path)
            db.commit()

            logger.info(f"Downloaded: {result.title}")

        except DownloadError as e:
            logger.error(f"Download failed: {e}")
            update_job_status(db, job_id, "failed", error_message=str(e))
            update_podcast_status(db, podcast_id, "error", str(e))
            return

        # Step 2: Transcribe
        update_job_status(db, job_id, "running", "transcribing", 30)
        update_podcast_status(db, podcast_id, "transcribing")

        try:
            audio_path = Path(podcast.audio_path)
            transcription = await transcribe_audio(audio_path)

            # Store transcript
            transcript = Transcript(
                podcast_id=podcast_id,
                full_text=transcription.full_text,
                segments=segments_to_list(transcription.segments),
                word_count=transcription.word_count,
            )
            db.add(transcript)
            db.commit()

            logger.info(f"Transcribed: {transcription.word_count} words")

        except TranscriptionError as e:
            logger.error(f"Transcription failed: {e}")
            update_job_status(db, job_id, "failed", error_message=str(e))
            update_podcast_status(db, podcast_id, "error", str(e))
            return

        # Step 3: Chunk
        update_job_status(db, job_id, "running", "chunking", 60)

        chunks_data = chunk_by_time(transcription.segments, window_seconds=30.0)
        logger.info(f"Created {len(chunks_data)} chunks")

        # Step 4: Embed and store
        update_job_status(db, job_id, "running", "embedding", 80)

        # Prepare chunks for vector store
        chunks_for_store = [
            {
                'text': chunk.text,
                'start_time': chunk.start_time,
                'end_time': chunk.end_time,
            }
            for chunk in chunks_data
        ]

        # Add to vector store
        chroma_ids = add_chunks(chunks_for_store, podcast_id, podcast.title)

        # Store chunk metadata in SQLite
        for i, chunk in enumerate(chunks_data):
            chunk_record = Chunk(
                podcast_id=podcast_id,
                text=chunk.text,
                start_time=chunk.start_time,
                end_time=chunk.end_time,
                token_count=chunk.token_count,
                chroma_id=chroma_ids[i] if i < len(chroma_ids) else None,
            )
            db.add(chunk_record)

        db.commit()
        logger.info(f"Stored {len(chroma_ids)} chunks in vector store")

        # Cleanup audio if configured
        if settings.delete_audio_after_transcription:
            delete_audio_file(audio_path)
            podcast.audio_path = None
            db.commit()

        # Complete!
        update_job_status(db, job_id, "completed", "done", 100)
        update_podcast_status(db, podcast_id, "ready")

        logger.info(f"Podcast {podcast_id} processing complete!")

    except Exception as e:
        logger.exception(f"Unexpected error processing podcast {podcast_id}")
        update_job_status(db, job_id, "failed", error_message=str(e))
        update_podcast_status(db, podcast_id, "error", str(e))

    finally:
        await unregister_job(job_id)
        db.close()
