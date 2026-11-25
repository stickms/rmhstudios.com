import { describe, expect, it } from 'vitest';
import {
  freshProgress,
  isCompleteGrid,
  judgeGuess,
  practiceBoard,
  practiceGuess,
  stableOrder,
  validatePick,
} from '@/lib/party/connections-practice';
import type { GridGroup } from '@/lib/party/connections';

const groups: GridGroup[] = [
  { label: 'Fruit', items: ['apple', 'pear', 'plum', 'fig'] },
  { label: 'Metals', items: ['iron', 'tin', 'zinc', 'lead'] },
  { label: 'Colours', items: ['red', 'blue', 'green', 'pink'] },
  { label: 'Planets', items: ['mars', 'venus', 'earth', 'saturn'] },
];

describe('stableOrder', () => {
  it('is the same for the same id and differs between ids', () => {
    const items = groups.flatMap((g) => g.items);
    expect(stableOrder('g1', items)).toEqual(stableOrder('g1', items));
    expect(stableOrder('g1', items)).not.toEqual(stableOrder('g2', items));
    expect([...stableOrder('g1', items)].sort()).toEqual([...items].sort());
  });
});

describe('practice guesses', () => {
  it('finds a group and shows it', () => {
    const r = practiceGuess(groups, freshProgress(), ['apple', 'pear', 'plum', 'fig']);
    expect(r).toMatchObject({ ok: true, correct: true, group: { index: 0, label: 'Fruit' } });
    if (r.ok) expect(r.progress).toEqual({ found: [0], mistakes: 0, status: 'active' });
  });

  it('is case-insensitive like the server', () => {
    const r = practiceGuess(groups, freshProgress(), ['APPLE', 'Pear', 'plum', 'fig']);
    expect(r).toMatchObject({ ok: true, correct: true });
  });

  it('says one away for three of a group, and counts the mistake', () => {
    const r = practiceGuess(groups, freshProgress(), ['apple', 'pear', 'plum', 'iron']);
    expect(r).toMatchObject({ ok: true, correct: false, oneAway: true });
    if (r.ok) expect(r.progress.mistakes).toBe(1);
  });

  it('says not a group for a scatter', () => {
    const r = practiceGuess(groups, freshProgress(), ['apple', 'iron', 'red', 'mars']);
    expect(r).toMatchObject({ ok: true, correct: false, oneAway: false });
  });

  it('fails after four mistakes and solves after four groups', () => {
    let p = freshProgress();
    for (let i = 0; i < 4; i++) {
      const r = practiceGuess(groups, p, ['apple', 'iron', 'red', 'mars']);
      if (!r.ok) throw new Error('unexpected');
      p = r.progress;
    }
    expect(p.status).toBe('failed');
    expect(practiceGuess(groups, p, ['apple', 'pear', 'plum', 'fig'])).toEqual({ ok: false, reason: 'finished' });

    let q = freshProgress();
    for (const g of groups) {
      const r = practiceGuess(groups, q, g.items);
      if (!r.ok) throw new Error('unexpected');
      q = r.progress;
    }
    expect(q).toMatchObject({ status: 'solved', found: [0, 1, 2, 3], mistakes: 0 });
  });

  it('refuses repeated, unknown and already-solved items without costing a mistake', () => {
    expect(practiceGuess(groups, freshProgress(), ['apple', 'apple', 'pear', 'plum'])).toEqual({
      ok: false,
      reason: 'not-four',
    });
    expect(practiceGuess(groups, freshProgress(), ['apple', 'pear', 'plum', 'kiwi'])).toEqual({
      ok: false,
      reason: 'unknown-item',
    });
    const solved = { found: [0], mistakes: 1, status: 'active' as const };
    expect(practiceGuess(groups, solved, ['apple', 'iron', 'red', 'mars'])).toEqual({
      ok: false,
      reason: 'item-solved',
    });
  });

  it('judges the same way the server does (judgeGuess is the shared rule)', () => {
    expect(judgeGuess(groups, freshProgress(), ['iron', 'tin', 'zinc', 'lead'])).toMatchObject({
      kind: 'hit',
      index: 1,
    });
    expect(validatePick(groups, ['iron', 'tin', 'zinc', 'lead'])).toBeNull();
  });
});

describe('practiceBoard', () => {
  it('uses the shuffle every player sees and drops the groups found', () => {
    const all = practiceBoard('g1', groups, freshProgress());
    expect(all).toEqual(
      stableOrder(
        'g1',
        groups.flatMap((g) => g.items),
      ),
    );
    const after = practiceBoard('g1', groups, { found: [0], mistakes: 0, status: 'active' });
    expect(after).toHaveLength(12);
    expect(after).not.toContain('apple');
  });
});

describe('isCompleteGrid', () => {
  it('needs a title, four labelled groups and sixteen different items', () => {
    expect(isCompleteGrid('A grid', groups)).toBe(true);
    expect(isCompleteGrid('ab', groups)).toBe(false);
    expect(
      isCompleteGrid('A grid', [{ ...groups[0]!, items: ['apple', 'pear', 'plum', ''] }, ...groups.slice(1)]),
    ).toBe(false);
    expect(
      isCompleteGrid('A grid', [{ ...groups[0]!, items: ['iron', 'pear', 'plum', 'fig'] }, ...groups.slice(1)]),
    ).toBe(false);
    expect(isCompleteGrid('A grid', [{ ...groups[0]!, label: 'metals' }, ...groups.slice(1)])).toBe(false);
  });
});
