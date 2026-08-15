import { useEffect, useRef } from 'react'
import { useUi } from '@/store/ui'
import { Button } from './ui'

/**
 * The quiet door to real help (§9.3).
 *
 * Reachable from Settings and from the relapse screen, and surfaced once —
 * never repeatedly — when the app notices a relapse cluster or a check-in note
 * that reads like genuine distress. No lecture, no diagnosis, easy to close.
 *
 * ⚠ BEFORE SHIPPING: verify these numbers are current and add entries for the
 * regions your friends actually live in. Helpline numbers change; a dead
 * number is worse than no number. See README → "Wellbeing".
 */

interface Helpline {
  region: string
  name: string
  contact: string
  href: string
  note: string
}

const HELPLINES: Helpline[] = [
  {
    region: 'United States',
    name: 'SAMHSA National Helpline',
    contact: '1-800-662-4357',
    href: 'tel:18006624357',
    note: 'Free, confidential, 24/7, treatment referral and information.',
  },
  {
    region: 'United Kingdom',
    name: 'Frank',
    contact: '0300 123 6600',
    href: 'tel:03001236600',
    note: 'Friendly, confidential drugs advice, 24/7.',
  },
  {
    region: 'Canada',
    name: 'Wellness Together Canada',
    contact: '1-866-585-0445',
    href: 'tel:18665850445',
    note: 'Free mental health and substance use support.',
  },
  {
    region: 'Australia',
    name: 'National Alcohol and Other Drug Hotline',
    contact: '1800 250 015',
    href: 'tel:1800250015',
    note: 'Free and confidential advice, 24/7.',
  },
]

export function SupportSheet() {
  const open = useUi((s) => s.supportOpen)
  const close = useUi((s) => s.closeSupport)
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-haze-950/80 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="support-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) close()
      }}
    >
      <div className="hm-panel hm-rise max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-t-sm p-5 sm:rounded-sm">
        <h2 id="support-title" className="font-display text-[12px] text-clear-400">
          Need real support?
        </h2>
        <p className="mt-3 text-sm text-bone-300/85">
          Hollowmoor is a game. It is not treatment, and it is not a substitute for talking to a
          person. If today is heavier than a game can hold, these are real, free, confidential
          services.
        </p>

        <ul className="mt-4 space-y-3">
          {HELPLINES.map((h) => (
            <li key={h.region} className="border-2 border-haze-600 bg-haze-900/60 p-3">
              <div className="text-[10px] uppercase tracking-widest text-bone-300/60">{h.region}</div>
              <div className="mt-1 text-sm text-bone-100">{h.name}</div>
              <a
                href={h.href}
                className="mt-1 inline-block font-display text-[11px] text-clear-400 underline decoration-clear-600 underline-offset-4"
              >
                {h.contact}
              </a>
              <p className="mt-1 text-[12px] text-bone-300/70">{h.note}</p>
            </li>
          ))}
        </ul>

        <p className="mt-4 text-[12px] text-bone-300/60">
          If someone is in immediate danger, call your local emergency number.
        </p>

        <div className="mt-5 flex justify-end">
          <Button ref={closeRef} variant="ghost" onClick={close}>
            Close
          </Button>
        </div>
      </div>
    </div>
  )
}

/** The small, permanently available entry point. Calm, never naggy. */
export function SupportLink({ className = '' }: { className?: string }) {
  const open = useUi((s) => s.openSupport)
  return (
    <button
      type="button"
      onClick={open}
      className={`text-[11px] text-bone-300/60 underline decoration-bone-500/40 underline-offset-4 hover:text-bone-100 ${className}`}
    >
      Need real support?
    </button>
  )
}
