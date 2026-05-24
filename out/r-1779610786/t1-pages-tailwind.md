# t1 -- Inline Style to Tailwind Conversion Summary

## Files Changed

| File | Style objects removed | Hover handlers removed |
|------|----------------------|----------------------|
| `src/pages/Home.jsx` | 12 | 4 (KBCard, New KB btn, Add podcast btn, recent podcast rows) |
| `src/pages/KnowledgeBase.jsx` | 10 | 3 (rename h1, Filter btn, PodcastRow border) |
| `src/pages/PodcastDetail.jsx` | 10 | 0 (none present) |
| **Total** | **32** | **7** |

## Remaining Inline Styles

One inline style retained intentionally:

- `KnowledgeBase.jsx` line 241: `style={{ width: \`\${p.progress || 0}%\` }}` -- dynamic data-driven width for the progress bar. Cannot be expressed as a static Tailwind class.

## Conversion Patterns Applied

- **CSS custom property colors** (`var(--accent)`, `var(--text-dim)`, etc.) mapped to Tailwind arbitrary value syntax: `text-[var(--accent)]`, `bg-[var(--surface)]`, `border-[var(--border)]`
- **Custom radii** (`var(--r-sm)` through `var(--r-lg)`) mapped to `rounded-[var(--r-sm)]`, etc.
- **Dashed borders** converted to `border border-dashed border-[var(--border)]`
- **`color-mix()` in hover states** preserved via Tailwind arbitrary values using underscore-for-space syntax: `hover:border-[color-mix(in_oklab,var(--accent),transparent_60%)]`
- **Grid template columns** converted to `grid-cols-[repeat(auto-fill,minmax(260px,1fr))]` and `grid-cols-[70px_1fr]`
- **Conditional border-bottom** (podcast row divider based on index) converted from inline style to conditional className with template literal
- **Conditional tab styles** (active vs. inactive) converted from inline style objects to template literal className with ternary

## Hover Handler Elimination

All 7 `onMouseEnter`/`onMouseLeave` handler pairs replaced with declarative Tailwind `hover:` utilities:

- `hover:bg-[var(--surface)]` -- ghost button hover fills
- `hover:bg-[var(--surface-2)]` -- podcast row hover
- `hover:text-[var(--accent)]` -- rename title hint
- `hover:border-[color-mix(...)]` + `hover:-translate-y-px` -- KB card lift effect

## Build Verification

`vite build` passes with no errors after all changes.
