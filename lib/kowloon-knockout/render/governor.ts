import type { RenderTier } from './tier';

const TIER_ORDER: RenderTier[] = ['low', 'medium', 'high', 'ultra'];

/** One tier down (ultra→high→medium→low); floors at low. */
export function nextLowerTier(tier: RenderTier): RenderTier {
    const i = TIER_ORDER.indexOf(tier);
    return i <= 0 ? 'low' : TIER_ORDER[i - 1];
}

/** Rolling average of frame deltas (ms) over a fixed window. */
export class FrametimeMonitor {
    private samples: number[] = [];
    constructor(private readonly window: number = 90) {}
    push(deltaMs: number): void {
        this.samples.push(deltaMs);
        if (this.samples.length > this.window) this.samples.shift();
    }
    full(): boolean {
        return this.samples.length >= this.window;
    }
    averageMs(): number {
        if (this.samples.length === 0) return 0;
        let sum = 0;
        for (const s of this.samples) sum += s;
        return sum / this.samples.length;
    }
    reset(): void {
        this.samples = [];
    }
}

/** Downscale only when the average over a FULL window exceeds the per-frame
 *  budget — i.e. FPS has been sustainedly below target, not a transient spike. */
export function shouldDownscale(monitor: FrametimeMonitor, budgetMs: number): boolean {
    return monitor.full() && monitor.averageMs() > budgetMs;
}
