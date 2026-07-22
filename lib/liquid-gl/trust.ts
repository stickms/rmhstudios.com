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
 * persisted under {@link FAIL_KEY}: a matching version pauses retries for a short
 * cooldown. Shipping a GL fix (new version) automatically clears stale blocks,
 * and the cooldown lets transient driver failures recover without a release.
 */
export const GL_TRUST_VERSION = '3';

/** A failed driver gets another hidden, verified-frame attempt after this cooldown. */
export const FAILURE_COOLDOWN_MS = 30 * 60_000;

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
 * WebKit detection for the compositor-safe tier. iOS Chrome/Edge/Firefox use
 * WebKit too (their UAs carry `CriOS`/`EdgiOS`/`FxiOS`, not the bare
 * `Chrome`/`Edg` desktop-Blink tokens). Those UAs lack Safari's authoritative
 * `Version/x.y` token, so they conservatively remain on the CSS fallback.
 */
export function isWebKit(ua: string): boolean {
  return /AppleWebKit/.test(ua) && !/\bChrome\/|Chromium|\bEdg\/|OPR\//.test(ua);
}

/**
 * Safari 26.0 shipped WebGPU on Apple platforms, but its canvas compositor could
 * flicker or wedge through 26.3. WebKit fixed that regression in Safari/iOS 26.4.
 * The OS token cannot be used here because iOS 26 freezes it at `OS 18_6`; the
 * `Version/x.y` token is the browser release and remains the useful safety gate.
 */
export function webKitWebGPUIsSafe(ua: string): boolean {
  if (!isWebKit(ua)) return false;
  const match = ua.match(/\bVersion\/(\d+)(?:\.(\d+))?/);
  if (!match) return false;
  const major = Number(match[1]);
  const minor = Number(match[2] ?? 0);
  return major > 26 || (major === 26 && minor >= 4);
}

/**
 * Tier attempt order for this UA.
 *
 * Safari 26.4+ can use WebGPU now that WebKit's canvas-compositor regression is
 * fixed. Older/unknown WebKit releases stay CSS-only: a compositor stall can
 * block the main thread before the verified-frame watchdog gets a chance to run.
 * WebKit never falls through to WebGL2 for the same reason. Blink/Gecko retain
 * the normal WebGPU → WebGL2 order.
 */
export function preferredTierOrder(ua: string): ('webgpu' | 'webgl2')[] {
  if (!isWebKit(ua)) return ['webgpu', 'webgl2'];
  return webKitWebGPUIsSafe(ua) ? ['webgpu'] : [];
}

/**
 * Whether a prior failure recorded for the CURRENT version should skip GL this
 * load. A stored value from a different version is stale (the GL code changed
 * since) → not blocked, so the device re-attempts on the fixed build.
 */
export function isBlockedByPriorFailure(
  version: string,
  get: (k: string) => string | null,
  now = Date.now(),
): boolean {
  try {
    const raw = get(FAIL_KEY);
    if (!raw) return false;
    const record = JSON.parse(raw) as { version?: unknown; failedAt?: unknown };
    return (
      record.version === version &&
      typeof record.failedAt === 'number' &&
      now - record.failedAt >= 0 &&
      now - record.failedAt < FAILURE_COOLDOWN_MS
    );
  } catch {
    return false;
  }
}

/** Persist a timestamped failure so reload loops pause, but transient failures recover. */
export function recordFailure(
  version: string,
  set: (k: string, v: string) => void,
  now = Date.now(),
): void {
  try {
    set(FAIL_KEY, JSON.stringify({ version, failedAt: now }));
  } catch {
    /* private mode / storage disabled — best-effort only */
  }
}

/** Remove a stale failure marker once a backend has proved it can render. */
export function clearFailure(remove: (k: string) => void): void {
  try {
    remove(FAIL_KEY);
  } catch {
    /* private mode / storage disabled — best-effort only */
  }
}
