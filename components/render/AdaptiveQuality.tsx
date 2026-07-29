'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { budgetMsFor, DEFAULT_TARGET_FPS, DEFAULT_WINDOW, FrametimeMonitor, shouldDownscale } from '@/lib/render/governor';

interface Props {
    /** `downscale` from `useRenderQuality` — called at most once per window. */
    onDownscale: () => void;
    /** Frames below this trigger a step down. */
    targetFps?: number;
    /** Optional readout for a settings/debug panel. */
    onFps?: (fps: number) => void;
}

const FPS_PUBLISH_EVERY = 20;

/**
 * Adaptive quality governor. Mount **inside** `<Canvas>`; renders nothing.
 *
 * Measures the real frame cadence and steps the render tier down when the
 * rolling average misses budget, so a weak GPU degrades gracefully instead of
 * grinding. Downscale-only — see `lib/render/governor.ts`.
 */
export default function AdaptiveQuality({ onDownscale, targetFps = DEFAULT_TARGET_FPS, onFps }: Props) {
    const monitor = useMemo(() => new FrametimeMonitor(DEFAULT_WINDOW), []);
    const budget = useMemo(() => budgetMsFor(targetFps), [targetFps]);
    const frames = useRef(0);

    useFrame((_, deltaRaw) => {
        // Clamp tab-stalls and asset-decode hitches so one 3s freeze doesn't
        // drag the average down and trigger a spurious downscale.
        monitor.push(Math.min(100, deltaRaw * 1000));

        frames.current++;
        if (onFps && frames.current % FPS_PUBLISH_EVERY === 0) {
            const avg = monitor.averageMs();
            if (avg > 0) onFps(Math.round(1000 / avg));
        }

        if (shouldDownscale(monitor, budget)) {
            onDownscale();
            monitor.reset(); // cooldown: re-sample a full window before stepping again
        }
    });

    return null;
}
