/**
 * The autopilot's turbo (lib/balatro/lua/mp_test/autopilot.lua `turbo`) for every engine
 * page of the e2e suite: the harness page (engine project) and real players (match project).
 *
 * Software WebGL spends nearly all of a ~100 ms frame drawing, and Balatro advances at most
 * 0.1 s of game time per frame (main.lua caps dt), so a scripted run mostly waits for
 * animations. Turbo calls love.update `updates` times per frame (the frame's dt each: the
 * game sees time pass faster, as at a higher game speed; seeded results are identical) and
 * draws every `drawEvery`-th frame. A Lua `wait_frames` still gets full frames (one update,
 * one draw), so specs that let the engine draw, and perf_spec's measurements, are unchanged.
 * Network, the hub and the match timers run on the page's own clock and are not affected.
 *
 * `BALATRO_E2E_TURBO`: `UxD` (default `8x4`), or `off` (also `1x1`) for real-speed frames —
 * the nightly run uses `off`, so the fast path never becomes the only path.
 */
export type Turbo = [updates: number, drawEvery: number];

export const DEFAULT_TURBO: Turbo = [8, 4];

export function turboSetting(env: Record<string, string | undefined> = process.env): Turbo {
  const v = (env.BALATRO_E2E_TURBO ?? '').trim().toLowerCase();
  if (v === 'off' || v === '0' || v === 'false') return [1, 1];
  const m = /^(\d{1,2})x(\d{1,2})$/.exec(v);
  if (!m) return DEFAULT_TURBO;
  const clamp = (n: number) => Math.min(64, Math.max(1, n));
  return [clamp(Number(m[1])), clamp(Number(m[2]))];
}

export const turboOn = ([updates, drawEvery]: Turbo) => updates > 1 || drawEvery > 1;
