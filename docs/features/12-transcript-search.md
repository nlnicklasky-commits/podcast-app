# Transcript Search with Regex

## 1. Overview

Transcript Search adds a local, in-browser search bar to the transcript view on the podcast detail page. It finds exact text matches within a single podcast's transcript, highlights them in context, and lets the user jump between matches with next/prev navigation.

**Why this complements semantic search:**

Semantic search (feature 01, `semantic-search` edge function) answers "find content *about* X" -- it uses vector embeddings to find semantically related chunks across an entire KB. Transcript Search answers "find the exact place where someone *said* X" -- it uses literal string matching within one podcast's transcript text.

| Dimension | Semantic Search (existing/planned) | Transcript Search (this feature) |
|-----------|------------------------------------|----------------------------------|
| Scope | Entire KB or full library | Single podcast transcript |
| Match type | Semantic similarity (vector cosine) | Exact text match or regex pattern |
| Latency | ~500ms (API call to edge function) | Instant (<10ms, client-side) |
| Cost | OpenAI embedding per query (~$0.0001) | Zero (no API calls) |
| Use case | "Find discussions about leadership" | "Find where they said 'Series A'" |
| Infrastructure | Edge function + pgvector | Zero -- pure frontend |

This is a client-side-only feature. No edge functions, no database changes, no API calls. The transcript data (`transcripts.full_text` and `transcripts.segments` JSONB) is already loaded by `PodcastDetail.jsx` (line 32: `getTranscript(podcastId)`).

---

## 2. User Stories

1. **As a researcher**, I want to search for a specific term within a podcast transcript and see all matches highlighted, so I can find every mention of a person, company, or concept without reading the entire transcript.

2. **As a writer**, I want to navigate between matches using next/prev buttons (or keyboard shortcuts), so I can quickly scan through a long transcript to find the best quote.

3. **As a power user**, I want to toggle regex mode so I can search for patterns like `\b(AI|ML|machine learning)\b` to find all variations of a term at once.

4. **As a user**, I want a case-insensitive search by default with a toggle for case-sensitive mode, so casual searches work without friction while precise matching is available when needed.

5. **As a user viewing a long transcript**, I want the match count displayed (e.g., "3 of 17 matches") and the view to auto-scroll to the current match, so I never lose my place.

6. **As a user switching tabs**, I want my search query to persist when I switch to the Insights or Processing tab and back to Transcript, so I do not have to retype my search.

7. **As a user**, I want to press Ctrl+F (or Cmd+F on Mac) while viewing a transcript to open the transcript search bar instead of the browser's default find, so the experience is native to the app.

---

## 3. Design & Functionality

### UI/UX Design

**Search bar within transcript view:**

The search bar sits at the top of the `TranscriptView` component (currently defined inline in `PodcastDetail.jsx`, line 279), between the "Full Transcript" header and the segment list. It follows the same visual style as the ChatPanel input: surface background, border, rounded corners.

```
+----------------------------------------------------------+
| FULL TRANSCRIPT                          12,847 words     |
+----------------------------------------------------------+
| [Q] Search transcript...   [.*] [Aa]   < 3/17 >  [x]   |
+----------------------------------------------------------+
| 0:00   The first thing I want to talk about is how...    |
| 0:45   ...and then the [Series A] funding came through   |  <-- highlighted
| 1:12   before the Series B they had already...           |
| ...                                                       |
| 3:22   ...the [Series A] was actually the turning point  |  <-- highlighted
+----------------------------------------------------------+
```

**UI elements:**

- **Search input** -- text field with a search icon (magnifying glass from `Icons.jsx`). Autofocuses when opened via keyboard shortcut.
- **Regex toggle** `[.*]` -- small button that toggles between plain text and regex mode. Default: plain text. Active state: accent color background.
- **Case sensitivity toggle** `[Aa]` -- toggles between case-insensitive (default) and case-sensitive. Active state: accent color background.
- **Match counter** -- "3 of 17" showing current match index and total count. Updates as the user types.
- **Navigation arrows** `< >` -- previous and next match buttons. Cycle: after the last match, next goes to the first.
- **Close button** `[x]` -- clears the search and removes all highlighting.

The search bar is hidden by default. It appears when:
1. The user presses Ctrl+F (Cmd+F on Mac) while the Transcript tab is active.
2. The user clicks a search icon in the transcript header.

**Match highlighting:**

Matched text is wrapped in a `<mark>` element with a semi-transparent accent background. The *current* match (the one the user has navigated to via next/prev) uses a stronger accent background with a subtle ring/outline to distinguish it from other matches.

```css
/* Other matches */
mark.search-match {
  background: color-mix(in oklab, var(--accent), transparent 70%);
  border-radius: 2px;
  padding: 0 1px;
}

/* Current/focused match */
mark.search-match-current {
  background: color-mix(in oklab, var(--accent), transparent 40%);
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}
```

### Behavior

**Search across segments vs full_text:**

Search operates on the `segments` array (from `transcripts.segments` JSONB), not `full_text`. Each segment has a `start` timestamp and contains `sentences` with text. Searching per-segment preserves the timestamp association, so the user can see *when* in the podcast each match occurs.

The search process:
1. For each segment, concatenate its `sentences[].text` into a single string.
2. Run the search pattern against each concatenated segment string.
3. Track match positions relative to the segment text for highlighting.
4. If a match spans a sentence boundary within a segment, the highlight wraps across the boundary.

This matches the existing rendering logic in `TranscriptView` (line 306): `seg.sentences?.map((s) => s.text).join(' ')`.

**Highlight rendering:**

The `TranscriptView` currently renders segment text as plain `<p>` elements (line 315). With search active, the text is split at match boundaries and reassembled with `<mark>` elements:

```typescript
function highlightText(text: string, matches: MatchRange[]): ReactNode[] {
  // Split text into alternating plain/highlighted spans
  // Return array of <span> and <mark> elements
}
```

This is a pure rendering transformation -- no mutation of the transcript data.

**Performance for large transcripts:**

A 2-hour podcast produces roughly 20,000-30,000 words across 200-400 segments. Performance considerations:

- **Search execution:** String search across 30K words is <1ms in modern browsers. Regex search can be slower, but catastrophic backtracking is mitigated (see regex safety below).
- **Re-rendering:** Highlighting changes only affect segments that contain matches. React's reconciliation handles this efficiently since segment keys are stable (array index).
- **Virtual scrolling:** Not needed for Phase 1. The existing `TranscriptView` renders all segments at once (line 303: `transcript.segments.map()`). For transcripts with 500+ segments, virtual scrolling via `react-window` could be added later, but manual testing should confirm whether it is necessary first. The current implementation works for Nick's personal use with typical podcast lengths.

**Debounce:** Search fires 150ms after the user stops typing. This is faster than the semantic search debounce (300ms) because transcript search is instant (no API call).

**Search persistence:**

The search query is stored in the `TranscriptView` component's state. Since `TranscriptView` is conditionally rendered based on `activeTab` in `PodcastDetail.jsx` (line 258), the component unmounts when switching tabs, losing state.

Fix: lift the search query state up to `PodcastDetail` and pass it as a prop to `TranscriptView`. When the user switches to Insights and back, the query is restored and matches are re-highlighted.

---

## 4. Architecture & Technical Specs

### Implementation Approach

**Client-side string search.** No Postgres full-text search needed.

The transcript data is already fully loaded in the browser (the `getTranscript()` service call fetches `full_text` and `segments` from Supabase on page load, line 32 of `PodcastDetail.jsx`). Searching this data in-memory is instant. Adding a Postgres `tsvector` index or full-text search RPC would add complexity with no performance benefit for single-transcript search.

If cross-transcript search (search across all transcripts in a KB) is needed in the future, that should use the existing semantic search infrastructure, not this feature.

**Search engine (custom, ~60 lines):**

```typescript
interface SearchOptions {
  query: string
  isRegex: boolean
  caseSensitive: boolean
}

interface MatchResult {
  segmentIndex: number
  startOffset: number  // character offset within the segment's concatenated text
  endOffset: number
  matchText: string    // the actual matched text (useful for regex)
}

function searchTranscript(
  segments: TranscriptSegment[],
  options: SearchOptions
): MatchResult[] {
  const { query, isRegex, caseSensitive } = options
  if (!query || query.length === 0) return []

  let pattern: RegExp
  if (isRegex) {
    try {
      pattern = new RegExp(query, caseSensitive ? 'g' : 'gi')
    } catch {
      return []  // invalid regex -- return no results, don't crash
    }
  } else {
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    pattern = new RegExp(escaped, caseSensitive ? 'g' : 'gi')
  }

  const results: MatchResult[] = []
  segments.forEach((seg, segIdx) => {
    const text = seg.sentences?.map(s => s.text).join(' ') || ''
    let match: RegExpExecArray | null
    // Reset lastIndex for each segment
    pattern.lastIndex = 0
    while ((match = pattern.exec(text)) !== null) {
      results.push({
        segmentIndex: segIdx,
        startOffset: match.index,
        endOffset: match.index + match[0].length,
        matchText: match[0],
      })
      // Prevent infinite loop on zero-length matches
      if (match[0].length === 0) pattern.lastIndex++
    }
  })

  return results
}
```

### Frontend Components

| Component | Location | Responsibility |
|-----------|----------|----------------|
| `TranscriptSearch` | `src/components/TranscriptSearch.jsx` | Search bar with input, toggles, match counter, nav arrows, close button |
| `HighlightedSegment` | `src/components/HighlightedSegment.jsx` | Renders a single transcript segment with `<mark>` highlights for matches |

**`TranscriptSearch` props:**

```typescript
interface TranscriptSearchProps {
  query: string
  onQueryChange: (query: string) => void
  isRegex: boolean
  onRegexToggle: () => void
  caseSensitive: boolean
  onCaseToggle: () => void
  matchCount: number
  currentMatchIndex: number
  onNext: () => void
  onPrev: () => void
  onClose: () => void
}
```

**`HighlightedSegment` props:**

```typescript
interface HighlightedSegmentProps {
  text: string
  matches: MatchResult[]  // filtered to this segment
  currentMatchIndex: number  // global index of the "current" match
  globalStartIndex: number   // first match index within this segment (for computing isCurrent)
}
```

**Integration into `PodcastDetail.jsx`:**

The existing inline `TranscriptView` function (line 279) is refactored to use the new components:

```jsx
function TranscriptView({ transcript, searchQuery, onSearchQueryChange }) {
  const [isRegex, setIsRegex] = useState(false)
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0)
  const [showSearch, setShowSearch] = useState(false)

  const matches = useMemo(
    () => searchTranscript(transcript.segments, { query: searchQuery, isRegex, caseSensitive }),
    [transcript.segments, searchQuery, isRegex, caseSensitive]
  )

  // Auto-scroll to current match
  const matchRefs = useRef<Map<number, HTMLElement>>(new Map())
  useEffect(() => {
    const el = matchRefs.current.get(currentMatchIndex)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [currentMatchIndex])

  // Keyboard shortcut: Ctrl+F opens search
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault()
        setShowSearch(true)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  // ... render
}
```

### Performance Optimization

**For Phase 1 (no virtual scrolling):**

- `useMemo` on `searchTranscript()` -- only re-runs when query, regex mode, or case sensitivity changes.
- `HighlightedSegment` uses `React.memo` to prevent re-rendering segments without matches.
- Match highlighting is computed per-segment, not across the full text, so only affected segments re-render.

**For Phase 2 (if needed):**

If transcripts with 500+ segments cause janky scrolling during search, add `react-window`:

```
npm install react-window --legacy-peer-deps
```

Wrap the segment list in a `VariableSizeList` where each row's height is measured dynamically. This limits DOM nodes to the visible viewport plus a small overscan.

Decision criteria: test with a real 2-hour podcast transcript. If scrolling is smooth without virtual scrolling, skip it.

### Regex Safety

User-provided regex patterns can cause catastrophic backtracking (e.g., `(a+)+$` on a long string of `a`s). Mitigations:

1. **Timeout wrapper:** Execute the regex search inside a `setTimeout` or Web Worker with a 500ms budget. If execution exceeds the budget, cancel and show "Regex too complex. Try a simpler pattern."

2. **Pattern length limit:** Cap the regex input at 200 characters. No reasonable search pattern exceeds this.

3. **Graceful error handling:** If `new RegExp(query)` throws (invalid regex syntax), show an inline error below the search bar: "Invalid regex: {error.message}". Do not crash the component.

4. **No `dotAll` or `multiline` flags exposed:** The search runs per-segment, and segments are single paragraphs. The `g` and optionally `i` flags are sufficient.

Implementation:

```typescript
function safeRegexSearch(text: string, pattern: RegExp, timeoutMs = 500): RegExpExecArray[] {
  const results: RegExpExecArray[] = []
  const start = performance.now()

  let match: RegExpExecArray | null
  while ((match = pattern.exec(text)) !== null) {
    results.push(match)
    if (match[0].length === 0) pattern.lastIndex++
    if (performance.now() - start > timeoutMs) {
      throw new Error('Regex execution timed out')
    }
  }

  return results
}
```

---

## 5. Implementation Phases

### Phase 1: Core Search + Highlighting

- [ ] Create `searchTranscript()` utility function in `src/lib/transcriptSearch.ts`
- [ ] Build `TranscriptSearch` component (search bar, toggles, match counter, nav)
- [ ] Build `HighlightedSegment` component (mark-based highlighting)
- [ ] Integrate into `TranscriptView` in `PodcastDetail.jsx`
- [ ] Add Ctrl+F keyboard shortcut to open search when Transcript tab is active
- [ ] Auto-scroll to current match on next/prev navigation
- [ ] Handle edge cases: empty transcript, no matches, single match

**Estimated effort:** 1-2 days

### Phase 2: Polish + Persistence

- [ ] Lift search query state to `PodcastDetail` so it survives tab switches
- [ ] Add regex safety (timeout wrapper, pattern length limit, error display)
- [ ] Add Enter key to navigate to next match, Shift+Enter for previous
- [ ] Add Escape key to close search bar and clear highlights
- [ ] Test with a real 2-hour podcast transcript for performance
- [ ] Add virtual scrolling with `react-window` if performance testing warrants it
- [ ] Mobile-responsive search bar (full width, controls stack vertically)

**Estimated effort:** 1 day

---

## 6. Dependencies & Risks

**Dependencies:**

- **Transcript data already loaded** -- `PodcastDetail.jsx` fetches `getTranscript(podcastId)` on mount (line 32). The `segments` JSONB array is available in component state. No additional data fetching required.
- **Segment structure** -- depends on `transcripts.segments` having the shape `[{ start, end, sentences: [{ text }] }]`. This is the format produced by `process-podcast` edge function (line 497: Whisper segments mapped to paragraphs with sentences). RSS transcript path also produces this shape (line 256).

**Risks:**

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Ctrl+F hijacking annoys users who want browser's native find | Medium | Low | Only intercept Ctrl+F when the Transcript tab is active. Other tabs and other pages use browser's native find. Add a small "(Ctrl+F)" hint next to the search icon so users know the app has its own search. |
| Regex catastrophic backtracking freezes the UI | Low | High | Timeout wrapper (500ms budget). Inline error message. Pattern length cap at 200 chars. |
| Very long transcripts (500+ segments) cause slow re-renders during search | Low | Medium | `React.memo` on `HighlightedSegment`. `useMemo` on search results. Virtual scrolling as Phase 2 backup. |
| Match positions are wrong when segment text includes HTML entities or Unicode | Low | Low | Search runs on raw text strings from the DB, not rendered HTML. No entity encoding issues. Unicode is handled natively by JavaScript regex. |
| Search state lost on page navigation (e.g., going to another podcast and back) | Medium | Low | Acceptable for Phase 1. Search is ephemeral by design -- it is a quick-find tool, not a persistent query. |

---

## 7. Estimated Effort

| Phase | Work | Effort |
|-------|------|--------|
| Phase 1 -- Core Search | Search utility, TranscriptSearch, HighlightedSegment, keyboard shortcut, auto-scroll | 1-2 days |
| Phase 2 -- Polish | State persistence, regex safety, keyboard nav, performance testing, virtual scrolling (if needed) | 1 day |
| **Total** | | **2-3 days** |

New npm dependencies: 0 (Phase 1), optionally 1 (`react-window`, Phase 2 only if needed).

New edge functions: 0.

New database tables/columns: 0.

Files modified: `PodcastDetail.jsx` (integrate search into TranscriptView, lift state).

Files created: `TranscriptSearch.jsx`, `HighlightedSegment.jsx`, `src/lib/transcriptSearch.ts`.
