/**
 * Monotonic ids, in their own module so anything can reach them.
 *
 * They used to live in `tick.ts`, which is fine for the halos and the Sinners
 * the tick itself mints — but the trophy audit and the actions both need one
 * too, and `trophies.ts` importing from `tick.ts` would close a cycle
 * (`tick → trophies → tick`).
 *
 * The alternative everything used before this was `Date.now()` plus an index,
 * and it produced duplicate React keys in the toast rail: two sources of
 * notices minting ids in the same millisecond (a trophy audit and a purchase,
 * or one audit running twice under StrictMode) collide, and a duplicated key is
 * a rendering bug React is explicit about not supporting.
 */

let counter = 1;

/** The next id. Unique for the lifetime of the tab, and cheap. */
export function nextId(): number {
  return counter++;
}

/**
 * Promise never to mint `id` again.
 *
 * The counter starts at 1 every time the page loads, but a SAVE carries ids
 * that were minted in an earlier session — a Sinner latched onto the temple
 * last night is still id 7 when it is loaded back this morning. Without this
 * the next Sinner to arrive is also id 7: two React children with the same key
 * in the ring, and `strikeSinner(7)` reaching whichever one the array happens
 * to find first.
 *
 * So everything that comes back from a save is reserved on the way in, and the
 * counter resumes above the highest of them.
 */
export function reserveId(id: number): void {
  if (Number.isFinite(id) && id >= counter) counter = Math.floor(id) + 1;
}
