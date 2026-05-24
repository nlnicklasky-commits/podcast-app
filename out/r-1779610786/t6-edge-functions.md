# Edge Function Improvements Summary

## Files Changed

| File | Lines (before) | Lines (after) |
|------|----------------|---------------|
| `supabase/functions/process-podcast/index.ts` | 601 | ~640 |
| `supabase/functions/chat/index.ts` | 197 | ~270 |
| `supabase/functions/podcast-search/index.ts` | 100 | ~155 |
| `supabase/functions/podcast-episodes/index.ts` | 153 | ~210 |

## 1. Constants Extracted

### process-podcast
- `WHISPER_MODEL` = `"whisper-large-v3"`
- `EMBEDDING_MODEL` = `"text-embedding-3-small"`
- `INSIGHTS_MODEL` = `"llama-3.3-70b-versatile"`
- `MAX_AUDIO_SIZE_BYTES` = `25 * 1024 * 1024` (was inline `25 * 1024 * 1024`)
- `CHUNK_MAX_TOKENS` = `500` (was local `MAX_TOKENS`)
- `CHUNK_TARGET_TOKENS` = `300` (was local `TARGET_TOKENS`)
- `EMBEDDING_BATCH_SIZE` = `20` (was local `BATCH_SIZE`)
- `INSIGHTS_MAX_CHARS` = `80_000` (was inline `80000`)
- `INSIGHTS_MAX_TOKENS` = `4096` (was inline)
- `PROGRESS` object: `DOWNLOAD_START`, `DOWNLOAD_COBALT_URL`, `DOWNLOAD_COMPLETE`, `UPLOAD_COMPLETE`, `TRANSCRIBE_COMPLETE`, `CHUNK_EMBED_START`, `CHUNK_EMBED_END`, `INSIGHTS_START`, `DONE` (was inline magic numbers: 0, 5, 15, 30, 55, 90, 100)
- Timeouts: `TIMEOUT_AUDIO_DOWNLOAD` (5min), `TIMEOUT_COBALT_API` (2min), `TIMEOUT_TRANSCRIPTION` (5min), `TIMEOUT_EMBEDDING` (2min), `TIMEOUT_INSIGHTS` (2min), `TIMEOUT_TRANSCRIPT_FETCH` (2min)

### chat
- `EMBEDDING_MODEL` = `"text-embedding-3-small"`
- `CHAT_MODEL` = `"llama-3.3-70b-versatile"`
- `MAX_CHUNKS` = `10` (was inline)
- `SIMILARITY_THRESHOLD` = `0.3` (was inline)
- `MAX_HISTORY_MESSAGES` = `20` (was inline)
- `CHAT_MAX_TOKENS` = `2048` (was inline)
- `SOURCE_PREVIEW_LENGTH` = `200` (was inline)
- `SYSTEM_PROMPT_TEMPLATE` (was inline string)
- Timeouts: `TIMEOUT_EMBEDDING` (2min), `TIMEOUT_CHAT` (2min)

### podcast-search
- `MAX_RESULTS` = `12` (was inline `"12"`)
- `TIMEOUT_PODCAST_INDEX` = `30_000` (30s)

### podcast-episodes
- `MAX_EPISODES` = `50` (was inline `"50"`)
- `TIMEOUT_PODCAST_INDEX` = `30_000` (30s)
- `TIMEOUT_RSS_FEED` = `30_000` (30s)

## 2. Error Codes Added

### process-podcast (`ErrorCode` enum)
`MISSING_PARAM`, `NOT_FOUND`, `CONFIG_ERROR`, `AUDIO_TOO_LARGE`, `DOWNLOAD_FAILED`, `DOWNLOAD_TIMEOUT`, `UPLOAD_FAILED`, `TRANSCRIPTION_FAILED`, `TRANSCRIPTION_TIMEOUT`, `TRANSCRIPT_FETCH_FAILED`, `EMBEDDING_FAILED`, `EMBEDDING_TIMEOUT`, `INSIGHTS_FAILED`, `INSIGHTS_TIMEOUT`, `CANCELLED`, `INTERNAL_ERROR`

### chat (`ErrorCode` enum)
`MISSING_PARAM`, `NOT_FOUND`, `CONFIG_ERROR`, `EMBEDDING_FAILED`, `EMBEDDING_TIMEOUT`, `SEARCH_FAILED`, `CHAT_FAILED`, `CHAT_TIMEOUT`, `INTERNAL_ERROR`

### podcast-search (`ErrorCode` enum)
`MISSING_PARAM`, `CONFIG_ERROR`, `PODCAST_INDEX_FAILED`, `PODCAST_INDEX_TIMEOUT`, `INTERNAL_ERROR`

### podcast-episodes (`ErrorCode` enum)
`MISSING_PARAM`, `CONFIG_ERROR`, `PODCAST_INDEX_FAILED`, `PODCAST_INDEX_TIMEOUT`, `INTERNAL_ERROR`

## 3. HTTP Status Codes

All four functions now return appropriate status codes instead of blanket 500:

| Status | When |
|--------|------|
| 200 | Success |
| 400 | Missing/invalid request parameters (`podcast_id`, `query`, `feed_id`, `knowledge_base_id`, `question`) |
| 404 | Podcast not found by ID (process-podcast) |
| 422 | Unprocessable content: audio too large, download failures, transcript fetch failures |
| 500 | Internal errors: API key missing, transcription/embedding/insight failures, timeouts on server-side services |

## 4. Timeouts Implemented

All external `fetch` calls now use `AbortController` via a shared `fetchWithTimeout` helper.

| External call | Timeout | File(s) |
|---------------|---------|---------|
| Audio download (RSS enclosure) | 5 min | process-podcast |
| Cobalt API request | 2 min | process-podcast |
| Audio download from Cobalt URL | 5 min | process-podcast |
| Groq Whisper transcription | 5 min | process-podcast |
| OpenAI embeddings | 2 min | process-podcast, chat |
| Groq insights generation | 2 min | process-podcast |
| Transcript fetch from RSS | 2 min | process-podcast |
| Groq chat completion | 2 min | chat |
| Podcast Index API | 30 sec | podcast-search, podcast-episodes |
| RSS feed fetch | 30 sec | podcast-episodes |

Timeout errors are caught and mapped to specific error codes (e.g., `TRANSCRIPTION_TIMEOUT`, `EMBEDDING_TIMEOUT`).

## 5. Logging Improvements

- **process-podcast**: All `console.log` calls now include `[podcast_id]` and `[step]` prefix for structured filtering. Error log entries in `processing_logs` table now include the error code: `[EMBEDDING_FAILED] OpenAI embeddings error: 429 ...`.
- **chat**: Errors logged with `console.error` including error object for stack traces.
- **podcast-search / podcast-episodes**: Timeout errors logged with descriptive messages. RSS feed timeout in podcast-episodes explicitly noted as non-fatal.

## 6. Error Response Format

All functions now use a consistent JSON error shape:

```json
{ "error": "Human-readable message", "code": "MACHINE_READABLE_CODE" }
```

Implemented via a shared `errorResponse(message, code, status)` helper in each file. Error codes are attached to thrown errors via `Object.assign` so the top-level catch handler can extract them for the response.
