import { useState } from 'react'
import { Button, Panel, PanelTitle, PageTitle } from '@/components/ui'
import { SupportLink } from '@/components/SupportSheet'
import { useGame } from '@/store/game'
import { useUi } from '@/store/ui'
import { getBackend } from '@/lib/backend'
import { setAudioEnabled, sfx } from '@/lib/audio'
import { disablePush, enablePush, pushConfigured } from '@/lib/push'
import type { PlayerSettings } from '@/lib/types'

export function SettingsPage() {
  const snapshot = useGame((s) => s.snapshot)
  const updateSettings = useGame((s) => s.updateSettings)
  const signOut = useGame((s) => s.signOut)
  const online = useGame((s) => s.backend?.online ?? false)
  const toast = useUi((s) => s.toast)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  if (!snapshot) return null
  const s = snapshot.profile.settings

  const toggle = async (key: keyof PlayerSettings, value: boolean) => {
    await updateSettings({ [key]: value } as Partial<PlayerSettings>)
    if (key === 'audioEnabled') {
      setAudioEnabled(value)
      if (value) sfx.win()
    }
  }

  return (
    <div className="space-y-4">
      <PageTitle>SETTINGS</PageTitle>

      <Panel>
        <PanelTitle>Feel</PanelTitle>
        <Toggle
          label="Sound"
          hint="Chiptune blips, off by default."
          checked={s.audioEnabled}
          onChange={(v) => void toggle('audioEnabled', v)}
        />
        <Toggle
          label="Reduce motion"
          hint={
            s.reducedMotion === null
              ? 'Following your system setting.'
              : 'Overriding your system setting.'
          }
          checked={s.reducedMotion === true}
          onChange={(v) => void updateSettings({ reducedMotion: v ? true : null })}
        />
        <Toggle
          label="Gentle mode"
          hint="Mutes the Dealer entirely. Vale still shows up. No judgement either way."
          checked={s.gentleMode}
          onChange={(v) => void toggle('gentleMode', v)}
        />
      </Panel>

      <Panel>
        <PanelTitle>Who can see you</PanelTitle>
        <p className="mb-3 text-[12px] text-bone-300/70">
          Your handle, streak, companion and avatar are visible on the leaderboard and in the town
          square. Your check-in notes and trigger tags are never shared with anyone.
        </p>
        <Toggle
          label="Private profile"
          hint="Hides you from the global leaderboard and the square. Friends still see you."
          checked={s.privateProfile}
          onChange={(v) => void toggle('privateProfile', v)}
        />
      </Panel>

      <Panel>
        <PanelTitle>Reminders</PanelTitle>
        <Toggle
          label="Push notifications"
          hint={
            pushConfigured()
              ? 'One in the morning, one in the evening — and nothing at all once you’ve checked in.'
              : online
                ? 'Needs a VAPID key. See README → “Notifications”.'
                : 'Needs a Supabase project.'
          }
          checked={s.pushEnabled}
          disabled={!pushConfigured()}
          onChange={async (v) => {
            const res = v ? await enablePush() : await disablePush()
            toast({ tone: res.ok ? 'win' : 'warn', title: res.ok ? 'Saved' : 'Not enabled', body: res.message })
          }}
        />
        <Toggle
          label="Email reminders"
          hint={online ? 'Only if you’ve linked an email.' : 'Needs a Supabase project.'}
          checked={s.emailReminders}
          disabled={!online}
          onChange={(v) => void toggle('emailReminders', v)}
        />
      </Panel>

      <Panel>
        <PanelTitle>Your data</PanelTitle>
        <p className="mb-3 text-[12px] text-bone-300/70">
          Friend code <span className="font-display text-[10px] text-clear-400">{snapshot.profile.friendCode}</span>
          {' · '}
          {online ? 'Synced to your Supabase project.' : 'Stored only in this browser.'}
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <Button
            variant="ghost"
            onClick={async () => {
              const backend = await getBackend()
              const data = await backend.auth.exportData()
              const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url
              a.download = `hollowmoor-${snapshot.profile.handle}.json`
              a.click()
              URL.revokeObjectURL(url)
              toast({ tone: 'info', title: 'Export downloaded' })
            }}
          >
            Export my data
          </Button>
          <Button variant="ghost" onClick={() => void signOut()}>
            Sign out
          </Button>
        </div>

        <div className="mt-4 border-t-2 border-haze-700 pt-4">
          {confirmingDelete ? (
            <div className="space-y-3">
              <p className="text-sm text-amber-warn">
                This erases your streak, your Kindred, your badges and your Grit. It cannot be
                undone.
              </p>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setConfirmingDelete(false)}>
                  Keep my account
                </Button>
                <Button
                  variant="danger"
                  className="flex-1"
                  onClick={async () => {
                    const backend = await getBackend()
                    await backend.auth.deleteAccount()
                    window.location.href = '/'
                  }}
                >
                  Delete everything
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="danger" onClick={() => setConfirmingDelete(true)}>
              Delete my account
            </Button>
          )}
        </div>
      </Panel>

      <Panel>
        <PanelTitle>About</PanelTitle>
        <p className="text-[12px] text-bone-300/70">
          Hollowmoor is a game about quitting cannabis. It is not treatment and it is not medical
          advice. The Dealer is a cartoon; the streak is real.
        </p>
        <div className="mt-3">
          <SupportLink />
        </div>
      </Panel>
    </div>
  )
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: string
  hint: string
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <label
      className={`flex items-start justify-between gap-4 border-b border-haze-700 py-3 last:border-0 ${
        disabled ? 'opacity-45' : 'cursor-pointer'
      }`}
    >
      <span className="min-w-0">
        <span className="block text-sm text-bone-100">{label}</span>
        <span className="mt-0.5 block text-[11px] text-bone-300/60">{hint}</span>
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-6 w-6 shrink-0 accent-[#14e0bd]"
      />
    </label>
  )
}
