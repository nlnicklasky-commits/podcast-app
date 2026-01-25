"""Pydantic schemas for API request/response validation."""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, HttpUrl


# === Podcast Schemas ===

class PodcastCreate(BaseModel):
    """Schema for creating a new podcast."""
    url: str = Field(..., description="YouTube URL of the podcast")


class PodcastBase(BaseModel):
    """Base podcast schema with common fields."""
    id: str
    url: str
    source_type: str
    title: Optional[str] = None
    channel: Optional[str] = None
    duration_seconds: Optional[int] = None
    published_at: Optional[datetime] = None
    thumbnail_url: Optional[str] = None
    status: str
    error_message: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class PodcastResponse(PodcastBase):
    """Schema for podcast response."""
    pass


class PodcastCreateResponse(BaseModel):
    """Schema for podcast creation response."""
    id: str
    job_id: str
    status: str
    message: str


class PodcastListResponse(BaseModel):
    """Schema for paginated podcast list."""
    items: list[PodcastResponse]
    total: int
    page: int
    page_size: int
    has_more: bool


# === Transcript Schemas ===

class TranscriptSegment(BaseModel):
    """Schema for a transcript segment."""
    start: float
    end: float
    text: str


class TranscriptResponse(BaseModel):
    """Schema for transcript response."""
    id: str
    podcast_id: str
    full_text: str
    segments: list[TranscriptSegment]
    word_count: Optional[int] = None
    created_at: datetime

    class Config:
        from_attributes = True


# === Chunk Schemas ===

class ChunkResponse(BaseModel):
    """Schema for a chunk response."""
    id: str
    podcast_id: str
    text: str
    start_time: Optional[float] = None
    end_time: Optional[float] = None
    token_count: Optional[int] = None

    class Config:
        from_attributes = True


# === Podcast Detail Schema ===

class PodcastDetailResponse(PodcastBase):
    """Schema for detailed podcast response including transcript."""
    transcript: Optional[TranscriptResponse] = None
    chunks: list[ChunkResponse] = []

    class Config:
        from_attributes = True


# === Search Schemas ===

class SearchRequest(BaseModel):
    """Schema for search request."""
    query: str = Field(..., min_length=1, description="Search query")
    limit: int = Field(default=10, ge=1, le=50, description="Number of results to return")
    podcast_id: Optional[str] = Field(default=None, description="Filter by podcast ID")


class SearchResult(BaseModel):
    """Schema for a single search result."""
    chunk_id: str
    podcast_id: str
    podcast_title: Optional[str] = None
    text: str
    start_time: Optional[float] = None
    end_time: Optional[float] = None
    score: float


class SearchResponse(BaseModel):
    """Schema for search response."""
    results: list[SearchResult]
    total: int


# === Job Schemas ===

class JobResponse(BaseModel):
    """Schema for job status response."""
    id: str
    podcast_id: str
    status: str
    current_step: Optional[str] = None
    progress: int
    error_message: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


# === Insight Schemas (Phase 2) ===

class InsightResponse(BaseModel):
    """Schema for AI-generated insights."""
    id: str
    podcast_id: str
    short_summary: Optional[str] = None
    long_summary: Optional[str] = None
    topics: Optional[list[str]] = None
    entities: Optional[dict] = None
    key_points: Optional[list[str]] = None
    created_at: datetime

    class Config:
        from_attributes = True


# === Chat Schemas (Phase 3) ===

class ChatRequest(BaseModel):
    """Schema for chat request."""
    message: str = Field(..., min_length=1, description="User message")
    conversation_id: Optional[str] = Field(default=None, description="Existing conversation ID")
    podcast_id: Optional[str] = Field(default=None, description="Scope to specific podcast")


class SourceCitation(BaseModel):
    """Schema for source citation in chat response."""
    podcast_id: str
    podcast_title: Optional[str] = None
    chunk_id: str
    start_time: Optional[float] = None
    text_preview: str


class ChatMessageResponse(BaseModel):
    """Schema for a chat message."""
    id: str
    role: str
    content: str
    sources: Optional[list[SourceCitation]] = None
    created_at: datetime

    class Config:
        from_attributes = True


class ChatResponse(BaseModel):
    """Schema for chat response."""
    conversation_id: str
    message: ChatMessageResponse


class ConversationResponse(BaseModel):
    """Schema for conversation."""
    id: str
    title: Optional[str] = None
    podcast_id: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    messages: list[ChatMessageResponse] = []

    class Config:
        from_attributes = True


class ConversationListResponse(BaseModel):
    """Schema for conversation list."""
    items: list[ConversationResponse]
    total: int
