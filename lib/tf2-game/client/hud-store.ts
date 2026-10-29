/**
 * The seam between the client loop and the React HUD: the loop `publish`es a
 * HudState (at most `maxHz` times a second — the HUD has no reason to re-render
 * at the frame rate), React reads it with `useSyncExternalStore`
 * (`components/tf2-game/use-hud.ts`). Commands the HUD sends back (team, class,
 * chat, voice, build…) go through `onCommand`, which the loop wires to the
 * network client or the listen server.
 *
 * Environment-agnostic.
 */

import { emptyHudState, type HudGame, type HudState } from './hud-state';
import type { ClassChoice, TeamChoice } from '../net/events';
import type { ImpulseAction } from './input/actions';

/** What the HUD asks the game to do. The loop maps them to MatchCommands / hub events. */
export type HudCommand =
  | { kind: 'team'; team: TeamChoice }
  | { kind: 'class'; cls: ClassChoice }
  | { kind: 'chat'; text: string; teamOnly: boolean }
  | { kind: 'voice'; menu: 0 | 1 | 2; item: number }
  /** `build <type> <mode>` / `destroy <type> <mode>` (BuildCommand in sim/buildings/player-objects.ts). */
  | { kind: 'build'; action: 'build' | 'destroy'; objectType: number; objectMode: number }
  /** `disguise <class> <team>` (team −1 = the enemy, as the PDA's default). */
  | { kind: 'disguise'; cls: number; team: number }
  | { kind: 'lastdisguise' }
  /** Any other console verb (`taunt`, `dropitem`, `+inspect`…), MatchCommand { kind: 'extra' }. */
  | { kind: 'extra'; command: string; args: ReadonlyArray<number | string | boolean> }
  | { kind: 'disconnect' }
  /** Pause menu opened/closed (single-player pauses the world). */
  | { kind: 'pause'; paused: boolean };

export type HudCommandListener = (cmd: HudCommand) => void;

export interface HudStore {
  getSnapshot(): HudState;
  subscribe(listener: () => void): () => void;
  /** Replace the state (throttled to `maxHz` unless `force`). */
  publish(state: HudState, force?: boolean): void;
  /** Patch the current state (immediate). */
  update(patch: Partial<HudState>): void;
  send(cmd: HudCommand): void;
  onCommand(listener: HudCommandListener): () => void;
  /** The loop forwards input impulses (drainImpulses) here; the HUD's menus consume them. */
  dispatchImpulse(action: ImpulseAction): void;
  onImpulse(listener: (action: ImpulseAction) => void): () => void;
}

export interface HudStoreOptions {
  game?: HudGame;
  /** Upper bound on React updates per second (default 30). */
  maxHz?: number;
  /** Wall clock in ms (injected for tests). */
  clock?: () => number;
}

export function createHudStore(opts: HudStoreOptions = {}): HudStore {
  let state = emptyHudState(opts.game ?? 'tf2');
  const listeners = new Set<() => void>();
  const commandListeners = new Set<HudCommandListener>();
  const impulseListeners = new Set<(action: ImpulseAction) => void>();
  const minInterval = 1000 / Math.max(1, opts.maxHz ?? 30);
  const clock = opts.clock ?? (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
  let lastPublish = -Infinity;

  const emit = () => {
    for (const l of listeners) l();
  };

  return {
    getSnapshot: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    publish(next, force = false) {
      const t = clock();
      if (!force && t - lastPublish < minInterval) return;
      lastPublish = t;
      state = next;
      emit();
    },
    update(patch) {
      state = { ...state, ...patch };
      emit();
    },
    send(cmd) {
      for (const l of commandListeners) l(cmd);
    },
    onCommand(listener) {
      commandListeners.add(listener);
      return () => commandListeners.delete(listener);
    },
    dispatchImpulse(action) {
      for (const l of impulseListeners) l(action);
    },
    onImpulse(listener) {
      impulseListeners.add(listener);
      return () => impulseListeners.delete(listener);
    },
  };
}
