import { statusConfig } from '../lib/utils'

export function StatusPip({ status }) {
  const config = statusConfig[status] || { color: 'var(--text-mute)', label: status, anim: false }
  return (
    <span className="inline-flex items-center gap-1.5 mono text-[11px]" style={{ color: config.color }}>
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

export function KBGlyph({ name, color = 'copper', size = 24 }) {
  const c = KB_COLORS[color] || KB_COLORS.copper
  const initial = (name || 'K').charAt(0).toUpperCase()
  return (
    <div
      className="inline-flex items-center justify-center font-semibold serif shrink-0"
      style={{
        width: size,
        height: size,
        borderRadius: 'var(--r-sm)',
        background: `color-mix(in oklab, ${c}, transparent 80%)`,
        border: `1px solid color-mix(in oklab, ${c}, transparent 60%)`,
        color: c,
        fontSize: size * 0.45,
      }}
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
  return (
    <span
      onClick={onClick}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] mono lowercase ${v} ${onClick ? 'cursor-pointer' : 'cursor-default'}`}
    >
      {icon}
      {children}
    </span>
  )
}
