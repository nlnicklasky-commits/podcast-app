# T3: Inline Style to Tailwind CSS Conversion -- Batch B

## Files Changed

| File | Style Objects Converted | Hover Handlers Removed | Remaining Inline Styles |
|------|------------------------|----------------------|------------------------|
| `src/components/ChatPanel.jsx` | 11 | 1 pair (starter buttons) | 1 (ThinkingDots animation with dynamic delay) |
| `src/components/InsightsPanel.jsx` | 8 | 0 | 1 (entity dot -- dynamic `background: c`) |
| `src/components/ProcessingProgress.jsx` | 11 | 0 | 2 (dynamic `width: ${pct}%` for progress bars) |
| `src/components/ProcessingLog.jsx` | 5 | 1 pair (expand button) | 1 (step color from `STEP_COLORS[log.step]` lookup) |
| `src/components/ui.jsx` | 1 (Tag -- full variant system) | 0 | 2 (StatusPip dynamic config.color, KBGlyph dynamic size/color-mix) |
| **Total** | **36** | **2 pairs** | **7 (all justified)** |

## Conversion Patterns Applied

- `style={{ background: 'var(--surface)' }}` replaced with `bg-[var(--surface)]`
- `style={{ color: 'var(--accent)' }}` replaced with `text-[var(--accent)]`
- `style={{ border: '1px solid var(--border)' }}` replaced with `border border-[var(--border)]`
- `style={{ borderRadius: 'var(--r-lg)' }}` replaced with `rounded-[var(--r-lg)]`
- `style={{ borderTop: '1px solid ...' }}` replaced with `border-t border-[var(--border)]`
- `style={{ borderBottom: '1px solid ...' }}` replaced with `border-b border-[var(--border)]`
- `style={{ whiteSpace: 'pre-wrap' }}` replaced with `whitespace-pre-wrap`
- `style={{ maxHeight: 120 }}` replaced with `max-h-[120px]`
- `style={{ borderRadius: 2 }}` replaced with `rounded-[2px]`
- `style={{ boxShadow: ... }}` replaced with `shadow-[0_0_0_3px_var(--accent-soft)]`
- `style={{ fontWeight: 500 }}` replaced with `font-medium` / `font-normal`
- `style={{ animation: 'pulse-dot ...' }}` replaced with `animate-[pulse-dot_1.2s_ease-in-out_infinite]`
- `style={{ paddingTop: 2, paddingBottom: 2 }}` replaced with `py-0.5`
- Conditional style objects replaced with template-literal `className` strings
- `oklch(...)` colors use underscore syntax in arbitrary values: `bg-[oklch(0.72_0.14_150)]`
- `color-mix(...)` uses underscore syntax: `bg-[color-mix(in_oklab,var(--error),transparent_90%)]`

## Hover Handler Migration

**ChatPanel.jsx -- starter buttons**: Removed `onMouseEnter`/`onMouseLeave` that toggled `borderColor` and `color`. Replaced with `hover:border-[color-mix(in_oklab,var(--accent),transparent_50%)] hover:text-[var(--text)]`.

**ProcessingLog.jsx -- expand button**: Removed `onMouseEnter`/`onMouseLeave` that toggled `color`. Replaced with `hover:text-[var(--text)]`.

## Remaining Inline Styles (Justified)

All 7 remaining `style={{}}` usages involve truly dynamic runtime values that Tailwind cannot express statically:

1. **ThinkingDots animation delay** -- `${i * 0.18}s` per-dot stagger (ChatPanel)
2. **Entity dot color** -- runtime `c` from `typeColors[entity.type]` lookup (InsightsPanel)
3. **Progress bar width (compact)** -- `${pct}%` dynamic percentage (ProcessingProgress)
4. **Progress bar width (full)** -- `${pct}%` dynamic percentage (ProcessingProgress)
5. **Log step color** -- runtime `STEP_COLORS[log.step]` lookup (ProcessingLog)
6. **StatusPip color + animation** -- runtime `config.color` and `config.anim` (ui.jsx)
7. **KBGlyph dimensions + colors** -- runtime `size` prop and `color-mix` with dynamic `c` (ui.jsx)

## Tag Component Refactor

Replaced the inline `variants` style-object map with a `TAG_CLASSES` constant mapping variant names to Tailwind class strings. The `cursor` conditional was also moved from inline style to conditional className (`cursor-pointer` / `cursor-default`).

## Build Verification

Production build (`vite build`) succeeds with no errors after all changes.
