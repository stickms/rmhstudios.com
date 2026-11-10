import { WEAPONS } from './content';
import type { Runtime } from './runtime';
import type { HearthworksStore } from './store';
import { TICK_MS } from './world';

/** How far ahead of the avatar a "fire where I am facing" shot aims (tiles); the weapon's own range does the rest. */
export const AIM_DISTANCE = 10;

/** The point `AIM_DISTANCE` tiles ahead of (x, z) along a yaw (0 faces +z, increasing toward +x). */
export function aimPoint(x: number, z: number, yaw: number): { x: number; z: number } {
  return { x: x + Math.sin(yaw) * AIM_DISTANCE, z: z + Math.cos(yaw) * AIM_DISTANCE };
}

/**
 * What F, R and the touch fire button do. The simulation enforces the fire interval, ammo and reload for real;
 * this throttles on the client as well so holding the key sends one command per shot, not one per frame (a peer's
 * command budget is finite, and a refused shot would show as a dud tracer).
 */
export function createCombatControls(
  store: HearthworksStore,
  runtime: Runtime,
  now: () => number = () => performance.now(),
) {
  let last = -Infinity;
  const me = () => {
    const s = store.getState();
    return s.world.players[s.playerId];
  };
  return {
    /** True when a shot was sent. */
    fire(): boolean {
      const p = me();
      const gun = p?.arms.equipped;
      if (!p || !gun) return false;
      const t = now();
      if (t - last < WEAPONS[gun].fireTicks * TICK_MS) return false;
      last = t;
      const a = runtime.avatar;
      const { dispatch } = store.getState();
      // The sim shoots from where the world thinks you are, which trails the avatar by up to a sync interval.
      if (Math.hypot(p.x - a.x, p.z - a.z) > 0.05) dispatch({ type: 'move', x: a.x, z: a.z });
      const aim = aimPoint(a.x, a.z, a.yaw);
      dispatch({ type: 'shoot', x: aim.x, z: aim.z });
      return true;
    },
    reload(): boolean {
      if (!me()?.arms.equipped) return false;
      store.getState().dispatch({ type: 'reload' });
      return true;
    },
    armed(): boolean {
      return !!me()?.arms.equipped;
    },
  };
}
