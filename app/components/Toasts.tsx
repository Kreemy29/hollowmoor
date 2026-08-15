import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useUi } from '@/store/ui'

const TONE = {
  win: 'border-clear-400 text-clear-400',
  info: 'border-haze-400 text-bone-100',
  warn: 'border-amber-warn text-amber-warn',
}

export function Toasts() {
  const toasts = useUi((s) => s.toasts)
  const dismiss = useUi((s) => s.dismiss)

  useEffect(() => {
    if (toasts.length === 0) return
    const timers = toasts.map((t) => window.setTimeout(() => dismiss(t.id), 4200))
    return () => timers.forEach(window.clearTimeout)
  }, [toasts, dismiss])

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-12 z-40 mx-auto flex w-full max-w-2xl flex-col items-center gap-2 px-3"
      role="status"
      aria-live="polite"
    >
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            className={`pointer-events-auto w-full max-w-sm border-2 bg-haze-900/95 px-3 py-2 ${TONE[t.tone]}`}
            onClick={() => dismiss(t.id)}
          >
            <div className="font-display text-[10px]">{t.title}</div>
            {t.body && <div className="mt-1 text-[12px] text-bone-300/80">{t.body}</div>}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
