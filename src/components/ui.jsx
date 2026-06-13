import { statusConfig } from '../lib/utils'

export function StatusPip({ status }) {
  const config = statusConfig[status] || { color: 'var(--text-mute)', label: status, anim: false }
  return (
    <span className="inline-flex items-center gap-1.5 mono text-[11px]" style={{ color: config.color }} role="status" aria-label={`Status: ${config.label}`}>
      <span
        className="w-[7px] h-[7px] rounded-full"
        style={{
          background: config.color,
          animation: config.anim ? 'pulse-dot 1.2s ease-in-out infinite' : 'none',
        }}
      />
      {config.label}
    </span>
  )
}

const KB_COLORS = {
  copper: 'oklch(0.72 0.13 50)',
  sage: 'oklch(0.7 0.1 145)',
  plum: 'oklch(0.65 0.13 320)',
  ink: 'oklch(0.7 0.1 230)',
}

export function KBGlyph({ name, color = 'copper', size = 24, className = '' }) {
  const c = KB_COLORS[color] || KB_COLORS.copper
  const initial = (name || 'K').charAt(0).toUpperCase()
  return (
    <div
      className={`inline-flex items-center justify-center font-semibold serif shrink-0 ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: 'var(--r-sm)',
        background: `color-mix(in oklab, ${c}, transparent 80%)`,
        border: `1px solid color-mix(in oklab, ${c}, transparent 60%)`,
        color: c,
        fontSize: size * 0.45,
      }}
      aria-hidden="true"
    >
      {initial}
    </div>
  )
}

export function SectionHeader({ title, subtitle, action }) {
  return (
    <div className="flex items-end justify-between mb-3.5 gap-3">
      <div>
        <h2 className="m-0 text-[13px] mono uppercase tracking-[0.08em] mute font-medium">
          {title}
        </h2>
        {subtitle && <p className="mt-1 text-[13px] dim">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

const TAG_CLASSES = {
  default: 'bg-[var(--surface)] text-[var(--text-dim)] border border-[var(--border)]',
  accent: 'bg-[var(--accent-faint)] text-[var(--accent)] border border-[var(--accent-soft)]',
  success: 'bg-[color-mix(in_oklab,var(--success),transparent_80%)] text-[var(--success)] border border-[color-mix(in_oklab,var(--success),transparent_70%)]',
}

export function Tag({ children, variant = 'default', icon, onClick }) {
  const v = TAG_CLASSES[variant] || TAG_CLASSES.default
  const cls = `inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] mono lowercase ${v} ${onClick ? 'cursor-pointer' : 'cursor-default'}`
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cls}>
        {icon}
        {children}
      </button>
    )
  }
  return (
    <span className={cls}>
      {icon}
      {children}
    </span>
  )
}

const BUTTON_VARIANTS = {
  primary: 'bg-[var(--accent)] text-[var(--accent-fg)] border border-transparent hover:brightness-110',
  secondary: 'bg-[var(--surface)] text-[var(--text)] border border-[var(--border)] hover:border-[color-mix(in_oklab,var(--accent),transparent_50%)]',
  danger: 'bg-[var(--error)] text-[var(--accent-fg)] border border-transparent hover:brightness-110',
  ghost: 'bg-transparent text-[var(--text-dim)] border border-transparent hover:bg-[var(--surface)] hover:text-[var(--text)]',
}

const BUTTON_SIZES = {
  sm: 'px-3 py-1.5 text-[12px] gap-1.5 min-h-[32px]',
  md: 'px-4 py-2 text-[13px] gap-2 min-h-[38px]',
}

export function Button({ variant = 'primary', size = 'md', loading = false, disabled, className = '', children, ...props }) {
  const v = BUTTON_VARIANTS[variant] || BUTTON_VARIANTS.primary
  const s = BUTTON_SIZES[size] || BUTTON_SIZES.md
  const isDisabled = disabled || loading
  return (
    <button
      type="button"
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={`inline-flex items-center justify-center font-medium rounded-[var(--r-md)] transition-all ${v} ${s} ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}
      {...props}
    >
      {loading && (
        <span
          className="w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin"
          aria-hidden="true"
        />
      )}
      {children}
    </button>
  )
}

export function EmptyState({ icon, title, subtitle, action }) {
  return (
    <div className="text-center py-16 border border-dashed border-[var(--border)] rounded-[var(--r-lg)]">
      {icon && (
        <div className="mx-auto mb-3 flex items-center justify-center text-[var(--text-mute)]" aria-hidden="true">
          {icon}
        </div>
      )}
      {title && <p className="mute mb-1">{title}</p>}
      {subtitle && <p className="text-sm mute">{subtitle}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  )
}
