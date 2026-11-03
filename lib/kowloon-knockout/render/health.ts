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
}

/** A failing renderer is given this many consecutive bad frames (~0.3s at 60fps). */
export const FAIL_STREAK_LIMIT = 20;
/** A renderer that completes nothing for this long is frozen, not slow: even
 *  software GL in our tests delivers a frame every ~4s. */
export const STALL_LIMIT_MS = 8000;

export type RecoveryAction = 'none' | 'force-webgl' | 'give-up';

export function decideRecovery(
    snap: RenderHealthSnapshot,
    now: number,
    ctx: { backendIsWebGPU: boolean; alreadyForcedWebGL: boolean; hidden: boolean },
): RecoveryAction {
    if (ctx.hidden) return 'none';
    const failing = snap.fatal || snap.failStreak >= FAIL_STREAK_LIMIT;
    const stalled = now - Math.max(snap.lastOkAt, snap.since) >= STALL_LIMIT_MS;
    if (!failing && !stalled) return 'none';
    // The WebGPU backend is the one that fails in ways a WebGL 2 retry fixes.
    if (ctx.backendIsWebGPU && !ctx.alreadyForcedWebGL) return 'force-webgl';
    return 'give-up';
}

const FORCE_KEY = 'kk-force-webgl';

let state: RenderHealthSnapshot = { ok: 0, failStreak: 0, fatal: false, lastOkAt: 0, since: 0 };
let backendIsWebGPU = false;
let forceWebGL = false;
try {
    if (typeof window !== 'undefined') forceWebGL = window.sessionStorage.getItem(FORCE_KEY) === '1';
} catch {
    /* storage can throw in private windows; the in-memory flag still works */
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export function resetRenderHealth(isWebGPU = false): void {
    backendIsWebGPU = isWebGPU;
    const t = now();
    state = { ok: 0, failStreak: 0, fatal: false, lastOkAt: t, since: t };
}

/** The device is gone. Unlike a failed frame this is never undone by a later
 *  render() call that merely returns without throwing. */
export function reportFatal(e?: unknown): void {
    state.fatal = true;
    console.warn('[kowloon] GPU device lost:', e);
}

export function reportFrameOk(): void {
    state.ok++;
    state.failStreak = 0;
    state.lastOkAt = now();
}

export function reportFrameFail(e?: unknown): void {
    state.failStreak++;
    if (state.failStreak === 1) console.warn('[kowloon] render frame failed:', e);
}

export function renderHealthSnapshot(): RenderHealthSnapshot {
    return { ...state };
}

export function shouldForceWebGL(): boolean {
    return forceWebGL;
}

export function markForceWebGL(): void {
    forceWebGL = true;
    try {
        window.sessionStorage.setItem(FORCE_KEY, '1');
    } catch {
        /* see above */
    }
}

export function currentBackendIsWebGPU(): boolean {
    return backendIsWebGPU;
}
