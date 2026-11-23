/**
 * The training duel: a scripted first fight against TRAINER.tmp that teaches the loop by doing it. Each step names
 * the one input it waits for; the UI highlights that control and leaves the others inert, so the player presses
 * real buttons in a real duel (the same `run.ts`), against an opponent whose rounds are fixed (`TUTORIAL_SCRIPT`).
 *
 * Skippable at any step, remembered (`rmh:cursed-logic:tutorial-done`), re-openable from the help panel. It never
 * blocks a run: skipping or leaving it only sets the flag. Nothing here is timed, so keyboard and still-motion
 * players finish it the same way.
 */
import { readString, writeString } from '@/lib/core/persist';
import { createRng } from './rng';
import { newRun, startDuel, type RoundOverride, type RunState } from './run';
import type { PlayerAction, Stance } from './types';

export type TutorialStepId =
  | 'intro'
  | 'stance-guard'
  | 'block'
  | 'stance-commit'
  | 'strike-prepare'
  | 'stance-scan'
  | 'probe'
  | 'stance-read'
  | 'prepare'
  | 'stance-finish'
  | 'strike-finish'
  | 'outro';

export interface TutorialStep {
  id: TutorialStepId;
  /** What the step waits for: a "continue" press, a stance, or an action. */
  expect: { kind: 'continue' } | { kind: 'stance'; stance: Stance } | { kind: 'action'; action: PlayerAction };
}

export const TUTORIAL_STEPS: readonly TutorialStep[] = [
  { id: 'intro', expect: { kind: 'continue' } },
  { id: 'stance-guard', expect: { kind: 'stance', stance: 'Guard' } },
  { id: 'block', expect: { kind: 'action', action: 'Block' } },
  { id: 'stance-commit', expect: { kind: 'stance', stance: 'Commit' } },
  { id: 'strike-prepare', expect: { kind: 'action', action: 'Strike' } },
  { id: 'stance-scan', expect: { kind: 'stance', stance: 'Scan' } },
  { id: 'probe', expect: { kind: 'action', action: 'Probe' } },
  { id: 'stance-read', expect: { kind: 'stance', stance: 'Read' } },
  { id: 'prepare', expect: { kind: 'action', action: 'Prepare' } },
  { id: 'stance-finish', expect: { kind: 'stance', stance: 'Commit' } },
  { id: 'strike-finish', expect: { kind: 'action', action: 'Strike' } },
  { id: 'outro', expect: { kind: 'continue' } },
];

/** TRAINER.tmp's rounds: it Strikes (block it), Prepares (punish it), Blocks (probe it), glitches twice. */
export const TUTORIAL_SCRIPT: RoundOverride[] = [
  { intent: 'Strike', stances: ['Guard', 'Commit', 'Read'], modifier: null },
  { intent: 'Prepare', stances: ['Pressure', 'Commit', 'Surge'], modifier: null },
  { intent: 'Block', stances: ['Scan', 'Guard', 'Harvest'], modifier: null },
  { intent: 'Idle', stances: ['Recover', 'Read', 'Bastion'], modifier: null },
  { intent: 'Idle', stances: ['Commit', 'Reckless', 'Counter'], modifier: null },
  // Spare rounds in case the duel runs on (it cannot with the inputs above, but a run never stalls on a script).
  { intent: 'Idle', modifier: null },
  { intent: 'Idle', modifier: null },
];

export const TUTORIAL_KEY = 'rmh:cursed-logic:tutorial-done';

export interface TutorialState {
  step: number;
  /** The last input did not match the step: the UI repeats the instruction. */
  nudge: boolean;
}

export const TUTORIAL_START: TutorialState = { step: 0, nudge: false };

export function currentStep(s: TutorialState): TutorialStep | null {
  return TUTORIAL_STEPS[s.step] ?? null;
}

export function isFinished(s: TutorialState): boolean {
  return s.step >= TUTORIAL_STEPS.length;
}

export type TutorialInput = { kind: 'continue' } | { kind: 'stance'; stance: Stance } | { kind: 'action'; action: PlayerAction };

/** Whether `input` is the one the current step waits for. */
export function accepts(s: TutorialState, input: TutorialInput): boolean {
  const step = currentStep(s);
  if (!step) return false;
  const e = step.expect;
  if (e.kind !== input.kind) return false;
  if (e.kind === 'stance' && input.kind === 'stance') return e.stance === input.stance;
  if (e.kind === 'action' && input.kind === 'action') return e.action === input.action;
  return true;
}

/** Feed an input: the step advances on the expected one; anything else sets `nudge` and changes nothing else. */
export function advance(s: TutorialState, input: TutorialInput): TutorialState {
  if (isFinished(s)) return s;
  if (!accepts(s, input)) return { ...s, nudge: true };
  return { step: s.step + 1, nudge: false };
}

/** The training duel's run: TRAINER.tmp, scripted rounds, no minigames, no mutations, no score. */
export function newTutorialRun(): RunState {
  const rng = createRng(1);
  const shell: RunState = { ...newRun(1, [], rng), mode: 'tutorial', script: TUTORIAL_SCRIPT, usedProtocols: [] };
  return startDuel({ ...shell, duel: null }, rng, 'trainer');
}

/** Read and write the remembered flag; without storage the tutorial is simply offered again. */
export function readTutorialDone(): boolean {
  return readString(TUTORIAL_KEY) === '1';
}

export function writeTutorialDone(): void {
  writeString(TUTORIAL_KEY, '1');
}
