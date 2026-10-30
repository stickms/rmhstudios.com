import { describe, expect, it } from 'vitest';
import {
  BADGE_XP,
  BADGE_XP_FOIL,
  DROP_EVERY_SECONDS,
  MAX_BADGE_LEVEL,
  MAX_DROPS_PER_TITLE,
  SET_SIZE,
  cardName,
  dropForIndex,
  dropsEarned,
  planCraft,
} from '../cards';

describe('dropsEarned', () => {
  it('is one drop per 30 minutes, capped at three per title', () => {
    expect(dropsEarned(0)).toBe(0);
    expect(dropsEarned(DROP_EVERY_SECONDS - 1)).toBe(0);
    expect(dropsEarned(DROP_EVERY_SECONDS)).toBe(1);
    expect(dropsEarned(DROP_EVERY_SECONDS * 3)).toBe(3);
    expect(dropsEarned(DROP_EVERY_SECONDS * 100)).toBe(MAX_DROPS_PER_TITLE);
  });

  it('treats bad input as no playtime', () => {
    expect(dropsEarned(-5)).toBe(0);
    expect(dropsEarned(Number.NaN)).toBe(0);
  });
});

describe('dropForIndex', () => {
  it('is deterministic for a user, title and drop', () => {
    expect(dropForIndex('u1', 'altair', 0)).toEqual(dropForIndex('u1', 'altair', 0));
  });

  it('gives a user distinct cards across their drops of one title', () => {
    for (const user of ['a', 'b', 'c', 'seed-ana', 'seed-ben']) {
      const picks = Array.from({ length: MAX_DROPS_PER_TITLE }, (_, k) =>
        dropForIndex(user, 'altair', k).cardIndex,
      );
      expect(new Set(picks).size).toBe(MAX_DROPS_PER_TITLE);
      for (const p of picks) {
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThan(SET_SIZE);
      }
    }
  });

  it('varies between users and is foil about one time in twenty', () => {
    const firsts = new Set<number>();
    let foil = 0;
    const N = 4000;
    for (let i = 0; i < N; i++) {
      const d = dropForIndex(`user-${i}`, 'altair', 0);
      firsts.add(d.cardIndex);
      if (d.foil) foil++;
    }
    expect(firsts.size).toBe(SET_SIZE);
    expect(foil / N).toBeGreaterThan(0.03);
    expect(foil / N).toBeLessThan(0.07);
  });
});

describe('cardName', () => {
  it('names every card in a set differently', () => {
    const names = Array.from({ length: SET_SIZE }, (_, i) => cardName('altair', i));
    expect(new Set(names).size).toBe(SET_SIZE);
  });

  it('is stable for a title', () => {
    expect(cardName('altair', 2)).toBe(cardName('altair', 2));
  });
});

describe('planCraft', () => {
  const full = Array(SET_SIZE).fill(1);

  it('needs one of every card', () => {
    expect(planCraft({ counts: full, level: 0, foil: false })).toEqual({
      ok: true,
      newLevel: 1,
      xp: BADGE_XP,
    });
    expect(planCraft({ counts: [1, 1, 1, 1, 1, 0], level: 0, foil: false })).toEqual({
      ok: false,
      reason: 'missing-cards',
    });
  });

  it('stops at the top level and levels one step at a time', () => {
    expect(planCraft({ counts: full, level: MAX_BADGE_LEVEL, foil: false })).toEqual({
      ok: false,
      reason: 'max-level',
    });
    expect(planCraft({ counts: full, level: 4, foil: false })).toMatchObject({
      ok: true,
      newLevel: 5,
    });
  });

  it('a foil badge is a single, larger reward', () => {
    expect(planCraft({ counts: full, level: 0, foil: true })).toEqual({
      ok: true,
      newLevel: 1,
      xp: BADGE_XP_FOIL,
    });
    expect(planCraft({ counts: full, level: 1, foil: true })).toEqual({
      ok: false,
      reason: 'max-level',
    });
  });

  it('refuses a wrongly sized count list', () => {
    expect(planCraft({ counts: [1, 1], level: 0, foil: false })).toEqual({
      ok: false,
      reason: 'missing-cards',
    });
  });
});
