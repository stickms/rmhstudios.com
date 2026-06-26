import { describe, it, expect } from 'vitest';
import { detectTier, TIER_FLAGS, type RenderCaps } from '../tier';

const caps = (o: Partial<RenderCaps> = {}): RenderCaps => ({
    backend: 'WebGPU', gpuTier: 3, isMobile: false, ...o,
});

describe('detectTier', () => {
    it('gives ultra to a high-end desktop WebGPU GPU', () => {
        expect(detectTier(caps())).toBe('ultra');
    });
    it('caps a mid desktop WebGPU GPU at high', () => {
        expect(detectTier(caps({ gpuTier: 2 }))).toBe('high');
    });
    it('drops WebGL2 desktop to at most medium', () => {
        expect(detectTier(caps({ backend: 'WebGL2', gpuTier: 3 }))).toBe('medium');
    });
    it('always returns low on mobile', () => {
        expect(detectTier(caps({ isMobile: true, backend: 'WebGPU', gpuTier: 3 }))).toBe('low');
    });
    it('returns low for a weak GPU regardless of backend', () => {
        expect(detectTier(caps({ gpuTier: 0 }))).toBe('low');
    });
});

describe('TIER_FLAGS', () => {
    it('enables the full stack only on ultra', () => {
        expect(TIER_FLAGS.ultra.ssr && TIER_FLAGS.ultra.volumetrics).toBe(true);
        expect(TIER_FLAGS.high.ssr).toBe(false);
    });
    it('disables all post on low', () => {
        expect(TIER_FLAGS.low.bloom).toBe(false);
        expect(TIER_FLAGS.low.gtao).toBe(false);
    });
    it('scales shadow map size down by tier', () => {
        expect(TIER_FLAGS.ultra.shadowMapSize).toBeGreaterThan(TIER_FLAGS.medium.shadowMapSize);
    });
});
