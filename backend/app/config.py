"""Application configuration using pydantic-settings."""

from functools import lru_cache
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

# Project root directory (podcast-app/)
PROJECT_ROOT = Path(__file__).parent.parent.parent
DATA_DIR = PROJECT_ROOT / "data"


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

    # API Keys
    anthropic_api_key: str = ""

    # Whisper Settings
    whisper_model: str = "base"
    whisper_device: str = "cpu"

    # Embedding Settings
    embedding_model: str = "all-MiniLM-L6-v2"

    # Storage Paths - use absolute paths based on project root
    database_url: str = f"sqlite:///{DATA_DIR / 'podcasts.db'}"
    chroma_path: str = str(DATA_DIR / "chroma")
    audio_path: str = str(DATA_DIR / "audio")

    # Processing Settings
    max_concurrent_jobs: int = 2
    delete_audio_after_transcription: bool = False
    max_podcast_duration_hours: int = 4

    # Chat Settings
    chat_model: str = "claude-haiku"
    ollama_base_url: str = "http://localhost:11434"

    # Server Settings
    host: str = "0.0.0.0"
    port: int = 8000
    frontend_url: str = "http://localhost:5173"

    @property
    def audio_dir(self) -> Path:
        """Get the audio directory as a Path object."""
        path = Path(self.audio_path)
        path.mkdir(parents=True, exist_ok=True)
        return path

    @property
    def chroma_dir(self) -> Path:
        """Get the ChromaDB directory as a Path object."""
        path = Path(self.chroma_path)
        path.mkdir(parents=True, exist_ok=True)
        return path

    @property
    def data_dir(self) -> Path:
        """Get the data directory as a Path object."""
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        return DATA_DIR

    @property
    def max_duration_seconds(self) -> int:
        """Get max podcast duration in seconds."""
        return self.max_podcast_duration_hours * 3600


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
