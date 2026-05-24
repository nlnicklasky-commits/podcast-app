# T4 — ErrorBoundary Component

## Files created / modified

| File | Action |
|------|--------|
| `src/components/ErrorBoundary.jsx` | Created |
| `src/App.jsx` | Modified — wrapped Layout+Routes with ErrorBoundary |

## ErrorBoundary component

React class component (required by the error boundary API) that catches any uncaught rendering error in its subtree.

- **`getDerivedStateFromError`** sets `hasError` and stores the error object.
- **`componentDidCatch`** logs the error and component stack to `console.error`.
- **Fallback UI** — viewport-centered card using the app's CSS custom properties (`--bg`, `--surface`, `--text`, `--accent`, `--error`, `--border`, `--r-lg`, `--r-md`, `--font-mono`) via Tailwind arbitrary-value classes. Shows a warning icon, heading, description, "Try again" button (resets state + reloads), and a collapsible error details section.
- **`reset()`** — clears error state and calls `window.location.reload()` to give the user a clean slate.
- All styling uses Tailwind utility classes with `var()` references; zero inline `style` attributes.

## Integration in App.jsx

ErrorBoundary wraps `<Layout>` (and its child `<Routes>`) inside `<BrowserRouter>`. This placement ensures:

1. Any rendering error in Layout, any page component, or any nested child is caught.
2. BrowserRouter remains outside the boundary so the router itself is not disrupted by the error reset flow (reload handles router re-init anyway).

## Build verification

Production build (`vite build`) passes with no errors after changes.
