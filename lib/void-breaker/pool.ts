/**
 * Object-pool slot acquisition (pure — no engine state, no I/O).
 *
 * Void Breaker preallocates fixed pools (projectiles, particles, shards, heart
 * pickups) and marks entries `active`. Slots used to be claimed with
 * `pool.find((o) => !o.active)`, which always starts at index 0 — and therefore
 * always allocates the LOWEST free index. That is self-defeating: the low end of
 * the pool stays permanently occupied while the game is busy, so every spawn
 * walks the whole active prefix before reaching a free slot, and a burst that
 * spawns `n` objects pays that walk `n` times over.
 *
 * Resuming each search where the previous one stopped makes consecutive
 * allocations O(1) amortized. The scan still wraps a full lap before giving up,
 * so a free slot is never missed and a genuinely full pool still reports full.
 *
 * The only observable difference is WHICH interchangeable slot a spawn lands in,
 * and therefore the order pooled objects sit in the array. Nothing keys off a
 * pool index — every field is reassigned on acquisition — so this affects only
 * the draw order of overlapping particles/projectiles.
 */

export interface Pooled {
  active: boolean;
}

/** A claimed slot plus the cursor value to resume the next search from. */
export interface PoolClaim<T> {
  slot: T;
  next: number;
}

/**
 * Claim the first inactive slot at or after `startAt`, wrapping once.
 * Returns `null` when every slot is active.
 *
 * `startAt` is normalized, so an out-of-range or negative cursor is safe.
 */
export function acquirePooled<T extends Pooled>(pool: T[], startAt: number): PoolClaim<T> | null {
  const n = pool.length;
  if (n === 0) return null;

  let start = startAt % n;
  if (start < 0) start += n;

  for (let k = 0; k < n; k++) {
    let index = start + k;
    if (index >= n) index -= n;
    const slot = pool[index];
    if (!slot.active) {
      const next = index + 1;
      return { slot, next: next >= n ? 0 : next };
    }
  }
  return null;
}
