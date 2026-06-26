'use client';

import { useRef, type MutableRefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { RenderFighter } from '@/lib/kowloon-knockout/net/session';

type FramesRef = MutableRefObject<RenderFighter[]>;

/**
 * Cinematic auto-framing camera: keeps every (living) fighter on screen by
 * tracking their centroid and pulling back as they spread out. A 3/4 angle
 * preserves the brawler read while showing depth.
 */
export default function CameraRig({ framesRef, shakeRef }: { framesRef: FramesRef; shakeRef: MutableRefObject<number> }) {
    const { camera } = useThree();
    const target = useRef(new THREE.Vector3(0, 1, 0));
    const lookAt = useRef(new THREE.Vector3(0, 1, 0));

    useFrame((state, delta) => {
        const fs = framesRef.current;
        const focus = fs.filter((f) => f.alive);
        const pool = focus.length ? focus : fs;
        if (pool.length === 0) return;

        let cx = 0, cz = 0;
        for (const f of pool) { cx += f.x; cz += f.z; }
        cx /= pool.length; cz /= pool.length;

        let spread = 4;
        for (const f of pool) spread = Math.max(spread, Math.hypot(f.x - cx, f.z - cz) * 2);

        const dist = THREE.MathUtils.clamp(spread * 1.25 + 7, 9, 22);
        const height = dist * 0.62;

        // Desired camera position: in front-ish (+Z) and above.
        const desired = new THREE.Vector3(cx * 0.6, height, cz * 0.6 + dist);
        const k = 1 - Math.pow(0.001, delta); // frame-rate independent damp
        target.current.lerp(desired, Math.min(1, k * 1.4));

        // Screen shake.
        const sh = shakeRef.current;
        const ox = sh > 0 ? (Math.random() - 0.5) * sh * 0.06 : 0;
        const oy = sh > 0 ? (Math.random() - 0.5) * sh * 0.06 : 0;
        camera.position.set(target.current.x + ox, target.current.y + oy, target.current.z);

        lookAt.current.lerp(new THREE.Vector3(cx, 1.1, cz), Math.min(1, k * 1.4));
        camera.lookAt(lookAt.current);

        if (shakeRef.current > 0) shakeRef.current *= 0.85;
    });

    return null;
}
