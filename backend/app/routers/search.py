"""Search API endpoints."""

import logging

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.dependencies import get_db
from app.models.database import Podcast
from app.models.schemas import SearchRequest, SearchResponse, SearchResult
from app.services.vector_store import search as vector_search

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("", response_model=SearchResponse)
async def search(
    request: SearchRequest,
    db: Session = Depends(get_db),
):
    """
    Perform semantic search across podcast transcripts.
    """
    # Search vector store
    results = vector_search(
        query=request.query,
        limit=request.limit,
        podcast_id=request.podcast_id,
    )

    # Enrich results with podcast titles if not present
    formatted_results = []
    podcast_cache = {}

    for result in results:
        podcast_id = result.get('podcast_id')

        # Get podcast title if not in result
        podcast_title = result.get('podcast_title')
        if not podcast_title and podcast_id:
            if podcast_id not in podcast_cache:
                podcast = db.query(Podcast).filter(Podcast.id == podcast_id).first()
                podcast_cache[podcast_id] = podcast.title if podcast else None
            podcast_title = podcast_cache.get(podcast_id)

        formatted_results.append(SearchResult(
            chunk_id=result['chunk_id'],
            podcast_id=podcast_id,
            podcast_title=podcast_title,
            text=result['text'],
            start_time=result.get('start_time'),
            end_time=result.get('end_time'),
            score=result['score'],
        ))

    return SearchResponse(
        results=formatted_results,
        total=len(formatted_results),
    )
