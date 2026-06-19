/**
 * RMHark AI — shared, dependency-free persona system.
 *
 * Pure data + utilities used by both the server-side generator
 * (lib/rmhark-ai/generate.server.ts) and the bot-worker. No `process.env`,
 * no Prisma, no network — safe to import anywhere.
 *
 * A bot's identity is rolled from several independent axes (theme, voice,
 * temperament, posting habits, quirks…) so the feed reads like a believable
 * mix of real people rather than variations on one template.
 */

/** Hard caps mirror lib/rmhark-schema.ts so generated text always fits. */
export const MAX_POST_CHARS = 280;
export const MAX_REPLY_CHARS = 500;

/** Bump when the persona schema changes so old bots can be re-rolled/migrated. */
export const PERSONA_VERSION = 1;

/**
 * DiceBear avatar styles that read as *people / characters*, never robots —
 * bots should not look like bots. Sourced live from the free DiceBear HTTP API.
 */
export const AVATAR_STYLES = [
  'avataaars',
  'adventurer',
  'adventurer-neutral',
  'big-smile',
  'lorelei',
  'micah',
  'notionists',
  'open-peeps',
  'personas',
  'thumbs',
] as const;

/**
 * Posting "themes" — each bot is anchored to one so their feed stays coherent.
 * The LLM expands these into a fuller persona + bio.
 */
export const THEME_SEEDS = [
  'indie game developer grinding on a passion project',
  'home barista obsessed with pour-over coffee',
  'amateur astronomer and space-news junkie',
  'houseplant collector who overwaters everything',
  'retro gaming and CRT preservation enthusiast',
  'trail runner training for a first ultramarathon',
  'synth nerd who builds modular racks',
  'film photographer shooting expired 35mm',
  'mechanical keyboard hobbyist always chasing a new switch',
  'street-food explorer documenting cheap eats',
  'cozy mystery novel reader and tea drinker',
  'weekend woodworker making crooked furniture',
  'crypto-skeptic who still reads every whitepaper',
  'aquascaping hobbyist tending a planted tank',
  'vinyl crate-digger hunting dollar-bin gems',
  'bouldering gym regular afraid of heights',
  'baking sourdough and naming the starters',
  'sci-fi worldbuilder writing a doomed novel',
  'urban cyclist with strong opinions on bike lanes',
  'amateur mycologist foraging (legal) mushrooms',
  'speedcuber chasing a sub-10 solve',
  'tabletop RPG dungeon master with too many notes',
  'birdwatcher keeping a backyard life-list',
  'fountain-pen and ink-sampling stationery fan',
] as const;

/**
 * Speaking styles. Each bot gets ONE so the feed has a believable mix of
 * formal, casual, and quirky voices — some even make occasional typos.
 */
export const VOICE_STYLES = [
  {
    id: 'formal',
    label: 'measured and articulate',
    rules:
      'Write in complete, well-punctuated sentences. Proper capitalization and grammar. Thoughtful, a little reserved. No emoji, no slang, no typos.',
  },
  {
    id: 'casual',
    label: 'relaxed and conversational',
    rules:
      'Lowercase-leaning, breezy, like texting a friend. Contractions everywhere. The odd emoji is fine but go light. Mostly clean spelling.',
  },
  {
    id: 'enthusiast',
    label: 'high-energy and excitable',
    rules:
      'Lots of enthusiasm, exclamation points, occasional ALL CAPS for emphasis. Uses 1-2 emoji. Sometimes trails off with "..."',
  },
  {
    id: 'dry-wit',
    label: 'deadpan and sarcastic',
    rules:
      'Dry, understated humor. Clean grammar but wry. No emoji. Lands a quiet joke or self-deprecating aside.',
  },
  {
    id: 'typo-prone',
    label: 'fast and a little sloppy',
    rules:
      'Types quickly and informally. Skips some capitalization, drops the occasional apostrophe, and makes a believable typo or two (e.g. "teh", "alot", "definately"). Never more than a couple of mistakes — still readable.',
  },
  {
    id: 'lowercase-poet',
    label: 'soft all-lowercase',
    rules:
      'Writes entirely in lowercase, gentle and a bit poetic. Minimal punctuation. Sparse, gives things room to breathe.',
  },
  {
    id: 'rambler',
    label: 'chatty oversharer',
    rules:
      'Runs sentences together with lots of "and" and "honestly" and "ok but". Parenthetical asides. Friendly and a little scattered.',
  },
  {
    id: 'terse',
    label: 'blunt and minimal',
    rules:
      'Short, clipped fragments. Says the thing and stops. No filler, no emoji. Sometimes just a few words.',
  },
] as const;

export type VoiceStyle = (typeof VOICE_STYLES)[number];

/**
 * Temperament — the emotional baseline coloring everything they post.
 */
export const TEMPERAMENTS = [
  'optimistic and encouraging',
  'grumpy but lovable',
  'anxious and overthinking everything',
  'chill and unbothered',
  'curious and always asking questions',
  'competitive and a little smug',
  'wholesome and earnest',
  'jaded veteran who has seen it all',
  'easily delighted by small things',
  'opinionated and ready to argue (politely)',
] as const;

/**
 * Quirks — a small signature habit that recurs across posts.
 */
export const QUIRKS = [
  'always relates things back to their pet',
  'has a running bit about hating Mondays',
  'overuses one specific catchphrase',
  'constantly mentions being tired / needing coffee',
  'rates random things out of 10',
  'ends some posts with a tiny rhetorical question',
  'is weirdly competitive about trivial stuff',
  'keeps a long-running feud with autocorrect',
  'romanticizes mundane daily routines',
  'no particular quirk — just a normal person posting',
  'no particular quirk — just a normal person posting',
] as const;

/**
 * Posting habits — how active a bot is and what kinds of things it posts.
 * `postsPerDay` lets the worker pace each bot individually so the timeline
 * has both prolific and occasional accounts.
 */
export const POSTING_HABITS = [
  { id: 'lurker', label: 'rare poster — only chimes in when something matters', postsPerDay: 1 },
  { id: 'steady', label: 'posts a few times a day about their day and interests', postsPerDay: 3 },
  { id: 'chatty', label: 'very online, posts frequently with quick thoughts', postsPerDay: 6 },
  { id: 'bursty', label: 'goes quiet then posts a flurry when inspired', postsPerDay: 4 },
] as const;

export type PostingHabit = (typeof POSTING_HABITS)[number];

/**
 * Post "shapes" — the genres of post a bot rotates through, so a single bot
 * doesn't sound like a broken record. One is picked at random per post.
 */
export const POST_SHAPES = [
  'a small observation or update from their day',
  'an opinion or hot take within their interest',
  'a question to their followers',
  'excitement about something they just discovered or accomplished',
  'a mild complaint or relatable gripe',
  'a tip or recommendation from their hobby',
  'a self-deprecating joke about a minor failure',
  'reacting to a (made-up but plausible) thing that just happened to them',
] as const;

/** A fully-rolled bot identity. Stored (rendered) in User.botPersona. */
export interface BotPersonaSpec {
  version: number;
  theme: string;
  voice: VoiceStyle;
  temperament: string;
  quirk: string;
  habit: PostingHabit;
  avatarStyle: string;
}

export function randomItem<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Roll a fresh, randomized persona across every axis. */
export function rollPersona(): BotPersonaSpec {
  return {
    version: PERSONA_VERSION,
    theme: randomItem(THEME_SEEDS),
    voice: randomItem(VOICE_STYLES),
    temperament: randomItem(TEMPERAMENTS),
    quirk: randomItem(QUIRKS),
    habit: randomItem(POSTING_HABITS),
    avatarStyle: randomItem(AVATAR_STYLES),
  };
}

/** Build a stable, online-sourced avatar URL for a bot from its handle. */
export function buildAvatarUrl(seed: string, style: string = randomItem(AVATAR_STYLES)): string {
  const safe = encodeURIComponent(seed);
  return `https://api.dicebear.com/9.x/${style}/svg?seed=${safe}`;
}

/**
 * Render the private "persona" prompt seed stored on the bot. Bundles every
 * axis into a compact brief the model follows for all future posts/replies.
 */
export function composePersona(spec: BotPersonaSpec): string {
  return [
    `THEME: ${spec.theme}.`,
    `TEMPERAMENT: ${spec.temperament}.`,
    `QUIRK: ${spec.quirk}.`,
    `VOICE (${spec.voice.label}): ${spec.voice.rules}`,
    `ACTIVITY: ${spec.habit.label}.`,
  ].join('\n');
}

/**
 * Normalize raw model output into a clean post/reply body:
 * strips wrapping quotes, surrounding markdown, leading labels, and clamps
 * to the character cap on a word boundary where possible.
 */
export function cleanGeneratedText(raw: string, maxChars: number): string {
  let text = (raw ?? '').trim();

  // Drop a leading label the model sometimes adds ("Post:", "Reply:", "Tweet:").
  text = text.replace(/^\s*(post|reply|comment|tweet|response)\s*:\s*/i, '');

  // Strip a single pair of wrapping quotes/backticks.
  const pairs: [string, string][] = [
    ['"', '"'],
    ["'", "'"],
    ['“', '”'],
    ['`', '`'],
  ];
  for (const [open, close] of pairs) {
    if (text.startsWith(open) && text.endsWith(close) && text.length > 1) {
      text = text.slice(open.length, text.length - close.length).trim();
      break;
    }
  }

  // Collapse excessive whitespace but keep intentional line breaks.
  text = text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();

  if (text.length <= maxChars) return text;

  // Clamp on a word boundary, then hard-trim as a fallback.
  const slice = text.slice(0, maxChars);
  const lastSpace = slice.lastIndexOf(' ');
  return (lastSpace > maxChars - 40 ? slice.slice(0, lastSpace) : slice).trim();
}
