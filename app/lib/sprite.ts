import type { Archetype } from '@/data/kindred'

/**
 * Procedural pixel-sprite generator.
 *
 * Every Kindred sprite in the game is drawn here from its species id, hue and
 * archetype — no ripped assets, no art pipeline, and a new species gets three
 * evolution stages of original art the moment you add it to the roster.
 *
 * The generator is *constructive*, not noise-based: it composes ellipses and
 * limbs on a 16x16 grid and mirrors the left half, which reads as a deliberate
 * creature at 16px where random blobs read as mush.
 */

export const GRID = 16

/** Palette slots. Index 0 is transparent. */
export const EMPTY = 0
export const OUTLINE = 1
export const SHADOW = 2
export const BASE = 3
export const LIGHT = 4
export const EYE = 5
export const ACCENT = 6

export type SpriteGrid = Uint8Array // GRID * GRID, row-major

function hashString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

class Canvas {
  readonly cells: Uint8Array

  constructor() {
    this.cells = new Uint8Array(GRID * GRID)
  }

  set(x: number, y: number, v: number) {
    if (x < 0 || y < 0 || x >= GRID || y >= GRID) return
    this.cells[y * GRID + x] = v
  }

  get(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= GRID || y >= GRID) return EMPTY
    return this.cells[y * GRID + x]
  }

  ellipse(cx: number, cy: number, rx: number, ry: number, v = BASE) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y += 1) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x += 1) {
        const dx = (x - cx) / rx
        const dy = (y - cy) / ry
        if (dx * dx + dy * dy <= 1.05) this.set(x, y, v)
      }
    }
  }

  rect(x0: number, y0: number, w: number, h: number, v = BASE) {
    for (let y = y0; y < y0 + h; y += 1) for (let x = x0; x < x0 + w; x += 1) this.set(x, y, v)
  }
}

/** Mirror the left half onto the right so the creature is bilaterally symmetric. */
function mirror(c: Canvas) {
  for (let y = 0; y < GRID; y += 1) {
    for (let x = 0; x < GRID / 2; x += 1) {
      c.set(GRID - 1 - x, y, c.get(x, y))
    }
  }
}

/** Wrap every filled cell in a 1px outline, the thing that makes it read as a sprite. */
function outline(c: Canvas) {
  const snapshot = Uint8Array.from(c.cells)
  const filled = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < GRID && y < GRID && snapshot[y * GRID + x] !== EMPTY
  for (let y = 0; y < GRID; y += 1) {
    for (let x = 0; x < GRID; x += 1) {
      if (filled(x, y)) continue
      if (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1)) {
        c.set(x, y, OUTLINE)
      }
    }
  }
}

/**
 * Cheap directional shading: light from the upper-left, shadow along the
 * bottom edge. Applied before the outline pass so edges stay clean.
 */
function shade(c: Canvas) {
  const snapshot = Uint8Array.from(c.cells)
  const isBody = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < GRID && y < GRID && snapshot[y * GRID + x] === BASE
  for (let y = 0; y < GRID; y += 1) {
    for (let x = 0; x < GRID; x += 1) {
      if (!isBody(x, y)) continue
      if (!isBody(x, y + 1)) c.set(x, y, SHADOW)
      else if (!isBody(x, y - 1) && !isBody(x - 1, y - 1)) c.set(x, y, LIGHT)
      else if (!isBody(x - 1, y) && x < GRID / 2) c.set(x, y, LIGHT)
    }
  }
}

function drawBeast(c: Canvas, stage: 1 | 2 | 3, rnd: () => number) {
  const bodyR = [3.2, 3.9, 4.6][stage - 1]
  const headR = [2.9, 3.2, 3.6][stage - 1]
  const headY = [6.2, 5.4, 4.6][stage - 1]
  const bodyY = [11.2, 11.0, 10.8][stage - 1]

  c.ellipse(7.5, bodyY, bodyR, bodyR * 0.82)
  c.ellipse(7.5, headY, headR, headR * 0.88)

  // Ears — length grows with stage, angle jitters per species.
  const earLen = stage + 1
  const earX = Math.round(7.5 - headR + 0.5) - (rnd() > 0.5 ? 1 : 0)
  for (let i = 0; i < earLen; i += 1) {
    c.set(earX - Math.floor(i / 2), Math.round(headY - headR) - i, BASE)
  }

  // Legs.
  const legY = Math.round(bodyY + bodyR * 0.8)
  c.rect(Math.round(7.5 - bodyR + 0.5), legY, 2, 2)
  c.rect(Math.round(7.5 - bodyR + 3.2), legY, 2, 2)

  // Tail, curling up at higher stages.
  const tailX = Math.round(7.5 - bodyR - 1)
  c.set(tailX, Math.round(bodyY), BASE)
  if (stage >= 2) c.set(tailX - 1, Math.round(bodyY) - 1, BASE)
  if (stage >= 3) c.set(tailX - 1, Math.round(bodyY) - 2, ACCENT)
}

function drawSerpent(c: Canvas, stage: 1 | 2 | 3, _rnd: () => number) {
  const headR = [2.6, 3.0, 3.4][stage - 1]
  const top = [5, 4, 3][stage - 1]
  const neckW = [1.0, 1.4, 1.8][stage - 1]
  const coilR = [3.0, 3.6, 4.2][stage - 1]

  // Drawn head-on rather than in profile: the mirror pass would fold any
  // sideways S-curve back into a symmetric blob, so the serpent reads as a
  // reared head over a coil instead — head, narrow neck, wide base.
  const headY = top + headR * 0.8
  c.ellipse(7.5, headY, headR, headR * 0.78)

  const neckTop = Math.round(headY + headR * 0.6)
  const coilY = 13.2
  for (let y = neckTop; y < coilY - coilR * 0.4; y += 1) {
    const w = Math.round(neckW)
    for (let dx = -w; dx <= 0; dx += 1) c.set(7 + dx, y, BASE)
  }

  // The coil the body is sitting on — widest at the bottom.
  c.ellipse(7.5, coilY, coilR, coilR * 0.52)
  if (stage >= 2) c.ellipse(7.5, coilY - 1.6, coilR * 0.72, coilR * 0.4)

  // Head frills, flaring wider each stage. These give the silhouette its
  // "not just a snake" read at 16px.
  const frillY = Math.round(headY)
  const frillX = Math.round(7.5 - headR)
  c.set(frillX - 1, frillY, BASE)
  if (stage >= 2) {
    c.set(frillX - 1, frillY - 1, ACCENT)
    c.set(frillX - 2, frillY, BASE)
  }
  if (stage >= 3) {
    c.set(frillX - 2, frillY - 1, ACCENT)
    c.set(frillX - 2, frillY + 1, BASE)
    c.set(frillX - 3, frillY, ACCENT)
  }
}

function drawWisp(c: Canvas, stage: 1 | 2 | 3, rnd: () => number) {
  const r = [3.0, 3.6, 4.2][stage - 1]
  const cy = [7.5, 7.0, 6.6][stage - 1]

  // Teardrop: a round core with a tapering flame above it.
  c.ellipse(7.5, cy, r, r * 0.95)
  const flame = stage + 2
  for (let i = 1; i <= flame; i += 1) {
    const w = Math.max(0, Math.round((flame - i) / 1.6))
    for (let dx = -w; dx <= 0; dx += 1) c.set(7 + dx, Math.round(cy - r) - i + 1, BASE)
  }

  // Trailing motes below — a wisp has no legs, it drifts.
  const trail = stage + 1
  for (let i = 1; i <= trail; i += 1) {
    const x = 7 - (rnd() > 0.5 ? 1 : 0)
    c.set(x, Math.round(cy + r) + i, i === trail ? ACCENT : BASE)
  }
}

function drawMoth(c: Canvas, stage: 1 | 2 | 3, _rnd: () => number) {
  const bodyH = [5, 6, 6][stage - 1]
  // Capped at 3.8 so the fully-grown wingspan still fits inside 16px instead
  // of being clipped flat against the edges.
  const wingR = [2.6, 3.2, 3.8][stage - 1]
  const top = [5, 4, 4][stage - 1]

  // Thorax.
  c.rect(6, top + 1, 2, bodyH)
  c.ellipse(7.5, top, 1.6, 1.6)

  // Upper and lower wings, mirrored automatically.
  c.ellipse(7.5 - wingR, top + 2.5, wingR, wingR * 0.85)
  c.ellipse(7.5 - wingR * 0.8, top + 2.5 + wingR, wingR * 0.7, wingR * 0.6)

  // Wing eyespots — the accent that makes a moth read as a moth.
  c.set(Math.round(7.5 - wingR), Math.round(top + 2.5), ACCENT)
  if (stage >= 3) c.set(Math.round(7.5 - wingR * 0.8), Math.round(top + 2.5 + wingR), ACCENT)

  // Antennae.
  c.set(6, top - 2, BASE)
  c.set(5, top - 3, stage >= 2 ? ACCENT : BASE)
}

function drawEyes(c: Canvas, archetype: Archetype, stage: 1 | 2 | 3) {
  const eyeY = {
    beast: [6, 5, 4],
    serpent: [6, 5, 4],
    wisp: [7, 6, 6],
    moth: [5, 4, 3],
  }[archetype][stage - 1]
  const eyeX = archetype === 'moth' ? 6 : 5
  c.set(eyeX, eyeY, EYE)
  c.set(GRID - 1 - eyeX, eyeY, EYE)
  if (stage >= 3) {
    // A second row of pupil makes fully-grown Kindred look older, not just bigger.
    c.set(eyeX, eyeY + 1, OUTLINE)
    c.set(GRID - 1 - eyeX, eyeY + 1, OUTLINE)
  }
}

function drawCrown(c: Canvas, stage: 1 | 2 | 3, archetype: Archetype) {
  if (stage < 3) return
  const y = archetype === 'moth' ? 1 : 1
  c.set(6, y, ACCENT)
  c.set(7, y - 1 < 0 ? 0 : y - 1, ACCENT)
  c.set(GRID - 7, y, ACCENT)
  c.set(GRID - 8, y - 1 < 0 ? 0 : y - 1, ACCENT)
}

/** Builds the 16x16 palette-index grid for a species at a stage. */
export function buildSprite(speciesId: string, archetype: Archetype, stage: 1 | 2 | 3): SpriteGrid {
  const rnd = mulberry32(hashString(`${speciesId}:${archetype}`))
  const c = new Canvas()

  switch (archetype) {
    case 'beast':
      drawBeast(c, stage, rnd)
      break
    case 'serpent':
      drawSerpent(c, stage, rnd)
      break
    case 'wisp':
      drawWisp(c, stage, rnd)
      break
    case 'moth':
      drawMoth(c, stage, rnd)
      break
  }

  mirror(c)
  shade(c)
  drawEyes(c, archetype, stage)
  drawCrown(c, stage, archetype)
  outline(c)
  return c.cells
}

// ---------------------------------------------------------------------------
// Breaker avatars
// ---------------------------------------------------------------------------

export const SKIN_TONES = ['#f0c8a0', '#e0a878', '#c88850', '#a06840', '#70482c', '#4a2e1c']
export const HAIR_COLORS = ['#2a2018', '#6b4423', '#c89050', '#8e2f2f', '#3a3f6b', '#c8c8d0']
export const OUTFIT_COLORS = ['#4e33a0', '#0f9f8b', '#d4531a', '#3a2676', '#8e8579']
export const ACCESSORIES = ['none', 'hood', 'cap', 'scarf', 'goggles']

/** Darkens (or lightens) a hex colour by a ratio, for cheap two-tone shading. */
function shadeHex(hex: string, ratio: number): string {
  const n = Number.parseInt(hex.slice(1), 16)
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)))
  const r = clamp(((n >> 16) & 255) * (1 + ratio))
  const g = clamp(((n >> 8) & 255) * (1 + ratio))
  const b = clamp((n & 255) * (1 + ratio))
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

export interface AvatarSpriteConfig {
  skin: number
  hair: number
  outfit: number
  accessory: number
}

/**
 * A 16x16 Breaker. Built from the same mirrored-grid machinery as the Kindred,
 * so avatars and creatures share one visual language on screen.
 */
export function buildAvatar(cfg: AvatarSpriteConfig): {
  grid: SpriteGrid
  colors: Record<number, string>
} {
  // Palette slots are reused as plain indices here — avatars ship their own
  // colour map rather than going through the Kindred shading pass.
  const SKIN = 3
  const HAIR = 4
  const OUTFIT = 2
  const ARM = 5
  const ACC = 6
  const c = new Canvas()

  // Head, torso, arms, legs — drawn on the left half then mirrored. Arms get a
  // darker shade so they separate from the torso instead of reading as one slab.
  c.rect(4, 3, 4, 5, SKIN) // head
  c.rect(3, 8, 5, 5, OUTFIT) // torso
  c.rect(2, 9, 1, 4, ARM) // arm
  c.rect(4, 13, 2, 3, ARM) // leg

  // Hair sits on top of the head; the hairline moves with the style index.
  const hairDepth = 1 + (cfg.hair % 3)
  c.rect(4, 2, 4, hairDepth, HAIR)
  c.rect(3, 3, 1, hairDepth, HAIR)

  switch (ACCESSORIES[cfg.accessory % ACCESSORIES.length]) {
    case 'hood':
      c.rect(3, 2, 5, 3, ACC)
      c.rect(3, 5, 1, 3, ACC)
      break
    case 'cap':
      c.rect(3, 1, 5, 2, ACC)
      c.rect(2, 2, 1, 1, ACC)
      break
    case 'scarf':
      c.rect(3, 8, 5, 1, ACC)
      break
    case 'goggles':
      c.rect(3, 4, 5, 1, ACC)
      break
    default:
      break
  }

  mirror(c)

  // Eyes last so nothing paints over them.
  c.set(5, 5, OUTLINE)
  c.set(GRID - 1 - 5, 5, OUTLINE)
  outline(c)

  return {
    grid: c.cells,
    colors: {
      [OUTLINE]: '#120c22',
      [SKIN]: SKIN_TONES[cfg.skin % SKIN_TONES.length],
      [HAIR]: HAIR_COLORS[cfg.hair % HAIR_COLORS.length],
      [OUTFIT]: OUTFIT_COLORS[cfg.outfit % OUTFIT_COLORS.length],
      [ARM]: shadeHex(OUTFIT_COLORS[cfg.outfit % OUTFIT_COLORS.length], -0.28),
      [ACC]: '#1e1440',
    },
  }
}

/** Renders any grid with an explicit colour map (used by avatars). */
export function gridPaths(
  grid: SpriteGrid,
  colors: Record<number, string>,
): { fill: string; d: string }[] {
  const out: { fill: string; d: string }[] = []
  for (const slotStr of Object.keys(colors)) {
    const slot = Number(slotStr)
    let d = ''
    for (let y = 0; y < GRID; y += 1) {
      let run = 0
      for (let x = 0; x <= GRID; x += 1) {
        const on = x < GRID && grid[y * GRID + x] === slot
        if (on) {
          run += 1
        } else if (run > 0) {
          d += `M${x - run} ${y}h${run}v1h-${run}z`
          run = 0
        }
      }
    }
    if (d) out.push({ fill: colors[slot], d })
  }
  return out
}

export interface SpritePalette {
  outline: string
  shadow: string
  base: string
  light: string
  eye: string
  accent: string
}

/**
 * Palette from a hue. `dimmed` desaturates and darkens everything — that is
 * the visual language of a Kindred that has gone to sleep after a relapse.
 */
export function palette(hue: number, dimmed = false): SpritePalette {
  const sat = dimmed ? 12 : 62
  const lift = dimmed ? -14 : 0
  const h = (s: number, l: number) => `hsl(${hue} ${s}% ${Math.max(4, l + lift)}%)`
  return {
    outline: h(sat + 6, 10),
    shadow: h(sat, 26),
    base: h(sat, 44),
    light: h(sat + 8, 62),
    eye: dimmed ? 'hsl(0 0% 34%)' : '#f6f2ea',
    accent: dimmed ? `hsl(${hue} 10% 40%)` : '#14e0bd',
  }
}

const SLOT_ORDER = [OUTLINE, SHADOW, BASE, LIGHT, ACCENT, EYE] as const

/**
 * Renders the grid to SVG path data, one path per palette slot. Paths beat
 * 256 `<rect>` elements — a Codex screen shows dozens of sprites at once.
 */
export function spritePaths(
  grid: SpriteGrid,
  pal: SpritePalette,
): { fill: string; d: string }[] {
  const colors: Record<number, string> = {
    [OUTLINE]: pal.outline,
    [SHADOW]: pal.shadow,
    [BASE]: pal.base,
    [LIGHT]: pal.light,
    [EYE]: pal.eye,
    [ACCENT]: pal.accent,
  }
  const out: { fill: string; d: string }[] = []
  for (const slot of SLOT_ORDER) {
    let d = ''
    for (let y = 0; y < GRID; y += 1) {
      let run = 0
      for (let x = 0; x <= GRID; x += 1) {
        const on = x < GRID && grid[y * GRID + x] === slot
        if (on) {
          run += 1
        } else if (run > 0) {
          d += `M${x - run} ${y}h${run}v1h-${run}z`
          run = 0
        }
      }
    }
    if (d) out.push({ fill: colors[slot], d })
  }
  return out
}
