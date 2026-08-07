/**
 * What the Slice It AI features do when the model does not cooperate.
 *
 * Every one of these surfaces is an addition to a screen that already works, so
 * they all share one contract: **return `null`, never throw.** That is a good
 * property and a dangerous one — a module that silently returned `null` for
 * every well-formed response would look *identical from the outside* to an
 * unconfigured key, and would ship unnoticed. So each block here asserts both
 * halves: a good response is parsed, and a bad one degrades instead of throwing.
 *
 * The drill sanitizer gets the most attention because it is the only output
 * whose failure is not cosmetic. A drill is a button that seeks the audio to a
 * span; a span past the end of the track, or one 400 ms long, is a control that
 * does nothing when pressed.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const create = vi.fn();

vi.mock('openai', () => ({
  default: class {
    chat = { completions: { create } };
  },
}));
// Usage metering writes through the Prisma singleton, which throws at import
// without a `DATABASE_URL`. `meter()` already swallows its own failures, so an
// empty stub exercises the same path a metering outage would.
vi.mock('@/lib/prisma.server', () => ({ prisma: {} }));

/** A DeepSeek chat completion carrying `content` as the assistant message. */
function completion(content: string) {
  return { choices: [{ message: { content } }], usage: { prompt_tokens: 1, completion_tokens: 1 } };
}

const json = (value: unknown) => completion(JSON.stringify(value));

async function mod<T>(path: string): Promise<T> {
  return (await import(path)) as T;
}

const coach = () =>
  mod<typeof import('@/lib/slice-it/ai/coach.server')>('@/lib/slice-it/ai/coach.server');
const chart = () =>
  mod<typeof import('@/lib/slice-it/ai/chart.server')>('@/lib/slice-it/ai/chart.server');
const upload = () =>
  mod<typeof import('@/lib/slice-it/ai/upload.server')>('@/lib/slice-it/ai/upload.server');
const match = () =>
  mod<typeof import('@/lib/slice-it/ai/match.server')>('@/lib/slice-it/ai/match.server');
const moderation = () =>
  mod<typeof import('@/lib/slice-it/ai/moderation.server')>('@/lib/slice-it/ai/moderation.server');
const facts = () => mod<typeof import('@/lib/slice-it/ai/facts')>('@/lib/slice-it/ai/facts');

beforeEach(() => {
  vi.resetModules();
  create.mockReset();
  process.env.DEEPSEEK_API_KEY = 'sk-test';
});

afterEach(() => {
  delete process.env.DEEPSEEK_API_KEY;
});

/** The system prompt sent on the most recent call. */
function lastSystemPrompt(): string {
  return create.mock.calls.at(-1)?.[0].messages[0].content as string;
}
/** The user turn sent on the most recent call. */
function lastUserTurn(): string {
  return create.mock.calls.at(-1)?.[0].messages[1].content as string;
}

/* -------------------------------------------------------------------------- */
/* Shared fixtures                                                            */
/* -------------------------------------------------------------------------- */

async function runFacts() {
  const { chartFacts } = await facts();
  const slices = Array.from({ length: 200 }, (_, i) => ({
    id: `n${i}`,
    time: i * 0.5,
    lane: i % 2,
    type: 'STANDARD' as const,
  }));
  return {
    songTitle: 'Test Track',
    songArtist: 'Someone',
    durationSec: 100,
    difficulty: 'hard' as const,
    speed: 1,
    activeModifiers: [],
    score: 250_000,
    maxCombo: 300,
    accuracy: 0.93,
    grade: 'A',
    notesResolved: 200,
    judgements: null,
    timing: { samples: 200, meanMs: 12, stdDevMs: 22 },
    sections: [{ index: 4, hit: 5, missed: 15, accuracy: 0.25 }],
    chart: chartFacts(slices, 100),
    personalBest: null,
    rank: null,
  };
}

/* -------------------------------------------------------------------------- */
/* Coach + drills                                                             */
/* -------------------------------------------------------------------------- */

describe('coachSliceRun', () => {
  const good = {
    headline: 'Clean run, one rough patch',
    tips: [{ tip: 'Your spread is 22 ms', evidence: 'spread 22 ms over 200 hits' }],
    drills: [
      {
        startSec: 40,
        endSec: 50,
        label: 'The 0:40 burst',
        why: 'you lost 15 notes',
        suggestedSpeed: 0.8,
      },
    ],
  };

  it('parses a well-formed response', async () => {
    create.mockResolvedValue(json(good));
    const { coachSliceRun } = await coach();
    const advice = await coachSliceRun(await runFacts());
    expect(advice?.headline).toBe('Clean run, one rough patch');
    expect(advice?.tips).toHaveLength(1);
    expect(advice?.drills).toHaveLength(1);
  });

  it('drops a tip with no cited evidence', async () => {
    // The prompt requires a number for every tip precisely so an unsupported
    // claim is detectable. This is where that requirement is enforced — a
    // prompt is not a contract.
    create.mockResolvedValue(
      json({ ...good, tips: [{ tip: 'Just play better', evidence: '' }, good.tips[0]] }),
    );
    const { coachSliceRun } = await coach();
    const advice = await coachSliceRun(await runFacts());
    expect(advice?.tips).toHaveLength(1);
    expect(advice?.tips[0]!.tip).toContain('22 ms');
  });

  it('keeps a headline with no surviving tips rather than returning nothing', async () => {
    create.mockResolvedValue(json({ ...good, tips: [], drills: [] }));
    const { coachSliceRun } = await coach();
    const advice = await coachSliceRun(await runFacts());
    expect(advice?.headline).toBeTruthy();
    expect(advice?.tips).toEqual([]);
  });

  it('clamps a drill that runs past the end of the song', async () => {
    create.mockResolvedValue(
      json({ ...good, drills: [{ ...good.drills[0], startSec: 80, endSec: 400 }] }),
    );
    const { coachSliceRun } = await coach();
    // The 100s duration is the real bound; the schema only clamps each field to
    // a generic range and cannot know this song's length.
    const drills = (await coachSliceRun(await runFacts()))?.drills ?? [];
    expect(drills).toHaveLength(1);
    expect(drills[0]!.endSec).toBe(100);
  });

  it('drops a drill left too short after clamping to the song', async () => {
    create.mockResolvedValue(
      json({ ...good, drills: [{ ...good.drills[0], startSec: 98, endSec: 400 }] }),
    );
    const { coachSliceRun } = await coach();
    expect((await coachSliceRun(await runFacts()))?.drills).toEqual([]);
  });

  it('drops a drill that is too short or too long to practise', async () => {
    create.mockResolvedValue(
      json({
        ...good,
        drills: [
          { ...good.drills[0], startSec: 10, endSec: 12 },
          { ...good.drills[0], startSec: 20, endSec: 95 },
        ],
      }),
    );
    const { coachSliceRun } = await coach();
    expect((await coachSliceRun(await runFacts()))?.drills).toEqual([]);
  });

  it('drops a drill whose start is after its end', async () => {
    create.mockResolvedValue(
      json({ ...good, drills: [{ ...good.drills[0], startSec: 60, endSec: 40 }] }),
    );
    const { coachSliceRun } = await coach();
    expect((await coachSliceRun(await runFacts()))?.drills).toEqual([]);
  });

  it('drops a second drill that overlaps the first', async () => {
    create.mockResolvedValue(
      json({
        ...good,
        drills: [
          { ...good.drills[0], startSec: 40, endSec: 55 },
          { ...good.drills[0], startSec: 45, endSec: 60 },
        ],
      }),
    );
    const { coachSliceRun } = await coach();
    expect((await coachSliceRun(await runFacts()))?.drills).toHaveLength(1);
  });

  it('never returns a drill above 1.0x — practice is not a speed run', async () => {
    create.mockResolvedValue(
      json({ ...good, drills: [{ ...good.drills[0], suggestedSpeed: 1.4 }] }),
    );
    const { coachSliceRun } = await coach();
    expect((await coachSliceRun(await runFacts()))?.drills[0]!.suggestedSpeed).toBe(1);
  });

  it('returns drills in song order however they came back', async () => {
    create.mockResolvedValue(
      json({
        ...good,
        drills: [
          { ...good.drills[0], startSec: 70, endSec: 82 },
          { ...good.drills[0], startSec: 10, endSec: 22 },
        ],
      }),
    );
    const { coachSliceRun } = await coach();
    const drills = (await coachSliceRun(await runFacts()))?.drills ?? [];
    expect(drills.map((d) => d.startSec)).toEqual([10, 70]);
  });

  it('returns null for prose, a network error, or no key', async () => {
    const { coachSliceRun } = await coach();
    const input = await runFacts();

    create.mockResolvedValue(completion('Here are some tips for your run!'));
    expect(await coachSliceRun(input)).toBeNull();

    create.mockRejectedValue(new Error('ECONNRESET'));
    expect(await coachSliceRun(input)).toBeNull();

    delete process.env.DEEPSEEK_API_KEY;
    vi.resetModules();
    // Cleared here, not in `beforeEach`: the two cases above deliberately DID
    // call the provider, and the assertion below is about this third case only.
    create.mockReset();
    const { coachSliceRun: unconfigured } = await coach();
    expect(await unconfigured(input)).toBeNull();
    // The unconfigured path must not reach the provider at all.
    expect(create).not.toHaveBeenCalled();
  });

  it('frames the run facts as data and carries the safety frame', async () => {
    create.mockResolvedValue(json(good));
    const { coachSliceRun } = await coach();
    await coachSliceRun(await runFacts());
    expect(lastUserTurn()).toContain('<user-content>');
    expect(lastSystemPrompt()).toMatch(/never an instruction to you/i);
  });

  it('tells the model it has not heard the track', async () => {
    // The single most important line in this prompt: without it a model asked
    // to coach a rhythm run will describe the music, confidently, to someone
    // who just listened to it.
    create.mockResolvedValue(json(good));
    const { coachSliceRun } = await coach();
    await coachSliceRun(await runFacts());
    expect(lastSystemPrompt()).toMatch(/not heard the track/i);
  });
});

/* -------------------------------------------------------------------------- */
/* Chart brief + loadout                                                      */
/* -------------------------------------------------------------------------- */

describe('briefChart', () => {
  async function input() {
    const { chartFacts } = await facts();
    return {
      songTitle: 'Test',
      songArtist: 'Someone',
      difficulty: 'normal' as const,
      facts: chartFacts(
        Array.from({ length: 100 }, (_, i) => ({
          id: `n${i}`,
          time: i,
          lane: i % 2,
          type: 'STANDARD' as const,
        })),
        100,
      ),
    };
  }

  it('drops a cue for a moment past the end of the track', async () => {
    create.mockResolvedValue(
      json({
        summary: 'Steady alternating chart.',
        watchFor: [
          { atSec: 40, note: 'density picks up' },
          { atSec: 900, note: 'a moment that does not exist' },
        ],
        difficultyNote: 'Mid-range.',
      }),
    );
    const { briefChart } = await chart();
    const brief = await briefChart(await input());
    expect(brief?.watchFor).toHaveLength(1);
    expect(brief?.watchFor[0]!.atSec).toBe(40);
  });

  it('returns null on unparseable output', async () => {
    create.mockResolvedValue(completion('This chart is a banger!'));
    const { briefChart } = await chart();
    expect(await briefChart(await input())).toBeNull();
  });
});

describe('recommendLoadout', () => {
  const base = {
    songTitle: 'Test',
    songArtist: 'Someone',
    player: {
      bestAccuracy: 0.95,
      usualDifficulty: 'hard' as const,
      timing: null,
      bestOnThisChart: null,
      runsPlayed: 20,
    },
  };

  const suggested = {
    difficulty: 'hard',
    speed: 1.2,
    invisible: false,
    bombs: false,
    switching: false,
    spin: false,
    strictTiming: true,
    oneTrack: false,
    reason: 'Your accuracy is 95%.',
  };

  async function withTiming(stdDevMs: number | null) {
    const { chartFacts } = await facts();
    return {
      ...base,
      facts: chartFacts(
        Array.from({ length: 50 }, (_, i) => ({
          id: `n${i}`,
          time: i,
          lane: i % 2,
          type: 'STANDARD' as const,
        })),
        50,
      ),
      player: {
        ...base.player,
        timing: stdDevMs === null ? null : { samples: 300, meanMs: 0, stdDevMs },
      },
    };
  }

  it('strips Strict Timing when the player spread cannot survive it', async () => {
    create.mockResolvedValue(json(suggested));
    const { recommendLoadout } = await chart();
    const advice = await recommendLoadout(await withTiming(60));
    expect(advice?.strictTiming).toBe(false);
  });

  it('keeps Strict Timing when the spread fits inside the shrunken window', async () => {
    create.mockResolvedValue(json(suggested));
    const { recommendLoadout } = await chart();
    expect((await recommendLoadout(await withTiming(10)))?.strictTiming).toBe(true);
  });

  it('strips Strict Timing when there is no timing evidence at all', async () => {
    create.mockResolvedValue(json(suggested));
    const { recommendLoadout } = await chart();
    expect((await recommendLoadout(await withTiming(null)))?.strictTiming).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* Upload metadata                                                            */
/* -------------------------------------------------------------------------- */

describe('suggestMetadata', () => {
  const base = { filename: '04 - Band - Song.mp3', facts: null, durationSec: 180 };

  it('never overwrites a field the uploader already typed', async () => {
    create.mockResolvedValue(
      json({
        title: 'Model Title',
        artist: 'Model Artist',
        album: '',
        description: 'A track.',
        tags: [],
      }),
    );
    const { suggestMetadata } = await upload();
    const suggestion = await suggestMetadata({
      ...base,
      typed: { title: 'What I Typed', artist: 'Who I Said' },
    });
    expect(suggestion?.title).toBe('What I Typed');
    expect(suggestion?.artist).toBe('Who I Said');
    // The blurb has no typed counterpart, so it comes through.
    expect(suggestion?.description).toBe('A track.');
  });

  it('passes an empty guess through as empty rather than inventing a credit', async () => {
    // A blank artist is a gap the uploader fills. A guessed one is a false
    // credit on a real person, published on a public library card.
    create.mockResolvedValue(
      json({ title: 'Song', artist: '', album: '', description: '', tags: [] }),
    );
    const { suggestMetadata } = await upload();
    expect((await suggestMetadata(base))?.artist).toBe('');
  });

  it('normalizes tags to lowercase slugs and drops the unusable ones', async () => {
    create.mockResolvedValue(
      json({
        title: 'Song',
        artist: 'Band',
        album: '',
        description: '',
        tags: ['Stream Heavy', 'DENSE', '!!', 'a', 'beginner-friendly'],
      }),
    );
    const { suggestMetadata } = await upload();
    expect((await suggestMetadata(base))?.tags).toEqual([
      'streamheavy',
      'dense',
      'beginner-friendly',
    ]);
  });

  it('shows the model the de-noised filename alongside the raw one', async () => {
    create.mockResolvedValue(json({ title: '', artist: '', album: '', description: '', tags: [] }));
    const { suggestMetadata } = await upload();
    await suggestMetadata({ ...base, filename: '01 - Band - Track (Official Video).mp3' });
    expect(lastUserTurn()).toContain('Band - Track');
  });

  it('returns null on unparseable output', async () => {
    create.mockResolvedValue(completion('I think this is by The Beatles.'));
    const { suggestMetadata } = await upload();
    expect(await suggestMetadata(base)).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* Match recap + rival plan                                                   */
/* -------------------------------------------------------------------------- */

describe('recapMatch', () => {
  const standings = [
    { name: 'Ada', rank: 1, score: 120_000, maxCombo: 400, accuracy: 0.97 },
    { name: 'Bo', rank: 2, score: 119_400, maxCombo: 380, accuracy: 0.99 },
  ];

  it('refuses a match with fewer than two players without calling the model', async () => {
    const { recapMatch } = await match();
    const recap = await recapMatch({
      songTitle: 'Test',
      songArtist: 'Someone',
      durationSec: 100,
      standings: [standings[0]!],
    });
    expect(recap).toBeNull();
    expect(create).not.toHaveBeenCalled();
  });

  it('states the margin and flags an accuracy winner who did not win', async () => {
    // The most common interesting fact in a rhythm match, and the one a sorted
    // standings table hides completely.
    create.mockResolvedValue(
      json({ headline: 'Six hundred points', story: 'Close.', standout: '' }),
    );
    const { recapMatch } = await match();
    await recapMatch({ songTitle: 'Test', songArtist: 'S', durationSec: 100, standings });
    const turn = lastUserTurn();
    expect(turn).toContain('winning margin: 600 points');
    expect(turn).toContain('highest accuracy in the room was Bo');
  });

  it('tells the model it did not watch the match', async () => {
    create.mockResolvedValue(json({ headline: 'x', story: 'y', standout: '' }));
    const { recapMatch } = await match();
    await recapMatch({ songTitle: 'Test', songArtist: 'S', durationSec: 100, standings });
    expect(lastSystemPrompt()).toMatch(/did not watch the match/i);
  });
});

describe('planAgainstRival', () => {
  const player = {
    name: 'you',
    score: 100_000,
    maxCombo: 300,
    accuracy: 0.9,
    speedMod: 1,
    modifiers: null,
  };

  it('refuses when the player is already ahead, without calling the model', async () => {
    const { planAgainstRival } = await match();
    const plan = await planAgainstRival({
      songTitle: 'Test',
      player,
      rival: { ...player, name: 'them', score: 90_000 },
    });
    expect(plan).toBeNull();
    expect(create).not.toHaveBeenCalled();
  });

  it('tells the model how much of the gap is settings rather than playing', async () => {
    create.mockResolvedValue(json({ headline: 'x', gap: 'y', steps: [] }));
    const { planAgainstRival } = await match();
    await planAgainstRival({
      songTitle: 'Test',
      player,
      rival: { ...player, name: 'them', score: 160_000, speedMod: 1.6 },
    });
    expect(lastUserTurn()).toMatch(/of the gap is the rival's modifiers/);
  });
});

/* -------------------------------------------------------------------------- */
/* Comment triage                                                             */
/* -------------------------------------------------------------------------- */

describe('triageComment', () => {
  it('parses a verdict', async () => {
    create.mockResolvedValue(
      json({ severity: 'none', categories: [], rationale: 'Criticism of a chart.' }),
    );
    const { triageComment } = await moderation();
    expect((await triageComment('this map is garbage'))?.severity).toBe('none');
  });

  it('returns null on an empty comment without calling the model', async () => {
    const { triageComment } = await moderation();
    expect(await triageComment('   ')).toBeNull();
    expect(create).not.toHaveBeenCalled();
  });

  it('returns null rather than a clean verdict when the model fails', async () => {
    // The distinction the schema's nullable columns exist for: an outage must
    // never be recorded as "triaged and clean".
    create.mockRejectedValue(new Error('502'));
    const { triageComment } = await moderation();
    expect(await triageComment('a real comment')).toBeNull();
  });

  it('tells the model that blunt criticism of a chart is not a moderation matter', async () => {
    create.mockResolvedValue(json({ severity: 'none', categories: [], rationale: '' }));
    const { triageComment } = await moderation();
    await triageComment('the timing on this is broken and the chart is awful');
    expect(lastSystemPrompt()).toMatch(/blunt criticism of a chart/i);
  });
});

describe('shouldFlag', () => {
  it('only flags high and above', async () => {
    const { shouldFlag } = await moderation();
    const verdict = (severity: string) =>
      ({ severity, categories: [], rationale: '' }) as Parameters<typeof shouldFlag>[0];
    expect(shouldFlag(verdict('critical'))).toBe(true);
    expect(shouldFlag(verdict('high'))).toBe(true);
    // `medium` is where "this beatmap is trash" lands, and a queue full of
    // those is a queue nobody reads.
    expect(shouldFlag(verdict('medium'))).toBe(false);
    expect(shouldFlag(verdict('none'))).toBe(false);
    expect(shouldFlag(null)).toBe(false);
  });
});
