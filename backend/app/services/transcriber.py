"""Transcription service using OpenAI Whisper."""

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import whisper

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# Cache for the loaded model
_model_cache: dict[str, whisper.Whisper] = {}


@dataclass
class TranscriptSegment:
    """A segment of transcribed audio."""
    start: float
    end: float
    text: str


@dataclass
class TranscriptionResult:
    """Result of a transcription operation."""
    full_text: str
    segments: list[TranscriptSegment]
    language: str
    word_count: int


class TranscriptionError(Exception):
    """Exception raised when transcription fails."""
    pass


def get_model(model_name: Optional[str] = None) -> whisper.Whisper:
    """
    Get or load a Whisper model.

    Args:
        model_name: Name of the model to load (default from settings)

    Returns:
        Loaded Whisper model
    """
    model_name = model_name or settings.whisper_model

    if model_name not in _model_cache:
        logger.info(f"Loading Whisper model: {model_name}")
        _model_cache[model_name] = whisper.load_model(
            model_name,
            device=settings.whisper_device
        )
        logger.info(f"Whisper model {model_name} loaded")

    return _model_cache[model_name]


async def transcribe_audio(
    audio_path: Path,
    model_name: Optional[str] = None,
    language: Optional[str] = None,
) -> TranscriptionResult:
    """
    Transcribe an audio file using Whisper.

    Args:
        audio_path: Path to the audio file
        model_name: Whisper model to use (default from settings)
        language: Language code (None for auto-detection)

    Returns:
        TranscriptionResult with full text and segments

    Raises:
        TranscriptionError: If transcription fails
    """
    if not audio_path.exists():
        raise TranscriptionError(f"Audio file not found: {audio_path}")

    try:
        logger.info(f"Transcribing: {audio_path}")

        model = get_model(model_name)

        # Transcribe with word timestamps
        result = model.transcribe(
            str(audio_path),
            language=language,
            verbose=False,
            word_timestamps=False,  # Set to True if you need word-level timestamps
        )

        # Extract segments
        segments = []
        for segment in result.get('segments', []):
            segments.append(TranscriptSegment(
                start=segment['start'],
                end=segment['end'],
                text=segment['text'].strip(),
            ))

        full_text = result.get('text', '').strip()
        detected_language = result.get('language', 'unknown')
        word_count = len(full_text.split())

        logger.info(
            f"Transcription complete: {len(segments)} segments, "
            f"{word_count} words, language: {detected_language}"
        )

        return TranscriptionResult(
            full_text=full_text,
            segments=segments,
            language=detected_language,
            word_count=word_count,
        )

    except Exception as e:
        logger.error(f"Transcription error: {e}")
        raise TranscriptionError(f"Transcription failed: {str(e)}")


def segment_to_dict(segment: TranscriptSegment) -> dict:
    """Convert a TranscriptSegment to a dictionary."""
    return {
        'start': segment.start,
        'end': segment.end,
        'text': segment.text,
    }


def segments_to_list(segments: list[TranscriptSegment]) -> list[dict]:
    """Convert a list of TranscriptSegments to a list of dictionaries."""
    return [segment_to_dict(s) for s in segments]
