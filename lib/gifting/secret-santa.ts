/**
 * Secret-gift exchange draw — pure and client-safe.
 * Feature idea G3 in docs/plans/2026-10-12-feature-ideas-every-surface.md.
 *
 * Elfster's core loop, on top of the gifting the site already has: a group
 * (a community, a group chat, a friend list) opts in, the draw assigns every
 * member exactly one recipient, nobody draws themselves, and the organiser can
 * add exclusions ("these two live together", "not the same person as last
 * year"). Gifts then flow through the existing coin-gift path.
 *
 * Two properties are load-bearing:
 *
 *   • **Reproducible.** The draw takes a seed and is deterministic in it, so
 *     a disputed draw can be re-run and audited by an admin from the stored
 *     seed — the server stores the seed, not just the result.
 *   • **One cycle when possible.** A single Hamiltonian cycle (A→B→C→…→A)
 *     means no two people simply swap gifts, which is what makes the exchange
 *     feel like an exchange. When exclusions make one cycle impossible the
 *     draw falls back to any valid derangement and says so.
 *
 * Search is randomized backtracking over a seeded shuffle. Real groups are
 * small (2–100); the step budget turns a pathological exclusion set into a
 * clean "no valid draw" instead of a hung request.
 */

export interface DrawInput {
  members: readonly string[];
  /** Pairs [giver, recipient] that must not be drawn. */
  exclusions?: ReadonlyArray<readonly [string, string]>;
  seed: number;
}

export type DrawResult =
  | { ok: true; assignments: Map<string, string>; singleCycle: boolean }
  | { ok: false; reason: 'too-few' | 'duplicate-member' | 'impossible' };

const STEP_BUDGET = 200_000;

/** mulberry32 — tiny, fast, good enough for a fair shuffle. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(xs: readonly T[], rand: () => number): T[] {
  const a = xs.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

function makeAllowed(exclusions: DrawInput['exclusions']) {
  const banned = new Set((exclusions ?? []).map(([g, r]) => `${g}\u0000${r}`));
  return (giver: string, recipient: string) =>
    giver !== recipient && !banned.has(`${giver}\u0000${recipient}`);
}

/** Try for one Hamiltonian cycle through every member. */
function cycleDraw(order: string[], allowed: (g: string, r: string) => boolean): string[] | null {
  const n = order.length;
  const path = [order[0]!];
  const used = new Set(path);
  let steps = 0;
  const extend = (): boolean => {
    if (++steps > STEP_BUDGET) return false;
    const last = path[path.length - 1]!;
    if (path.length === n) return allowed(last, path[0]!);
    for (const next of order) {
      if (used.has(next) || !allowed(last, next)) continue;
      path.push(next);
      used.add(next);
      if (extend()) return true;
      path.pop();
      used.delete(next);
    }
    return false;
  };
  return extend() ? path : null;
}

/** Any derangement respecting exclusions (may contain short cycles). */
function anyDraw(
  givers: string[],
  recipients: string[],
  allowed: (g: string, r: string) => boolean,
): Map<string, string> | null {
  const out = new Map<string, string>();
  const taken = new Set<string>();
  let steps = 0;
  const assign = (i: number): boolean => {
    if (++steps > STEP_BUDGET) return false;
    if (i === givers.length) return true;
    const g = givers[i]!;
    for (const r of recipients) {
      if (taken.has(r) || !allowed(g, r)) continue;
      out.set(g, r);
      taken.add(r);
      if (assign(i + 1)) return true;
      taken.delete(r);
      out.delete(g);
    }
    return false;
  };
  return assign(0) ? out : null;
}

export function drawExchange(input: DrawInput): DrawResult {
  const { members, exclusions, seed } = input;
  if (members.length < 2) return { ok: false, reason: 'too-few' };
  if (new Set(members).size !== members.length) return { ok: false, reason: 'duplicate-member' };

  const rand = rng(seed);
  const allowed = makeAllowed(exclusions);
  const order = shuffled(members, rand);

  const cycle = cycleDraw(order, allowed);
  if (cycle) {
    const assignments = new Map<string, string>();
    cycle.forEach((g, i) => assignments.set(g, cycle[(i + 1) % cycle.length]!));
    return { ok: true, assignments, singleCycle: true };
  }

  const any = anyDraw(order, shuffled(members, rand), allowed);
  return any
    ? { ok: true, assignments: any, singleCycle: false }
    : { ok: false, reason: 'impossible' };
}
