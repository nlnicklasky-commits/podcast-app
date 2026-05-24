-- Add transcript_url column for pre-existing transcripts from RSS feeds
ALTER TABLE podcasts ADD COLUMN transcript_url text;
