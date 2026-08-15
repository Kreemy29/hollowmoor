/**
 * The local voice library.
 *
 * Hollowmoor is fully playable with no API key — Grok makes the writing
 * personal, this makes it *exist*. Every line here obeys the same hard rules
 * the edge function enforces on generated text (§9):
 *
 *   - Roast the slip, the loop, and the excuses. Never the person's worth,
 *     body, intelligence, or any protected group.
 *   - Never encourage, glorify, or explain drug use. The Dealer taunts about
 *     relapsing, never about the substance being good.
 *   - No mention of self-harm, ever.
 *   - Wins are celebrated louder than slips are roasted.
 */

/** THE DEALER, after an honest relapse. Exactly one gloat, then Vale takes over. */
export const DEALER_RELAPSE: string[] = [
  'Back so soon? I didn’t even move the furniture.',
  'Day zero. My favourite number. It has such a nice round shape.',
  'You didn’t lose to me. You lost to a Tuesday.',
  'I love this part. The part where you explain it to yourself.',
  'Careful, your streak fell off. Oh wait — that was hours ago.',
  '"Just this once" is my most successful product. Repeat customers every time.',
  'The counter goes back to zero. The excuse goes into my collection.',
  'You held out longer than last time. Genuinely annoying of you.',
  'And the crowd goes… back to bed.',
  'That plan you had? I read it. It was adorable.',
  'You know what I like about you? Your consistency. In this specific area.',
  'A whole streak, gone, and I didn’t even have to try hard.',
  'Somewhere a calendar just sighed.',
  'The boredom got you. The boredom always gets you. It’s free labour for me.',
  'You didn’t decide anything. You just stopped deciding, and I filled the gap.',
  'Your Kindred is asleep. Don’t worry, it’s used to it.',
  'I’ll keep the light on. I always keep the light on.',
  'Look at that — the loop still fits. Like it was made for you.',
  'You told your friends the number. That’s the bit that stings, isn’t it.',
  'Same time tomorrow? I’m very flexible.',
]

/** THE DEALER when the player is winning. Salty, rattled, still funny. */
export const DEALER_SALTY: string[] = [
  'Still here? Fine. I have other clients.',
  'Congratulations, you’ve gone a whole day without me. Riveting television.',
  'You look insufferable. Clear-eyed and insufferable.',
  'Enjoy the streak. Streaks are famously permanent.',
  'I’m not worried. I’m just… standing here. Watching. Casually.',
  'A week. Cute. I’ve seen weeks. Weeks are nothing.',
  'You’re only doing this to spite me, and honestly? It’s working.',
  'Every day you don’t show up, my numbers look worse. Stop it.',
  'You’ve started sleeping properly. Disgusting.',
  'This is a phase. A long, well-documented, extremely public phase.',
  'Your Kindred evolved. Great. Now it’s a bigger problem for me.',
  'I preferred you when you were easier to schedule.',
  'Do you know how boring you’ve become? Do you? Do you know?',
  'You checked in before I even got my coffee. Unsportsmanlike.',
  'Fine. FINE. Take the day. Take the whole stupid day.',
  'Weekend’s coming. I’m very patient. Ask anyone.',
  'You’ve got money in your pocket for once. That’s traditionally my window.',
  'Someone at the town square asked about your streak. I hated it.',
  'One day you’ll get complacent. I have literally nothing else scheduled.',
  'You’re making this personal. Good. I work better angry.',
]

/** PROFESSOR VALE, celebrating. These should always land louder than the roast. */
export const VALE_HYPE: string[] = [
  'That’s another one in the bank. Nobody can take today off you.',
  'You made a boring, unglamorous, completely correct decision. That’s the whole game.',
  'Your Kindred is brighter today. That’s not a metaphor — go look at it.',
  'Day by day is not a slogan, it’s a method, and you are running it correctly.',
  'The Haze is thinner where you’re standing. I can actually see the road.',
  'You didn’t feel like it and you did it anyway. That’s the strong version.',
  'Something in you got easier today. It compounds. Keep going.',
  'The Dealer is very quiet this morning. I noticed. He noticed.',
  'You’re building a person who does this. That person is nearly here.',
  'One more ring on the tree. Small, permanent, yours.',
  'You checked in. That’s the hard part done before breakfast.',
  'This is the stretch where it stops being white-knuckle. Feel it starting?',
  'Your best streak just moved. New floor, not a lucky day.',
  'Whatever you did to get through last night — do that again.',
  'A week is where the fog starts lifting off the low ground. Look around.',
  'You’re past the part most people don’t get past. Say that out loud once.',
  'Thirty days rewires the reflex. You are literally rebuilding hardware.',
  'The version of you from day one wouldn’t believe today happened.',
  'That’s a real number now. Not a fluke, not a good week. A number.',
  'You’ve stopped negotiating with it. That’s the moment things change.',
  'Clearsummit is a long walk and you are actually on the road.',
  'Nothing dramatic happened today. That was the win.',
  'Your friends can see that streak. Let them.',
  'You beat the craving with the most powerful tool there is: waiting.',
  'The counter is high enough now that it protects itself. Guard it.',
  'You are officially boring to the Haze. That is the highest honour here.',
  'Rest properly tonight. You earned an unremarkable evening.',
  'Momentum is real and it is currently pointed the right way.',
  'You showed up on a day you didn’t want to. That one counts double.',
  'Whatever the number is, it’s bigger than yesterday. That’s all it ever needs to be.',
  'The cravings are getting shorter. You may not have noticed. I did.',
  'You are the least interesting client the Dealer has. Stay unhireable.',
  'That’s another day your Kindred didn’t have to sleep through.',
  'You made room in your week for something that isn’t this. Fill it.',
  'The hard days are the ones that build the floor. This is a floor day.',
  'Look how far Fogmouth is behind you.',
  'The road to Clearsummit is made entirely of days like this one.',
  'You’ve got proof now. Not hope — proof. Go check the Codex.',
  'Nobody handed you that streak. Every single day of it was a decision.',
  'Same again tomorrow. That’s the whole plan and it works.',
]

/**
 * PROFESSOR VALE's practical tips. These are real urge-management techniques
 * (urge surfing, delay-and-distract, HALT, environment design, replacement
 * routines) dressed in Hollowmoor's language.
 */
export const VALE_TIPS: string[] = [
  'Cravings peak and fall in about fifteen minutes. Set a timer and let it break on the rocks.',
  'Ride it, don’t fight it. Name what it feels like in your body and watch it move. It always moves.',
  'HALT: hungry, angry, lonely, tired. Fix the actual one. Most cravings are wearing a disguise.',
  'Change the room. A craving is half habit-loop and half furniture.',
  'Delay ten minutes. Not forever — ten minutes. You almost never come back to it.',
  'Drink a full glass of cold water first. It buys you ninety seconds of thinking room.',
  'Walk to the end of the street and back. Motion drains the urge faster than willpower does.',
  'Write down the exact excuse your brain just made. Read it back. They’re never good on paper.',
  'Put a wall between you and the thing: a locked drawer, a friend’s house, a different route home.',
  'Text one person the word "craving". You don’t have to explain. The sending is the technique.',
  'Box breathing: four in, four hold, four out, four hold. Do it six times before you decide anything.',
  'Eat something with real sugar or protein. Low blood sugar imitates a craving almost perfectly.',
  'Plan your evening at 4pm, not at 9pm. The 9pm version of you is not on your side.',
  'Keep your hands busy — controller, cards, dishes, guitar. Idle hands are the Haze’s cheapest tool.',
  'The urge is a wave, not a wall. Waves have a top. You have been over the top before.',
  'Identify your first domino. It’s rarely the substance. It’s usually a route, a room, or a person.',
  'Put the money you didn’t spend somewhere you can see it. Numbers going up beat numbers going down.',
  'If it’s a weekend pattern, decide Friday morning what Saturday looks like. Decide it once.',
  'Sleep is the whole game. If tonight is bad, tomorrow’s craving is louder for free.',
  'Have a replacement ritual with the same shape: same time, same chair, different thing in your hand.',
  'Tell one friend your streak number. Accountability is a cheat code and it is legal.',
  'Notice the "I deserve this" thought. Rewards are fine — pick one that doesn’t cost you the streak.',
  'The 20 minutes after work is the fault line. Fill it before it fills itself.',
  'Exercise for ten minutes, badly. Effort matters more than form for killing an urge.',
  'When bored, do the smallest useful thing in sight. Boredom is a vacuum and vacuums get filled.',
  'Keep a "why" note in your phone written on a good day. Read it on a bad one.',
  'Play out the whole tape: not just the first ten minutes, but tomorrow morning too.',
  'If you’re somewhere it’s happening, leave early. Leaving early is not losing.',
  'Practise the flat no. No explanation, no debate, no apology. "I’m good, thanks." Full stop.',
  'Celebrate out loud at 7, 30 and 90 days. Under-celebrating is how people quit quitting.',
  'Cold water on your face and wrists resets the nervous system in about thirty seconds.',
  'Track the trigger, not just the day. Patterns you can see are patterns you can plan around.',
  'Put your phone across the room at night. Half of the 1am spiral is just reach.',
  'A craving after a good day is normal. It isn’t a sign you’re failing — it’s the old wiring firing.',
  'Make the next step tiny. "Get through the next hour" is a complete plan.',
  'If you slipped, log it today. A slip logged today is one day. A slip hidden becomes a week.',
  'Stack a new habit onto an existing one: kettle on, then breathe. The kettle does the remembering.',
  'Say the craving out loud in a stupid voice. It is remarkably hard to obey something that sounds silly.',
  'Have a "go" list of three things you’ll actually do at 9pm. Decide it now, not then.',
  'Rest is not relapse. A bad day inside a good month is still a good month.',
]

/**
 * Nudges keyed to a trigger tag the player has been logging. Surfaced by the
 * daily generator when a pattern shows up in their check-in history.
 */
export const NUDGES: Record<string, string[]> = {
  boredom: [
    'Your slips cluster on empty evenings. Put one thing in tonight’s calendar before the gap opens.',
    'Boredom is your pattern. Line up the next hour now, while you still care.',
  ],
  stress: [
    'Stress shows up in your log more than anything else. Breath of the Deep, four rounds, before it stacks.',
    'When it gets loud, drop into a dive before you decide anything. That’s your tell.',
  ],
  loneliness: [
    'Your hard days are the quiet ones. Say something in the town square — even a stupid emote counts.',
    'Loneliness keeps showing up in your log. Message one Breaker today before the evening lands.',
  ],
  celebration: [
    'Good nights are your risk, not bad ones. Decide what you’re drinking and when you’re leaving.',
    'You slip when things go well. Plan the celebration like you’d plan the hard part.',
  ],
  sleeplessness: [
    'Sleep keeps preceding your slips. Phone across the room, dive at lights-out.',
    'Your 3am is dangerous. Have the delve queued before you’re staring at the ceiling.',
  ],
  peer_pressure: [
    'Other people are your trigger. Practise the flat no once out loud today. That’s all it takes.',
    'You slip in company. Pick your exit time before you walk in.',
  ],
  the_bell: [
    'Same hour, every time. The Bell has your number — put something immovable in that slot.',
    'Your log has a clock in it. Book over that hour for the rest of the week.',
  ],
  payday: [
    'Money in hand is your fault line. Move it somewhere annoying to reach before tonight.',
    'Payday keeps showing up in your relapse log. Spend it on something loud and stupid instead.',
  ],
  weekend: [
    'Your slips land on weekends. It’s Friday — decide now what Saturday looks like.',
    'The pattern is weekends. Make Saturday a plan, not a gap.',
  ],
}

function pick<T>(list: T[], seed: number): T {
  return list[Math.abs(seed) % list.length]
}

/** Deterministic per-day pick so the same day always shows the same line. */
export function seedFrom(str: string): number {
  let h = 0
  for (let i = 0; i < str.length; i += 1) h = (h * 31 + str.charCodeAt(i)) | 0
  return h
}

export function fallbackDealer(date: string, userId: string, relapsed: boolean): string {
  const pool = relapsed ? DEALER_RELAPSE : DEALER_SALTY
  return pick(pool, seedFrom(`${date}:${userId}:dealer`))
}

export function fallbackVale(date: string, userId: string, wantTip: boolean): string {
  const pool = wantTip ? VALE_TIPS : VALE_HYPE
  return pick(pool, seedFrom(`${date}:${userId}:vale:${wantTip ? 'tip' : 'hype'}`))
}

export function fallbackNudge(tag: string | null, date: string, userId: string): string | null {
  if (!tag) return null
  const pool = NUDGES[tag]
  if (!pool) return null
  return pick(pool, seedFrom(`${date}:${userId}:nudge`))
}
