'use client';

/**
 * Pieces shared by the menu's 3D layers (MenuFighters3D behind the menus, FighterPreview3D on
 * character select): the neon lighting rig and the demand-mode frame driver.
 */
import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import type { MenuQuality } from '@/lib/kowloon-knockout/render/menuQuality';

/** A three-point neon rig: a warm key from the front, a hot-pink rim from behind-left and a cyan rim from
 *  behind-right (the card art's two inks), with a violet hemisphere fill so shadows stay plum, not black.
 *  Weak devices keep the key and the pink rim. */
export function NeonRig({ lights }: { lights: MenuQuality['lights'] }) {
    return (
        <>
            <hemisphereLight args={['#9a86d6', '#1a0b24', 0.85]} />
            <directionalLight position={[2.5, 4.5, 4]} intensity={1.6} color="#ffd9c0" />
            <pointLight position={[-3.2, 2.2, -1.4]} intensity={34} color="#ff2e88" distance={14} />
            {lights >= 2 && <pointLight position={[3.4, 2.0, -1.2]} intensity={30} color="#46e6ff" distance={14} />}
            {lights >= 3 && <pointLight position={[0, 0.8, 3.2]} intensity={7} color="#8f5cff" distance={10} />}
        </>
    );
}

/** Renders on a timer instead of every display frame: demand mode plus an fps cap, nothing while hidden. */
export function FrameDriver({ fps, active = true }: { fps: number; active?: boolean }) {
    const invalidate = useThree((s) => s.invalidate);
    useEffect(() => {
        if (!active) return;
        invalidate();
        const id = window.setInterval(() => { if (!document.hidden) invalidate(); }, 1000 / fps);
        return () => window.clearInterval(id);
    }, [fps, active, invalidate]);
    return null;
}
