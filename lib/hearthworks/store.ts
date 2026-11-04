import { createStore, type StoreApi } from 'zustand/vanilla';
import { useStore } from 'zustand';
import type { BuildingId, CropId } from './content';
import type { ViewKind } from './camera';
import { createWorld, stepWorld, type Command, type World, type WorldEvent } from './world';

type DistributiveOmit<T, K extends keyof never> = T extends unknown ? Omit<T, K> : never;
/** A command as the local player issues it: the store stamps `playerId`. */
export type LocalCommand = DistributiveOmit<Command, 'playerId'>;

export type Tool =
  | { kind: 'inspect' }
  | { kind: 'build'; building: BuildingId }
  | { kind: 'remove' }
  | { kind: 'plant'; crop: CropId }
  | { kind: 'harvest' };

export interface HearthworksState {
  world: World;
  /** Bumped when an advance changed something visible, so selectors re-run (the world is mutated in place). */
  rev: number;
  playerId: string;
  /** Which view the player wants; the camera eases toward it (see camera.ts). */
  view: ViewKind;
  tool: Tool;
  /** Events from the most recent advance, for HUD toasts. */
  lastEvents: readonly WorldEvent[];
  pending: LocalCommand[];
  dispatch: (cmd: LocalCommand) => void;
  advance: (dtMs: number) => readonly WorldEvent[];
  setTool: (tool: Tool) => void;
  setView: (view: ViewKind) => void;
  toggleView: () => void;
  replaceWorld: (world: World) => void;
}

/** One store per game session; a factory so tests (and later, networked sessions) get their own. */
export function createHearthworksStore(opts: { seed?: number; size?: number; playerId?: string } = {}) {
  const playerId = opts.playerId ?? 'local';
  const world = createWorld(opts.seed ?? 1, opts.size ?? 32);
  stepWorld(world, 0, [{ type: 'join', playerId }]);
  return createStore<HearthworksState>((set, get) => ({
    world,
    rev: 0,
    playerId,
    view: 'iso',
    tool: { kind: 'inspect' },
    lastEvents: [],
    pending: [],
    dispatch: (cmd) => set((s) => ({ pending: [...s.pending, cmd] })),
    advance: (dtMs) => {
      const s = get();
      const cmds = s.pending.map((c) => ({ ...c, playerId: s.playerId }) as Command);
      // A background tab can hand us seconds at once; cap so catch-up never freezes the page.
      const events = stepWorld(s.world, Math.min(dtMs, 250), cmds);
      // Only re-render subscribers when something observable happened: every change to what is
      // drawn or shown (buildings, crop stages, money, items) is announced by an event.
      if (events.length > 0 || cmds.length > 0) set({ pending: [], rev: s.rev + 1, lastEvents: events });
      return events;
    },
    setTool: (tool) => set({ tool }),
    setView: (view) => set({ view }),
    toggleView: () => set((s) => ({ view: s.view === 'iso' ? 'third' : 'iso' })),
    replaceWorld: (next) => {
      stepWorld(next, 0, [{ type: 'join', playerId: get().playerId }]);
      set((s) => ({ world: next, rev: s.rev + 1, pending: [], lastEvents: [] }));
    },
  }));
}

export type HearthworksStore = StoreApi<HearthworksState>;
export const hearthworksStore: HearthworksStore = createHearthworksStore({ seed: 20261104 });

export function useHearthworks<T>(selector: (s: HearthworksState) => T): T {
  return useStore(hearthworksStore, selector);
}
