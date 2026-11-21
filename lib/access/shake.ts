/**
 * Shake detection on `devicemotion`. A shake is several direction reversals of
 * strong acceleration inside a short window; one bump or a walk does not count.
 */
type MotionCtor = typeof DeviceMotionEvent & {
  requestPermission?: () => Promise<'granted' | 'denied'>;
};

const THRESHOLD = 18; // m/s^2 on any axis, gravity excluded where the browser provides it
const REVERSALS = 4;
const WINDOW_MS = 900;
const COOLDOWN_MS = 4000;

export function motionPermissionGated(): boolean {
  return (
    typeof window !== 'undefined' &&
    'DeviceMotionEvent' in window &&
    typeof (window.DeviceMotionEvent as MotionCtor).requestPermission === 'function'
  );
}

/** Must be called from a user gesture on iOS. */
export async function requestMotionPermission(): Promise<boolean> {
  if (!motionPermissionGated()) return true;
  try {
    return (await (window.DeviceMotionEvent as MotionCtor).requestPermission!()) === 'granted';
  } catch {
    return false;
  }
}

export function isTouchPhone(): boolean {
  return (
    typeof window !== 'undefined' &&
    'DeviceMotionEvent' in window &&
    window.matchMedia('(pointer: coarse)').matches &&
    window.matchMedia('(hover: none)').matches
  );
}

/** Start listening; returns a stop function. */
export function watchForShake(onShake: () => void): () => void {
  let last = 0;
  let lastSign = 0;
  let marks: number[] = [];
  let cooldownUntil = 0;
  const handler = (e: DeviceMotionEvent) => {
    const a = e.acceleration ?? e.accelerationIncludingGravity;
    if (!a) return;
    const x = a.x ?? 0;
    const mag = Math.abs(x) > Math.abs(a.y ?? 0) ? x : (a.y ?? 0);
    if (Math.abs(mag) < THRESHOLD) return;
    const now = e.timeStamp || Date.now();
    if (now < cooldownUntil) return;
    const sign = mag > 0 ? 1 : -1;
    if (sign === lastSign && now - last < 120) return;
    lastSign = sign;
    last = now;
    marks = marks.filter((m) => now - m < WINDOW_MS);
    marks.push(now);
    if (marks.length >= REVERSALS) {
      marks = [];
      cooldownUntil = now + COOLDOWN_MS;
      onShake();
    }
  };
  window.addEventListener('devicemotion', handler);
  return () => window.removeEventListener('devicemotion', handler);
}
