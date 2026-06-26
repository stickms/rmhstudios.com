'use client';

import { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import StickFighter from './StickFighter';
import type { RenderFighter } from '@/lib/kowloon-knockout/net/session';
import type { FighterClass } from '@/lib/kowloon-knockout/game/fighters/types';
import { CLASS_DISPLAY, CLASS_STATS } from '@/lib/kowloon-knockout/game/fighters/stats';

function makeIdle(className: FighterClass): RenderFighter {
    const d = CLASS_DISPLAY[className];
    const s = CLASS_STATS[className];
    return {
        seat: 0, team: 0, className, displayName: d.name,
        color: d.color, accent: d.accent, isLocal: true,
        x: 0, z: 0, yaw: 0, state: 'idle', punch: null,
        punchFrame: 0, stateFrame: 0, hitFlash: 0,
        health: s.maxHealth, maxHealth: s.maxHealth,
        stamina: s.stamina, maxStamina: s.stamina, alive: true,
    };
}

function Spinner({ className }: { className: FighterClass }) {
    const framesRef = useRef<RenderFighter[]>([makeIdle(className)]);
    // Keep colours fresh when the class changes.
    framesRef.current[0] = { ...framesRef.current[0], ...makeIdle(className), yaw: framesRef.current[0].yaw };
    useFrame((_, delta) => { framesRef.current[0].yaw += delta * 0.7; });
    return (
        <group position={[0, -0.7, 0]}>
            <StickFighter seat={0} framesRef={framesRef} showNameplate={false} />
        </group>
    );
}

/** A small spinning 3D preview of a fighter for the character select screen. */
export default function FighterPreview3D({ fighterClass, size = 200 }: { fighterClass: FighterClass; size?: number }) {
    return (
        <div style={{ width: size, height: size }}>
            <Canvas dpr={0.6} camera={{ position: [0, 0.5, 3.4], fov: 42 }} gl={{ antialias: false }}>
                <ambientLight intensity={0.7} color="#8a7aaa" />
                <directionalLight position={[3, 5, 2]} intensity={1.3} color="#ffe0c0" />
                <pointLight position={[-3, 2, 2]} intensity={28} color="#ff3366" distance={20} />
                <pointLight position={[3, 1, 3]} intensity={20} color="#33ccff" distance={20} />
                <Spinner className={fighterClass} />
            </Canvas>
        </div>
    );
}
