/**
 * Arcade Pass — code-driven daily game challenges.
 *
 * Pure module (client-safe): challenge definitions + a deterministic daily
 * rotation. No Prisma, no Date.now/Math.random in the rotation itself — the
 * three challenges for a given UTC day are a pure function of the day key, so
 * every server instance (and the client) agrees on them without shared state.
 *
 * Progress + rewards live in the existing `UserQuest` table, keyed
 * `(userId, questId=<challenge id>, periodKey=<day key>)`. See
 * `lib/game/results.server.ts` for the write side.
 */

/**
 * `daily` is a **mode** metric, not a quantity: it is satisfied only by a
 * result that reports it explicitly (today, only Slice It's S1 daily challenge,
 * via `daily.server.ts` → `reportGameResult`). It exists because the other four
 * metrics can all be satisfied by any run of any chart, which is what made the
 * old Slice It entry a participation trophy — there was no vocabulary here for
 * "the specific thing everyone is playing today".
 *
 * `accuracy` and `fullCombo` (X2) exist for the same reason `daily` does: a
 * rhythm/typing game's central metric is not always its score. `accuracy` is
 * `0–1` and tracks the best seen, like `score`/`clear`; `fullCombo` is
 * terminal, like `win`/`daily` — either the run was a full combo or it was not.
 */
export type ArcadeMetric = 'score' | 'win' | 'plays' | 'clear' | 'daily' | 'accuracy' | 'fullCombo';

export interface ArcadeChallengeDef {
  /** Game id — must match an `id` in `lib/games.ts`. */
  game: string;
  /** Human-readable challenge title (English; not run through i18n, like the quest catalog). */
  title: string;
  metric: ArcadeMetric;
  target: number;
  xp: number;
  coins: number;
}

/** A resolved challenge for a specific day (a def plus its stable id). */
export interface ArcadeChallenge extends ArcadeChallengeDef {
  /** Stable id: `a.<dayKey>.<game>.<metric>`. */
  id: string;
}

/** A challenge merged with the viewer's progress — the client-facing shape. */
export interface ArcadeChallengeView extends ArcadeChallenge {
  progress: number;
  completed: boolean;
  claimed: boolean;
}

/** Full arcade state returned to the page/API. */
export interface ArcadeState {
  /** UTC day key the challenges belong to ("YYYY-MM-DD"). */
  dayKey: string;
  challenges: ArcadeChallengeView[];
  streak: { current: number; best: number };
}

/**
 * Eligible pool. Every `game` id below is verified against `lib/games.ts`.
 * Each entry is a concrete challenge (metric + target + reward); a game may
 * appear more than once so the daily pick can vary the metric it asks for.
 * Rewards stay in the xp 40–70 / coins 10–20 band.
 */
const POOL: ArcadeChallengeDef[] = [
  {
    game: 'laundry-sort',
    title: 'Score 4,000 in Laundry Sort',
    metric: 'score',
    target: 4000,
    xp: 50,
    coins: 12,
  },
  {
    game: 'laundry-sort',
    title: 'Play 2 rounds of Laundry Sort',
    metric: 'plays',
    target: 2,
    xp: 40,
    coins: 10,
  },
  {
    game: 'void-breaker',
    title: 'Score 8,000 in Void Breaker',
    metric: 'score',
    target: 8000,
    xp: 60,
    coins: 15,
  },
  {
    game: 'void-breaker',
    title: 'Clear 5 waves in Void Breaker',
    metric: 'clear',
    target: 5,
    xp: 55,
    coins: 14,
  },
  {
    game: 'kowloon-knockout',
    title: 'Win a Kowloon Knockout brawl',
    metric: 'win',
    target: 1,
    xp: 60,
    coins: 16,
  },
  {
    game: 'neon-driftway',
    title: 'Score 6,000 in Neon Driftway',
    metric: 'score',
    target: 6000,
    xp: 55,
    coins: 14,
  },
  {
    game: 'nightrail',
    title: 'Score 25,000 in Nightrail',
    metric: 'score',
    target: 25000,
    xp: 55,
    coins: 14,
  },
  {
    // The distance target is roughly the harbor level end to end, so this one
    // is "finish a delivery" rather than "score well on it" — a different ask
    // of the same run.
    game: 'nightrail',
    title: 'Cover 2,000m in a single Nightrail run',
    metric: 'clear',
    target: 2000,
    xp: 50,
    coins: 12,
  },
  {
    game: 'slice-it',
    title: 'Score 5,000 in Slice It!',
    metric: 'score',
    target: 5000,
    xp: 50,
    coins: 12,
  },
  {
    // S1. The only entry in this pool that names a *specific* thing to play:
    // the daily challenge is one chart, one difficulty, one modifier set and
    // one attempt, identical for everybody, chosen by hashing the day key in
    // `lib/slice-it/daily.server.ts`. Top of the reward band because it is the
    // only challenge here you cannot re-roll by picking an easier song, and the
    // only one you get exactly one try at.
    game: 'slice-it',
    title: "Play today's Slice It! daily challenge",
    metric: 'daily',
    target: 1,
    xp: 70,
    coins: 20,
  },
  {
    // X2. Addresses the metric a rhythm game is actually about, rather than
    // the raw score every difficulty and every modifier set can inflate.
    game: 'slice-it',
    title: 'Finish a Slice It! song above 95% accuracy',
    metric: 'accuracy',
    target: 0.95,
    xp: 55,
    coins: 14,
  },
  {
    game: 'slice-it',
    title: 'Full combo any Slice It! song',
    metric: 'fullCombo',
    target: 1,
    xp: 60,
    coins: 16,
  },
  {
    game: 'synapse-storm',
    title: 'Score 3,000 in Synapse Storm',
    metric: 'score',
    target: 3000,
    xp: 50,
    coins: 12,
  },
  {
    game: 'dream-rift',
    title: 'Clear 2 stages in Dream Rift',
    metric: 'clear',
    target: 2,
    xp: 60,
    coins: 16,
  },
  {
    game: 'dream-rift',
    title: 'Score 50,000 in Dream Rift',
    metric: 'score',
    target: 50000,
    xp: 65,
    coins: 18,
  },
  {
    game: 'velum2099',
    title: 'Bank 5,000 credits in VELUM2099',
    metric: 'score',
    target: 5000,
    xp: 55,
    coins: 14,
  },
  {
    game: 'rochester-offensive',
    title: 'Win a round in Rochester Offensive',
    metric: 'win',
    target: 1,
    xp: 65,
    coins: 18,
  },
  {
    game: 'temple-of-joy',
    title: 'Play Temple of Joy today',
    metric: 'plays',
    target: 1,
    xp: 40,
    coins: 10,
  },
];

/** Distinct game ids in pool order (the rotation picks from these). */
const POOL_GAMES: string[] = Array.from(new Set(POOL.map((d) => d.game)));

/** Deterministic 32-bit FNV-1a string hash. No Date.now / Math.random. */
function hashStr(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** UTC day key ("YYYY-MM-DD") for a date (defaults to now). */
export function arcadeDayKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

/**
 * The three challenges for a given UTC day, chosen deterministically from the
 * pool. Picks 3 distinct games (hashed off the day key), then one metric
 * variant per game (hashed off day key + game).
 */
export function challengesForDay(dayKey: string): ArcadeChallenge[] {
  const remaining = [...POOL_GAMES];
  const chosen: string[] = [];
  const count = Math.min(3, remaining.length);
  for (let i = 0; i < count; i++) {
    const idx = hashStr(`${dayKey}#g${i}`) % remaining.length;
    chosen.push(remaining[idx]);
    remaining.splice(idx, 1);
  }

  return chosen.map((game) => {
    const variants = POOL.filter((d) => d.game === game);
    const def = variants[hashStr(`${dayKey}#m${game}`) % variants.length];
    return {
      ...def,
      id: `a.${dayKey}.${game}.${def.metric}`,
    };
  });
}

/** Parse the day key back out of a challenge id (`a.<dayKey>.<game>.<metric>`). */
export function dayKeyFromChallengeId(id: string): string | null {
  const m = /^a\.(\d{4}-\d{2}-\d{2})\./.exec(id);
  return m ? m[1] : null;
}
