/**
 * §16.4b — structural trust management for the shader liquid layer.
 *
 * The GL tier is a *replacement* for the CSS aurora + `.lg-goo`: activating it
 * sets `html.liquid-gl`, which HIDES the CSS stack (globals.css). If the canvas
 * then fails, stalls, or renders invisibly — as reported on iOS/WebKit after the
 * shader shipped — the site is left motion-dead with nothing painting. Because
 * that failure cannot be reproduced here (no WebKit), the defence is structural,
 * not device-specific: never trust the tier until it has proven itself, and tear
 * it down the instant it stops proving itself.
 *
 * This module is the PURE decision core (no DOM, no GL) so the gating + watchdog
 * state machine is unit-testable; `index.ts` wires the real canvas / renderer /
 * timers / storage to it.
 */

/**
 * Bump this whenever the GL renderers or this trust logic change. It is the value
 * persisted under {@link FAIL_KEY}: a device that recorded a failure is only kept
 * on CSS while the stored value still matches — so shipping a GL fix (new version)
 * automatically clears every stale block and lets those devices re-attempt. This
 * stands in for an app/build version (none is injected client-side today).
 */
export const GL_TRUST_VERSION = '1';

/** Clean probation frames required before `html.liquid-gl` is set (canvas revealed). */
export const VERIFY_FRAMES = 5;

/**
 * No successful render for this long (ms), while the loop is running AND the tab
 * is visible, means the render loop stalled (the WebKit "renders once then wedges"
 * failure mode). The idle-damped loop still paints ≥30fps (≤~33ms/frame) when
 * visible, so this threshold never trips on a healthy, merely-idle layer.
 */
export const STALL_MS = 2000;

/** How often the post-activation watchdog samples the heartbeat (ms). */
export const WATCHDOG_INTERVAL_MS = 1000;

/** localStorage key persisting a per-version GL failure so the next load skips GL. */
export const FAIL_KEY = 'rmh-liquid-gl-failed';

/** One probation frame's health, as observed by the renderer + context listeners. */
export interface FrameHealth {
  /** No GL/GPU error was raised producing this frame. */
  ok: boolean;
  /** The (deep-checked) readback showed real output — not an all-black blank frame. */
  nonBlank: boolean;
  /** The underlying context is lost. */
  lost: boolean;
}

/** Verified-frame gating state. */
export interface VerifyState {
  /** Consecutive clean frames observed so far. */
  frames: number;
  /** Promoted — `html.liquid-gl` may be set and the canvas revealed. */
  verified: boolean;
  /** Gave up during probation — permanently fall back to CSS for this session. */
  aborted: boolean;
}

export function initialVerify(): VerifyState {
  return { frames: 0, verified: false, aborted: false };
}

/**
 * Advance the verified-frame gate with one probation frame's health.
 *  - a lost context or a GL error ⇒ abort (fall back to CSS, record the failure);
 *  - clean frames accumulate; reaching {@link VERIFY_FRAMES} with a confirmed
 *    non-blank deep sample ⇒ verified (reveal the canvas).
 * Terminal states (`verified` / `aborted`) are stable — further frames no-op.
 */
export function stepVerify(state: VerifyState, health: FrameHealth): VerifyState {
  if (state.verified || state.aborted) return state;
  if (health.lost || !health.ok) return { frames: state.frames, verified: false, aborted: true };
  const frames = state.frames + 1;
  const verified = frames >= VERIFY_FRAMES && health.nonBlank;
  return { frames, verified, aborted: false };
}

/** True on the frame whose success would reach the gate — the caller runs the deep readback then. */
export function isGateFrame(state: VerifyState): boolean {
  return !state.verified && !state.aborted && state.frames + 1 >= VERIFY_FRAMES;
}

/**
 * Post-activation watchdog verdict. A lost context always fails. A paused loop
 * (tab hidden, or `running` false) is legitimate and never fails. Otherwise a
 * stalled heartbeat past {@link STALL_MS} fails.
 */
export function watchdogFailed(args: {
  now: number;
  lastRenderTs: number;
  running: boolean;
  visible: boolean;
  contextLost: boolean;
}): boolean {
  if (args.contextLost) return true;
  if (!args.running || !args.visible) return false;
  return args.now - args.lastRenderTs > STALL_MS;
}

/**
 * §16.4b.3 WebKit caution tier. Safari/iOS WebKit ships WebGPU but it is young;
 * WebGL2 is battle-tested there, so WebKit UAs skip WebGPU. iOS Chrome/Edge/Firefox
 * are all WebKit under the hood (their UAs carry `CriOS`/`EdgiOS`/`FxiOS`, not the
 * bare `Chrome`/`Edg` desktop-Blink tokens) — so they correctly resolve to WebKit.
 */
export function isWebKit(ua: string): boolean {
  return /AppleWebKit/.test(ua) && !/\bChrome\/|Chromium|\bEdg\/|OPR\//.test(ua);
}

/** Tier attempt order for this UA — WebKit avoids WebGPU (§16.4b.3). */
export function preferredTierOrder(ua: string): ('webgpu' | 'webgl2')[] {
  return isWebKit(ua) ? ['webgl2'] : ['webgpu', 'webgl2'];
}

/**
 * Whether a prior failure recorded for the CURRENT version should skip GL this
 * load. A stored value from a different version is stale (the GL code changed
 * since) → not blocked, so the device re-attempts on the fixed build.
 */
export function isBlockedByPriorFailure(
  version: string,
  get: (k: string) => string | null,
): boolean {
  try {
    return get(FAIL_KEY) === version;
  } catch {
    return false;
  }
}

/** Persist a GL failure for this version so the next load skips the attempt. */
export function recordFailure(version: string, set: (k: string, v: string) => void): void {
  try {
    set(FAIL_KEY, version);
  } catch {
    /* private mode / storage disabled — best-effort only */
  }
}
