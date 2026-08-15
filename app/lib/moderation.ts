/**
 * Chat moderation (§9.5).
 *
 * The rule is "edgy, not harmful": general profanity is allowed on purpose —
 * this is a trash-talk app — while slurs, targeted harassment and self-harm
 * directives are blocked outright, and brand-new accounts can't post links.
 */

export interface ModerationVerdict {
  ok: boolean
  reason?: string
  /** True when the message looked like genuine distress rather than banter. */
  concern?: boolean
}

const MAX_LEN = 400
const RATE_WINDOW_MS = 20_000
const RATE_MAX = 6
const LINK_GRACE_HOURS = 24

/**
 * Collapses leet-speak, padding and repeats so `f-u-c-k-e-r` and `fuuucker`
 * normalise to the same string before matching.
 */
export function normalise(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[013457@$!|]/g, (c) => ({ '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', $: 's', '!': 'i', '|': 'i' })[c] ?? c)
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/(.)\1{2,}/g, '$1$1')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Targeted-harm patterns. These are blocked regardless of context.
 *
 * A hand-rolled slur list goes stale and misses variants, so this ships with
 * the structural patterns only and reads an operator-supplied list from
 * `VITE_BLOCKLIST` (comma-separated, matched against the normalised text).
 * Point it at a maintained list before you invite anyone beyond your friends —
 * see README → "Moderation".
 */
const HARM_PATTERNS: { re: RegExp; reason: string; concern?: boolean }[] = [
  { re: /\b(kill|hang|hurt) (your ?self|yourself|urself)\b/, reason: 'self-harm directive', concern: true },
  { re: /\b(kys|khs)\b/, reason: 'self-harm directive', concern: true },
  { re: /\byou should (die|not exist)\b/, reason: 'targeted harassment' },
  { re: /\bi hope you (die|overdose)\b/, reason: 'targeted harassment' },
]

/** Phrases that suggest the *sender* is in genuine trouble, not trash-talking. */
const DISTRESS_PATTERNS: RegExp[] = [
  /\bi (want|need) to (die|disappear)\b/,
  /\bi (cant|can not) (do this|go on|keep going) (anymore|any more)\b/,
  /\bi (feel|am) (completely )?(hopeless|worthless)\b/,
  /\bno (point|reason) (in|to) (living|anything)\b/,
]

const OPERATOR_BLOCKLIST: string[] = (import.meta.env?.VITE_BLOCKLIST ?? '')
  .split(',')
  .map((s: string) => normalise(s))
  .filter(Boolean)

const LINK_RE = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|io|gg|xyz|link|ru|cn)\b)/i

export interface ModerationContext {
  /** ISO timestamps of this player's recent messages, newest first. */
  recentTimestamps: string[]
  accountCreatedAt: string
}

export function moderateMessage(body: string, ctx: ModerationContext): ModerationVerdict {
  const trimmed = body.trim()
  if (!trimmed) return { ok: false, reason: 'Say something first.' }
  if (trimmed.length > MAX_LEN) {
    return { ok: false, reason: `Keep it under ${MAX_LEN} characters.` }
  }

  const recent = ctx.recentTimestamps.filter(
    (t) => Date.now() - new Date(t).getTime() < RATE_WINDOW_MS,
  )
  if (recent.length >= RATE_MAX) {
    return { ok: false, reason: 'Slow down — you’re posting too fast.' }
  }

  const flat = normalise(trimmed)

  for (const p of HARM_PATTERNS) {
    if (p.re.test(flat)) {
      return { ok: false, reason: 'That one crosses the line.', concern: p.concern }
    }
  }
  for (const word of OPERATOR_BLOCKLIST) {
    if (word && flat.includes(word)) {
      return { ok: false, reason: 'That one crosses the line.' }
    }
  }

  const ageHours = (Date.now() - new Date(ctx.accountCreatedAt).getTime()) / 3_600_000
  if (ageHours < LINK_GRACE_HOURS && LINK_RE.test(trimmed)) {
    return {
      ok: false,
      reason: 'New Breakers can’t post links for the first day. Anti-spam, not personal.',
    }
  }

  return { ok: true, concern: DISTRESS_PATTERNS.some((re) => re.test(flat)) }
}

/**
 * Distress signal from check-in notes (§9.4). Never diagnoses, never blocks —
 * it only tells the UI to surface the support link once, quietly.
 */
export function noteSuggestsDistress(note: string | null | undefined): boolean {
  if (!note) return false
  const flat = normalise(note)
  return DISTRESS_PATTERNS.some((re) => re.test(flat)) || HARM_PATTERNS.some((p) => p.concern && p.re.test(flat))
}

/**
 * Several relapses inside a short window is the other trigger from §9.4.
 * Three or more in a rolling week is the threshold — enough to be a pattern,
 * not so tight that a rough weekend triggers a lecture.
 */
export function relapseClusterConcern(relapseDates: string[], today: string): boolean {
  const todayMs = new Date(`${today}T12:00:00Z`).getTime()
  const withinWeek = relapseDates.filter((d) => {
    const ms = new Date(`${d}T12:00:00Z`).getTime()
    return todayMs - ms <= 7 * 86_400_000 && todayMs - ms >= 0
  })
  return withinWeek.length >= 3
}
