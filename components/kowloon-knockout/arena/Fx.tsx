'use client';

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { GameSession } from '@/lib/kowloon-knockout/net/session';

const MAX = 260;
const GRAVITY = 9;

interface Particle {
    x: number; y: number; z: number;
    vx: number; vy: number; vz: number;
    life: number; maxLife: number;
    size: number;
    color: THREE.Color;
    active: boolean;
}

/** Pooled, instanced spark bursts driven by the session's FX event queue. */
export default function Fx({ session }: { session: GameSession }) {
    const meshRef = useRef<THREE.InstancedMesh>(null);
    const dummy = useMemo(() => new THREE.Object3D(), []);
    const pool = useMemo<Particle[]>(
        () => Array.from({ length: MAX }, () => ({
            x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, maxLife: 1, size: 0.2,
            color: new THREE.Color(), active: false,
        })),
        [],
    );

    const spawn = (n: number, x: number, y: number, z: number, color: THREE.Color, power: number) => {
        for (let s = 0; s < n; s++) {
            const p = pool.find((q) => !q.active);
            if (!p) return;
            const a = Math.random() * Math.PI * 2;
            const up = Math.random() * 0.8 + 0.2;
            const spd = 1.5 + Math.random() * power;
            p.x = x; p.y = y; p.z = z;
            p.vx = Math.cos(a) * spd;
            p.vy = up * spd;
            p.vz = Math.sin(a) * spd;
            p.maxLife = 0.35 + Math.random() * 0.3;
            p.life = p.maxLife;
            p.size = 0.12 + Math.random() * 0.12;
            p.color.copy(color);
            p.active = true;
        }
    };

    useFrame((_, deltaRaw) => {
        const mesh = meshRef.current;
        if (!mesh) return;
        const delta = Math.min(0.05, deltaRaw);

        // Ingest new FX events.
        for (const e of session.drainFx()) {
            if (e.kind === 'hit') {
                spawn(Math.min(18, 6 + Math.round(e.power)), e.x, e.y, e.z, new THREE.Color(e.color), 3.5);
            } else if (e.kind === 'block') {
                spawn(6, e.x, e.y, e.z, new THREE.Color('#cfe8ff'), 2);
            } else if (e.kind === 'ko') {
                spawn(30, e.x, 1.1, e.z, new THREE.Color('#ffcc00'), 5);
            }
        }

        // Integrate + write instances.
        for (let i = 0; i < MAX; i++) {
            const p = pool[i];
            if (p.active) {
                p.life -= delta;
                if (p.life <= 0) {
                    p.active = false;
                } else {
                    p.vy -= GRAVITY * delta;
                    p.x += p.vx * delta;
                    p.y += p.vy * delta;
                    p.z += p.vz * delta;
                    if (p.y < 0.05) { p.y = 0.05; p.vy *= -0.4; p.vx *= 0.6; p.vz *= 0.6; }
                }
            }
            const frac = p.active ? p.life / p.maxLife : 0;
            dummy.position.set(p.x, p.y, p.z);
            dummy.scale.setScalar(p.active ? p.size * frac : 0);
            dummy.updateMatrix();
            mesh.setMatrixAt(i, dummy.matrix);
            mesh.setColorAt(i, p.active ? p.color : BLACK);
        }
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    });

    return (
        <instancedMesh ref={meshRef} args={[undefined, undefined, MAX]} frustumCulled={false}>
            <icosahedronGeometry args={[1, 0]} />
            <meshBasicMaterial toneMapped={false} transparent blending={THREE.AdditiveBlending} depthWrite={false} />
        </instancedMesh>
    );
}

const BLACK = new THREE.Color('#000000');
