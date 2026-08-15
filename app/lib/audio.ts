import { Howl } from 'howler'

/**
 * Audio.
 *
 * SFX are synthesised at runtime with WebAudio rather than shipped as files —
 * it keeps the repo asset-free and licence-clean, and square/triangle blips are
 * exactly the 16-bit texture we want. Howler drives the optional music loop, so
 * dropping `public/audio/theme.mp3` in is all it takes to add a soundtrack.
 *
 * Muted by default (§7 quality floor). Nothing here creates an AudioContext
 * until the player turns sound on and interacts with the page.
 */

let ctx: AudioContext | null = null
let enabled = false
let music: Howl | null = null

export function setAudioEnabled(on: boolean) {
  enabled = on
  if (!on) {
    music?.pause()
    return
  }
  ensureContext()
  void ctx?.resume()
}

export function isAudioEnabled() {
  return enabled
}

function ensureContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    ctx = new Ctor()
  }
  return ctx
}

interface BlipOptions {
  freq: number
  duration: number
  type?: OscillatorType
  /** Slide to this frequency over the note's life. */
  glideTo?: number
  gain?: number
  delay?: number
}

function blip({ freq, duration, type = 'square', glideTo, gain = 0.06, delay = 0 }: BlipOptions) {
  if (!enabled) return
  const audio = ensureContext()
  if (!audio) return
  const t0 = audio.currentTime + delay

  const osc = audio.createOscillator()
  const amp = audio.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t0)
  if (glideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, glideTo), t0 + duration)

  // Fast attack, exponential decay — the classic chip envelope.
  amp.gain.setValueAtTime(0.0001, t0)
  amp.gain.exponentialRampToValueAtTime(gain, t0 + 0.008)
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + duration)

  osc.connect(amp).connect(audio.destination)
  osc.start(t0)
  osc.stop(t0 + duration + 0.02)
}

function arpeggio(freqs: number[], step = 0.07, type: OscillatorType = 'square') {
  freqs.forEach((f, i) => blip({ freq: f, duration: step * 1.6, type, delay: i * step }))
}

export const sfx = {
  /** UI tick. */
  select: () => blip({ freq: 660, duration: 0.05, gain: 0.035 }),
  back: () => blip({ freq: 330, duration: 0.06, glideTo: 220, gain: 0.035 }),

  /** Clean check-in — bright, rising, unmistakably a win. */
  win: () => arpeggio([523, 659, 784, 1047], 0.075),

  /** Relapse — falls, but resolves. Never a "game over" sting; §9.1. */
  slip: () => {
    blip({ freq: 392, duration: 0.16, glideTo: 262, type: 'triangle', gain: 0.05 })
    blip({ freq: 294, duration: 0.22, glideTo: 247, type: 'triangle', gain: 0.045, delay: 0.16 })
  },

  /** Evolution — the signature moment. Long, loud, earned. */
  evolve: () => {
    arpeggio([523, 659, 784, 1047, 1319], 0.09, 'square')
    blip({ freq: 1568, duration: 0.5, type: 'triangle', gain: 0.05, delay: 0.45 })
  },

  /** Dimming — the evolution jingle, inverted. */
  dim: () => arpeggio([784, 659, 523, 392], 0.1, 'triangle'),

  grit: () => blip({ freq: 880, duration: 0.06, glideTo: 1320, gain: 0.04 }),
  catchKindred: () => arpeggio([440, 554, 659, 880], 0.06),
  badge: () => arpeggio([659, 784, 988, 1319, 1568], 0.1),
  pop: () => blip({ freq: 520 + Math.random() * 300, duration: 0.04, type: 'square', gain: 0.03 }),
  hit: () => blip({ freq: 160, duration: 0.09, glideTo: 90, type: 'sawtooth', gain: 0.05 }),
  breatheIn: () => blip({ freq: 220, duration: 0.9, glideTo: 440, type: 'sine', gain: 0.03 }),
  breatheOut: () => blip({ freq: 440, duration: 1.2, glideTo: 196, type: 'sine', gain: 0.03 }),
}

/**
 * Optional music loop. Silently does nothing when the file is absent, so the
 * repo ships without any binary audio.
 */
export function startMusic(src = '/audio/theme.mp3') {
  if (!enabled || music) return
  music = new Howl({ src: [src], loop: true, volume: 0.18, html5: true, onloaderror: () => { music = null } })
  music.play()
}

export function stopMusic() {
  music?.stop()
  music = null
}
