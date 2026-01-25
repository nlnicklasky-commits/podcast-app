"""Job status API endpoints."""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.dependencies import get_db
from app.models.database import Job
from app.models.schemas import JobResponse

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/{job_id}", response_model=JobResponse)
async def get_job(
    job_id: str,
    db: Session = Depends(get_db),
):
    """
    Get job status by ID.
    """
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    return JobResponse.model_validate(job)


@router.get("", response_model=list[JobResponse])
async def list_jobs(
    status: Optional[str] = Query(default=None),
    podcast_id: Optional[str] = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """
    List jobs with optional filters.
    """
    query = db.query(Job)

    if status:
        query = query.filter(Job.status == status)
    if podcast_id:
        query = query.filter(Job.podcast_id == podcast_id)

    jobs = query.order_by(Job.created_at.desc()).limit(limit).all()

    return [JobResponse.model_validate(job) for job in jobs]
