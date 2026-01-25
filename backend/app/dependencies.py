"""Shared dependencies for FastAPI routes."""

from typing import Generator
from sqlalchemy.orm import Session

from app.models.database import SessionLocal


def get_db() -> Generator[Session, None, None]:
    """Get a database session dependency."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
