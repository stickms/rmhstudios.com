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
