import { describe, it, expect } from 'vitest';
import { gpuTierFromRendererString } from '../probe';

describe('gpuTierFromRendererString', () => {
    it('buckets discrete NVIDIA/AMD/Apple GPUs high', () => {
        expect(gpuTierFromRendererString('Apple M2 Pro')).toBe(3);
        expect(gpuTierFromRendererString('NVIDIA GeForce RTX 4070')).toBe(3);
    });
    it('buckets integrated Intel mid-low', () => {
        expect(gpuTierFromRendererString('Intel(R) Iris(R) Xe Graphics')).toBe(2);
        expect(gpuTierFromRendererString('Intel(R) HD Graphics 4000')).toBe(1);
    });
    it('returns 0 for unknown/software', () => {
        expect(gpuTierFromRendererString('SwiftShader')).toBe(0);
        expect(gpuTierFromRendererString('')).toBe(0);
    });
});
