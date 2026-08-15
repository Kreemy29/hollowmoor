import { Link } from 'react-router-dom'
import { AvatarSprite } from '@/components/Sprite'
import { Panel, PageTitle, Stat } from '@/components/ui'
import { SupportLink } from '@/components/SupportSheet'
import { useGame } from '@/store/game'
import { breakerLevel } from '@/lib/rules'

const LINKS = [
  { to: '/kindred', label: 'Your Kindred', glyph: '🐾', blurb: 'Companion, evolution ladder, party' },
  { to: '/codex', label: 'The Codex', glyph: '📖', blurb: 'Every creature in Hollowmoor' },
  { to: '/trials', label: 'Trigger Trials', glyph: '🎖', blurb: 'Eight badges and the endgame' },
  { to: '/raid', label: 'The Haze Titan', glyph: '💥', blurb: 'This week’s co-op boss' },
  { to: '/board', label: 'The Board', glyph: '🏆', blurb: 'Leaderboard, friends, friend codes' },
  { to: '/arena', label: 'The Arena', glyph: '⚔', blurb: 'Streak duels and trades' },
  { to: '/shop', label: 'The Shop', glyph: '🛒', blurb: 'Spend your Grit' },
  { to: '/settings', label: 'Settings', glyph: '⚙', blurb: 'Sound, privacy, data, account' },
]

export function MenuPage() {
  const snapshot = useGame((s) => s.snapshot)
  if (!snapshot) return null
  const { profile, streaks, grit } = snapshot

  return (
    <div className="space-y-4">
      <PageTitle>MORE</PageTitle>

      <Panel>
        <div className="flex items-center gap-4">
          <AvatarSprite avatar={profile.avatar} size={64} />
          <div className="min-w-0 flex-1">
            <div className="font-display text-[12px] text-bone-100">{profile.handle}</div>
            <div className="mt-1 text-[11px] text-bone-300/60">
              Breaker Lv.{breakerLevel(streaks.totalCleanDays, streaks.bestStreak)} ·{' '}
              {profile.friendCode}
            </div>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-3 border-t-2 border-haze-700 pt-3">
          <Stat label="Clean days" value={streaks.totalCleanDays} tone="clear" />
          <Stat label="Resets" value={streaks.relapseCount} tone="warn" />
          <Stat label="Grit" value={`✦${grit}`} tone="ember" />
        </div>
      </Panel>

      <nav className="grid gap-2">
        {LINKS.map((link) => (
          <Link
            key={link.to}
            to={link.to}
            className="hm-panel flex items-center gap-3 p-3 hover:border-clear-600"
          >
            <span className="text-xl" aria-hidden="true">
              {link.glyph}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-display text-[10px] text-bone-100">{link.label}</span>
              <span className="mt-0.5 block text-[11px] text-bone-300/60">{link.blurb}</span>
            </span>
            <span className="text-bone-300/40" aria-hidden="true">
              ›
            </span>
          </Link>
        ))}
      </nav>

      <div className="flex justify-center pt-2">
        <SupportLink />
      </div>
    </div>
  )
}
