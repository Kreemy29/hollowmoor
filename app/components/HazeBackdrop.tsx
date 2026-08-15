import { useMemo } from 'react'

/**
 * The Haze itself — a drifting purple fog behind every screen whose density
 * falls as the streak climbs. At day zero it is thick and close; at Clearsummit
 * it is a thin band on the horizon. It is the only ambient art in the app and
 * it carries the whole "you are moving through a region" feeling.
 */
export function HazeBackdrop({ streak }: { streak: number }) {
  // 1.0 at day zero → ~0.15 at a year. Deliberately steep in week one so the
  // very first clean days visibly clear the air.
  const density = useMemo(() => Math.max(0.15, 1 - Math.log10(1 + streak) / 2.2), [streak])

  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden="true">
      <div className="absolute inset-0 bg-haze-950" />

      {/* Distant ridgeline — Clearsummit, visible once the fog thins. */}
      <svg
        className="absolute inset-x-0 bottom-0 h-[42vh] w-full"
        viewBox="0 0 400 200"
        preserveAspectRatio="none"
      >
        <path d="M0 200 L0 120 L60 70 L110 105 L160 45 L220 100 L280 60 L340 110 L400 80 L400 200 Z" fill="#1e1440" />
        <path d="M0 200 L0 150 L70 115 L130 150 L190 110 L250 145 L320 120 L400 155 L400 200 Z" fill="#150e2b" />
      </svg>

      {/* Two fog bands drifting at different speeds. */}
      <div
        className="absolute inset-x-[-20%] top-[18%] h-[45vh] blur-2xl"
        style={{
          opacity: density * 0.75,
          background:
            'radial-gradient(60% 60% at 30% 50%, #4e33a0 0%, transparent 70%), radial-gradient(50% 70% at 75% 40%, #6d4aff 0%, transparent 70%)',
          animation: 'hm-drift 34s ease-in-out infinite alternate',
        }}
      />
      <div
        className="absolute inset-x-[-20%] top-[45%] h-[55vh] blur-3xl"
        style={{
          opacity: density * 0.6,
          background:
            'radial-gradient(55% 60% at 65% 40%, #3a2676 0%, transparent 70%), radial-gradient(45% 55% at 20% 60%, #2a1b57 0%, transparent 70%)',
          animation: 'hm-drift 52s ease-in-out infinite alternate-reverse',
        }}
      />

      {/* A faint teal glow from above once you're properly clear of it. */}
      {streak >= 7 && (
        <div
          className="absolute inset-x-0 top-0 h-[30vh]"
          style={{
            opacity: Math.min(0.35, (streak - 7) / 120 + 0.08),
            background: 'linear-gradient(to bottom, #14e0bd22, transparent)',
          }}
        />
      )}

      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-haze-950" />
    </div>
  )
}
