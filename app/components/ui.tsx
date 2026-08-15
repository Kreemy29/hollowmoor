import { forwardRef } from 'react'
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { sfx } from '@/lib/audio'

/** Shared chrome: chunky panels, pixel headers, big thumb-friendly buttons. */

export function Panel({
  children,
  className = '',
  ...rest
}: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return (
    <div className={`hm-panel rounded-sm p-4 ${className}`} {...rest}>
      {children}
    </div>
  )
}

export function PanelTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 className="font-display text-[11px] tracking-wide text-clear-400 uppercase">{children}</h2>
      {right}
    </div>
  )
}

type Variant = 'primary' | 'danger' | 'ghost' | 'ember'

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-clear-600 text-haze-950 border-clear-400 hover:bg-clear-500 active:translate-y-[2px]',
  ember: 'bg-ember-600 text-bone-100 border-ember-400 hover:bg-ember-500 active:translate-y-[2px]',
  danger:
    'bg-haze-800 text-amber-warn border-amber-warn/60 hover:bg-haze-700 active:translate-y-[2px]',
  ghost: 'bg-haze-800/70 text-bone-100 border-haze-600 hover:bg-haze-700 active:translate-y-[2px]',
}

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }
>(function Button({ variant = 'primary', className = '', onClick, children, ...rest }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      className={`font-display text-[10px] leading-relaxed border-2 px-4 py-3 rounded-sm transition-[background,transform] disabled:opacity-40 disabled:pointer-events-none ${VARIANTS[variant]} ${className}`}
      onClick={(e) => {
        sfx.select()
        onClick?.(e)
      }}
      {...rest}
    >
      {children}
    </button>
  )
})

export function LinkButton({
  to,
  variant = 'ghost',
  className = '',
  children,
}: {
  to: string
  variant?: Variant
  className?: string
  children: ReactNode
}) {
  return (
    <Link
      to={to}
      onClick={() => sfx.select()}
      className={`inline-block text-center font-display text-[10px] leading-relaxed border-2 px-4 py-3 rounded-sm transition-[background,transform] ${VARIANTS[variant]} ${className}`}
    >
      {children}
    </Link>
  )
}

export function Stat({
  label,
  value,
  tone = 'clear',
  sub,
}: {
  label: string
  value: ReactNode
  tone?: 'clear' | 'ember' | 'bone' | 'warn'
  sub?: string
}) {
  const color = {
    clear: 'text-clear-400',
    ember: 'text-ember-400',
    bone: 'text-bone-100',
    warn: 'text-amber-warn',
  }[tone]
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-widest text-bone-300/70">{label}</div>
      <div className={`font-display text-lg ${color}`}>{value}</div>
      {sub && <div className="text-[11px] text-bone-300/60">{sub}</div>}
    </div>
  )
}

export function ProgressBar({
  value,
  max,
  tone = 'clear',
  label,
  height = 12,
}: {
  value: number
  max: number
  tone?: 'clear' | 'ember' | 'haze'
  label?: string
  height?: number
}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0
  const fill = { clear: 'bg-clear-500', ember: 'bg-ember-500', haze: 'bg-haze-400' }[tone]
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label={label}
      className="w-full border-2 border-haze-600 bg-haze-950"
      style={{ height }}
    >
      <div
        className={`h-full ${fill} transition-[width] duration-500`}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

export function Chip({
  children,
  tone = 'haze',
}: {
  children: ReactNode
  tone?: 'haze' | 'clear' | 'ember' | 'warn'
}) {
  const cls = {
    haze: 'border-haze-500 text-bone-300',
    clear: 'border-clear-500 text-clear-400',
    ember: 'border-ember-500 text-ember-400',
    warn: 'border-amber-warn text-amber-warn',
  }[tone]
  return (
    <span className={`inline-block border px-2 py-0.5 text-[10px] uppercase tracking-wider ${cls}`}>
      {children}
    </span>
  )
}

export function Speech({
  who,
  children,
}: {
  who: 'dealer' | 'vale' | 'grunt'
  children: ReactNode
}) {
  const meta = {
    dealer: { name: 'THE DEALER', color: 'text-haze-300', border: 'border-haze-400' },
    vale: { name: 'PROF. VALE', color: 'text-clear-400', border: 'border-clear-600' },
    grunt: { name: 'HAZE GRUNT', color: 'text-amber-warn', border: 'border-amber-warn/50' },
  }[who]
  return (
    <div className={`border-l-4 ${meta.border} bg-haze-900/60 py-2 pl-3 pr-2`}>
      <div className={`font-display text-[9px] ${meta.color}`}>{meta.name}</div>
      <p className="mt-1 text-sm text-bone-100/90">{children}</p>
    </div>
  )
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="border-2 border-dashed border-haze-600 p-6 text-center">
      <div className="font-display text-[11px] text-bone-300">{title}</div>
      <p className="mt-2 text-sm text-bone-300/70">{body}</p>
    </div>
  )
}

export function PageTitle({ children, sub }: { children: ReactNode; sub?: string }) {
  return (
    <header className="mb-4">
      <h1 className="font-display text-sm text-bone-100">{children}</h1>
      {sub && <p className="mt-2 text-sm text-bone-300/70">{sub}</p>}
    </header>
  )
}
