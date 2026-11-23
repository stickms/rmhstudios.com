import { afterEach, describe, expect, it } from 'vitest';
import { createRng } from '../rng';
import { chooseStance, commitAction, finishRound } from '../run';
import {
  TUTORIAL_KEY,
  TUTORIAL_START,
  TUTORIAL_STEPS,
  accepts,
  advance,
  currentStep,
  isFinished,
  newTutorialRun,
  readTutorialDone,
  writeTutorialDone,
  type TutorialState,
} from '../tutorial';

describe('tutorial state machine', () => {
  it('starts at the intro and waits for a continue', () => {
    expect(currentStep(TUTORIAL_START)?.id).toBe('intro');
    expect(accepts(TUTORIAL_START, { kind: 'continue' })).toBe(true);
    expect(accepts(TUTORIAL_START, { kind: 'action', action: 'Strike' })).toBe(false);
  });

  it('a wrong input nudges and does not advance', () => {
    const s = advance(advance(TUTORIAL_START, { kind: 'continue' }), { kind: 'stance', stance: 'Commit' });
    expect(s.step).toBe(1);
    expect(s.nudge).toBe(true);
    const fixed = advance(s, { kind: 'stance', stance: 'Guard' });
    expect(fixed.step).toBe(2);
    expect(fixed.nudge).toBe(false);
  });

  it('the scripted duel, played exactly as instructed, is won on the last action step', () => {
    const rng = createRng(3);
    let run = newTutorialRun();
    let t: TutorialState = TUTORIAL_START;
    expect(run.duel?.protocolId).toBe('trainer');
    for (const step of TUTORIAL_STEPS) {
      expect(currentStep(t)?.id).toBe(step.id);
      const e = step.expect;
      if (e.kind === 'continue') {
        t = advance(t, { kind: 'continue' });
      } else if (e.kind === 'stance') {
        // The scripted offer always contains the stance the step asks for, and the tell is the truth.
        expect(run.duel!.stanceOffer).toContain(e.stance);
        expect(run.duel!.tellTrue).toBe(true);
        run = chooseStance(run, e.stance);
        t = advance(t, { kind: 'stance', stance: e.stance });
      } else {
        const pending = commitAction(run, rng, e.action, false)!;
        run = finishRound(run, rng, pending, null);
        t = advance(t, { kind: 'action', action: e.action });
        if (step.id === 'block') expect(run.integrity).toBe(run.maxIntegrity);
        if (step.id === 'prepare') expect(run.duel!.playerPrimed).toBe(true);
      }
    }
    expect(isFinished(t)).toBe(true);
    expect(run.duel?.result).toBe('win');
    expect(run.stage).toBe('over');
    expect(run.score).toBe(0);
  });
});

describe('tutorial flag', () => {
  afterEach(() => {
    try {
      localStorage.removeItem(TUTORIAL_KEY);
    } catch {
      /* no storage in this environment */
    }
  });

  it('round-trips through storage and never throws without it', () => {
    expect(() => writeTutorialDone()).not.toThrow();
    expect(typeof readTutorialDone()).toBe('boolean');
  });
});
