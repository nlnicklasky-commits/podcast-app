"""Text chunking service for creating searchable segments."""

import logging
import re
from dataclasses import dataclass
from typing import Optional

from app.services.transcriber import TranscriptSegment

logger = logging.getLogger(__name__)


@dataclass
class Chunk:
    """A chunk of text with timestamp information."""
    text: str
    start_time: float
    end_time: float
    token_count: int


def estimate_tokens(text: str) -> int:
    """
    Estimate the number of tokens in a text.

    Uses a simple approximation: ~4 characters per token for English.

    Args:
        text: Text to estimate tokens for

    Returns:
        Estimated token count
    """
    return len(text) // 4


def chunk_by_time(
    segments: list[TranscriptSegment],
    window_seconds: float = 30.0,
) -> list[Chunk]:
    """
    Chunk transcript segments by time windows.

    This is the basic Phase 1 chunking strategy that groups segments
    into fixed time windows.

    Args:
        segments: List of transcript segments with timestamps
        window_seconds: Target duration of each chunk in seconds

    Returns:
        List of Chunks with combined text and timestamp ranges
    """
    if not segments:
        return []

    chunks = []
    current_texts = []
    current_start = segments[0].start
    current_end = segments[0].start

    for segment in segments:
        # Check if adding this segment would exceed the time window
        if segment.start - current_start >= window_seconds and current_texts:
            # Create chunk from accumulated segments
            combined_text = ' '.join(current_texts)
            chunks.append(Chunk(
                text=combined_text,
                start_time=current_start,
                end_time=current_end,
                token_count=estimate_tokens(combined_text),
            ))
            # Start new chunk
            current_texts = [segment.text]
            current_start = segment.start
            current_end = segment.end
        else:
            # Add to current chunk
            current_texts.append(segment.text)
            current_end = segment.end

    # Don't forget the last chunk
    if current_texts:
        combined_text = ' '.join(current_texts)
        chunks.append(Chunk(
            text=combined_text,
            start_time=current_start,
            end_time=current_end,
            token_count=estimate_tokens(combined_text),
        ))

    logger.info(f"Created {len(chunks)} chunks from {len(segments)} segments")
    return chunks


def split_into_sentences(text: str) -> list[str]:
    """
    Split text into sentences.

    Args:
        text: Text to split

    Returns:
        List of sentences
    """
    # Simple sentence splitting on common sentence terminators
    # followed by space and capital letter or end of string
    sentence_pattern = r'(?<=[.!?])\s+(?=[A-Z])|(?<=[.!?])$'
    sentences = re.split(sentence_pattern, text)
    return [s.strip() for s in sentences if s.strip()]


def chunk_smart(
    segments: list[TranscriptSegment],
    target_tokens: int = 400,
    max_tokens: int = 600,
    overlap_sentences: int = 1,
) -> list[Chunk]:
    """
    Smart chunking that respects sentence boundaries.

    This is the Phase 2 chunking strategy that:
    - Groups consecutive segments until reaching target_tokens
    - Breaks at sentence boundaries
    - Includes timestamp range for each chunk
    - Overlaps by overlap_sentences for context continuity

    Args:
        segments: List of transcript segments with timestamps
        target_tokens: Target token count per chunk
        max_tokens: Maximum token count per chunk
        overlap_sentences: Number of sentences to overlap between chunks

    Returns:
        List of Chunks with combined text and timestamp ranges
    """
    if not segments:
        return []

    # First, combine all text and track timestamps
    combined_entries = []
    for segment in segments:
        sentences = split_into_sentences(segment.text)
        for sentence in sentences:
            combined_entries.append({
                'text': sentence,
                'start': segment.start,
                'end': segment.end,
            })

    if not combined_entries:
        return []

    chunks = []
    current_entries = []
    current_tokens = 0
    overlap_buffer = []

    for entry in combined_entries:
        entry_tokens = estimate_tokens(entry['text'])

        # Check if we should start a new chunk
        if current_tokens + entry_tokens > target_tokens and current_entries:
            # We've exceeded target, but check if it's still under max
            if current_tokens + entry_tokens <= max_tokens:
                # Add this entry and then create chunk
                current_entries.append(entry)
                current_tokens += entry_tokens

            # Create chunk
            combined_text = ' '.join(e['text'] for e in current_entries)
            chunks.append(Chunk(
                text=combined_text,
                start_time=current_entries[0]['start'],
                end_time=current_entries[-1]['end'],
                token_count=estimate_tokens(combined_text),
            ))

            # Save overlap entries for next chunk
            overlap_buffer = current_entries[-overlap_sentences:] if overlap_sentences > 0 else []

            # Start new chunk with overlap
            if current_tokens + entry_tokens > max_tokens:
                # We didn't add this entry, start fresh with it
                current_entries = overlap_buffer + [entry]
            else:
                # We added the entry, start with overlap only
                current_entries = overlap_buffer.copy()

            current_tokens = sum(estimate_tokens(e['text']) for e in current_entries)
        else:
            current_entries.append(entry)
            current_tokens += entry_tokens

    # Don't forget the last chunk
    if current_entries:
        combined_text = ' '.join(e['text'] for e in current_entries)
        chunks.append(Chunk(
            text=combined_text,
            start_time=current_entries[0]['start'],
            end_time=current_entries[-1]['end'],
            token_count=estimate_tokens(combined_text),
        ))

    logger.info(f"Smart chunking created {len(chunks)} chunks from {len(segments)} segments")
    return chunks


def chunk_to_dict(chunk: Chunk) -> dict:
    """Convert a Chunk to a dictionary."""
    return {
        'text': chunk.text,
        'start_time': chunk.start_time,
        'end_time': chunk.end_time,
        'token_count': chunk.token_count,
    }
