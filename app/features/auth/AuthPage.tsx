import { useRef, useState } from 'react'
import { KindredSprite } from '@/components/Sprite'
import { Button, Panel, Speech } from '@/components/ui'
import { HazeBackdrop } from '@/components/HazeBackdrop'
import { SupportLink, SupportSheet } from '@/components/SupportSheet'
import { useGame } from '@/store/game'
import { getBackend } from '@/lib/backend'
import { isSupabaseConfigured } from '@/lib/supabase'
import { sfx } from '@/lib/audio'

/**
 * The way back in.
 *
 * A guest save lives in one browser's localStorage, and browsers throw that
 * away — iOS evicts it after about a week of not visiting, private tabs never
 * keep it, and clearing site data wipes it. Losing a streak that way is the
 * worst thing this app can do to someone, so there are three doors here:
 *
 *   1. Email sign-in — a real account, works across devices. Needs Supabase.
 *   2. Restore from a backup file — works with no server at all.
 *   3. Start fresh.
 */
export function AuthPage({ onNewGame }: { onNewGame: () => void }) {
  const online = isSupabaseConfigured
  const bootstrap = useGame((s) => s.bootstrap)
  const [mode, setMode] = useState<'choose' | 'email'>('choose')
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function sendMagicLink() {
    if (!email.includes('@')) {
      setStatus({ tone: 'bad', text: 'That doesn’t look like an email address.' })
      return
    }
    setBusy(true)
    setStatus(null)
    try {
      const backend = await getBackend()
      const res = await backend.auth.signInWithEmail(email.trim())
      setStatus({ tone: res.sent ? 'ok' : 'bad', text: res.message })
    } catch (err) {
      setStatus({ tone: 'bad', text: (err as Error).message })
    } finally {
      setBusy(false)
    }
  }

  async function restoreFromFile(file: File) {
    setBusy(true)
    setStatus(null)
    try {
      const text = await file.text()
      const backend = await getBackend()
      const res = await backend.auth.importData(JSON.parse(text))
      setStatus({ tone: res.ok ? 'ok' : 'bad', text: res.message })
      if (res.ok) {
        sfx.evolve()
        await bootstrap()
      }
    } catch {
      setStatus({ tone: 'bad', text: 'Couldn’t read that file. Is it the backup you downloaded?' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative min-h-full">
      <HazeBackdrop streak={0} />
      <SupportSheet />

      <div className="mx-auto flex min-h-full w-full max-w-lg flex-col justify-center px-4 py-10">
        <div className="text-center">
          <KindredSprite speciesId="lanternjack" stage={2} size={88} />
          <h1 className="mt-4 font-display text-lg text-bone-100">HOLLOWMOOR</h1>
          <p className="mt-2 font-display text-[9px] tracking-widest text-haze-300">
            A REGION UNDER THE HAZE
          </p>
        </div>

        {mode === 'choose' && (
          <div className="mt-8 space-y-3">
            <Button className="w-full" onClick={onNewGame}>
              Start a new Breaker
            </Button>

            {online ? (
              <Button
                variant="ghost"
                className="w-full"
                onClick={() => {
                  setMode('email')
                  setStatus(null)
                }}
              >
                I already have an account
              </Button>
            ) : (
              <Panel className="text-left">
                <p className="text-[12px] text-bone-300/75">
                  There are no accounts yet — this build saves to{' '}
                  <span className="text-bone-100">this browser only</span>. Browsers throw that away
                  eventually, so back your save up from Settings and keep the file.
                </p>
              </Panel>
            )}

            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              className="w-full py-3 text-[12px] text-bone-300/70 underline decoration-bone-500/40 underline-offset-4 hover:text-bone-100"
            >
              Restore from a backup file
            </button>
          </div>
        )}

        {mode === 'email' && (
          <div className="mt-8 space-y-3">
            <Panel>
              <label htmlFor="email" className="text-[10px] uppercase tracking-widest text-bone-300/70">
                Your email
              </label>
              <input
                id="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void sendMagicLink()
                }}
                placeholder="you@example.com"
                className="mt-2 w-full border-2 border-haze-600 bg-haze-950 px-3 py-3 text-base text-bone-100 placeholder:text-bone-500/50"
              />
              <p className="mt-2 text-[11px] text-bone-300/60">
                We send a sign-in link. No password to forget, and your streak follows you to any
                device.
              </p>
              <Button className="mt-4 w-full" disabled={busy} onClick={() => void sendMagicLink()}>
                {busy ? 'sending…' : 'Send me a link'}
              </Button>
            </Panel>

            <Button variant="ghost" className="w-full" onClick={() => setMode('choose')}>
              Back
            </Button>
          </div>
        )}

        {status && (
          <p
            className={`mt-4 border-2 p-3 text-[12px] ${
              status.tone === 'ok'
                ? 'border-clear-600 text-clear-400'
                : 'border-amber-warn/60 text-amber-warn'
            }`}
            role="status"
          >
            {status.text}
          </p>
        )}

        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void restoreFromFile(file)
            e.target.value = ''
          }}
        />

        <div className="mt-8">
          <Speech who="vale">
            However you get in, the number is the number. Nobody can take a day off you that you
            actually did.
          </Speech>
        </div>

        <div className="mt-6 flex justify-center">
          <SupportLink />
        </div>
      </div>
    </div>
  )
}
