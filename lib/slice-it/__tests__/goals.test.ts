/**
 * S3, S5, S6, S7 and S10 — the single-player structures.
 *
 * The rule under test throughout: a goal reads only what a run already
 * produces. The moment one needs something else, every new goal type is a
 * schema change and the feature stops being cheap enough to add to.
 */

import { describe, expect, it } from 'vitest';
import {
  BOSS_SECTION_PENALTY,
  DAN_COURSES,
  SCORE_TIERS,
  bossCurve,
  bossVerdict,
  campaignProgress,
  describeGoal,
  highestDan,
  meetsGoal,
  missionsFor,
  passesDan,
  scoreTargets,
  tierFor,
  unlockedStages,
  type CampaignChapter,
  type Goal,
} from '../goals';
import { DEFAULT_MODIFIERS } from '../modifiers';
import type { Modifiers, RunStats, Slice } from '../types';

function stats(overrides: Partial<RunStats> = {}): RunStats {
  return {
    score: 100_000,
    maxCombo: 400,
    accuracy: 0.96,
    notesResolved: 500,
    judgements: { MARVELOUS: 480, PERFECT: 20, GREAT: 0, GOOD: 0, BAD: 0, MISS: 0 },
    health: 100,
    gaugeBroken: false,
    failed: false,
    failReason: null,
    isFullCombo: true,
    isPerfect: false,
    ...overrides,
  } as RunStats;
}

const mods = (overrides: Partial<Modifiers> = {}): Modifiers => ({
  ...DEFAULT_MODIFIERS,
  ...overrides,
});

const note = (id: string, time: number, type: Slice['type'] = 'STANDARD'): Slice => ({
  id,
  time,
  lane: 0,
  type,
});

describe('goal evaluation', () => {
  it('does not call a failed run a clear', () => {
    // A run the gauge killed at 0:20 resolved plenty of notes; calling that a
    // clear would make the whole campaign completable by dying.
    expect(meetsGoal({ kind: 'clear' }, stats(), mods())).toBe(true);
    expect(
      meetsGoal({ kind: 'clear' }, stats({ failed: true, failReason: 'health' }), mods()),
    ).toBe(false);
  });

  it('gates accuracy and score on not failing too', () => {
    expect(meetsGoal({ kind: 'accuracy', min: 0.95 }, stats(), mods())).toBe(true);
    expect(meetsGoal({ kind: 'accuracy', min: 0.99 }, stats(), mods())).toBe(false);
    expect(
      meetsGoal({ kind: 'accuracy', min: 0.5 }, stats({ failed: true }), mods()),
    ).toBe(false);
    expect(meetsGoal({ kind: 'score', min: 50_000 }, stats(), mods())).toBe(true);
  });

  it('counts a combo reached even on a failed run', () => {
    // A combo is a thing that happened; the gauge killing you later does not
    // un-happen it.
    expect(meetsGoal({ kind: 'combo', min: 300 }, stats({ failed: true }), mods())).toBe(true);
  });

  it('requires EVERY named modifier for a conditional full combo', () => {
    // `some` would let "FC with bombs" be satisfied by an FC with mirror, which
    // is a different feat.
    const goal: Goal = { kind: 'fc', modifiers: ['bombs', 'switching'] };
    expect(meetsGoal(goal, stats(), mods({ bombs: true, switching: true }))).toBe(true);
    expect(meetsGoal(goal, stats(), mods({ bombs: true }))).toBe(false);
    expect(meetsGoal({ kind: 'fc' }, stats(), mods())).toBe(true);
    expect(
      meetsGoal({ kind: 'fc' }, stats({ judgements: { ...stats().judgements, MISS: 1 } }), mods()),
    ).toBe(false);
  });

  it('reserves perfect for nothing below MARVELOUS', () => {
    expect(meetsGoal({ kind: 'perfect' }, stats(), mods())).toBe(false);
    // The game's existing definition (`RunStats.isPerfect`), not a second one:
    // a mission and the H7 badge disagreeing about the same run on the same
    // screen would be worse than either being strict or lenient.
    const flawless = stats({
      judgements: { MARVELOUS: 500, PERFECT: 0, GREAT: 0, GOOD: 0, BAD: 0, MISS: 0 },
      isPerfect: true,
    });
    expect(meetsGoal({ kind: 'perfect' }, flawless, mods())).toBe(true);
  });

  it('describes every goal kind', () => {
    const kinds: Goal[] = [
      { kind: 'clear' },
      { kind: 'accuracy', min: 0.95 },
      { kind: 'score', min: 1000 },
      { kind: 'combo', min: 100 },
      { kind: 'fc' },
      { kind: 'fc', modifiers: ['bombs'] },
      { kind: 'perfect' },
      { kind: 'no-hold-drops' },
    ];
    for (const goal of kinds) expect(describeGoal(goal).length).toBeGreaterThan(0);
  });
});

describe('S6 — per-chart missions', () => {
  const plain = Array.from({ length: 100 }, (_, i) => note(`n${i}`, i));
  const withHolds = [...plain.slice(0, 90), ...Array.from({ length: 10 }, (_, i) => note(`h${i}`, 90 + i, 'LONG'))];

  it('never offers a hold mission on a chart with no holds', () => {
    // A mission that cannot be completed reads as the game being broken, not
    // as a challenge.
    for (let seed = 0; seed < 30; seed++) {
      const missions = missionsFor(plain, `hash-${seed}`);
      expect(missions.some((m) => m.goal.kind === 'no-hold-drops')).toBe(false);
    }
  });

  it('can offer one on a chart that has them', () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 40; seed++) {
      for (const mission of missionsFor(withHolds, `hash-${seed}`)) seen.add(mission.id);
    }
    expect(seen.has('holds')).toBe(true);
  });

  it('is the same three for everyone on the same chart', () => {
    // Two players comparing missions on one chart must see one list.
    expect(missionsFor(plain, 'abc')).toEqual(missionsFor(plain, 'abc'));
  });

  it('varies between charts', () => {
    const sets = new Set(
      Array.from({ length: 12 }, (_, i) =>
        missionsFor(withHolds, `h${i}`)
          .map((m) => m.id)
          .join(','),
      ),
    );
    expect(sets.size).toBeGreaterThan(1);
  });

  it('gives exactly three, easy first', () => {
    const missions = missionsFor(withHolds, 'abc');
    expect(missions).toHaveLength(3);
    expect(new Set(missions.map((m) => m.id)).size).toBe(3);
    for (let i = 1; i < missions.length; i++) {
      expect(missions[i].reward).toBeGreaterThanOrEqual(missions[i - 1].reward);
    }
  });

  it('offers nothing on an empty chart', () => {
    expect(missionsFor([], 'abc')).toEqual([]);
  });

  it('scales the combo targets to the chart', () => {
    const short = missionsFor(Array.from({ length: 12 }, (_, i) => note(`s${i}`, i)), 'abc');
    for (const mission of short) {
      if (mission.goal.kind === 'combo') expect(mission.goal.min).toBeLessThanOrEqual(12);
    }
  });
});

describe('S10 — score tiers', () => {
  it('is a fraction of the chart’s own maximum', () => {
    // A target that is trivial on a short chart and impossible on a long one is
    // a chart-length setting wearing a difficulty setting's clothes.
    const targets = scoreTargets(1_000_000);
    expect(targets.bronze).toBeLessThan(targets.silver);
    expect(targets.silver).toBeLessThan(targets.gold);
    expect(targets.gold).toBeLessThan(targets.platinum);
    expect(targets.platinum).toBeLessThan(1_000_000);
  });

  it('reports the highest tier reached', () => {
    expect(tierFor(0, 1_000_000)).toBeNull();
    expect(tierFor(700_000, 1_000_000)).toBe('bronze');
    expect(tierFor(1_000_000, 1_000_000)).toBe('platinum');
  });

  it('scales with the chart', () => {
    expect(tierFor(700_000, 1_000_000)).toBe(tierFor(70_000, 100_000));
  });

  it('names four tiers, ascending', () => {
    expect(SCORE_TIERS).toEqual(['bronze', 'silver', 'gold', 'platinum']);
  });
});

describe('S7 — the boss', () => {
  const perfect = [0, 100, 250, 500, 900];

  it('is derived from the chart’s achievable score', () => {
    const easy = bossCurve(perfect, 0);
    const hard = bossCurve(perfect, 2);
    expect(easy[4]).toBeLessThan(hard[4]);
    expect(hard[4]).toBeLessThan(perfect[4]);
  });

  it('clamps an unknown tier to the hardest', () => {
    expect(bossCurve(perfect, 99)).toEqual(bossCurve(perfect, 2));
  });

  it('costs gauge only when behind', () => {
    expect(bossVerdict(500, 400)).toEqual({ ahead: true, penalty: 0 });
    expect(bossVerdict(300, 400)).toEqual({ ahead: false, penalty: BOSS_SECTION_PENALTY });
    // Level counts as ahead — losing gauge for a tie would be a coin flip on
    // floating-point equality.
    expect(bossVerdict(400, 400).ahead).toBe(true);
  });
});

describe('S3 — the certification ladder', () => {
  it('ships empty rather than seeded by whatever was in the library', () => {
    // A ladder defined by the generator's output on the day it ran is precisely
    // the arbitrariness a fixed list exists to avoid.
    expect(DAN_COURSES).toEqual([]);
    expect(highestDan(['dan-1'])).toBeNull();
  });

  it('is pass/fail across every chart in the course', () => {
    const course = { id: 'd', name: 'D', rank: 1, minRating: 4, charts: ['a', 'b', 'c'] };
    expect(passesDan([stats(), stats(), stats()], course)).toBe(true);
    expect(passesDan([stats(), stats({ failed: true }), stats()], course)).toBe(false);
    // A short run set is not a pass — you cannot certify on two of three.
    expect(passesDan([stats(), stats()], course)).toBe(false);
  });
});

describe('S5 — the campaign', () => {
  const chapters: CampaignChapter[] = [
    {
      id: 'ch1',
      name: 'One',
      stages: [
        { id: 's1', chartId: 'a', goal: { kind: 'clear' }, reward: 'coins:10' },
        { id: 's2', chartId: 'b', goal: { kind: 'fc' }, reward: 'skin.neon' },
      ],
    },
    {
      id: 'ch2',
      name: 'Two',
      stages: [{ id: 's3', chartId: 'c', goal: { kind: 'perfect' }, reward: 'coins:50' }],
    },
  ];

  it('opens one stage at a time', () => {
    expect(unlockedStages(chapters, new Set())).toEqual(['s1']);
    expect(unlockedStages(chapters, new Set(['s1']))).toEqual(['s2']);
  });

  it('blocks a later chapter until the earlier one is finished', () => {
    expect(unlockedStages(chapters, new Set(['s1']))).not.toContain('s3');
    expect(unlockedStages(chapters, new Set(['s1', 's2']))).toEqual(['s3']);
  });

  it('opens nothing once everything is done', () => {
    expect(unlockedStages(chapters, new Set(['s1', 's2', 's3']))).toEqual([]);
  });

  it('reports progress across every chapter', () => {
    expect(campaignProgress(chapters, new Set())).toBe(0);
    expect(campaignProgress(chapters, new Set(['s1', 's2']))).toBeCloseTo(2 / 3, 5);
    expect(campaignProgress([], new Set())).toBe(0);
  });
});
