/**
 * The one way a contract stub fails.
 *
 * T01 freezes every cross-task interface as compiled, exported stubs so that a
 * consumer can be written, type-checked and reviewed against the FINAL signature
 * before its producer exists. A stub that returned a plausible default instead
 * would let a consumer's test go green against nothing; a stub that throws a
 * message naming the owning task tells whoever hits it exactly where the real
 * code is supposed to come from.
 *
 * The message shape — `eversion: <name> not implemented (T0x)` — is asserted by
 * `__tests__/contracts.test.ts`, so a stub cannot quietly drop its owner. When a
 * task lands its implementation it deletes the `notImplemented` call and, if it
 * was the last one in the file, the import; the contracts test lists the stubs
 * that still throw and the owning task removes its entries in the same commit.
 */

/** Owning-task ids, as numbered in `docs/plans/2026-10-17-globe-eversion-tasks.md`. */
export type TaskId =
  | 'T04'
  | 'T05'
  | 'T06'
  | 'T07'
  | 'T08'
  | 'T09'
  | 'T10'
  | 'T11'
  | 'T12'
  | 'T13'
  | 'T15'
  | 'T17'
  | 'T18'
  | 'T23'
  | 'T24'
  | 'T25'
  | 'T29';

/** Throw the standard "not implemented" error for `name`, owned by `task`. */
export function notImplemented(name: string, task: TaskId): never {
  throw new Error(`eversion: ${name} not implemented (${task})`);
}
