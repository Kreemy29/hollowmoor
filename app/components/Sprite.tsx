import { useMemo } from 'react'
import type { AvatarConfig } from '@/lib/types'
import { speciesById } from '@/data/kindred'
import {
  GRID,
  buildAvatar,
  buildSprite,
  gridPaths,
  palette,
  spritePaths,
} from '@/lib/sprite'

interface KindredSpriteProps {
  speciesId: string
  stage: 1 | 2 | 3
  /** Rendered size in px. The sprite is vector, so any size stays crisp. */
  size?: number
  /** Asleep after a relapse: desaturated, with visible Z's. */
  dimmed?: boolean
  /** Idle bob. Disabled automatically under prefers-reduced-motion (see CSS). */
  animate?: boolean
  className?: string
  title?: string
}

export function KindredSprite({
  speciesId,
  stage,
  size = 96,
  dimmed = false,
  animate = true,
  className = '',
  title,
}: KindredSpriteProps) {
  const species = speciesById(speciesId)
  const paths = useMemo(() => {
    if (!species) return []
    const grid = buildSprite(species.id, species.archetype, stage)
    return spritePaths(grid, palette(species.hue, dimmed))
  }, [species, stage, dimmed])

  if (!species) return null
  const label = title ?? `${species.stageNames[stage - 1]}${dimmed ? ', asleep' : ''}`

  return (
    <div
      className={`relative inline-block ${className}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label={label}
    >
      <svg
        viewBox={`0 0 ${GRID} ${GRID}`}
        width={size}
        height={size}
        shapeRendering="crispEdges"
        className={animate ? 'hm-bob' : undefined}
        aria-hidden="true"
      >
        {paths.map((p) => (
          <path key={p.fill + p.d.length} d={p.d} fill={p.fill} />
        ))}
      </svg>
      {dimmed && (
        <span
          className="pointer-events-none absolute -top-1 right-0 font-display text-[10px] text-bone-300/70"
          aria-hidden="true"
        >
          z z
        </span>
      )}
    </div>
  )
}

export function AvatarSprite({
  avatar,
  size = 48,
  className = '',
  showAura = true,
}: {
  avatar: AvatarConfig
  size?: number
  className?: string
  showAura?: boolean
}) {
  const paths = useMemo(() => {
    const { grid, colors } = buildAvatar(avatar)
    return gridPaths(grid, colors)
  }, [avatar])

  return (
    <div
      className={`relative inline-block ${className}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label="Breaker avatar"
    >
      {showAura && (
        <span
          className="absolute inset-0 rounded-full opacity-40 blur-[6px]"
          style={{ background: avatar.accent }}
          aria-hidden="true"
        />
      )}
      <svg
        viewBox={`0 0 ${GRID} ${GRID}`}
        width={size}
        height={size}
        shapeRendering="crispEdges"
        className="relative"
        aria-hidden="true"
      >
        {paths.map((p) => (
          <path key={p.fill + p.d.length} d={p.d} fill={p.fill} />
        ))}
      </svg>
    </div>
  )
}
