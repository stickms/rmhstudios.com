/**
 * Device-orientation tracking for Neon Driftway's VR head look.
 *
 * This module owns nothing but the browser plumbing: permissions, listeners,
 * and the latest raw sample. The quaternion maths lives in `./camera` so this
 * file stays dependency-free (and therefore trivially testable).
 *
 * The three things that make this awkward in practice, all handled here:
 *
 *  1. **iOS gates the event.** Safari requires `DeviceOrientationEvent
 *     .requestPermission()` from inside a user gesture. We never prompt on
 *     load — {@link GyroTracker.requestPermission} is called from a button.
 *  2. **Plenty of browsers fire the event with null angles.** Desktop Chrome
 *     does this. A listener alone proves nothing, so we only report `active`
 *     once a sample actually carries numbers.
 *  3. **Nothing fires at all on most desktops.** We start a watchdog when
 *     listening begins; if no usable sample arrives, the status settles on
 *     `unavailable` and the game keeps its static forward camera.
 *
 * Consent is shared with the site-wide tilt effects (`rmh-motion-ok`) so a
 * player who already allowed motion elsewhere is not asked twice.
 */

export interface GyroSample {
  /** Compass/heading rotation about the screen-normal axis, degrees. */
  alpha: number;
  /** Front-to-back tilt, degrees. */
  beta: number;
  /** Left-to-right tilt, degrees. */
  gamma: number;
  /** Screen rotation (0/90/180/270), degrees. */
  screenAngle: number;
  /** True when the reading is earth-referenced rather than relative. */
  absolute: boolean;
}

export type GyroStatus =
  /** No orientation events on this device — use the static camera. */
  | 'unavailable'
  /** Supported, but the browser wants an explicit grant first (iOS). */
  | 'needs-permission'
  /** The player declined, or the grant failed. */
  | 'denied'
  /** Listening, nothing usable has arrived yet. */
  | 'waiting'
  /** Live samples are flowing. */
  | 'active';

/** Shared with `components/settings/TiltEffectsRow` — one motion consent. */
export const MOTION_CONSENT_KEY = 'rmh-motion-ok';

type OrientationCtor = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<'granted' | 'denied' | 'default'>;
};

/** True only where the browser gates orientation behind a permission call. */
export function gyroPermissionGateExists(): boolean {
  if (typeof window === 'undefined' || !('DeviceOrientationEvent' in window)) return false;
  return typeof (window.DeviceOrientationEvent as OrientationCtor).requestPermission === 'function';
}

/** True where the event type exists at all (says nothing about real hardware). */
export function gyroEventSupported(): boolean {
  return typeof window !== 'undefined' && 'DeviceOrientationEvent' in window;
}

/** Whether motion was already granted site-wide in a previous session. */
export function hasStoredMotionConsent(): boolean {
  try {
    return localStorage.getItem(MOTION_CONSENT_KEY) === '1';
  } catch {
    return false;
  }
}

function storeMotionConsent(granted: boolean): void {
  try {
    if (granted) localStorage.setItem(MOTION_CONSENT_KEY, '1');
    else localStorage.removeItem(MOTION_CONSENT_KEY);
  } catch {
    /* storage disabled — consent just doesn't persist */
  }
}

function currentScreenAngle(): number {
  if (typeof window === 'undefined') return 0;
  const angle = window.screen?.orientation?.angle;
  if (typeof angle === 'number') return angle;
  const legacy = (window as unknown as { orientation?: number }).orientation;
  return typeof legacy === 'number' ? legacy : 0;
}

/** How long to wait for a usable sample before declaring the sensor absent. */
const WATCHDOG_MS = 2500;

export class GyroTracker {
  private listening = false;
  private statusValue: GyroStatus = 'unavailable';
  private latest: GyroSample | null = null;
  private watchdog: ReturnType<typeof setTimeout> | null = null;
  private absoluteSeen = false;

  /** Notified whenever {@link status} changes, for UI that mirrors it. */
  onStatusChange: ((status: GyroStatus) => void) | null = null;

  get status(): GyroStatus {
    return this.statusValue;
  }

  /** The most recent usable reading, or null while nothing has arrived. */
  get sample(): GyroSample | null {
    return this.latest;
  }

  /**
   * Attach listeners. Safe to call repeatedly. Does **not** prompt — on a
   * gated platform without a stored grant this reports `needs-permission` and
   * waits for {@link requestPermission}.
   */
  start(): void {
    if (this.listening) return;
    if (!gyroEventSupported()) {
      this.setStatus('unavailable');
      return;
    }
    if (gyroPermissionGateExists() && !hasStoredMotionConsent()) {
      this.setStatus('needs-permission');
      return;
    }

    this.listening = true;
    this.setStatus('waiting');
    window.addEventListener('deviceorientation', this.onOrientation, { passive: true });
    // Android exposes the earth-referenced reading under its own event name;
    // when both fire we keep the absolute one. Not in lib.dom's event map.
    window.addEventListener('deviceorientationabsolute', this.onAbsolute as EventListener, { passive: true });
    window.addEventListener('orientationchange', this.onScreenRotate, { passive: true });
    window.screen?.orientation?.addEventListener?.('change', this.onScreenRotate);

    this.watchdog = setTimeout(() => {
      if (this.statusValue === 'waiting') this.setStatus('unavailable');
    }, WATCHDOG_MS);
  }

  /**
   * Ask for motion access. **Must be called from a user gesture.** Resolves to
   * whether tracking is now running.
   */
  async requestPermission(): Promise<boolean> {
    if (!gyroEventSupported()) {
      this.setStatus('unavailable');
      return false;
    }

    if (gyroPermissionGateExists()) {
      try {
        const request = (window.DeviceOrientationEvent as OrientationCtor).requestPermission!;
        const result = await request();
        if (result !== 'granted') {
          storeMotionConsent(false);
          this.setStatus('denied');
          return false;
        }
        storeMotionConsent(true);
      } catch {
        // Thrown when called outside a gesture, or inside a cross-origin frame.
        this.setStatus('denied');
        return false;
      }
    }

    this.start();
    return this.statusValue !== 'unavailable' && this.statusValue !== 'denied';
  }

  stop(): void {
    if (this.watchdog !== null) {
      clearTimeout(this.watchdog);
      this.watchdog = null;
    }
    if (!this.listening) return;
    this.listening = false;
    window.removeEventListener('deviceorientation', this.onOrientation);
    window.removeEventListener('deviceorientationabsolute', this.onAbsolute as EventListener);
    window.removeEventListener('orientationchange', this.onScreenRotate);
    window.screen?.orientation?.removeEventListener?.('change', this.onScreenRotate);
    this.latest = null;
    if (this.statusValue === 'active' || this.statusValue === 'waiting') {
      this.setStatus(gyroPermissionGateExists() && !hasStoredMotionConsent() ? 'needs-permission' : 'unavailable');
    }
  }

  private setStatus(next: GyroStatus): void {
    if (this.statusValue === next) return;
    this.statusValue = next;
    this.onStatusChange?.(next);
  }

  private onScreenRotate = (): void => {
    if (this.latest) this.latest.screenAngle = currentScreenAngle();
  };

  private onAbsolute = (event: DeviceOrientationEvent): void => {
    this.absoluteSeen = true;
    this.ingest(event, true);
  };

  private onOrientation = (event: DeviceOrientationEvent): void => {
    // Once the absolute stream is proven, ignore the relative one entirely
    // rather than letting the two fight over `latest`.
    if (this.absoluteSeen) return;
    this.ingest(event, event.absolute === true);
  };

  private ingest(event: DeviceOrientationEvent, absolute: boolean): void {
    const { alpha, beta, gamma } = event;
    // A browser that fires the event with nulls has no sensor behind it.
    if (alpha === null || beta === null || gamma === null) return;

    this.latest = {
      alpha,
      beta,
      gamma,
      screenAngle: currentScreenAngle(),
      absolute,
    };

    if (this.watchdog !== null) {
      clearTimeout(this.watchdog);
      this.watchdog = null;
    }
    this.setStatus('active');
  }
}
