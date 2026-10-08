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

/**
 * The governor's target for a display of `refreshHz`.
 *
 * A fixed 50fps target is right for a 60Hz panel and wrong for anything
 * faster: at 144Hz a scene holding 55fps never misses it, so the governor never
 * steps in and the player sees a third of the frames their display can show.
 * So the target follows the panel — 80% of its rate, so ordinary jitter never
 * trips it — floored at the old 50 (a 60Hz panel is unchanged) and capped at
 * 144Hz's share (≈115fps), because chasing 240fps would spend resolution on
 * frames few people can tell apart from 144. Downscale-only and at most three
 * steps (`useRenderQuality`), so the worst case is "one tier lower, smooth".
 */
export const MAX_TARGET_REFRESH_HZ = 144;
export const TARGET_SHARE_OF_REFRESH = 0.8;

export function targetFpsForRefresh(refreshHz: number): number {
    const hz = Math.min(Math.max(refreshHz, 0), MAX_TARGET_REFRESH_HZ);
    return Math.max(DEFAULT_TARGET_FPS, hz * TARGET_SHARE_OF_REFRESH);
}

/** Per-frame budget in ms for a target framerate. */
export function budgetMsFor(targetFps: number = DEFAULT_TARGET_FPS): number {
    return 1000 / targetFps;
}
