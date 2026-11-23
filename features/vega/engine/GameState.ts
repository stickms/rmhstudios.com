/**
 * Project Vega's UI store: what the React layer shows. The simulation (`Simulation`) is the authority; the host
 * (`VegaGame`) publishes snapshots of it here several times a second and on every event worth a re-render.
 */
import { create } from 'zustand';
import type { EnemyType, MapId, TargetMode, TowerType } from './data';
import type { RunStats } from './Simulation';
import { initialTutorial, tutorialReducer, type TutorialEvent, type TutorialState } from './tutorial';

export type Screen = 'menu' | 'play' | 'end';

export interface HudSnapshot {
  phase: 'build' | 'wave' | 'victory' | 'over';
  wave: number;
  cleared: number;
  serum: number;
  integrity: number;
  score: number;
  /** A wave can be started (build) or called early (during a wave, once the newest finished spawning). */
  canStart: boolean;
  speed: 1 | 2;
  next: { type: EnemyType; count: number }[];
  nextBoss: EnemyType | null;
  introduces: EnemyType[];
}

export interface SelectedSnapshot {
  id: number;
  type: TowerType;
  tier: number;
  mode: TargetMode;
  kills: number;
  damage: number;
  sell: number;
  upgradeCost: number | null;
  stunned: boolean;
}

export type LogKind =
  | 'waveStart'
  | 'waveEarly'
  | 'boss'
  | 'waveClear'
  | 'perfect'
  | 'leak'
  | 'catalogued'
  | 'funds'
  | 'blocked'
  | 'sever'
  | 'victory'
  | 'resumed';

export interface LogLine {
  id: number;
  kind: LogKind;
  wave?: number;
  amount?: number;
  enemy?: EnemyType;
}

export interface EndResult {
  map: MapId;
  score: number;
  cleared: number;
  /** Cleared wave CAP (the run is complete) rather than lost all integrity. */
  complete: boolean;
  /** Reached containment (wave GOAL) at some point in the run. */
  contained: boolean;
  stats: RunStats;
  durationMs: number;
  achievements: string[];
}

export const EMPTY_HUD: HudSnapshot = {
  phase: 'build',
  wave: 0,
  cleared: 0,
  serum: 0,
  integrity: 0,
  score: 0,
  canStart: true,
  speed: 1,
  next: [],
  nextBoss: null,
  introduces: [],
};

interface VegaStore {
  screen: Screen;
  mapId: MapId;
  hud: HudSnapshot;
  build: TowerType | null;
  selected: SelectedSnapshot | null;
  paused: boolean;
  victoryOpen: boolean;
  manualOpen: boolean;
  tutorial: TutorialState;
  log: LogLine[];
  result: EndResult | null;
  /** A specimen catalogued for the first time this run, shown as a dossier card until dismissed. */
  dossier: EnemyType | null;

  setScreen: (s: Screen) => void;
  setMap: (m: MapId) => void;
  setHud: (h: HudSnapshot) => void;
  setBuild: (t: TowerType | null) => void;
  setSelected: (s: SelectedSnapshot | null) => void;
  setPaused: (p: boolean) => void;
  setVictoryOpen: (o: boolean) => void;
  setManualOpen: (o: boolean) => void;
  tutorialEvent: (e: TutorialEvent) => void;
  setTutorial: (s: TutorialState) => void;
  pushLog: (l: Omit<LogLine, 'id'>) => void;
  setResult: (r: EndResult | null) => void;
  setDossier: (e: EnemyType | null) => void;
  resetRun: () => void;
}

let logId = 1;

export const useGameStore = create<VegaStore>()((set) => ({
  screen: 'menu',
  mapId: 'intake',
  hud: EMPTY_HUD,
  build: null,
  selected: null,
  paused: false,
  victoryOpen: false,
  manualOpen: false,
  tutorial: initialTutorial(true),
  log: [],
  result: null,
  dossier: null,

  setScreen: (screen) => set({ screen }),
  setMap: (mapId) => set({ mapId }),
  setHud: (hud) => set({ hud }),
  setBuild: (build) => set(build ? { build, selected: null } : { build }),
  setSelected: (selected) => set(selected ? { selected, build: null } : { selected }),
  setPaused: (paused) => set({ paused }),
  setVictoryOpen: (victoryOpen) => set({ victoryOpen }),
  setManualOpen: (manualOpen) => set({ manualOpen }),
  tutorialEvent: (e) => set((s) => ({ tutorial: tutorialReducer(s.tutorial, e) })),
  setTutorial: (tutorial) => set({ tutorial }),
  pushLog: (l) => set((s) => ({ log: [{ ...l, id: logId++ }, ...s.log].slice(0, 6) })),
  setResult: (result) => set({ result }),
  setDossier: (dossier) => set({ dossier }),
  resetRun: () =>
    set({
      hud: EMPTY_HUD,
      build: null,
      selected: null,
      paused: false,
      victoryOpen: false,
      log: [],
      result: null,
      dossier: null,
    }),
}));
