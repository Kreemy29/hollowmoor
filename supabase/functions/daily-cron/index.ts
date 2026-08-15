// deno-lint-ignore-file no-explicit-any
/**
 * daily-cron — hourly reminder sweep.
 *
 * Runs every hour on the hour. `hm_due_reminders` decides who is actually due:
 * it only returns players whose *local* time is 9am or 8pm, who have push on,
 * and who have not already checked in today. Nobody is ever reminded to do
 * something they've already done — that's the difference between a reminder
 * and a nag.
 *
 * Deploy:
 *   supabase functions deploy daily-cron --no-verify-jwt
 *   supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:you@example.com
 *   supabase secrets set CRON_SECRET=<a long random string>
 *
 * Schedule it with pg_cron + pg_net, or any external scheduler, sending
 * `Authorization: Bearer <CRON_SECRET>`.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendPush } from '../_shared/webpush.ts'

const MORNING = [
  { title: 'Your Kindred is waiting', body: 'One check-in and the day is logged. Takes ten seconds.' },
  { title: 'Morning, Breaker', body: 'The Dealer had a quiet night. Keep it that way.' },
  { title: 'Day’s not going to log itself', body: 'Ten seconds at the Rest Stop.' },
]

const EVENING = [
  { title: 'Still out of the Haze?', body: 'Log today before midnight — honest either way.' },
  { title: 'Rest Stop closes at midnight', body: 'Check in and keep the chain.' },
  { title: 'One question, then you’re done', body: 'The Craving is waiting outside Restwick.' },
]

function pick<T>(list: T[], seed: string): T {
  let h = 0
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) | 0
  return list[Math.abs(h) % list.length]
}

Deno.serve(async (req) => {
  // This function mutates nothing a user owns, but it does fan out messages —
  // so it is gated on a shared secret rather than left open.
  const secret = Deno.env.get('CRON_SECRET')
  if (secret && req.headers.get('Authorization') !== `Bearer ${secret}`) {
    return new Response('Forbidden', { status: 403 })
  }

  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY')
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY')
  const subject = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com'

  if (!publicKey || !privateKey) {
    // No keys configured is a valid setup — reminders are optional.
    return new Response(JSON.stringify({ skipped: 'no VAPID keys configured' }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const utcHour = new Date().getUTCHours()
  const { data: due, error } = await supabase.rpc('hm_due_reminders', { p_utc_hour: utcHour })

  if (error) {
    console.error('[daily-cron] hm_due_reminders failed', error)
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }

  let sent = 0
  let expired = 0
  const today = new Date().toISOString().slice(0, 10)

  for (const row of (due ?? []) as any[]) {
    const copy =
      row.kind === 'morning'
        ? pick(MORNING, `${today}:${row.user_id}`)
        : pick(EVENING, `${today}:${row.user_id}`)

    // A live streak is the strongest thing we can put in front of someone.
    const body =
      row.current_streak > 0
        ? `${copy.body} You're on ${row.current_streak} days.`
        : copy.body

    try {
      const result = await sendPush(
        { endpoint: row.endpoint, p256dh: row.p256dh, auth: row.auth },
        { title: copy.title, body, url: '/checkin', tag: `checkin-${today}` },
        { publicKey, privateKey, subject },
      )

      if (result.expired) {
        await supabase.from('push_subscriptions').delete().eq('endpoint', row.endpoint)
        expired += 1
      } else if (result.ok) {
        sent += 1
      } else {
        // Mark it failed rather than deleting — a transient 5xx shouldn't cost
        // someone their reminders.
        await supabase
          .from('push_subscriptions')
          .update({ failed_at: new Date().toISOString() })
          .eq('endpoint', row.endpoint)
      }
    } catch (err) {
      console.error('[daily-cron] push failed', row.endpoint, err)
    }
  }

  return new Response(JSON.stringify({ hour: utcHour, due: (due ?? []).length, sent, expired }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
