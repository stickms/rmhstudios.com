'use client';

import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import type * as THREE from 'three';
import Fighter from './Fighter';
import { FrameDriver, NeonRig } from './SceneKit';
import type { RenderFighter } from '@/lib/kowloon-knockout/net/session';
import type { FighterClass } from '@/lib/kowloon-knockout/game/fighters/types';
import { CLASS_DISPLAY, CLASS_STATS } from '@/lib/kowloon-knockout/game/fighters/stats';
import { previewAt } from '@/lib/kowloon-knockout/render/previewLoop';
import { resolveMenuQuality } from '@/lib/kowloon-knockout/render/menuQuality';
import { useGraphicsStore } from '@/lib/kowloon-knockout/render/graphicsStore';

function makeFrame(className: FighterClass, modelId: string): RenderFighter {
    const d = CLASS_DISPLAY[className];
    const s = CLASS_STATS[className];
    return {
        seat: 0, team: 0, className, modelId, displayName: d.name,
        color: d.color, accent: d.accent, isLocal: true,
        x: 0, z: 0, yaw: -0.5, state: 'idle', punch: null,
        punchFrame: 0, stateFrame: 0, actionProgress: 0, hitFlash: 0,
        health: s.maxHealth, maxHealth: s.maxHealth,
        stamina: s.stamina, maxStamina: s.stamina, alive: true,
    };
}

/** Runs the preview routine (previewLoop.ts) on the fighter: it bounces, throws each punch, guards. */
function Routine({ className, modelId }: { className: FighterClass; modelId: string }) {
    const framesRef = useRef<RenderFighter[]>([makeFrame(className, modelId)]);
    const clock = useRef(0);
    // Keep colours and the chosen model fresh when either changes.
    framesRef.current[0] = { ...framesRef.current[0], ...makeFrame(className, modelId) };
    useFrame((_, delta) => {
        clock.current += Math.min(0.1, delta);
        Object.assign(framesRef.current[0], previewAt(clock.current));
    });
    // The fighter stands on y = 0 (its feet and ring); the camera is aimed at its middle.
    return <Fighter seat={0} framesRef={framesRef} showNameplate={false} />;
}

const FOV = 34;
/** Frames a 1.8 m fighter in a square: a little breathing room above the head and below the ring. */
function PreviewCamera() {
    const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
    const invalidate = useThree((s) => s.invalidate);
    useEffect(() => {
        camera.position.set(0.5, 1.05, 4.3);
        camera.lookAt(0, 0.88, 0);
        camera.updateProjectionMatrix();
        invalidate();
    }, [camera, invalidate]);
    return null;
}

/** A 3D preview of the real in-match fighter (chosen model included) for the character select screen:
 *  it bounces on its toes and shows its punches. Quality follows the Graphics setting (a preview never
 *  switches off — it is the thing you are choosing). */
export default function FighterPreview3D({ fighterClass, modelId, size = 200 }: { fighterClass: FighterClass; modelId: string; size?: number }) {
    const setting = useGraphicsStore((s) => s.menuFighters);
    const preference = useGraphicsStore((s) => s.preference);
    const quality = useMemo(() => {
        if (typeof window === 'undefined') return resolveMenuQuality({ setting: 'pixel', preference, isMobile: true, devicePixelRatio: 1 });
        const nav = navigator as Navigator & { deviceMemory?: number };
        const q = resolveMenuQuality({
            setting: setting === 'off' ? 'auto' : setting, preference,
            isMobile: window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 640,
            devicePixelRatio: window.devicePixelRatio,
            deviceMemory: nav.deviceMemory,
            hardwareConcurrency: nav.hardwareConcurrency,
        });
        // The preview is small, so "pixel" would be a handful of chunky dots: keep it a little sharper.
        return q.mode === 'pixel' ? { ...q, dpr: Math.max(q.dpr, 0.75) } : q;
    }, [setting, preference]);

    return (
        // `key` remounts the canvas contents per model so the dispatcher's load state starts fresh.
        <div className="kk-model-preview" style={{ width: size, height: size }}>
            <Canvas
                key={quality.mode + (quality.antialias ? 'aa' : '')}
                frameloop="demand"
                dpr={quality.dpr}
                camera={{ fov: FOV, near: 0.1, far: 40, position: [0.5, 1.05, 4.3] }}
                gl={{ antialias: quality.antialias, alpha: true, stencil: false }}
                style={{ imageRendering: quality.mode === 'pixel' ? 'pixelated' : 'auto' }}
            >
                <PreviewCamera />
                <FrameDriver fps={quality.fps} />
                <NeonRig lights={quality.lights} />
                <Routine key={modelId} className={fighterClass} modelId={modelId} />
            </Canvas>
        </div>
    );
}
