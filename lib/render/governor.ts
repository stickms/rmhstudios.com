/**
 * Frametime governor — the runtime half of the tier system.
 *
 * Detection (`detectTier`) only guesses from a GPU string; this measures what
 * the machine actually delivers and steps quality *down* when the rolling
 * average misses budget. Downscale-only by design: oscillating between tiers
 * mid-match looks worse than sitting one notch low.
 *
 * Generalised from `lib/kowloon-knockout/render/governor.ts`.
 */

export const DEFAULT_TARGET_FPS = 50;
export const DEFAULT_WINDOW = 90; // ~1.5s at 60fps

/** Rolling average of frame deltas (ms) over a fixed window. */
export class FrametimeMonitor {
    private samples: number[] = [];
    private sum = 0;

    constructor(private readonly window: number = DEFAULT_WINDOW) {}

    push(deltaMs: number): void {
        this.samples.push(deltaMs);
        this.sum += deltaMs;
        if (this.samples.length > this.window) {
            this.sum -= this.samples.shift() as number;
        }
    }

    full(): boolean {
        return this.samples.length >= this.window;
    }

    averageMs(): number {
        return this.samples.length === 0 ? 0 : this.sum / this.samples.length;
    }

    fps(): number {
        const avg = this.averageMs();
        return avg > 0 ? 1000 / avg : 0;
    }

    reset(): void {
        this.samples = [];
        this.sum = 0;
    }
}

/**
 * Downscale only when the average over a FULL window exceeds the per-frame
 * budget — i.e. sustainedly below target, not a transient spike (asset decode,
 * GC, tab restore).
 */
export function shouldDownscale(monitor: FrametimeMonitor, budgetMs: number): boolean {
    return monitor.full() && monitor.averageMs() > budgetMs;
}

/** Per-frame budget in ms for a target framerate. */
export function budgetMsFor(targetFps: number = DEFAULT_TARGET_FPS): number {
    return 1000 / targetFps;
}
