import { describe, it, expect } from 'vitest';
import { nextLowerTier, FrametimeMonitor, shouldDownscale } from '../governor';

describe('nextLowerTier', () => {
    it('steps down one level and floors at low', () => {
        expect(nextLowerTier('ultra')).toBe('high');
        expect(nextLowerTier('high')).toBe('medium');
        expect(nextLowerTier('medium')).toBe('low');
        expect(nextLowerTier('low')).toBe('low');
    });
});

describe('FrametimeMonitor', () => {
    it('is not full until the window fills, then averages a fixed window', () => {
        const m = new FrametimeMonitor(3);
        m.push(10); m.push(20);
        expect(m.full()).toBe(false);
        m.push(30);
        expect(m.full()).toBe(true);
        expect(m.averageMs()).toBeCloseTo(20, 5);
        m.push(60); // drops the oldest (10) → [20,30,60]
        expect(m.averageMs()).toBeCloseTo(110 / 3, 5);
    });
    it('reset empties the window', () => {
        const m = new FrametimeMonitor(2);
        m.push(10); m.push(10);
        m.reset();
        expect(m.full()).toBe(false);
        expect(m.averageMs()).toBe(0);
    });
});

describe('shouldDownscale', () => {
    it('is false until the window is full, even when slow', () => {
        const m = new FrametimeMonitor(3);
        m.push(50); m.push(50);
        expect(shouldDownscale(m, 20)).toBe(false);
    });
    it('is true when a full window averages over budget', () => {
        const m = new FrametimeMonitor(3);
        m.push(30); m.push(30); m.push(30);
        expect(shouldDownscale(m, 20)).toBe(true);
    });
    it('is false when a full window is within budget', () => {
        const m = new FrametimeMonitor(3);
        m.push(15); m.push(16); m.push(14);
        expect(shouldDownscale(m, 20)).toBe(false);
    });
});
