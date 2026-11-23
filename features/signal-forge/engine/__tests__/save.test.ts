import { describe, expect, it } from 'vitest';
import { classifySave, makeBlob, metaAfterRun, DEFAULT_META } from '../save';
import { newRun } from '../run';
import { tutorialRun } from '../tutorial';

describe('cloud save versioning', () => {
  it('a v2 blob round-trips and stays playable', () => {
    const run = newRun({ seed: 11, ascension: 2, mode: 'timed' });
    const blob = JSON.parse(JSON.stringify(makeBlob(run, { ...DEFAULT_META, ascensionUnlocked: 3 })));
    const c = classifySave(blob);
    expect(c.kind).toBe('run');
    if (c.kind === 'run') {
      expect(c.run).toEqual(run);
      expect(c.meta.ascensionUnlocked).toBe(3);
    }
  });

  it('retires a pre-rework (v1) save cleanly with its floor and score', () => {
    // The shape the old engine wrote (features/signal-forge/engine/serialization.ts before the rework).
    const v1 = {
      floor: 7,
      node: 2,
      phase: 'combat',
      playerHp: 31,
      playerMaxHp: 40,
      score: 4210,
      deckList: [{ id: 1, name: 'Pulse Strike', cost: 1, type: 'Pulse', damage: 6, shield: 0, effect: 'Deal 6', rarity: 'common' }],
      enemies: [],
      ownedRelics: [],
    };
    expect(classifySave(v1)).toEqual({ kind: 'retired', floor: 7, score: 4210, meta: DEFAULT_META });
  });

  it('never throws on garbage and treats it as no save', () => {
    for (const raw of [null, undefined, 3, 'x', [], {}, { v: 2 }, { v: 9, run: {} }]) {
      expect(() => classifySave(raw)).not.toThrow();
    }
    expect(classifySave({ v: 2, run: null, meta: { ascensionUnlocked: 99 } }).meta.ascensionUnlocked).toBe(10);
  });

  it('retires a v2 run that names content this build no longer has', () => {
    const run = newRun({ seed: 1 });
    run.deck.push({ uid: 999, id: 'card_that_was_removed' });
    expect(classifySave(makeBlob(run, DEFAULT_META)).kind).toBe('retired');
  });

  it('never saves the tutorial', () => {
    expect(makeBlob(tutorialRun(), DEFAULT_META).run).toBeNull();
  });

  it('a win unlocks the next ascension, a loss does not', () => {
    const run = newRun({ seed: 1, ascension: 2 });
    run.phase = 'victory';
    expect(metaAfterRun(DEFAULT_META, run).ascensionUnlocked).toBe(3);
    run.phase = 'defeat';
    expect(metaAfterRun(DEFAULT_META, run).ascensionUnlocked).toBe(0);
  });
});
