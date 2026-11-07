// Frame-rate-independent smoothing. `lambda` is the response rate (1/s): the gap closes by 1 - e^(-lambda*dt)
// each step, so the result after one second is the same at 30, 60 or 144 fps (the old `+= (target - cur) * 0.5`
// per frame moved twice as fast at 120 Hz as at 60, which is what made motion judder on fast displays).

/** Move `current` toward `target`; `dt` in seconds (0 or less leaves it where it is). */
export function damp(current: number, target: number, lambda: number, dt: number): number {
    if (!(dt > 0)) return current;
    return current + (target - current) * (1 - Math.exp(-lambda * dt));
}

/** Shortest-path angle damp (radians). */
export function dampAngle(current: number, target: number, lambda: number, dt: number): number {
    let d = target - current;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return current + d * (dt > 0 ? 1 - Math.exp(-lambda * dt) : 0);
}
