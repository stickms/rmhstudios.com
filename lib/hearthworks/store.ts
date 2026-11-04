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
  | { kind: 'hire' }
  | { kind: 'plant'; crop: CropId }
  | { kind: 'harvest' };

/**
 * Where the world comes from when it is shared (lib/hearthworks/net/driver.ts builds these). While a driver is
 * attached the store stops running its own sim: commands go to the driver, and each `advance` pulls the
 * driver's world — the host's authoritative one, or a peer's predicted view of it.
 */
export interface MultiplayerDriver {
  /** The id this player has in the shared world (the account id the hub vouches for). */
  readonly playerId: string;
  /** The world to draw now; null until a joining peer has its first snapshot. */
  world(): World | null;
  /** A command from the local player. */
  send(cmd: LocalCommand): void;
  /** Move time forward (a host steps its fixed ticks; a peer has nothing to step) and return the events. */
  advance(dtMs: number): readonly WorldEvent[];
}

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
  /** The shared session driving the world, or null when playing alone. */
  driver: MultiplayerDriver | null;
  /** The offline world and player set aside while a joined (not hosted) session is shown. */
  stash: { world: World; playerId: string } | null;
  dispatch: (cmd: LocalCommand) => void;
  advance: (dtMs: number) => readonly WorldEvent[];
  setTool: (tool: Tool) => void;
  setView: (view: ViewKind) => void;
  toggleView: () => void;
  replaceWorld: (world: World) => void;
  /**
   * Run the world through `driver`. `stash` keeps the current offline world to come back to on `detachDriver`
   * (a joined session); a host plays in its own world, so it keeps it.
   */
  attachDriver: (driver: MultiplayerDriver, opts?: { stash?: boolean }) => void;
  detachDriver: () => void;
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
    driver: null,
    stash: null,
    dispatch: (cmd) => {
      const d = get().driver;
      if (!d) {
        set((s) => ({ pending: [...s.pending, cmd] }));
        return;
      }
      d.send(cmd);
      // A peer shows its own command at once (prediction): pull the new view now, not at the next frame.
      const w = d.world();
      set((s) => ({ world: w ?? s.world, rev: s.rev + 1 }));
    },
    advance: (dtMs) => {
      const s = get();
      if (s.driver) {
        const events = s.driver.advance(dtMs);
        const w = s.driver.world();
        if (events.length > 0 || (w !== null && w !== s.world)) {
          set({ world: w ?? s.world, rev: s.rev + 1, lastEvents: events });
        }
        return events;
      }
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
    attachDriver: (driver, opts) =>
      set((s) => ({
        driver,
        playerId: driver.playerId,
        pending: [],
        // Keep the first stash across a host promotion (the offline world is still the one to return to).
        stash: s.stash ?? (opts?.stash ? { world: s.world, playerId: s.playerId } : null),
        world: driver.world() ?? s.world,
        rev: s.rev + 1,
      })),
    detachDriver: () =>
      set((s) => {
        if (!s.driver) return {};
        const back = s.stash;
        return {
          driver: null,
          stash: null,
          pending: [],
          lastEvents: [],
          rev: s.rev + 1,
          ...(back ? { world: back.world, playerId: back.playerId } : {}),
        };
      }),
  }));
}

export type HearthworksStore = StoreApi<HearthworksState>;
export const hearthworksStore: HearthworksStore = createHearthworksStore({ seed: 20261104 });

export function useHearthworks<T>(selector: (s: HearthworksState) => T): T {
  return useStore(hearthworksStore, selector);
}
