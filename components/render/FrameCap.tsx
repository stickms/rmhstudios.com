'use client';

import { useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { FrameCap as FrameCapClock, markFrameCapped } from '@/lib/render/frame-cap';

interface Props {
    /**
     * Frames per second to render at, or `null` for every display frame (the
     * same cadence as `frameloop="always"`). Typically
     * `menuOpen ? MENU_BACKDROP_FPS : null` — see `lib/render/frame-cap.ts`.
     */
    fps: number | null;
}

/**
 * The frame loop for a `<Canvas frameloop="demand">`. Mount **inside** the
 * canvas; renders nothing.
 *
 * Uncapped, it re-requests a frame from inside every frame, which is exactly
 * `"always"`. Capped, a rAF loop requests one on the vsync ticks a
 * {@link FrameCapClock} lets through — vsync-aligned, so a 60fps cap on a 60Hz
 * panel draws every frame instead of beating against a timer. It
 * drives `demand` rather than switching `frameloop` because R3F's
 * `setFrameloop` zeroes `clock.elapsedTime`, which would make every
 * elapsed-time animation in the scene jump whenever a menu opened.
 *
 * `useFrame` deltas stay real time either way, so a world clock or a physics
 * step keeps its speed at the lower rate. A hidden tab still stops: the browser
 * runs no rAF callbacks in a background tab.
 */
export default function FrameCap({ fps }: Props) {
    const gl = useThree((s) => s.gl);
    const invalidate = useThree((s) => s.invalidate);

    useFrame(() => {
        if (fps === null) invalidate();
    });

    useEffect(() => {
        markFrameCapped(gl, fps !== null);
        if (fps === null) {
            invalidate();
            return () => markFrameCapped(gl, false);
        }
        const clock = new FrameCapClock();
        let id = 0;
        const tick = (timestamp: number) => {
            if (clock.tick(timestamp, 0, fps) !== null) invalidate();
            id = requestAnimationFrame(tick);
        };
        id = requestAnimationFrame(tick);
        return () => {
            cancelAnimationFrame(id);
            markFrameCapped(gl, false);
        };
    }, [fps, gl, invalidate]);

    return null;
}
