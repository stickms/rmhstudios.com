'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useRenderTier } from './RenderTierContext';
import { useGraphicsStore } from '@/lib/kowloon-knockout/render/graphicsStore';
import { FrametimeMonitor, shouldDownscale } from '@/lib/kowloon-knockout/render/governor';

const TARGET_FPS = 50;
const BUDGET_MS = 1000 / TARGET_FPS;   // 20ms
const WINDOW = 90;                      // ~1.5s at 60fps
const FPS_PUBLISH_EVERY = 20;           // throttle store writes

/** Adaptive FPS governor: in Auto mode, steps the render tier down one level
 *  when the rolling-average frametime stays over budget (never raises). Always
 *  publishes a smoothed FPS to the store for the menu readout. Renders nothing. */
export default function Governor() {
    const { preference, downscale } = useRenderTier();
    const setFps = useGraphicsStore((s) => s.setFps);
    const monitor = useMemo(() => new FrametimeMonitor(WINDOW), []);
    const frameCount = useRef(0);

    useFrame((_, deltaRaw) => {
        const deltaMs = Math.min(100, deltaRaw * 1000); // clamp tab-stalls
        monitor.push(deltaMs);

        frameCount.current++;
        if (frameCount.current % FPS_PUBLISH_EVERY === 0) {
            const avg = monitor.averageMs();
            if (avg > 0) setFps(Math.round(1000 / avg));
        }

        if (preference !== 'auto') return;
        if (shouldDownscale(monitor, BUDGET_MS)) {
            downscale();
            monitor.reset(); // cooldown: re-sample a full window before stepping again
        }
    });

    return null;
}
