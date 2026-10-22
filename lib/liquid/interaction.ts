/** Shared, deterministic water impulse. CSS pixels and seconds; no DOM. */
export const LIQUID_FIELD = {
  radius: 420,
  speed: 900,
  lifetime: 1.4,
  displacement: 5,
  maxSurfaces: 8,
  recovery: 0.36,
} as const;

/** A travelling damped wave: causal, continuous at arrival, finite in time. */
export function liquidWave(age: number, distance: number, strength = 1): number {
  if (!Number.isFinite(age + distance + strength) || distance < 0) return 0;
  if (distance >= LIQUID_FIELD.radius) return 0;
  const t = age - distance / LIQUID_FIELD.speed;
  if (t <= 0 || t >= LIQUID_FIELD.lifetime) return 0;
  const range = (1 - distance / LIQUID_FIELD.radius) ** 2;
  const tail = (1 - t / LIQUID_FIELD.lifetime) ** 3;
  // A quintic attack gives the arriving front zero velocity and acceleration.
  const u = Math.min(1, t / 0.055);
  const attack = u * u * u * (10 + u * (-15 + 6 * u));
  return (
    attack *
    Math.sin(t * 21) *
    Math.exp(-t * 4.5) *
    range *
    tail *
    Math.min(1, Math.max(0, strength))
  );
}

/** C2 recovery: preserve position/velocity/acceleration, then reach exact rest. */
export function liquidRecovery(
  age: number,
  value: number,
  velocity: number,
  acceleration: number,
  duration: number = LIQUID_FIELD.recovery,
): number {
  if (age <= 0) return value + velocity * age + acceleration * age * age * 0.5;
  if (age >= duration) return 0;
  const u = age / duration,
    v = 1 - u;
  return (
    value * (1 - u * u * u * (10 + u * (-15 + 6 * u))) +
    velocity * duration * u * v * v * v * (1 + 3 * u) +
    acceleration * duration * duration * 0.5 * u * u * v * v * v
  );
}

/** Distance to the actual surface, rather than its possibly distant centre. */
export function distanceToSurface(
  x: number,
  y: number,
  rect: Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom'>,
): number {
  return Math.hypot(
    Math.max(rect.left - x, 0, x - rect.right),
    Math.max(rect.top - y, 0, y - rect.bottom),
  );
}
