/**
 * Allow-list for the throwaway databases the perf seed may write to. Anchored, so a
 * production-like name that merely begins with the prefix (`rmh_wsprod`) is refused.
 *
 * Accepted: `rmh_perf`, `rmh_perf_<word>[_<word>...]` and `rmh_ws<N>` / `rmh_ws<N>_<word>...`
 * (`rmh_ws`, `rmh_ws4`, `rmh_ws2_a`, `rmh_perf_template`, `rmh_perf_build`). A name with a `prod`
 * segment is refused even if it fits the shape.
 */
const ALLOWED = /^rmh_(perf|ws\d*)(_[a-z0-9]+)*$/;

export function isPerfSeedDbName(name: string): boolean {
  return ALLOWED.test(name) && !/(^|_)prod/.test(name);
}
