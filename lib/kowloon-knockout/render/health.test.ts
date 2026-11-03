import { describe, expect, it } from 'vitest';
import { decideRecovery, FAIL_STREAK_LIMIT, STALL_LIMIT_MS, type RenderHealthSnapshot } from './health';
import { FrametimeMonitor, shouldDownscale } from './governor';

const snap = (over: Partial<RenderHealthSnapshot> = {}): RenderHealthSnapshot => ({
    ok: 100, failStreak: 0, fatal: false, lastOkAt: 10_000, since: 1_000, ...over,
});
const webgpu = { backendIsWebGPU: true, alreadyForcedWebGL: false, hidden: false };
const webgl = { backendIsWebGPU: false, alreadyForcedWebGL: false, hidden: false };

describe('decideRecovery', () => {
    it('leaves a painting renderer alone', () => {
        expect(decideRecovery(snap(), 10_500, webgpu)).toBe('none');
    });
    it('falls back to WebGL 2 when WebGPU loses its device', () => {
        expect(decideRecovery(snap({ fatal: true }), 10_100, webgpu)).toBe('force-webgl');
    });
    it('falls back after a sustained failure streak, not a single bad frame', () => {
        expect(decideRecovery(snap({ failStreak: 1 }), 10_100, webgpu)).toBe('none');
        expect(decideRecovery(snap({ failStreak: FAIL_STREAK_LIMIT }), 10_100, webgpu)).toBe('force-webgl');
    });
    it('treats a long stall as frozen but not a slow software renderer', () => {
        expect(decideRecovery(snap(), 10_000 + 4_500, webgl)).toBe('none');
        expect(decideRecovery(snap(), 10_000 + STALL_LIMIT_MS, webgl)).toBe('give-up');
    });
    it('gives up once WebGL 2 has also failed', () => {
        expect(decideRecovery(snap({ fatal: true }), 10_100, { ...webgpu, alreadyForcedWebGL: true })).toBe('give-up');
        expect(decideRecovery(snap({ fatal: true }), 10_100, webgl)).toBe('give-up');
    });
    it('never judges a hidden tab', () => {
        expect(decideRecovery(snap({ fatal: true }), 99_999, { ...webgpu, hidden: true })).toBe('none');
    });
});

describe('governor on a very slow machine', () => {
    it('downscales after a handful of frames, not a full 90-frame window', () => {
        const m = new FrametimeMonitor(90);
        for (let i = 0; i < 6; i++) m.push(100);
        expect(shouldDownscale(m, 20)).toBe(true);
    });
    it('ignores a short burst of one slow frame', () => {
        const m = new FrametimeMonitor(90);
        for (let i = 0; i < 5; i++) m.push(16);
        m.push(100);
        expect(shouldDownscale(m, 20)).toBe(false);
    });
});
