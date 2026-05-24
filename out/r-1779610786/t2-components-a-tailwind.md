# T2: Inline Style to Tailwind Conversion -- Components Batch A

## Files Changed

| File | Style Objects Removed | Hover Handlers Removed | Notes |
|------|----------------------|----------------------|-------|
| `src/components/Layout.jsx` | 8 | 4 (2 in KB list, 2 in NavItem) | Sidebar, wordmark, search trigger, KB items, footer, mobile header |
| `src/components/CommandPalette.jsx` | 7 | 2 (item list hover) | Overlay, modal shell, input, kbd, items, footer |
| `src/components/AddPodcastModal.jsx` | 17 | 4 (show cards, episode cards) | Overlay, modal, tabs, inputs, error text, spinners, buttons |
| `src/components/CreateKBModal.jsx` | 6 | 0 | Overlay, modal, header, input, textarea, submit button |
| `src/components/AddToKBModal.jsx` | 6 | 2 (KB card border-color hover) | Overlay, modal, header, KB cards, spinner, error text |
| **Totals** | **44** | **12** | |

## Conversion Patterns Applied

- **Borders**: `style={{ border: '1px solid var(--border)' }}` converted to `border border-[var(--border)]`
- **Backgrounds**: `style={{ background: 'var(--surface)' }}` converted to `bg-[var(--surface)]`
- **Text colors**: `style={{ color: 'var(--text)' }}` converted to `text-[var(--text)]`
- **Border radii**: `style={{ borderRadius: 'var(--r-md)' }}` converted to `rounded-[var(--r-md)]`
- **Box shadows**: `style={{ boxShadow: '...' }}` converted to `shadow-[...]`
- **Backdrop filters**: `style={{ backdropFilter: 'blur(4px)' }}` converted to `backdrop-blur-[4px]`
- **RGBA backgrounds**: `style={{ background: 'rgba(0,0,0,0.55)' }}` converted to `bg-black/55`
- **Spinner borders**: `style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }}` converted to `border-[var(--accent)] border-t-transparent`
- **Compound border-radius**: `style={{ borderRadius: '12px 12px var(--r-lg) var(--r-lg)' }}` converted to `rounded-[12px_12px_var(--r-lg)_var(--r-lg)]`
- **color-mix hover**: `e.currentTarget.style.borderColor = 'color-mix(...)'` converted to `hover:border-[color-mix(in_oklab,var(--accent),transparent_50%)]`

## Hover Handler Migration

All 12 `onMouseEnter`/`onMouseLeave` pairs replaced with declarative Tailwind `hover:` classes:

- **Layout KB items + NavItem**: Conditional background on hover converted to `hover:bg-[var(--surface)]` alongside ternary className for active/inactive state
- **CommandPalette items**: Hover highlight converted to `hover:bg-[var(--surface)]` with first-item active state via ternary
- **AddPodcastModal show cards**: `hover:bg-[var(--surface)]`
- **AddPodcastModal episode cards**: `hover:bg-[var(--surface)]`
- **AddToKBModal KB cards**: Border color hover converted to `hover:border-[color-mix(...)]`

## Conditional Styles

Elements with state-dependent styles (active nav items, mode tabs, audio/transcript buttons) use template literal classNames with ternary expressions instead of style objects.

## Verification

- `npm run build` succeeds with zero errors
- Zero `style={{` attributes remaining across all 5 files
- Zero `onMouseEnter`/`onMouseLeave` handlers remaining
- All component logic, state management, and non-hover event handlers unchanged
