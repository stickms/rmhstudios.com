/**
 * The UI store: holds the run (`run.ts`), the seeded RNG behind it, the reveal sequence the UI plays between a
 * commit and its result, the tutorial's step, and the two per-player settings. All rules are in the pure modules;
 * this file only sequences them and saves an unfinished run to localStorage so a reload resumes it.
 */
import { create } from 'zustand';
import { readJson, removeKey, writeJson } from '@/lib/core/persist';
import { createRng, freshSeed, type Rng } from './rng';
import {
  chooseStance as chooseStanceRule,
  commitAction,
  continueRun as continueRunRule,
  finishRound,
  newRun,
  pickMilestone as pickMilestoneRule,
  applyDecoder,
  type PendingClash,
  type RunState,
} from './run';
import { buyItem as buyItemRule, retireLegacyShop } from './shopState';
import {
  TUTORIAL_START,
  accepts,
  advance,
  isFinished,
  newTutorialRun,
  writeTutorialDone,
  type TutorialInput,
  type TutorialState,
} from './tutorial';
import type { PactId, PlayerAction, RunUpgradeId, ShopItemId, Stance } from './types';
import { submitRun, type Submission } from '@features/cursed-logic/net/runs';

export type Screen = 'menu' | 'run' | 'tutorial';
/** idle: waiting for input · reveal: the two actions flip in turn · minigame · result: the clash's outcome shows. */
export type Phase = 'idle' | 'reveal' | 'minigame' | 'result';

const SAVE_KEY = 'rmh:cursed-logic:run';
const SETTINGS_KEY = 'rmh:cursed-logic:settings';
const SAVE_VERSION = 1;

interface Settings {
  minigames: boolean;
}

interface SavedRun {
  v: number;
  run: RunState;
  rng: number;
  startedAt: number;
}

/** A saved run in the current format, or null (an old or broken save is dropped, never loaded half-way). */
export function readSavedRun(): SavedRun | null {
  const saved = readJson<SavedRun | null>(SAVE_KEY, null);
  if (!saved || saved.v !== SAVE_VERSION || !saved.run || saved.run.mode !== 'run' || saved.run.stage === 'over') {
    return null;
  }
  return saved;
}

export interface CursedLogicStore {
  screen: Screen;
  run: RunState | null;
  phase: Phase;
  revealStep: number;
  pending: PendingClash | null;
  reinforce: boolean;
  tutorial: TutorialState;
  settings: Settings;
  startedAt: number;
  /** Bumps on every finished clash, to key one-shot effects. */
  clashId: number;
  /** The finished run's submission to the board (sent once, when the run ends). */
  submission: Submission;

  init: () => void;
  startRun: (pacts: PactId[]) => void;
  resumeRun: () => boolean;
  startTutorial: () => void;
  finishTutorial: () => void;
  tutorialContinue: () => void;
  chooseStance: (stance: Stance) => void;
  setReinforce: (on: boolean) => void;
  decode: () => void;
  commit: (action: PlayerAction) => void;
  advanceReveal: () => void;
  completeMinigame: (success: boolean) => void;
  endResult: () => void;
  pickMilestone: (choice: RunUpgradeId | null) => void;
  buy: (item: ShopItemId) => void;
  continueRun: () => void;
  abandon: () => void;
  toMenu: () => void;
  setMinigames: (on: boolean) => void;
}

let rng: Rng = createRng(1);

function persist(run: RunState | null, startedAt: number): void {
  if (!run || run.mode !== 'run' || run.stage === 'over') {
    removeKey(SAVE_KEY);
    return;
  }
  writeJson(SAVE_KEY, { v: SAVE_VERSION, run, rng: rng.state, startedAt } satisfies SavedRun);
}

export const useCursedLogicStore = create<CursedLogicStore>()((set, get) => {
  /** Tutorial gate: in the training duel only the input the step waits for goes through. */
  const tutorialAllows = (input: TutorialInput): boolean => {
    const s = get();
    if (s.screen !== 'tutorial') return true;
    if (!accepts(s.tutorial, input)) {
      set({ tutorial: { ...s.tutorial, nudge: true } });
      return false;
    }
    return true;
  };
  const tutorialStep = (input: TutorialInput) => {
    const s = get();
    if (s.screen === 'tutorial') set({ tutorial: advance(s.tutorial, input) });
  };
  const setRun = (run: RunState | null) => {
    set({ run });
    persist(run, get().startedAt);
  };

  return {
    screen: 'menu',
    run: null,
    phase: 'idle',
    revealStep: 0,
    pending: null,
    reinforce: false,
    tutorial: TUTORIAL_START,
    settings: { minigames: true },
    startedAt: 0,
    clashId: 0,
    submission: { state: 'idle' },

    init: () => {
      retireLegacyShop();
      const settings = readJson<Settings | null>(SETTINGS_KEY, null);
      if (settings && typeof settings.minigames === 'boolean') set({ settings: { minigames: settings.minigames } });
    },

    startRun: (pacts) => {
      const seed = freshSeed();
      rng = createRng(seed);
      const startedAt = Date.now();
      set({
        screen: 'run',
        phase: 'idle',
        pending: null,
        reinforce: false,
        startedAt,
        clashId: 0,
        submission: { state: 'idle' },
      });
      setRun(newRun(seed, pacts, rng));
    },

    resumeRun: () => {
      const saved = readSavedRun();
      if (!saved) return false;
      rng = createRng(saved.rng);
      set({
        screen: 'run',
        run: saved.run,
        phase: 'idle',
        pending: null,
        reinforce: false,
        startedAt: saved.startedAt,
      });
      return true;
    },

    startTutorial: () => {
      rng = createRng(1);
      set({
        screen: 'tutorial',
        run: newTutorialRun(),
        phase: 'idle',
        pending: null,
        reinforce: false,
        tutorial: TUTORIAL_START,
      });
    },

    finishTutorial: () => {
      writeTutorialDone();
      set({ screen: 'menu', run: null, phase: 'idle', pending: null, tutorial: TUTORIAL_START });
    },

    tutorialContinue: () => {
      const s = get();
      if (s.screen !== 'tutorial' || !accepts(s.tutorial, { kind: 'continue' })) return;
      const next = advance(s.tutorial, { kind: 'continue' });
      if (isFinished(next)) {
        get().finishTutorial();
        return;
      }
      set({ tutorial: next });
    },

    chooseStance: (stance) => {
      const { run, phase } = get();
      if (!run || phase !== 'idle' || run.stage !== 'duel') return;
      if (!tutorialAllows({ kind: 'stance', stance })) return;
      const next = chooseStanceRule(run, stance);
      if (next === run) return;
      tutorialStep({ kind: 'stance', stance });
      setRun(next);
    },

    setReinforce: (on) => set({ reinforce: on }),

    decode: () => {
      const { run } = get();
      if (!run || get().screen === 'tutorial') return;
      setRun(applyDecoder(run));
    },

    commit: (action) => {
      const { run, phase, reinforce } = get();
      if (!run || phase !== 'idle' || run.stage !== 'duel' || !run.duel?.stance) return;
      if (!tutorialAllows({ kind: 'action', action })) return;
      const pending = commitAction(run, rng, action, reinforce && get().screen !== 'tutorial');
      if (!pending) return;
      tutorialStep({ kind: 'action', action });
      set({ pending, phase: 'reveal', revealStep: 0 });
    },

    advanceReveal: () => {
      const { phase, revealStep, pending, settings, screen } = get();
      if (phase !== 'reveal' || !pending) return;
      if (revealStep < 1) {
        set({ revealStep: revealStep + 1 });
        return;
      }
      if (pending.minigame && settings.minigames && screen !== 'tutorial') {
        set({ phase: 'minigame' });
        return;
      }
      get().completeMinigame(false);
    },

    completeMinigame: (success) => {
      const { run, pending, phase, settings, screen } = get();
      if (!run || !pending || (phase !== 'minigame' && phase !== 'reveal')) return;
      const played = phase === 'minigame' && pending.minigame && settings.minigames && screen !== 'tutorial';
      const next = finishRound(run, rng, pending, played ? success : null);
      set((s) => ({ phase: 'result', clashId: s.clashId + 1, reinforce: false }));
      setRun(next);
      // A run that just ended is logged once, here, rather than from a component effect.
      if (next.mode === 'run' && next.stage === 'over' && run.stage !== 'over') {
        set({ submission: { state: 'sending' } });
        void submitRun(next, Date.now() - get().startedAt).then((submission) => {
          if (get().run === next) set({ submission });
        });
      }
    },

    endResult: () => {
      if (get().phase !== 'result') return;
      set({ phase: 'idle', pending: null, revealStep: 0 });
    },

    pickMilestone: (choice) => {
      const { run } = get();
      if (!run) return;
      setRun(pickMilestoneRule(run, rng, choice));
    },

    buy: (item) => {
      const { run } = get();
      if (!run) return;
      setRun(buyItemRule(run, item));
    },

    continueRun: () => {
      const { run } = get();
      if (!run) return;
      set({ phase: 'idle', pending: null });
      setRun(continueRunRule(run, rng));
    },

    abandon: () => {
      removeKey(SAVE_KEY);
      set({ screen: 'menu', run: null, phase: 'idle', pending: null });
    },

    toMenu: () => {
      const { run } = get();
      if (run?.mode === 'run' && run.stage === 'over') removeKey(SAVE_KEY);
      set({ screen: 'menu', run: null, phase: 'idle', pending: null });
    },

    setMinigames: (on) => {
      set({ settings: { minigames: on } });
      writeJson(SETTINGS_KEY, { minigames: on });
    },
  };
});
