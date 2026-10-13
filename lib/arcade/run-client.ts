import { create } from 'zustand';
import { findModifier, isSeededGame, seedKeyOf, type SeededGameId } from '@/lib/arcade/seeded';

export interface RunPlan {
  kind: 'free' | 'seed' | 'daily';
  gameId: SeededGameId;
  seed: number;
  variant: string;
  /** Option values the game must force (difficulty, duration, character). */
  options: Record<string, string | number> | null;
  /** Daily only: false once today's attempt is already used (practice run). */
  counted: boolean;
}

export const useArcadeRun = create<{ run: RunPlan | null; set: (r: RunPlan | null) => void }>(
  (set) => ({
    run: null,
    set: (run) => set({ run }),
  }),
);

type Pending = { kind: 'seed'; seed: number; variant: string } | { kind: 'daily' } | null;
let pending: Pending | undefined;

/** Read `?seed=&v=` / `?daily=1` once per page load. */
export function readPending(): Pending {
  if (pending !== undefined) return pending;
  pending = null;
  if (typeof window === 'undefined') return pending;
  const q = new URLSearchParams(window.location.search);
  if (q.get('daily') === '1') pending = { kind: 'daily' };
  else {
    const seed = Number(q.get('seed'));
    const v = q.get('v');
    if (Number.isInteger(seed) && seed > 0 && seed <= 0xffffffff && v)
      pending = { kind: 'seed', seed, variant: v };
  }
  return pending;
}

export const freeSeed = () => (Math.random() * 0xffffffff) >>> 0 || 1;

/**
 * Decide the seed + forced options for the next solo run. `current` is the
 * variant the player picked in the menu (used for a free run, so it can be
 * shared). Never throws: a failed daily claim degrades to a free run.
 */
export async function planRun(gameId: string, currentVariant: string): Promise<RunPlan> {
  const free: RunPlan = {
    kind: 'free',
    gameId: gameId as SeededGameId,
    seed: freeSeed(),
    variant: currentVariant,
    options: null,
    counted: false,
  };
  if (!isSeededGame(gameId)) return free;
  const p = readPending();
  let plan = free;
  if (p?.kind === 'seed') {
    const mod = findModifier(gameId, p.variant);
    if (mod)
      plan = {
        kind: 'seed',
        gameId,
        seed: p.seed,
        variant: mod.id,
        options: mod.options,
        counted: false,
      };
  } else if (p?.kind === 'daily') {
    try {
      const res = await fetch('/api/arcade/daily/start', { method: 'POST' });
      if (res.ok) {
        const d = (await res.json()) as {
          counted: boolean;
          mutator: {
            gameId: string;
            seed: number;
            modifier: { id: string; options: Record<string, string | number> };
          };
        };
        if (d.mutator.gameId === gameId) {
          plan = {
            kind: 'daily',
            gameId,
            seed: d.mutator.seed,
            variant: d.mutator.modifier.id,
            options: d.mutator.modifier.options,
            counted: d.counted,
          };
        }
      }
    } catch {
      /* falls through to a free run */
    }
  }
  useArcadeRun.getState().set(plan);
  return plan;
}

export { seedKeyOf };
