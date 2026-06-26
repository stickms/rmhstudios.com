import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { RenderTier } from './tier';

/** 'auto' = adaptive governor; a specific tier = locked (governor inert). */
export type TierPreference = 'auto' | RenderTier;

interface GraphicsState {
    preference: TierPreference;
    setPreference: (p: TierPreference) => void;
    /** Most recent smoothed FPS from the in-Canvas Governor (ephemeral). */
    fps: number;
    setFps: (n: number) => void;
}

export const useGraphicsStore = create<GraphicsState>()(
    persist(
        (set) => ({
            preference: 'auto',
            setPreference: (preference) => set({ preference }),
            fps: 0,
            setFps: (fps) => set({ fps }),
        }),
        {
            name: 'kk-graphics',
            // Node/SSR-safe: no storage when window is absent (persistence no-ops).
            storage: createJSONStorage(() => {
                if (typeof window !== 'undefined') {
                    return window.localStorage;
                }
                // Return no-op storage for Node/SSR environments
                return {
                    getItem: () => null,
                    setItem: () => undefined,
                    removeItem: () => undefined,
                } as unknown as Storage;
            }),
            // Persist only the user's preference; fps is runtime telemetry.
            partialize: (s) => ({ preference: s.preference }),
        },
    ),
);
