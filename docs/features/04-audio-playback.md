# Feature 04 — Audio Playback with Transcript Sync

## 1. Overview

Audio Playback with Transcript Sync adds a persistent audio player to PodBrain that streams podcast episodes and synchronizes playback with the existing transcript view. As audio plays, the corresponding transcript segment highlights and auto-scrolls into view. Clicking any transcript line seeks playback to that moment. The result is a Descript / Otter.ai-style reading experience layered onto the existing knowledge base workflow.

**Why it matters:** PodBrain already extracts transcripts, insights, and embeddings from podcasts, but there is no way to _listen_ to the source audio while reviewing that data. Transcript sync closes the loop — users can verify AI-generated insights against the original audio, re-listen to key moments surfaced by RAG chat citations, and consume podcasts in a read-along format that improves comprehension and retention.

**Reference products:**
- **Descript** — waveform scrubber with word-level transcript highlighting and click-to-seek.
- **Otter.ai** — segment-level highlight that auto-scrolls, speaker labels, playback speed control.
- **Pocket Casts / Overcast** — persistent mini-player that survives navigation, skip buttons, variable speed, volume, and resume-from-position.

---

## 2. User Stories

1. **Listen while reading** — As a user viewing a processed podcast, I want to press play and see the transcript highlight the current segment in real time so I can read along with the audio.

2. **Jump to a moment** — As a user reading a transcript, I want to click any segment's timestamp to seek playback to that exact moment so I can hear the context around a passage that caught my eye.

3. **Control playback speed** — As a user who consumes podcasts at 1.5x or 2x, I want a speed selector (0.5x through 2x) that persists for the session so I can listen efficiently.

4. **Navigate without losing audio** — As a user who is listening to a podcast, I want the player to keep playing when I navigate to the Library or another knowledge base, with a mini-player visible at the bottom of the screen.

5. **Resume where I left off** — As a user returning to a podcast I partially listened to, I want playback to resume from my last position so I do not have to scrub manually.

6. **Skip forward/back** — As a user, I want 15-second skip-back and 30-second skip-forward buttons so I can quickly replay or skip sections.

7. **Use keyboard shortcuts** — As a power user, I want Space (play/pause), Left/Right arrows (seek +/-15s), and Up/Down arrows (speed +/-0.25x) so I can control playback without reaching for the mouse.

8. **Listen from a chat citation** — As a user viewing a RAG chat answer with source citations that include timestamps, I want to click a citation's timestamp to load that podcast and seek to the cited moment so I can verify the AI's answer.

---

## 3. Design & Functionality

### UI/UX Design

**Persistent bottom bar player (64px tall, full width, fixed to viewport bottom):**

```
+-----------------------------------------------------------------------+
| [Thumbnail 40x40]  Title — Channel     [|<15s] [Play/Pause] [30s>|]  |
|                     0:42 ━━━━━━●━━━━━━━━━━━ 1:23:07                   |
|                     [0.5x] [0.75x] [1x] [1.25x] [1.5x] [2x]   [Vol] |
+-----------------------------------------------------------------------+
```

- **Collapsed mini-player** (when not on the playing podcast's detail page): shows thumbnail, title, play/pause, and scrubber only — single row, 48px.
- **Expanded player** (when on the playing podcast's detail page): adds speed selector and volume. The detail page content gets `pb-16` to avoid overlap.
- **Scrubber**: HTML `<input type="range">` styled with Tailwind. Displays elapsed / total time in `mono text-[11px]`.
- **Speed selector**: row of pill buttons. Active speed gets `bg-[var(--accent)] text-[var(--accent-fg)]`. Speeds: 0.5x, 0.75x, 1x, 1.25x, 1.5x, 2x.
- **Volume**: single slider, hidden on mobile (mobile volume is hardware-controlled).
- **Close button (X)**: stops playback and removes the player from the DOM.

**Transcript sync enhancements to existing `TranscriptView`:**

- Active segment gets `bg-[var(--accent)]/10 border-l-2 border-[var(--accent)]` highlight, replacing the current plain layout.
- Container auto-scrolls (via `scrollIntoView({ behavior: 'smooth', block: 'center' })`) so the active segment stays visible. Auto-scroll pauses if the user manually scrolls (re-engages after 5 seconds of no manual scroll, or when clicking a segment).
- Each segment's timestamp becomes a clickable button: `cursor-pointer hover:text-[var(--text)]`. Clicking dispatches a seek to `segment.start`.
- When no audio is playing, transcript renders exactly as it does today — no regressions.

**Keyboard shortcuts (registered on `window`, suppressed when an input/textarea is focused):**

| Key | Action |
|-----|--------|
| `Space` | Toggle play / pause |
| `ArrowLeft` | Seek back 15 seconds |
| `ArrowRight` | Seek forward 30 seconds |
| `ArrowUp` | Increase speed one step |
| `ArrowDown` | Decrease speed one step |
| `M` | Mute / unmute |

### Behavior

**Audio source strategy:**

Stream directly from `podcasts.enclosure_url` (the original RSS MP3 URL stored at ingest time). For YouTube-sourced podcasts (no `enclosure_url`), the play button is disabled with a tooltip: "Audio not available — YouTube sources do not retain audio after processing." This is the simplest approach and avoids re-downloading or storing audio long-term. See Section 4 for the full tradeoff analysis.

**Handling expired or changed RSS URLs:**

If the `<audio>` element fires an `error` event (network error, 403, 404), the player shows an inline banner: "Audio unavailable — the source URL may have expired. Try re-processing this podcast." The error state is non-blocking; transcript and insights remain accessible. A future enhancement could attempt to re-resolve the URL via the Podcast Index API's `/episodes/byid` endpoint using the stored `episode_index_id`.

**Buffering and loading states:**

- `waiting` event on the Audio element triggers a spinner overlay on the play button.
- `canplay` event clears the spinner.
- `stalled` event (>3 seconds) shows "Buffering..." text next to the scrubber.

**Resume playback position:**

Stored in `localStorage` under the key `podbrain:playback:{podcastId}`. Value is a JSON object: `{ position: number, speed: number, updatedAt: string }`. Written every 5 seconds during playback and on pause/close. On load, if a stored position exists, seek to it before playing. Positions older than 30 days are pruned on app startup.

**Navigating away from podcast detail:**

Audio continues playing. The bottom bar switches to the collapsed mini-player. Clicking the mini-player's title navigates back to the podcast detail page (preserving the `kbId` context if available). The transcript sync only runs when the user is on the matching PodcastDetail route.

---

## 4. Architecture & Technical Specs

### Audio Source Strategy

| Option | Pros | Cons |
|--------|------|------|
| **A: Stream from `enclosure_url`** | Zero storage cost. No re-download latency. RSS URLs are typically long-lived (months to years). Simple implementation. | URLs _can_ expire or change. CORS may block streaming for some hosts. YouTube-sourced podcasts have no `enclosure_url`. |
| **B: Re-download to Supabase Storage** | Guaranteed availability. No CORS issues (Supabase Storage serves with permissive headers). | Storage cost (~50-150 MB per episode). Re-download latency on first play. Requires cleanup policy or storage grows unbounded. |
| **C: Browser-side Service Worker cache** | Works offline. No server storage cost. | Cache Quota limits (~100-500 MB per origin). Only caches after first full play. Complex implementation for moderate gain. |

**Recommendation: Option A (stream from `enclosure_url`) for Phase 1.** Rationale:

- Podcast Index RSS `enclosureUrl` values point to CDN-hosted MP3 files that are generally stable for months or longer — they are the canonical distribution URL for the episode.
- Zero incremental cost (no Supabase Storage usage).
- The `<audio>` element handles streaming, buffering, and range requests natively.
- CORS risk is mitigable: most podcast CDNs serve MP3s with permissive CORS headers because podcast apps fetch them cross-origin by design. For the rare host that blocks CORS, a thin Supabase Edge Function proxy (`GET /functions/v1/audio-proxy?url=...`) can relay the stream. This proxy should only be built if CORS failures are observed in practice.
- YouTube-sourced podcasts (no `enclosure_url`) simply disable the play button — this is an acceptable tradeoff since Podcast Index is the primary source.

**Phase 3 enhancement:** Add Option B as an opt-in "pin audio" feature — user clicks a pin icon, the audio is re-downloaded to Supabase Storage, and the player uses the Storage URL instead. Pinned episodes are limited to 10 to cap storage.

### Database Changes

**No new tables required for Phase 1.** Playback position is stored in `localStorage` (see Section 3). This avoids a migration and keeps the feature entirely client-side.

**Phase 3 migration (if resume-across-devices is needed later):**

```sql
-- Table: playback_positions
create table playback_positions (
  id uuid primary key default gen_random_uuid(),
  podcast_id uuid not null references podcasts(id) on delete cascade,
  position_seconds real not null default 0,
  speed real not null default 1,
  updated_at timestamptz not null default now(),
  unique (podcast_id)
);

-- Index for fast lookup
create index idx_playback_positions_podcast on playback_positions(podcast_id);
```

This table is deferred because PodBrain is currently single-user with no auth. Adding it now would create a table with no RLS policies and no user scoping, which would need to be reworked when auth is added in Phase 6.

### Frontend Components

**New files:**

| File | Purpose |
|------|---------|
| `src/contexts/PlaybackContext.tsx` | React context providing global player state and controls to all components |
| `src/components/AudioPlayer.tsx` | Bottom-bar player UI (expanded and mini variants) |
| `src/components/TranscriptSync.tsx` | Enhanced transcript view with active segment highlighting and click-to-seek |
| `src/hooks/usePlaybackPosition.ts` | Hook for reading/writing localStorage resume positions |
| `src/hooks/useKeyboardShortcuts.ts` | Hook for registering global keyboard shortcuts |

**Modified files:**

| File | Change |
|------|--------|
| `src/App.jsx` | Wrap `<Layout>` with `<PlaybackProvider>` so player state is available everywhere |
| `src/components/Layout.jsx` | Render `<AudioPlayer />` as the last child of the root flex container, above the closing `</div>` |
| `src/pages/PodcastDetail.jsx` | Replace `<TranscriptView>` with `<TranscriptSync>`, add "Play" button in the header actions bar, pass `enclosure_url` to playback context |
| `src/components/ChatPanel.jsx` | Make citation timestamps clickable — on click, load the cited podcast into the player and seek to the timestamp |

**Component tree (simplified):**

```
<PlaybackProvider>
  <Layout>
    <Routes>
      <PodcastDetail>
        <TranscriptSync />      <!-- reads PlaybackContext for active segment -->
      </PodcastDetail>
    </Routes>
    <AudioPlayer />              <!-- fixed bottom, reads/writes PlaybackContext -->
  </Layout>
</PlaybackProvider>
```

### PlaybackContext API

```typescript
interface PlaybackState {
  podcast: {
    id: string
    title: string
    channel: string
    thumbnailUrl: string | null
    enclosureUrl: string
    durationSeconds: number
  } | null
  isPlaying: boolean
  currentTime: number        // seconds (float)
  duration: number           // seconds (float), from audio element
  speed: number              // 0.5 | 0.75 | 1 | 1.25 | 1.5 | 2
  volume: number             // 0-1
  isMuted: boolean
  isBuffering: boolean
  error: string | null
}

interface PlaybackControls {
  load(podcast: PlaybackState['podcast']): void
  play(): void
  pause(): void
  toggle(): void
  seek(seconds: number): void
  seekRelative(delta: number): void
  setSpeed(speed: number): void
  setVolume(volume: number): void
  toggleMute(): void
  close(): void
}
```

The context creates a single `HTMLAudioElement` via `useRef`, attaches event listeners (`timeupdate`, `ended`, `error`, `waiting`, `canplay`, `loadedmetadata`), and exposes state + controls. The audio element is never rendered into the DOM — it is created imperatively via `new Audio()` so it is decoupled from React's render lifecycle.

### Audio API

**HTML5 `Audio` element (native).** No third-party library needed.

Rationale for _not_ using Howler.js: Howler adds Web Audio API abstraction, sprite-based playback, and audio format fallback — none of which are needed here. PodBrain plays a single MP3 stream at a time. The native `Audio` API supports `playbackRate`, `currentTime` seeking, `timeupdate` events, and media session integration out of the box. Keeping the dependency count low aligns with the project's "no unnecessary libraries" philosophy (the app currently has only 5 runtime dependencies in `package.json`).

**Timestamp synchronization algorithm:**

```typescript
// Called on every `timeupdate` event (~4 times/second in most browsers)
function findActiveSegment(
  segments: Array<{ start: number; end: number }>,
  currentTime: number
): number {
  // Binary search since segments are sorted by start time
  let lo = 0, hi = segments.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1
    if (currentTime < segments[mid].start) {
      hi = mid - 1
    } else if (
      mid < segments.length - 1 &&
      currentTime >= segments[mid + 1].start
    ) {
      lo = mid + 1
    } else {
      return mid
    }
  }
  return lo
}
```

Binary search runs in O(log n). A typical 2-hour podcast has ~500-1500 Whisper segments, so the worst case is ~11 comparisons per `timeupdate` tick. This is negligible compared to the rendering cost of highlighting a segment.

**Performance for long podcasts (2+ hours):**

- `timeupdate` fires ~4 times/second. Binary search + conditional re-render (only if active segment index changed) ensures no unnecessary DOM updates.
- `TranscriptSync` uses `React.memo` on each segment row, re-rendering only the previously active and newly active segments.
- `scrollIntoView` is throttled to fire at most once per segment change, not on every `timeupdate`.
- The `segments` array is passed as a prop and memoized — never re-fetched during playback.

### State Management

**React Context** (`PlaybackContext`), not Zustand.

Rationale: The player state is consumed by exactly 3-4 components (`AudioPlayer`, `TranscriptSync`, `PodcastDetail` header, and optionally `ChatPanel` for citation playback). React Context with `useReducer` is sufficient for this scope. Adding Zustand would be the project's first state management library, introducing a new dependency and pattern for a narrow use case. If PodBrain later needs more complex global state (e.g., multi-tab sync, offline queue), Zustand can be introduced then and the playback context migrated.

The context provider stores the `Audio` ref and a `useReducer`-managed state object. Dispatch actions: `LOAD`, `PLAY`, `PAUSE`, `SEEK`, `TIME_UPDATE`, `SPEED_CHANGE`, `VOLUME_CHANGE`, `BUFFERING`, `ERROR`, `CLOSE`.

---

## 5. Implementation Phases

### Phase 1 — Basic Player + Transcript Sync (~3-4 days)

**Goal:** Play audio on the podcast detail page with transcript highlighting.

- [ ] Create `PlaybackContext.tsx` with `Audio` element management, `useReducer` state, and controls API
- [ ] Create `AudioPlayer.tsx` — bottom bar with play/pause, scrubber (elapsed/total), and close button
- [ ] Create `TranscriptSync.tsx` — fork of existing `TranscriptView` with:
  - Active segment highlight (`bg-[var(--accent)]/10`)
  - Auto-scroll to active segment
  - Click-to-seek on timestamps
- [ ] Add "Play" button to `PodcastDetail` header (next to "Process" / "Add to KB")
- [ ] Wrap `App.jsx` with `<PlaybackProvider>`
- [ ] Render `<AudioPlayer />` in `Layout.jsx`
- [ ] Handle `error` event on Audio element (show "audio unavailable" banner)
- [ ] Gate play button: disabled with tooltip when `enclosure_url` is null (YouTube sources)

### Phase 2 — Persistent Mini-Player, Speed, Keyboard (~2-3 days)

**Goal:** Player survives navigation. Power-user controls.

- [ ] Mini-player variant (collapsed 48px bar when not on active podcast's detail page)
- [ ] Mini-player title click navigates to podcast detail
- [ ] Speed selector (0.5x, 0.75x, 1x, 1.25x, 1.5x, 2x) — updates `audio.playbackRate`
- [ ] Volume slider (desktop only, hidden on mobile via `hidden sm:block`)
- [ ] Skip back 15s / skip forward 30s buttons
- [ ] `useKeyboardShortcuts.ts` hook — Space, Arrow keys, M
- [ ] Keyboard shortcuts disabled when any `<input>`, `<textarea>`, or `[contenteditable]` is focused
- [ ] Auto-scroll pause on manual scroll (re-engage after 5s idle or on segment click)

### Phase 3 — Resume Position, Citation Playback, Polish (~2-3 days)

**Goal:** Remember positions. Citations become playable. Edge cases handled.

- [ ] `usePlaybackPosition.ts` — save to `localStorage` every 5s, on pause, and on close
- [ ] On load, seek to stored position if available
- [ ] Prune positions older than 30 days on app startup
- [ ] Make chat citation timestamps clickable (load podcast into player, seek to timestamp)
- [ ] Buffering state UI (spinner on play button, "Buffering..." text)
- [ ] `stalled` / `waiting` / `canplay` event handling
- [ ] Media Session API integration (`navigator.mediaSession`) — lock screen controls on mobile, system media key support on desktop
- [ ] Responsive design pass: mini-player layout on screens < 640px
- [ ] Accessibility: ARIA labels on all player controls, focus-visible outlines

---

## 6. Dependencies & Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **RSS `enclosure_url` expires or returns 403/404** | Low-Medium. Most podcast CDNs keep URLs alive for months-years, but some use signed/expiring URLs. | Player cannot play audio. Transcript and insights still work. | Detect via `error` event. Show "Audio unavailable" with a "re-process" suggestion. Phase 3 enhancement: re-resolve URL via Podcast Index API using `episode_index_id`. |
| **CORS blocks audio streaming** | Low. Podcast CDNs generally serve with `Access-Control-Allow-Origin: *` because podcast apps fetch cross-origin. | Audio fails to load in the browser. | Fallback: proxy through a thin Supabase Edge Function (`audio-proxy`). Only build if observed in practice. Test with 5-10 popular feeds before shipping. |
| **Mobile browser autoplay restrictions** | Certain. iOS Safari and Chrome on Android block `audio.play()` unless triggered by a user gesture. | Play button click works (it _is_ a user gesture). Autoplay-on-page-load would fail, but we do not autoplay. | Always gate playback behind an explicit user click. Never call `play()` from `useEffect` or on navigation. Resume-from-position only _seeks_ on load; play requires a tap. |
| **Long podcast performance (3+ hours)** | Low. Binary search + memo keeps per-tick cost constant. | Janky scrolling or laggy highlight if not optimized. | Binary search for segment lookup. `React.memo` on segment rows. Throttled `scrollIntoView`. Profile with a 3-hour episode during Phase 1 development. |
| **YouTube-sourced podcasts have no audio URL** | Certain. Audio is deleted after processing, and no `enclosure_url` exists. | Play button disabled for these podcasts. | Show clear disabled state with tooltip: "Audio not available for YouTube sources." Future option: re-download via Cobalt on demand (would need Railway service to be running). |
| **Audio element memory on long sessions** | Low. The native `Audio` element streams and does not buffer the entire file into memory. | N/A if streaming; could be an issue if using Web Audio API (which we are not). | Use native `Audio`, not Web Audio API. Single `Audio` instance reused across podcasts (call `audio.src = newUrl` to switch). |
| **`localStorage` quota for resume positions** | Negligible. Each entry is ~100 bytes. 1000 podcasts = ~100KB, well within the 5-10MB quota. | N/A. | Prune entries older than 30 days. |

**External dependencies:** None. This feature uses only the native HTML5 Audio API and React. No new npm packages are required.

**Internal dependencies:**
- `podcasts.enclosure_url` must be populated (already stored for Podcast Index sources).
- `transcripts.segments` must contain `start` and `end` timestamps (already stored by `process-podcast` edge function, confirmed in the Whisper segment mapping at line 497 of `process-podcast/index.ts`).

---

## 7. Estimated Effort

| Phase | Scope | Estimate |
|-------|-------|----------|
| Phase 1 | Basic player + transcript sync | 3-4 days |
| Phase 2 | Mini-player, speed, keyboard shortcuts | 2-3 days |
| Phase 3 | Resume, citation playback, polish | 2-3 days |
| **Total** | | **7-10 days** |

Estimates assume a single developer working on this feature. All work is frontend-only — no Edge Function changes or database migrations are required for Phases 1-2. Phase 3 adds `localStorage` logic and optional Media Session API, both client-side.

The feature can ship incrementally: Phase 1 is useful on its own (play + sync on detail page). Phases 2 and 3 add polish and persistence. Each phase produces a shippable increment.
