/**
 * The pure half of Alex's background heartbeat (port of the decision rules and message pools in
 * discordbot/pet_care.go). The tick itself — load, decide, persist, broadcast — is
 * PetService.careTick; this file is the part with no I/O.
 */
import { getDuration } from './config';
import type { ProactiveKind } from './pet-ai';
import { pick } from './pet';
import {
  MSG_LEVEL_CARE,
  MSG_LEVEL_OFF,
} from './pet-repo';

export const careTickInterval =
  (): number =>
    getDuration(
      'ALEX_TICK_INTERVAL',
      10 *
        60_000,
    );
export const careAlertInterval =
  (): number =>
    getDuration(
      'ALEX_CARE_ALERT_INTERVAL',
      45 *
        60_000,
    );
export const ambientMinInterval =
  (): number =>
    getDuration(
      'ALEX_AMBIENT_INTERVAL',
      3 *
        3_600_000,
    );
/** Added randomly on top of the minimum ambient interval. */
export const AMBIENT_JITTER_MS =
  3 *
  3_600_000;

/** Does a server at this /alexmessages level take this kind of message? */
export function wantsMessage(
  level: string,
  kind: ProactiveKind,
): boolean {
  if (
    level ===
    MSG_LEVEL_OFF
  )
    return false;
  if (
    level ===
    MSG_LEVEL_CARE
  )
    return (
      kind !==
        'ambient' &&
      kind !==
        'prompt'
    );
  return true;
}

/** Has `interval` elapsed since `last` (null = due)? */
export function dueSince(
  last:
    | number
    | null,
  interval: number,
  now: number,
): boolean {
  return (
    last ===
      null ||
    now -
      last >=
      interval
  );
}

/** Ambient posts get jitter so they don't fire like clockwork; the very first is a 1-in-3 roll. */
export function ambientDue(
  last:
    | number
    | null,
  now: number,
  rand: () => number = Math.random,
): boolean {
  if (
    last ===
    null
  )
    return (
      Math.floor(
        rand() *
          3,
      ) ===
      0
    );
  const threshold =
    ambientMinInterval() +
    Math.floor(
      rand() *
        (AMBIENT_JITTER_MS +
          1),
    );
  return (
    now -
      last >=
    threshold
  );
}

const CARE_ALERT_LINES: Record<
  string,
  string[]
> =
  {
    hungry:
      [
        "yo I'm STARVING fr, somebody `/feed` me a boba before I pass out 🧋😭",
        "deadass haven't eaten in a min... `/feed` me pls, I'm running on empty no cap",
        'my stomach doin backflips rn, need some food ASAP 🍜 `/feed` me!',
      ],
    sleepy:
      [
        "bro I'm running on 2 hours of sleep and pure spite... lemme `/rest` fr 😴",
        'eyes closin on me rn, I need a nap bad — `/rest` me pls 💤',
        'lowkey about to fall asleep at my desk, somebody `/rest` me 😩',
      ],
    stinky:
      [
        "ngl I'm kinda funky rn 😳 somebody `/clean` me before the standup pls",
        "I've been grinding so hard I forgot to shower 💀 `/clean` me fr",
        "it's giving... unwashed hoodie 🧼 `/clean` me up pls",
      ],
    sad: [
      'feelin kinda lonely rn 🥺 somebody `/chat` with me or `/play`?',
      'lowkey down bad emotionally, could use some company 😔 `/play` with me?',
      "nobody's talked to me in a min... `/chat` me pls, I'm spiraling 🥲",
    ],
    sick: [
      "yo I don't feel too good... 🤒 I need some serious care or I'm cooked fr",
      'feelin real sick rn, my health tankin — please `/feed` and `/rest` me 😷',
      "bro I think I'm comin down with somethin 🤧 take care of me pls",
    ],
    gone: [
      '...(Alex is passed out, run `/revive` to bring him back) 💀',
    ],
  };

export function careAlertLine(
  need: string,
): string {
  const lines =
    CARE_ALERT_LINES[
      need
    ];
  return lines
    ? pick(
        lines,
      )
    : 'I need some care rn fr 🥺 check on me with `/alex`';
}

const AMBIENT_BY_STAGE: Record<
  string,
  string[]
> =
  {
    infant:
      [
        'goo goo ga ga 👶 (translation: I want boba)',
        'just spilled my baby bottle full of boba everywhere 🍼🧋 oops',
        'took my first lil nap and dreamt about tapioca pearls 💤',
        "learnin to say my first word... it's prob gonna be 'boba' fr",
      ],
    toddler:
      [
        'just stacked my alphabet blocks into a lil server rack 🧱 vibe coding starts early',
        "watched a Blippi video about APIs, I'm basically senior dev now 😤",
        'toddled over to the fridge lookin for boba, none found, devastated 😭',
      ],
    child:
      [
        "built my first Scratch game today, it's a boba clicker obviously 🎮🧋",
        'got a gold star in math class, addin it to the LinkedIn already ⭐',
        "traded my lunch for a friend's boba, best deal I ever made fr",
      ],
    teen: [
      'grindin LeetCode easies at 2am, we love a delusional teen arc 💻',
      "posted a 'humbled to announce' on LinkedIn for gettin my learner's permit 🚗",
      'at the boba shop tryna look busy with my laptop open to VSCode 🧋😎',
    ],
    adult:
      [
        "currently out gettin boba, 50% sugar extra pearls, don't judge 🧋",
        "just posted 'thrilled to share' on LinkedIn for absolutely no reason 💼✨",
        'in a Wells Fargo standup pretendin I understand the sprint board 😅',
        'vibe coding a side project rn, no plan just pure vibes 🚀',
        'at the gym doin one set then takin a 30 min boba break 💪🧋',
        "refactored code that wasn't broke and now nothin works, classic 💀",
        "networkin on LinkedIn like it's a full time job fr fr 🤝",
        'deployed on a Friday, livin dangerously 😤',
        'stared at the same bug for an hour, it was a typo 🫠',
        'meal prepped for the week, ate all of it by tuesday 🍱💀',
        'my commute playlist is carryin my whole mental health rn 🎧',
        'tried to touch grass, mosquitos said not today 🦟🌱',
        '3 monitors and I still alt-tab to my phone, insane 📱',
        'someone scheduled a 9am meeting, praying for their downfall 😤',
        'impulse-bought a mechanical keyboard I did NOT need, worth it ⌨️',
        "laundry's been in the dryer for 2 days, it lives there now 🧺",
        'cooked actual food for once and felt like a whole chef 👨‍🍳',
        'opened 40 browser tabs to solve one error, this is the job 🗂️',
      ],
  };

const AMBIENT_GENERAL =
  [
    "just vibin, hope y'all are havin a bussin day fr 🧋",
    "lowkey thinkin about boba again... it's a lifestyle at this point 🧋",
    'manifesting a return offer and infinite tapioca pearls 🙏✨',
    "reminder: you're crushin it today, no cap 💪 (now `/feed` me lol)",
    'hope everybody drank some water today, hydration is self care fr 💧',
    "random check-in: what's the best thing that happened to you today? 👀",
    'my brain at 100 tabs open and 3% battery rn, anybody else? 🔋',
    "low-key grateful for this lil server, y'all keep me going fr 🙏",
    "the weather's doin somethin today and I have feelings about it 🌤️",
    'debating a nap vs a boba run... why not both honestly 🧋😴',
    "shoutout to whoever's grinding late tonight, we up together 🌙",
    'just had a thought so deep I gotta lie down about it 🧠',
  ];

const CAREER_AMBIENT: Record<
  string,
  string[]
> =
  {
    swe: [
      "grindin LeetCode hards today, one day I'll be a real SWE fr 💻",
      'refactored my side project for the 5th time instead of shipping, SWE life 😩',
    ],
    data: [
      'training a model to predict which boba shop has the shortest line 📊🧋',
      'p-value came back significant, we STAY winning 📈',
    ],
    founder:
      [
        'cold-emailing VCs at 3am, the founder grind never sleeps 🚀',
        "pivoted my startup again, we're a boba-delivery-AI-blockchain now 😤",
      ],
    quant:
      [
        "backtesting a strategy that's definitely not gonna blow up my account 📈🙏",
        'reading a stochastic calculus book at the gym, quant arc fr',
      ],
    pm: [
      'scheduled a meeting that coulda been an email, feelin very PM today 📋',
      "wrote a 12-page PRD nobody's gonna read, this is the job lol",
    ],
    design:
      [
        'nudged this button 2px left for 3 hours, worth it 🎨',
        "made a design system with 40 shades of purple, chef's kiss ✨",
      ],
  };

/** Stage-aware slice-of-life line; career flavour once he's a teen/adult chasing one. */
export function ambientLine(
  stage: string,
  career: string,
): string {
  const pool =
    [
      ...AMBIENT_GENERAL,
      ...(AMBIENT_BY_STAGE[
        stage
      ] ??
        []),
    ];
  if (
    (stage ===
      'teen' ||
      stage ===
        'adult') &&
    career &&
    CAREER_AMBIENT[
      career
    ]
  ) {
    pool.push(
      ...CAREER_AMBIENT[
        career
      ]!,
    );
  }
  return pick(
    pool,
  );
}
