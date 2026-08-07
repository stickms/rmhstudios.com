/**
 * Platform capabilities — the browser APIs games reach for that aren't
 * everywhere, behind one set of safe wrappers.
 *
 * The rule this file exists to enforce: **a missing capability degrades the
 * feature, never the page.** A bare `new AudioContext()` throws outright where
 * Web Audio is unavailable or blocked (older iOS, Firefox with
 * `dom.webaudio.enabled` off, a locked-down enterprise profile, some embedded
 * webviews); if that call sits in a game's init path, the whole game fails to
 * start because it couldn't make a beep.
 *
 * Everything here is SSR-safe: each function returns the "not available"
 * answer when there is no `window`, so nothing needs a `typeof window` guard
 * at the call site.
 */

/* ─── Web Audio ─────────────────────────────────────────────────────────── */

type AudioContextCtor = typeof AudioContext;

interface LegacyWindow {
  AudioContext?: AudioContextCtor;
  /** Safari shipped Web Audio prefixed for years; some webviews still are. */
  webkitAudioContext?: AudioContextCtor;
}

/**
 * One AudioContext for the whole page.
 *
 * Browsers cap the number of contexts a document may create (Chrome's limit is
 * six), and games that made one per sound module hit it — after which every
 * subsequent `new AudioContext()` throws and takes the game with it.
 */
let sharedContext: AudioContext | null = null;
let contextUnavailable = false;

/**
 * The page's AudioContext, or `null` if Web Audio isn't available.
 *
 * Callers must handle `null` — that is the whole point. Treat it as "this
 * device plays no sound", not as an error.
 */
export function getAudioContext(): AudioContext | null {
  if (sharedContext) return sharedContext;
  if (contextUnavailable || typeof window === 'undefined') return null;

  const w = window as unknown as LegacyWindow;
  const Ctor = w.AudioContext ?? w.webkitAudioContext;
  if (!Ctor) {
    contextUnavailable = true;
    return null;
  }

  try {
    sharedContext = new Ctor();
    return sharedContext;
  } catch {
    // Construction can throw even when the constructor exists — a blocked
    // autoplay policy, an exhausted context budget, a disabled feature flag.
    contextUnavailable = true;
    return null;
  }
}

/**
 * Resume the shared context after a user gesture.
 *
 * Every engine starts contexts `suspended` until the user has interacted, and
 * iOS additionally re-suspends on backgrounding — so this is worth calling on
 * each gesture, not only the first.
 */
export function resumeAudioContext(): void {
  const ctx = sharedContext;
  if (!ctx || ctx.state !== 'suspended') return;
  // Older Safari's `resume()` returns undefined rather than a promise.
  void Promise.resolve(ctx.resume()).catch(() => {});
}

/** Whether this device can play Web Audio at all. Does not create a context. */
export function canPlayWebAudio(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as unknown as LegacyWindow;
  return Boolean(w.AudioContext ?? w.webkitAudioContext);
}

/**
 * The page's output audio latency, in milliseconds, or `null` when unknown.
 *
 * `outputLatency` is the real end-to-end number and is Firefox/Chrome-only;
 * `baseLatency` (the processing buffer) is available almost everywhere but is
 * a fraction of the real figure. Prefer the former, fall back to the latter,
 * and treat `0` as "unknown" rather than "none" — Safari reports 0 and it is
 * not true.
 *
 * Does not create an `AudioContext` — call `getAudioContext()` first (or let a
 * caller that already did, like `AudioManager`) so this never has the side
 * effect of spinning one up just to measure it.
 */
export function outputLatencyMs(): number | null {
  const ctx = sharedContext;
  if (!ctx) return null;
  const latency = ctx.outputLatency || ctx.baseLatency || 0;
  return latency > 0 ? Math.round(latency * 1000) : null;
}

/* ─── Haptics ───────────────────────────────────────────────────────────── */

/**
 * A short haptic tick, where the platform offers one.
 *
 * Absent on all of desktop and on iOS Safari, present on Android Chrome — and
 * ignored entirely without a prior user gesture, which is fine: this is
 * decoration, so a no-op is the correct failure.
 */
export function vibrate(pattern: number | number[]): void {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // Some engines throw on an out-of-range pattern rather than clamping it.
  }
}

/* ─── Haptic preferences ────────────────────────────────────────────────── */

const HAPTICS_ENABLED_KEY = 'rmh:haptics:enabled';
const HAPTICS_INTENSITY_KEY = 'rmh:haptics:intensity';

/**
 * Whether hit haptics are enabled, from the last explicit choice.
 *
 * Defaults to on: `vibrate()` already no-ops on every device without a motor
 * (all of desktop, iOS Safari), so getting the default "wrong" there costs
 * nothing, and a phone player with a motor generally wants to feel a hit.
 *
 * No settings surface exists for this yet (A8) — see
 * `docs/_handoff/presentation-requests.md`. Once a toggle lands, write
 * through {@link setHapticsEnabled} rather than the key directly, so every
 * reader keeps agreeing on the storage format.
 */
export function hapticsEnabled(): boolean {
  if (typeof localStorage === 'undefined') return true;
  try {
    const raw = localStorage.getItem(HAPTICS_ENABLED_KEY);
    return raw === null ? true : raw === '1';
  } catch {
    return true;
  }
}

export function setHapticsEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(HAPTICS_ENABLED_KEY, enabled ? '1' : '0');
  } catch {
    // Private browsing / storage full — the in-memory default still applies
    // for the rest of this tab's life, which is a fine place for this to fail.
  }
}

/**
 * 0–1. Defaults to 0.7 rather than 1: full-strength `vibrate()` reads as
 * harsh on most phones, and the judgement-scaled durations in
 * `lib/slice-it/engine.ts` are already tuned against that default.
 */
export function hapticsIntensity(): number {
  if (typeof localStorage === 'undefined') return 0.7;
  try {
    const raw = Number(localStorage.getItem(HAPTICS_INTENSITY_KEY));
    return Number.isFinite(raw) && raw > 0 && raw <= 1 ? raw : 0.7;
  } catch {
    return 0.7;
  }
}

export function setHapticsIntensity(value: number): void {
  try {
    localStorage.setItem(HAPTICS_INTENSITY_KEY, String(Math.max(0, Math.min(1, value))));
  } catch {
    // See setHapticsEnabled.
  }
}

/* ─── Idle work ─────────────────────────────────────────────────────────── */

interface IdleWindow {
  requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
}

/**
 * Run work once the browser is idle, with a timeout so it happens regardless.
 *
 * Safari only shipped `requestIdleCallback` in 17.4, so a straight call
 * silently never runs on a large installed base — hence the timer fallback.
 * Returns a cancel function.
 */
export function whenIdle(work: () => void, timeout = 2000): () => void {
  if (typeof window === 'undefined') return () => {};
  const w = window as unknown as IdleWindow;

  if (typeof w.requestIdleCallback === 'function') {
    const handle = w.requestIdleCallback(work, { timeout });
    return () => w.cancelIdleCallback?.(handle);
  }

  const handle = window.setTimeout(work, Math.min(timeout, 200));
  return () => window.clearTimeout(handle);
}

/* ─── Wake lock ─────────────────────────────────────────────────────────── */

interface WakeLockSentinelLike {
  release(): Promise<void>;
  addEventListener(type: 'release', listener: () => void): void;
}

interface WakeLockNavigator {
  wakeLock?: { request(type: 'screen'): Promise<WakeLockSentinelLike> };
}

/**
 * Keep the screen awake while a game is on. Returns a release function.
 *
 * Chromium and Safari 16.4+ only; elsewhere this is a no-op and the screen
 * dims as usual, which is a worse experience but not a broken one.
 *
 * The sentinel is re-acquired when the tab returns to the foreground: every
 * engine drops the lock on backgrounding and does not restore it.
 */
export function requestScreenWakeLock(): () => void {
  if (typeof navigator === 'undefined') return () => {};
  const nav = navigator as unknown as WakeLockNavigator;
  if (!nav.wakeLock) return () => {};

  let sentinel: WakeLockSentinelLike | null = null;
  let released = false;

  const acquire = () => {
    if (released || document.visibilityState !== 'visible') return;
    nav
      .wakeLock!.request('screen')
      .then((next) => {
        if (released) {
          void next.release().catch(() => {});
          return;
        }
        sentinel = next;
      })
      // A request can be rejected (low battery, a policy) — that is a decline,
      // not a failure worth surfacing.
      .catch(() => {});
  };

  const onVisibility = () => {
    if (document.visibilityState === 'visible') acquire();
  };

  acquire();
  document.addEventListener('visibilitychange', onVisibility);

  return () => {
    released = true;
    document.removeEventListener('visibilitychange', onVisibility);
    void sentinel?.release().catch(() => {});
    sentinel = null;
  };
}

/* ─── Fullscreen ────────────────────────────────────────────────────────── */

interface FullscreenElement extends HTMLElement {
  webkitRequestFullscreen?: () => Promise<void> | void;
}

interface FullscreenDocument extends Document {
  webkitExitFullscreen?: () => Promise<void> | void;
  webkitFullscreenElement?: Element | null;
}

/** Whether anything is currently fullscreen, across both spellings. */
export function isFullscreen(): boolean {
  if (typeof document === 'undefined') return false;
  const doc = document as FullscreenDocument;
  return Boolean(doc.fullscreenElement ?? doc.webkitFullscreenElement);
}

/**
 * Toggle fullscreen on an element.
 *
 * Safari still only has the `webkit`-prefixed methods on desktop, and iPhone
 * Safari has neither — there, this resolves to `false` and callers should keep
 * whatever in-page "expanded" mode they have.
 */
export async function toggleFullscreen(element: HTMLElement): Promise<boolean> {
  if (typeof document === 'undefined') return false;
  const doc = document as FullscreenDocument;
  const target = element as FullscreenElement;

  try {
    if (isFullscreen()) {
      await (doc.exitFullscreen?.() ?? doc.webkitExitFullscreen?.());
      return false;
    }
    const request = target.requestFullscreen ?? target.webkitRequestFullscreen;
    if (!request) return false;
    await request.call(target);
    return true;
  } catch {
    // Rejected when not called from a user gesture, or blocked by permissions
    // policy inside an iframe (Discord activities, embeds).
    return false;
  }
}

/* ─── Rendering capability ──────────────────────────────────────────────── */

let webglSupport: boolean | null = null;

/**
 * Whether this device can create a WebGL context at all.
 *
 * Not the same question as "does the browser support WebGL": a driver
 * blocklist, a headless environment, or an exhausted context budget all make
 * `getContext` return null on a browser that advertises support. Games with a
 * 3D mode should ask this and offer their 2D path rather than mounting a
 * canvas that stays black.
 */
export function supportsWebGL(): boolean {
  if (webglSupport !== null) return webglSupport;
  if (typeof document === 'undefined') return false;

  try {
    const canvas = document.createElement('canvas');
    webglSupport = Boolean(
      canvas.getContext('webgl2') ??
      canvas.getContext('webgl') ??
      canvas.getContext('experimental-webgl'),
    );
  } catch {
    webglSupport = false;
  }
  return webglSupport;
}

/**
 * A rough "don't ask this device for much" signal.
 *
 * `deviceMemory` is Chromium-only and `hardwareConcurrency` is widely but not
 * universally available, so the absence of both means "assume capable" rather
 * than "assume weak" — guessing low would strip effects from every Safari user.
 */
export function isLowPowerDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const nav = navigator as Navigator & { deviceMemory?: number };
  if (typeof nav.deviceMemory === 'number' && nav.deviceMemory <= 2) return true;
  if (typeof nav.hardwareConcurrency === 'number' && nav.hardwareConcurrency <= 2) return true;
  return false;
}

/**
 * I2 — gamepad rumble, scaled by the same haptics settings the touch path uses.
 *
 * `playEffect` returns a promise that must NOT be awaited on the input path,
 * and whose rejection must be swallowed: a pad without an actuator rejects, and
 * an unhandled rejection per note is a console full of noise on exactly the
 * hardware that cannot do anything about it.
 */
export function rumble(pad: Gamepad | null, durationMs: number, strong = 0.2): void {
  if (!pad || !hapticsEnabled()) return;
  const actuator = (pad as Gamepad & { vibrationActuator?: GamepadHapticActuator })
    .vibrationActuator as (GamepadHapticActuator & {
    playEffect?: (type: string, params: Record<string, number>) => Promise<unknown>;
  }) | undefined;
  if (!actuator?.playEffect) return;

  const intensity = hapticsIntensity();
  void actuator
    .playEffect('dual-rumble', {
      duration: Math.max(1, Math.round(durationMs)),
      weakMagnitude: 0.4 * intensity,
      strongMagnitude: strong * intensity,
    })
    .catch(() => {});
}
