/**
 * Webrings — pure and client-safe.
 * Feature idea P6 in docs/plans/2026-10-12-feature-ideas-every-surface.md.
 *
 * The indie-web webring, revived for profiles: a member creates a ring
 * ("pixel artists", "Rochester Offensive mains"), others join, and every
 * member profile in the ring shows a small `← prev · ring name · next →`
 * strip plus a random hop. It is discovery that is curated by the people in
 * it rather than by a ranking model, which is the whole charm.
 *
 * The ring order is join order (stable, explainable: "you're between Ana and
 * Bo because you joined after Ana"). Navigation skips members who are not
 * currently eligible — left the site, set their profile private, or blocked
 * the viewer — so a hop never lands on a profile the viewer cannot see. If
 * nobody else is eligible the strip hides itself.
 */

export interface RingMember {
  userId: string;
  joinedAt: number;
}

/** Ring order: join time, then id so equal timestamps are still stable. */
export function ringOrder(members: readonly RingMember[]): string[] {
  return [...members]
    .sort(
      (a, b) => a.joinedAt - b.joinedAt || (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0),
    )
    .map((m) => m.userId);
}

export interface RingHops {
  prev: string | null;
  next: string | null;
  position: number;
  size: number;
}

/**
 * Neighbours of `current` in the ring, skipping anyone `eligible` rejects.
 * `current` itself need not be eligible (a viewer can be on a profile that
 * just went private) but must be a member.
 */
export function hops(
  order: readonly string[],
  current: string,
  eligible: (id: string) => boolean,
): RingHops | null {
  const i = order.indexOf(current);
  if (i === -1) return null;
  const n = order.length;
  const find = (step: 1 | -1): string | null => {
    for (let k = 1; k < n; k++) {
      const id = order[(i + step * k + n * k) % n]!;
      if (eligible(id)) return id;
    }
    return null;
  };
  return { prev: find(-1), next: find(1), position: i + 1, size: n };
}

/** A random eligible member other than `current`; `rand` is injectable for tests. */
export function randomHop(
  order: readonly string[],
  current: string,
  eligible: (id: string) => boolean,
  rand: () => number = Math.random,
): string | null {
  const pool = order.filter((id) => id !== current && eligible(id));
  return pool.length ? pool[Math.floor(rand() * pool.length)]! : null;
}
