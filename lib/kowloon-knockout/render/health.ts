/**
 * Render health: did the last frames actually reach the screen?
 *
 * The match simulation runs on its own clock (rAF + a background timer), the HUD
 * is plain DOM, and none of it knows whether the 3D canvas is painting. When the
 * renderer fails every frame (a WebGPU validation error, a lost device, a node
 * material that will not compile) the player gets a blank or frozen picture
 * while the fight carries on underneath. This module is the one place that
 * records frame outcomes, and `decideRecovery` is the pure policy that turns
 * them into an action. Both stay free of React/three so they are unit-testable.
 */

export interface RenderHealthSnapshot {
  /** Frames that rendered without throwing/rejecting since the last reset. */
  ok: number;
  /** Consecutive failed frames since the last good one. */
  failStreak: number;
  /** The GPU device was lost: nothing more will paint on this renderer. */
  fatal: boolean;
  /** performance.now() of the last good frame; the reset time before any. */
  lastOkAt: number;
  /** performance.now() when the current canvas started (or was reset). */
  since: number;
  /** Uncaptured GPU errors inside the recent window (see ERROR_WINDOW_MS). */
  gpuErrors: number;
  /** Consecutive pixel probes that found the canvas blank (one flat colour). */
  blankStreak: number;
  /** Probes that could read the canvas (diagnostic: 0 means the probe is blind). */
  probed: number;
  /** A probe has seen a picture on this canvas at least once. */
  painted: boolean;
}

/** A failing renderer is given this many consecutive bad frames (~0.3s at 60fps). */
export const FAIL_STREAK_LIMIT = 20;
/** A renderer that completes nothing for this long is frozen, not slow: even
 *  software GL in our tests delivers a frame every ~4s. */
export const STALL_LIMIT_MS = 8000;
/** A device that raises this many uncaptured errors within ERROR_WINDOW_MS is
 *  failing every frame (a validation error per draw), even though each sync
 *  render() call "succeeds": WebGPU reports the failure later, so the frame
 *  counters alone read a canvas that has painted nothing as healthy. */
export const GPU_ERROR_LIMIT = 45;
export const ERROR_WINDOW_MS = 2000;
/** Probes are ~1s apart, so this is ~6s of a flat-coloured canvas: long enough
 *  for first-use shader compilation on a slow GPU, which also draws nothing. */
export const BLANK_STREAK_LIMIT = 6;

export type RecoveryAction =
  | 'none'
  | 'force-webgl'
  | 'give-up';

export function decideRecovery(
  snap: RenderHealthSnapshot,
  now: number,
  ctx: {
    backendIsWebGPU: boolean;
    alreadyForcedWebGL: boolean;
    hidden: boolean;
  },
): RecoveryAction {
  if (
    ctx.hidden
  )
    return 'none';
  const failing =
    snap.fatal ||
    snap.failStreak >=
      FAIL_STREAK_LIMIT ||
    snap.gpuErrors >=
      GPU_ERROR_LIMIT ||
    snap.blankStreak >=
      BLANK_STREAK_LIMIT;
  const stalled =
    now -
      Math.max(
        snap.lastOkAt,
        snap.since,
      ) >=
    STALL_LIMIT_MS;
  if (
    !failing &&
    !stalled
  )
    return 'none';
  // The WebGPU backend is the one that fails in ways a WebGL 2 retry fixes.
  if (
    ctx.backendIsWebGPU &&
    !ctx.alreadyForcedWebGL
  )
    return 'force-webgl';
  return 'give-up';
}

const FORCE_KEY =
  'kk-force-webgl';

let state: RenderHealthSnapshot =
  {
    ok: 0,
    failStreak: 0,
    fatal: false,
    lastOkAt: 0,
    since: 0,
    gpuErrors: 0,
    blankStreak: 0,
    probed: 0,
    painted: false,
  };
let errorTimes: number[] =
  [];
let backendIsWebGPU = false;
let forceWebGL = false;
try {
  if (
    typeof window !==
    'undefined'
  )
    forceWebGL =
      window.sessionStorage.getItem(
        FORCE_KEY,
      ) ===
      '1';
} catch {
  /* storage can throw in private windows; the in-memory flag still works */
}

const now =
  () =>
    typeof performance !==
    'undefined'
      ? performance.now()
      : Date.now();

export function resetRenderHealth(
  isWebGPU = false,
): void {
  backendIsWebGPU =
    isWebGPU;
  const t =
    now();
  state =
    {
      ok: 0,
      failStreak: 0,
      fatal: false,
      lastOkAt:
        t,
      since:
        t,
      gpuErrors: 0,
      blankStreak: 0,
      probed: 0,
      painted: false,
    };
  errorTimes =
    [];
}

/** An uncaptured GPU error. Counted in a rolling window instead of as a failed
 *  frame, because the next frame's render() returns normally and would clear it. */
export function reportGpuError(
  e?: unknown,
): void {
  const t =
    now();
  errorTimes.push(
    t,
  );
  if (
    errorTimes.length >
    4 *
      GPU_ERROR_LIMIT
  )
    errorTimes.splice(
      0,
      errorTimes.length -
        4 *
          GPU_ERROR_LIMIT,
    );
  if (
    errorTimes.length ===
    1
  )
    console.warn(
      '[kowloon] GPU error:',
      e,
    );
}

/** Result of a pixel probe of the presented canvas. A painted frame ends the
 *  blank run; an unreadable canvas (`null`) says nothing either way.
 *
 *  Browsers differ in whether a WebGPU canvas can be read back after submit, so
 *  on WebGPU a probe that has never once seen a picture is treated as blind, not
 *  as proof of a blank canvas: only a canvas that WAS readable and then went flat
 *  counts. WebGL 2 reads back reliably (checked in Chromium and WebKit). */
export function reportProbe(
  blank:
    | boolean
    | null,
): void {
  if (
    blank ===
    null
  )
    return;
  state.probed++;
  if (
    !blank
  ) {
    state.painted = true;
    state.blankStreak = 0;
    return;
  }
  if (
    backendIsWebGPU &&
    !state.painted
  )
    return;
  state.blankStreak++;
}

/** The device is gone. Unlike a failed frame this is never undone by a later
 *  render() call that merely returns without throwing. */
export function reportFatal(
  e?: unknown,
): void {
  state.fatal = true;
  console.warn(
    '[kowloon] GPU device lost:',
    e,
  );
}

export function reportFrameOk(): void {
  state.ok++;
  state.failStreak = 0;
  state.lastOkAt =
    now();
}

export function reportFrameFail(
  e?: unknown,
): void {
  state.failStreak++;
  if (
    state.failStreak ===
    1
  )
    console.warn(
      '[kowloon] render frame failed:',
      e,
    );
}

export function renderHealthSnapshot(): RenderHealthSnapshot {
  const t =
    now();
  errorTimes =
    errorTimes.filter(
      (
        x,
      ) =>
        t -
          x <=
        ERROR_WINDOW_MS,
    );
  return {
    ...state,
    gpuErrors:
      errorTimes.length,
  };
}

export function shouldForceWebGL(): boolean {
  return forceWebGL;
}

export function markForceWebGL(): void {
  forceWebGL = true;
  try {
    window.sessionStorage.setItem(
      FORCE_KEY,
      '1',
    );
  } catch {
    /* see above */
  }
}

export function currentBackendIsWebGPU(): boolean {
  return backendIsWebGPU;
}
