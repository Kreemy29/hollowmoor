// deno-lint-ignore-file no-explicit-any
/**
 * grok-generate — the freshness layer.
 *
 * Called once per player per local day. It returns the cached row if one
 * exists, so a player refreshing the dashboard forty times costs nothing, and
 * only calls x.ai on a genuine miss.
 *
 * Two hard rules this function is responsible for:
 *   1. XAI_API_KEY never leaves this process. It is not in the client bundle,
 *      not in a public env var, not in a response body.
 *   2. Nothing Grok returns is shown to a player unvalidated. Anything that
 *      trips the safety checks in `isSafe()` is dropped and the local voice
 *      library is used instead. A missing key is not an error state — it is
 *      just the fallback path, and the game plays fine on it forever.
 *
 * Deploy:  supabase functions deploy grok-generate
 * Secret:  supabase secrets set XAI_API_KEY=xai-...
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const XAI_URL = 'https://api.x.ai/v1/chat/completions'
const XAI_MODEL = Deno.env.get('XAI_MODEL') ?? 'grok-3'

const SYSTEM_PROMPT = `You are two voices in a game that helps someone quit cannabis.

THE DEALER is a cocky cartoon villain who taunts the player for laughs.
PROFESSOR VALE is a warm, funny mentor who gives real, practical advice.

Keep lines short and punchy (1-2 sentences each). Be edgy and crude if it's funny.

HARD RULES — these are not style notes, they are requirements:
- Never attack the player's core worth, appearance, intelligence, or any protected group.
- Roast the slip, the loop, and the excuses. Never the person.
- Never encourage, romanticize, or give instructions for drug use. The Dealer taunts
  about relapsing, never about the substance being good.
- Never mention self-harm, suicide, or dying, in any framing, including jokes.
- When the player has relapsed, the Dealer may gloat for exactly one line, then Vale
  must pivot to a same-day comeback — never end on the insult.
- Wins are celebrated louder than slips are roasted.

Output ONLY valid JSON: {"dealer": "...", "vale": "..."}`

/** Substance-agnostic red flags. Anything matching is dropped, not edited. */
const UNSAFE = [
  /\b(kill|hurt|harm)\s+(your ?self|urself)\b/i,
  /\bsuicide|self[-\s]?harm\b/i,
  /\byou('| a)?re\s+(worthless|useless|pathetic|stupid|a\s+loser|disgusting)\b/i,
  /\b(fat|ugly|retard|idiot)\b/i,
  /\b(just|only)\s+(one\s+)?(hit|puff|joint|bowl|bong)\b/i,
  /\b(weed|cannabis|pot)\s+(is|was)\s+(good|great|better|fine|harmless)\b/i,
  /\bgo (ahead and )?(smoke|use)\b/i,
  /\b(how to|where to)\s+(get|buy|score)\b/i,
]

function isSafe(line: unknown): line is string {
  if (typeof line !== 'string') return false
  const trimmed = line.trim()
  if (trimmed.length < 3 || trimmed.length > 320) return false
  return !UNSAFE.some((re) => re.test(trimmed))
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

/** Deterministic pick so the same player+day always gets the same fallback. */
function seeded<T>(list: T[], seed: string): T {
  let h = 0
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) | 0
  return list[Math.abs(h) % list.length]
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )

    const { data: userData } = await supabase.auth.getUser()
    const user = userData?.user
    if (!user) return json({ error: 'Not signed in.' }, 401)

    const body = await req.json().catch(() => ({}))
    const date: string = body.date ?? new Date().toISOString().slice(0, 10)
    const moment: string | undefined = body.moment

    // ---- Fallback library, always available -------------------------------
    const { data: voice } = await supabase.from('voice_lines').select('speaker, line')
    const pool = (speaker: string) =>
      (voice ?? []).filter((v: any) => v.speaker === speaker).map((v: any) => v.line as string)

    // ---- Player state, so the voices know what happened -------------------
    const { data: recent } = await supabase
      .from('checkins')
      .select('date, result, trigger_tag')
      .order('date', { ascending: false })
      .limit(14)

    const { data: streak } = await supabase
      .from('streaks')
      .select('current_streak, best_streak, relapse_count')
      .maybeSingle()

    const relapsed = recent?.[0]?.result === 'relapse'
    const current = streak?.current_streak ?? 0

    const fallbackDealer = () =>
      seeded(
        pool(relapsed ? 'dealer_relapse' : 'dealer_salty'),
        `${date}:${user.id}:dealer`,
      ) ?? 'Still here? Fine.'
    const fallbackVale = () =>
      seeded(pool(relapsed ? 'vale_tip' : 'vale_hype'), `${date}:${user.id}:vale`) ??
      'Same again tomorrow. That is the whole plan and it works.'

    // ---- One-off moment lines are never cached ----------------------------
    if (moment) {
      const line = await generate(
        `The player just had this moment: ${moment}. Context: ${String(body.context ?? 'none')}. ` +
          `Their streak is ${current} days.`,
        moment === 'milestone' ? 'vale' : 'dealer',
      )
      return json({
        line: line ?? (moment === 'milestone' ? fallbackVale() : fallbackDealer()),
      })
    }

    // ---- Cache hit --------------------------------------------------------
    const { data: cached } = await supabase
      .from('ai_content_cache')
      .select('*')
      .eq('user_id', user.id)
      .eq('date', date)
      .maybeSingle()

    if (cached) {
      return json({
        dealer: cached.dealer,
        vale: cached.vale,
        nudge: cached.nudge,
        source: cached.source,
      })
    }

    // ---- Nudge: derived from the player's own logged pattern --------------
    const relapses = (recent ?? []).filter((c: any) => c.result === 'relapse')
    const tagCounts = new Map<string, number>()
    for (const r of relapses) {
      if (r.trigger_tag) tagCounts.set(r.trigger_tag, (tagCounts.get(r.trigger_tag) ?? 0) + 1)
    }
    const topTag = [...tagCounts.entries()].sort((a, b) => b[1] - a[1])[0]
    const weekendPattern =
      relapses.filter((r: any) => [0, 5, 6].includes(new Date(`${r.date}T12:00:00Z`).getUTCDay()))
        .length >= 2

    // ---- Generate ---------------------------------------------------------
    const state = [
      `Current clean streak: ${current} days.`,
      `Best ever: ${streak?.best_streak ?? 0} days.`,
      relapsed
        ? 'They relapsed at their most recent check-in — the Dealer gloats ONCE and Vale pivots to a same-day comeback.'
        : 'They are currently clean — the Dealer should be salty and rattled, Vale should celebrate.',
      topTag ? `Their most common relapse trigger is "${topTag[0]}".` : '',
      weekendPattern ? 'Their slips cluster on weekends.' : '',
    ]
      .filter(Boolean)
      .join(' ')

    const pair = await generatePair(state)

    const dealer = isSafe(pair?.dealer) ? pair!.dealer : fallbackDealer()
    const vale = isSafe(pair?.vale) ? pair!.vale : fallbackVale()
    const source = isSafe(pair?.dealer) && isSafe(pair?.vale) ? 'grok' : 'fallback'

    let nudge: string | null = null
    if (topTag && topTag[1] >= 2) {
      nudge = `Your log keeps saying "${topTag[0]}". Plan around it before it plans around you.`
    } else if (weekendPattern) {
      nudge = 'Your slips land on weekends. Decide now what Saturday looks like.'
    }

    await supabase
      .from('ai_content_cache')
      .upsert({ user_id: user.id, date, dealer, vale, nudge, source })

    return json({ dealer, vale, nudge, source })

    // ---- helpers ----------------------------------------------------------

    async function generatePair(context: string): Promise<{ dealer: string; vale: string } | null> {
      const raw = await callGrok([
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `${context}\n\nWrite today's pair of lines.` },
      ])
      if (!raw) return null
      try {
        const parsed = JSON.parse(raw.replace(/^```json\s*|\s*```$/g, ''))
        return { dealer: String(parsed.dealer ?? ''), vale: String(parsed.vale ?? '') }
      } catch {
        return null
      }
    }

    async function generate(context: string, who: 'dealer' | 'vale'): Promise<string | null> {
      const raw = await callGrok([
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: `${context}\n\nWrite ONE line as ${who === 'dealer' ? 'THE DEALER' : 'PROFESSOR VALE'}. Output JSON: {"dealer":"...","vale":"..."} with the other field empty.`,
        },
      ])
      if (!raw) return null
      try {
        const parsed = JSON.parse(raw.replace(/^```json\s*|\s*```$/g, ''))
        const line = who === 'dealer' ? parsed.dealer : parsed.vale
        return isSafe(line) ? line : null
      } catch {
        return null
      }
    }

    async function callGrok(messages: { role: string; content: string }[]): Promise<string | null> {
      const key = Deno.env.get('XAI_API_KEY')
      // No key is a supported configuration, not a failure. The game has a
      // voice without it; Grok only makes that voice personal.
      if (!key) return null

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 8000)
      try {
        const res = await fetch(XAI_URL, {
          method: 'POST',
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: XAI_MODEL,
            messages,
            temperature: 0.9,
            max_tokens: 200,
            response_format: { type: 'json_object' },
          }),
          signal: controller.signal,
        })
        if (!res.ok) {
          console.error('[grok] HTTP', res.status, await res.text().catch(() => ''))
          return null
        }
        const data = await res.json()
        return data?.choices?.[0]?.message?.content ?? null
      } catch (err) {
        console.error('[grok] request failed', err)
        return null
      } finally {
        clearTimeout(timeout)
      }
    }
  } catch (err) {
    console.error('[grok-generate] unhandled', err)
    return json({ error: 'Generation failed.' }, 500)
  }
})
