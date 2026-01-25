"""SQLAlchemy database models."""

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import (
    Column,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    Float,
    Boolean,
    DateTime,
    JSON,
    create_engine,
)
from sqlalchemy.orm import (
    DeclarativeBase,
    Mapped,
    mapped_column,
    relationship,
    sessionmaker,
)

from app.config import get_settings


def generate_uuid() -> str:
    """Generate a UUID string."""
    return str(uuid.uuid4())


class Base(DeclarativeBase):
    """Base class for all models."""
    pass


class Podcast(Base):
    """Podcast metadata model."""

    __tablename__ = "podcasts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    url: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    source_type: Mapped[str] = mapped_column(String(20), default="youtube")
    title: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    channel: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    duration_seconds: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    published_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    thumbnail_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    audio_path: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    # Relationships
    transcript: Mapped[Optional["Transcript"]] = relationship(
        "Transcript", back_populates="podcast", uselist=False, cascade="all, delete-orphan"
    )
    insights: Mapped[Optional["Insight"]] = relationship(
        "Insight", back_populates="podcast", uselist=False, cascade="all, delete-orphan"
    )
    chunks: Mapped[list["Chunk"]] = relationship(
        "Chunk", back_populates="podcast", cascade="all, delete-orphan"
    )
    jobs: Mapped[list["Job"]] = relationship(
        "Job", back_populates="podcast", cascade="all, delete-orphan"
    )
    conversations: Mapped[list["Conversation"]] = relationship(
        "Conversation", back_populates="podcast"
    )

    __table_args__ = (
        Index("idx_podcasts_status", "status"),
        Index("idx_podcasts_created", "created_at"),
    )


class Transcript(Base):
    """Transcript model."""

    __tablename__ = "transcripts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    podcast_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("podcasts.id", ondelete="CASCADE"), nullable=False
    )
    full_text: Mapped[str] = mapped_column(Text, nullable=False)
    segments: Mapped[dict] = mapped_column(JSON, nullable=False)
    word_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Relationships
    podcast: Mapped["Podcast"] = relationship("Podcast", back_populates="transcript")


class Insight(Base):
    """AI-generated insights model."""

    __tablename__ = "insights"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    podcast_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("podcasts.id", ondelete="CASCADE"), nullable=False
    )
    short_summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    long_summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    topics: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    entities: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    key_points: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Relationships
    podcast: Mapped["Podcast"] = relationship("Podcast", back_populates="insights")


class Chunk(Base):
    """Transcript chunk for vector search."""

    __tablename__ = "chunks"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    podcast_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("podcasts.id", ondelete="CASCADE"), nullable=False
    )
    text: Mapped[str] = mapped_column(Text, nullable=False)
    start_time: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    end_time: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    token_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    chroma_id: Mapped[Optional[str]] = mapped_column(String(36), unique=True, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Relationships
    podcast: Mapped["Podcast"] = relationship("Podcast", back_populates="chunks")

    __table_args__ = (
        Index("idx_chunks_podcast", "podcast_id"),
        Index("idx_chunks_chroma", "chroma_id"),
    )


class Conversation(Base):
    """Conversation for chat feature."""

    __tablename__ = "conversations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    title: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    podcast_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("podcasts.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    # Relationships
    podcast: Mapped[Optional["Podcast"]] = relationship(
        "Podcast", back_populates="conversations"
    )
    messages: Mapped[list["Message"]] = relationship(
        "Message", back_populates="conversation", cascade="all, delete-orphan"
    )


class Message(Base):
    """Chat message model."""

    __tablename__ = "messages"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    conversation_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False
    )
    role: Mapped[str] = mapped_column(String(20), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    sources: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Relationships
    conversation: Mapped["Conversation"] = relationship(
        "Conversation", back_populates="messages"
    )

    __table_args__ = (
        Index("idx_messages_conversation", "conversation_id"),
    )


class Job(Base):
    """Processing job model."""

    __tablename__ = "jobs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    podcast_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("podcasts.id", ondelete="CASCADE"), nullable=False
    )
    status: Mapped[str] = mapped_column(String(20), default="queued")
    current_step: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    progress: Mapped[int] = mapped_column(Integer, default=0)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Relationships
    podcast: Mapped["Podcast"] = relationship("Podcast", back_populates="jobs")

    __table_args__ = (
        Index("idx_jobs_podcast", "podcast_id"),
        Index("idx_jobs_status", "status"),
    )


# Database setup
settings = get_settings()
engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False} if "sqlite" in settings.database_url else {},
    echo=False,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def init_db() -> None:
    """Initialize the database by creating all tables."""
    Base.metadata.create_all(bind=engine)


def get_db():
    """Get a database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
