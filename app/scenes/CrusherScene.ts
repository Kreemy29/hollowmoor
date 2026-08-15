import type Phaser from 'phaser'

/**
 * Craving Crusher — the default panic game.
 *
 * Haze bubbles rise out of the fog; you smash them before they reach the top.
 * Fast, loud, and over in 45 seconds, which is deliberately the same order of
 * magnitude as an actual craving peak. Nothing here is a "score attack" trap:
 * the run ends on its own so it can't become a new compulsion.
 */

export const CRUSHER_DURATION_MS = 45_000

export interface CrusherCallbacks {
  onScore: (score: number) => void
  onTime: (msLeft: number) => void
  onEnd: (score: number) => void
  onPop: () => void
}

interface Bubble {
  x: number
  y: number
  r: number
  speed: number
  hue: number
  wobble: number
  alive: boolean
}

export function makeCrusherScene(phaser: typeof Phaser, cb: CrusherCallbacks) {
  return class CrusherScene extends phaser.Scene {
    private bubbles: Bubble[] = []
    private score = 0
    private missed = 0
    private elapsed = 0
    private spawnAcc = 0
    private gfx!: Phaser.GameObjects.Graphics
    private label!: Phaser.GameObjects.Text
    private ended = false

    constructor() {
      super('crusher')
    }

    create() {
      const { width, height } = this.scale
      this.gfx = this.add.graphics()

      this.label = this.add
        .text(width / 2, 22, 'SMASH THE HAZE', {
          fontFamily: '"Press Start 2P", monospace',
          fontSize: '10px',
          color: '#cfc6bb',
        })
        .setOrigin(0.5)

      this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.strike(p.x, p.y))
      this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
        if (p.isDown) this.strike(p.x, p.y)
      })

      // Keyboard fallback: space smashes the lowest bubble, so the game is
      // completable without a pointer (§7 quality floor).
      this.input.keyboard?.on('keydown-SPACE', () => {
        const target = [...this.bubbles].filter((b) => b.alive).sort((a, b) => b.y - a.y)[0]
        if (target) this.strike(target.x, target.y)
      })

      void height
    }

    private strike(x: number, y: number) {
      if (this.ended) return
      for (const b of this.bubbles) {
        if (!b.alive) continue
        const dx = b.x - x
        const dy = b.y - y
        if (dx * dx + dy * dy <= (b.r + 14) * (b.r + 14)) {
          b.alive = false
          this.score += 1
          cb.onScore(this.score)
          cb.onPop()
          this.burst(b)
          return
        }
      }
    }

    private burst(b: Bubble) {
      const ring = this.add.circle(b.x, b.y, b.r, 0x14e0bd, 0.5)
      this.tweens.add({
        targets: ring,
        scale: 2.1,
        alpha: 0,
        duration: 260,
        onComplete: () => ring.destroy(),
      })
    }

    private spawn() {
      const { width, height } = this.scale
      const r = 14 + Math.random() * 16
      this.bubbles.push({
        x: r + Math.random() * (width - r * 2),
        y: height + r,
        r,
        // Bigger bubbles are slower — small ones are the real threat.
        speed: (0.055 + Math.random() * 0.05) * (26 / r) * 10,
        hue: 258 + Math.random() * 40,
        wobble: Math.random() * Math.PI * 2,
        alive: true,
      })
    }

    update(_time: number, delta: number) {
      if (this.ended) return
      const { width, height } = this.scale

      this.elapsed += delta
      const left = Math.max(0, CRUSHER_DURATION_MS - this.elapsed)
      cb.onTime(left)
      if (left <= 0) {
        this.ended = true
        cb.onEnd(this.score)
        return
      }

      // Spawn rate ramps through the run so the last ten seconds are frantic.
      const ramp = 1 + (this.elapsed / CRUSHER_DURATION_MS) * 2.2
      this.spawnAcc += delta * ramp
      if (this.spawnAcc > 420) {
        this.spawnAcc = 0
        this.spawn()
      }

      this.gfx.clear()
      for (const b of this.bubbles) {
        if (!b.alive) continue
        b.y -= (b.speed * delta) / 16
        b.wobble += delta / 300
        const x = b.x + Math.sin(b.wobble) * 6

        if (b.y + b.r < 0) {
          b.alive = false
          this.missed += 1
          continue
        }

        const color = phaser.Display.Color.HSVToRGB(b.hue / 360, 0.55, 0.72).color
        this.gfx.fillStyle(color, 0.85)
        this.gfx.fillCircle(x, b.y, b.r)
        this.gfx.lineStyle(2, 0x0b0716, 1)
        this.gfx.strokeCircle(x, b.y, b.r)
        this.gfx.fillStyle(0xffffff, 0.22)
        this.gfx.fillCircle(x - b.r * 0.3, b.y - b.r * 0.3, b.r * 0.28)
      }

      this.bubbles = this.bubbles.filter((b) => b.alive)
      this.label.setText(`${this.score}  ·  ${Math.ceil(left / 1000)}s`)
      void width
      void height
    }
  }
}
