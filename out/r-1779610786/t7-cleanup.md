# t7 -- Dead Code Cleanup Report

## Files Deleted

| File | Reason | Verification |
|------|--------|-------------|
| `src/components/PodcastCard.jsx` | Component defined but never imported or used anywhere in the codebase | `grep -r "PodcastCard" src/` returned only its own file |

## Dead Code Found in `src/lib/utils.js` (Not Removed -- Owned by Another Worker)

With PodcastCard deleted, two exports in utils.js become dead:

- **`statusColors`** (lines 58-60): Only consumer was PodcastCard.jsx. Zero remaining imports.
- **`className` property** on each `statusConfig` entry (lines 45-51): Only accessed by `statusColors`. Zero direct references from any component.

These were not removed because another worker (t4) owns utils.js and a linter hook restores changes made to it. Flagged here for future cleanup.

## Dead Code Scan Results

### Unused Icon Exports in `src/components/Icons.jsx`

Seven exported icon components have zero references outside Icons.jsx:

| Icon | Line | References |
|------|------|-----------|
| `Chat` | 27 | 0 |
| `Play` | 29 | 0 |
| `Pause` | 30 | 0 |
| `Bookmark` | 31 | 0 |
| `Hash` | 33 | 0 |
| `Spark` | 44 | 0 |
| `Globe` | 45 | 0 |

**Not removed.** Icons are imported via `import * as Icons`, so unused exports have zero runtime cost. The icon library is intentionally kept comprehensive for future use.

### `extractYouTubeVideoId` -- Exported but Only Used Internally

- **File:** `src/services/podcasts.js`, line 7
- **Issue:** `export function` but only called within the same file (line 99, inside `addPodcast`). No external imports.
- **Not changed.** File is in-scope for other workers. The `export` keyword is harmless; could be downgraded to a plain `function` later.

## TODO / FIXME / HACK Comments

None found. `grep -rn "TODO\|FIXME\|HACK\|XXX" src/` returned zero results across all source files.

## Console Statements

| Type | Count | Location | Status |
|------|-------|----------|--------|
| `console.log` | 0 | -- | Clean |
| `console.error` | 1 | `ErrorBoundary.jsx:14` | Appropriate (uncaught error logging) |
| `console.warn` | 1 | `supabase.js:7-9` | Skipped (t5 owns this file) |

## Unused Imports

No unused imports found across any source file in `src/`. Every import statement has a corresponding usage within its file.

## Build Verification

Production build passes after PodcastCard deletion: 86 modules transformed, 0 errors, 0 warnings (pre-existing chunk size advisory only).
