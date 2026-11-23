import { describe, expect, it } from 'vitest';
import { currentStep, startTutorial, TUTORIAL_STEPS, tutorialAdvance, tutorialAllows, tutorialRun, type TutorialEvent } from '../tutorial';
import { dispatch } from '../run';
import { isOnPhrase, effectiveCard } from '../combat';
import type { RunState } from '../types';

describe('tutorial state machine', () => {
  it('only accepts the action the current step asks for', () => {
    const s = startTutorial();
    expect(tutorialAllows(s, { t: 'next' })).toBe(true);
    expect(tutorialAllows(s, { t: 'end' })).toBe(false);
    expect(tutorialAdvance(s, { t: 'end' })).toBe(s);
  });

  it('can be skipped from any step', () => {
    for (let i = 0; i < TUTORIAL_STEPS.length; i++) {
      expect(tutorialAdvance({ step: i, done: false }, { t: 'skip' }).done).toBe(true);
    }
  });

  it('a keyboard-only player can finish it against the real engine', () => {
    let s = startTutorial();
    let run: RunState = tutorialRun();
    for (let guard = 0; guard < 50 && !s.done; guard++) {
      const step = currentStep(s)!;
      let ev: TutorialEvent;
      if (step.expects === 'next') ev = { t: 'next' };
      else if (step.expects === 'vent') {
        run = dispatch(run, { t: 'vent' });
        ev = { t: 'vent' };
      } else if (step.expects === 'end') {
        run = dispatch(run, { t: 'end' });
        ev = { t: 'end' };
      } else {
        // Play the first card in hand that lands on the phrase (what a player tabbing through the hand would do).
        const i = run.combat!.hand.findIndex((h) => isOnPhrase(run, effectiveCard(h)) && effectiveCard(h).cost <= run.combat!.energy);
        expect(i, `a playable on-phrase card at step ${step.id}`).toBeGreaterThanOrEqual(0);
        run = dispatch(run, { t: 'play', i, timing: 'steady' });
        ev = { t: 'play', onPhrase: true };
      }
      s = tutorialAdvance(s, ev);
    }
    expect(s.done).toBe(true);
    expect(run.stats.bursts).toBe(1);
    expect(run.stats.vents).toBe(1);
    expect(run.phase).toBe('combat');
  });
});
