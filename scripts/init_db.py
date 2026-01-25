#!/usr/bin/env python3
"""Initialize the database."""

import sys
from pathlib import Path

# Add backend to path
backend_path = Path(__file__).parent.parent / "backend"
sys.path.insert(0, str(backend_path))

from app.models.database import init_db, engine, Base
from app.config import get_settings


def main():
    """Initialize the database."""
    settings = get_settings()

    print(f"Initializing database at: {settings.database_url}")

    # Ensure data directory exists
    data_dir = Path("data")
    data_dir.mkdir(exist_ok=True)

    # Create all tables
    init_db()

    print("Database initialized successfully!")
    print(f"Tables created: {', '.join(Base.metadata.tables.keys())}")


if __name__ == "__main__":
    main()
