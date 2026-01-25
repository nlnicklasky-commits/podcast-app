"""Audio downloader service using yt-dlp."""

import logging
import re
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Optional

import yt_dlp

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


@dataclass
class DownloadResult:
    """Result of a download operation."""
    audio_path: Path
    title: str
    channel: str
    duration_seconds: int
    published_at: Optional[datetime]
    thumbnail_url: Optional[str]
    video_id: str


class DownloadError(Exception):
    """Exception raised when download fails."""
    pass


def validate_youtube_url(url: str) -> bool:
    """
    Validate that the URL is a valid YouTube URL.

    Args:
        url: URL to validate

    Returns:
        True if valid, False otherwise
    """
    youtube_patterns = [
        r'^https?://(?:www\.)?youtube\.com/watch\?v=[\w-]+',
        r'^https?://(?:www\.)?youtube\.com/v/[\w-]+',
        r'^https?://youtu\.be/[\w-]+',
        r'^https?://(?:www\.)?youtube\.com/embed/[\w-]+',
        r'^https?://(?:www\.)?youtube\.com/shorts/[\w-]+',
    ]

    for pattern in youtube_patterns:
        if re.match(pattern, url):
            return True
    return False


def extract_video_id(url: str) -> Optional[str]:
    """
    Extract video ID from a YouTube URL.

    Args:
        url: YouTube URL

    Returns:
        Video ID or None if not found
    """
    patterns = [
        r'(?:v=|/v/|youtu\.be/|/embed/|/shorts/)([^&?#]+)',
    ]

    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    return None


async def download_audio(url: str, podcast_id: str) -> DownloadResult:
    """
    Download audio from a YouTube URL.

    Args:
        url: YouTube URL to download from
        podcast_id: Unique ID for the podcast (used for filename)

    Returns:
        DownloadResult with audio path and metadata

    Raises:
        DownloadError: If download fails or URL is invalid
    """
    if not validate_youtube_url(url):
        raise DownloadError(f"Invalid YouTube URL: {url}")

    video_id = extract_video_id(url)
    if not video_id:
        raise DownloadError(f"Could not extract video ID from URL: {url}")

    output_dir = settings.audio_dir
    output_path = output_dir / f"{podcast_id}.mp3"

    ydl_opts = {
        'format': 'bestaudio/best',
        'postprocessors': [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'mp3',
            'preferredquality': '128',
        }],
        'outtmpl': str(output_dir / f"{podcast_id}.%(ext)s"),
        'quiet': True,
        'no_warnings': True,
        'extract_flat': False,
    }

    try:
        logger.info(f"Downloading audio from {url}")

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            # First, extract info without downloading to check duration
            info = ydl.extract_info(url, download=False)

            if not info:
                raise DownloadError("Could not extract video information")

            duration = info.get('duration', 0)
            if duration > settings.max_duration_seconds:
                max_hours = settings.max_podcast_duration_hours
                raise DownloadError(
                    f"Video duration ({duration // 3600}h {(duration % 3600) // 60}m) "
                    f"exceeds maximum allowed ({max_hours}h)"
                )

            # Now download
            ydl.download([url])

        # Parse metadata
        title = info.get('title', 'Unknown Title')
        channel = info.get('uploader', info.get('channel', 'Unknown Channel'))
        duration_seconds = info.get('duration', 0)
        thumbnail_url = info.get('thumbnail')

        # Parse upload date
        published_at = None
        upload_date = info.get('upload_date')
        if upload_date:
            try:
                published_at = datetime.strptime(upload_date, '%Y%m%d')
            except ValueError:
                pass

        logger.info(f"Downloaded: {title} ({duration_seconds}s)")

        return DownloadResult(
            audio_path=output_path,
            title=title,
            channel=channel,
            duration_seconds=duration_seconds,
            published_at=published_at,
            thumbnail_url=thumbnail_url,
            video_id=video_id,
        )

    except yt_dlp.utils.DownloadError as e:
        logger.error(f"yt-dlp download error: {e}")
        raise DownloadError(f"Failed to download: {str(e)}")
    except Exception as e:
        logger.error(f"Unexpected error during download: {e}")
        raise DownloadError(f"Download failed: {str(e)}")


def delete_audio_file(audio_path: Path) -> bool:
    """
    Delete an audio file.

    Args:
        audio_path: Path to the audio file

    Returns:
        True if deleted, False otherwise
    """
    try:
        if audio_path.exists():
            audio_path.unlink()
            logger.info(f"Deleted audio file: {audio_path}")
            return True
        return False
    except Exception as e:
        logger.error(f"Error deleting audio file {audio_path}: {e}")
        return False
