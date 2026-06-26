import { describe, it, expect, beforeEach } from 'vitest';
import { useGraphicsStore } from '../graphicsStore';

describe('useGraphicsStore', () => {
    beforeEach(() => {
        useGraphicsStore.setState({ preference: 'auto', fps: 0 });
    });
    it('defaults to auto preference and 0 fps', () => {
        const s = useGraphicsStore.getState();
        expect(s.preference).toBe('auto');
        expect(s.fps).toBe(0);
    });
    it('setPreference updates the preference', () => {
        useGraphicsStore.getState().setPreference('medium');
        expect(useGraphicsStore.getState().preference).toBe('medium');
        useGraphicsStore.getState().setPreference('auto');
        expect(useGraphicsStore.getState().preference).toBe('auto');
    });
    it('setFps updates fps', () => {
        useGraphicsStore.getState().setFps(58);
        expect(useGraphicsStore.getState().fps).toBe(58);
    });
});
