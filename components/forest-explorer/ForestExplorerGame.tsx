'use client';

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { PointerLockControls, Sky, Stars } from '@react-three/drei';
import { useRef, useState, useEffect, useMemo } from 'react';
import * as THREE from 'three';

// ─── Module-level constants ───────────────────────────────────────────────────
// Computed once at module load — mirrors ForestScene's deterministic RNG so
// collision radii are perfectly aligned with rendered tree positions.

const SCENE_RNG = (n: number) => {
    const x = Math.sin(n + 1) * 43758.5453;
    return x - Math.floor(x);
};

// 22% of trees are ancient giants (scale 1.80–2.55), rest are normal (0.45–1.35).
// MUST be used by both ForestScene and TREE_COLLIDERS to keep collision radii in sync.
const TREE_SCALE = (s: number): number => {
    const giant = SCENE_RNG(s + 4) < 0.22;
    return giant
        ? 1.8 + SCENE_RNG(s + 2) * 0.75   // 1.80 – 2.55
        : 0.45 + SCENE_RNG(s + 2) * 0.90;  // 0.45 – 1.35
};

const TREE_COLLIDERS: { x: number; z: number; r: number }[] = (() => {
    const out: { x: number; z: number; r: number }[] = [];
    for (let i = 0; i < 240; i++) {
        const s = i * 7.331;
        const angle = SCENE_RNG(s) * Math.PI * 2;
        const minR = i < 30 ? 7 : 15;
        const radius = minR + SCENE_RNG(s + 1) * 95;
        out.push({
            x: Math.cos(angle) * radius,
            z: Math.sin(angle) * radius,
            r: 0.28 * TREE_SCALE(s) + 0.45, // trunk base + player capsule
        });
    }
    return out;
})();

// ─── Types ────────────────────────────────────────────────────────────────────

type TimeOfDay = 'day' | 'night';

// ─── Tree ─────────────────────────────────────────────────────────────────────

type TreeProps = {
    position: [number, number, number];
    scale?: number;
    variety?: number;
};

function Tree({ position, scale = 1, variety = 0 }: TreeProps) {
    const groupRef = useRef<THREE.Group>(null);
    const phase = useMemo(() => Math.random() * Math.PI * 2, []);

    useFrame((state) => {
        if (groupRef.current) {
            groupRef.current.rotation.z =
                Math.sin(state.clock.elapsedTime * 0.7 + phase) * 0.012;
        }
    });

    const trunkColors = ['#7a5c32', '#6b4423', '#8a6440'];
    const foliagePalettes: [string, string, string][] = [
        ['#1a4d0f', '#276614', '#338019'],
        ['#14402a', '#1e6040', '#288053'],
        ['#2b4d14', '#3d6e1e', '#4f8a28'],
    ];

    const [dark, mid, light] = foliagePalettes[variety % 3];

    return (
        <group ref={groupRef} position={position}>
            <mesh position={[0, 1.5 * scale, 0]} castShadow>
                <cylinderGeometry args={[0.16 * scale, 0.26 * scale, 3 * scale, 7]} />
                <meshLambertMaterial color={trunkColors[variety % 3]} />
            </mesh>
            <mesh position={[0, 3.6 * scale, 0]} castShadow>
                <coneGeometry args={[1.9 * scale, 2.8 * scale, 7]} />
                <meshLambertMaterial color={dark} />
            </mesh>
            <mesh position={[0, 5.3 * scale, 0]} castShadow>
                <coneGeometry args={[1.35 * scale, 2.4 * scale, 7]} />
                <meshLambertMaterial color={mid} />
            </mesh>
            <mesh position={[0, 6.8 * scale, 0]} castShadow>
                <coneGeometry args={[0.75 * scale, 2.0 * scale, 7]} />
                <meshLambertMaterial color={light} />
            </mesh>
        </group>
    );
}

// ─── Rock ─────────────────────────────────────────────────────────────────────

type RockProps = { position: [number, number, number]; scale?: number };

function Rock({ position, scale = 1 }: RockProps) {
    const rotY = useMemo(() => Math.random() * Math.PI * 2, []);
    const rotX = useMemo(() => Math.random() * 0.4, []);
    return (
        <mesh position={position} rotation={[rotX, rotY, 0]} castShadow receiveShadow>
            <dodecahedronGeometry args={[0.38 * scale, 0]} />
            <meshLambertMaterial color="#7a7a6e" />
        </mesh>
    );
}

// ─── Mushroom ─────────────────────────────────────────────────────────────────

function Mushroom({ position }: { position: [number, number, number] }) {
    return (
        <group position={position}>
            <mesh position={[0, 0.13, 0]}>
                <cylinderGeometry args={[0.04, 0.07, 0.26, 6]} />
                <meshLambertMaterial color="#ede0c8" />
            </mesh>
            <mesh position={[0, 0.32, 0]}>
                <coneGeometry args={[0.19, 0.23, 8]} />
                <meshLambertMaterial color="#c0392b" />
            </mesh>
        </group>
    );
}

// ─── Ground ───────────────────────────────────────────────────────────────────

function Ground() {
    return (
        <>
            <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
                <planeGeometry args={[500, 500]} />
                <meshLambertMaterial color="#3a6b2e" />
            </mesh>
            {[
                [5, 5, 5] as [number, number, number],
                [-10, 0, 14] as [number, number, number],
                [18, 0, -8] as [number, number, number],
                [-6, 0, -20] as [number, number, number],
            ].map(([x, , z], i) => (
                <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.001, z]} receiveShadow>
                    <circleGeometry args={[3 + i * 1.5, 10]} />
                    <meshLambertMaterial color="#2b5220" transparent opacity={0.55} />
                </mesh>
            ))}
        </>
    );
}

// ─── Pond ─────────────────────────────────────────────────────────────────────

function Pond() {
    const waterRef = useRef<THREE.Mesh>(null);

    // THREE.Shape ellipse is the correct way to get elliptical geometry in R3F
    // (EllipseGeometry does not exist in the THREE namespace)
    const pondShape = useMemo(() => {
        const s = new THREE.Shape();
        s.ellipse(0, 0, 7, 5, 0, Math.PI * 2, false, 0);
        return s;
    }, []);

    const highlightShape = useMemo(() => {
        const s = new THREE.Shape();
        s.ellipse(0, 0, 4, 2.8, 0, Math.PI * 2, false, 0);
        return s;
    }, []);

    useFrame((state) => {
        if (!waterRef.current) return;
        const mat = waterRef.current.material as THREE.MeshStandardMaterial;
        mat.opacity = 0.82 + Math.sin(state.clock.elapsedTime * 0.6) * 0.06;
        mat.emissiveIntensity = 0.04 + Math.sin(state.clock.elapsedTime * 0.4) * 0.02;
    });

    // Pond rocks placed around the perimeter
    const pondRocks: [number, number, number, number][] = [
        [28,  0.15, -28, 0.9],
        [33,  0.12, -22, 0.7],
        [34,  0.10, -18, 0.5],
        [23,  0.14, -17, 0.8],
        [22,  0.10, -26, 0.6],
        [30,  0.18, -29, 1.1],
        [36,  0.12, -24, 0.6],
        [26,  0.10, -16, 0.5],
    ];

    // Reeds clustered at one end
    const reeds: [number, number, number][] = [
        [23.5, 0, -18.5],
        [24.2, 0, -19.8],
        [22.8, 0, -20.4],
        [24.8, 0, -18.2],
        [23.1, 0, -21.0],
    ];

    return (
        <group>
            {/* Dark ground patch beneath pond */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[28, 0.002, -22]}>
                <circleGeometry args={[9, 14]} />
                <meshLambertMaterial color="#1e3d28" />
            </mesh>

            {/* Main water ellipse */}
            <mesh
                ref={waterRef}
                rotation={[-Math.PI / 2, 0, 0]}
                position={[28, 0.04, -22]}
            >
                <shapeGeometry args={[pondShape, 18]} />
                <meshStandardMaterial
                    color="#1a4a6b"
                    roughness={0.05}
                    metalness={0.15}
                    transparent
                    opacity={0.88}
                    emissive={new THREE.Color('#0a2030')}
                    emissiveIntensity={0.04}
                />
            </mesh>

            {/* Inner highlight */}
            <mesh rotation={[-Math.PI / 2, 0.3, 0]} position={[27, 0.05, -22.5]}>
                <shapeGeometry args={[highlightShape, 14]} />
                <meshStandardMaterial
                    color="#2a6a9b"
                    roughness={0.02}
                    transparent
                    opacity={0.35}
                />
            </mesh>

            {/* Perimeter rocks */}
            {pondRocks.map(([x, y, z, s], i) => (
                <mesh
                    key={i}
                    position={[x, y, z]}
                    rotation={[Math.sin(i) * 0.3, i * 1.3, 0]}
                    castShadow
                >
                    <dodecahedronGeometry args={[0.38 * s, 0]} />
                    <meshLambertMaterial color="#6a6a5e" />
                </mesh>
            ))}

            {/* Reeds */}
            {reeds.map(([x, , z], i) => (
                <group key={i} position={[x, 0, z]}>
                    <mesh position={[0, 0.55, 0]}>
                        <cylinderGeometry args={[0.025, 0.03, 1.1, 5]} />
                        <meshLambertMaterial color="#4a7a30" />
                    </mesh>
                    {/* Reed head */}
                    <mesh position={[0, 1.2, 0]}>
                        <cylinderGeometry args={[0.05, 0.04, 0.22, 6]} />
                        <meshLambertMaterial color="#5a3a1a" />
                    </mesh>
                </group>
            ))}
        </group>
    );
}

// ─── Fireflies ────────────────────────────────────────────────────────────────

function Fireflies({ night }: { night: boolean }) {
    const pointsRef = useRef<THREE.Points>(null);
    const COUNT = 60;

    const { geometry, phases } = useMemo(() => {
        const positions = new Float32Array(COUNT * 3);
        const ph: number[] = [];
        for (let i = 0; i < COUNT; i++) {
            positions[i * 3] = (Math.random() - 0.5) * 70;
            positions[i * 3 + 1] = 0.5 + Math.random() * 3.5;
            positions[i * 3 + 2] = (Math.random() - 0.5) * 70;
            ph.push(Math.random() * Math.PI * 2);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        return { geometry: geo, phases: ph };
    }, []);

    useFrame((state) => {
        if (!pointsRef.current) return;
        const pos = pointsRef.current.geometry.attributes.position.array as Float32Array;
        const t = state.clock.elapsedTime;
        for (let i = 0; i < COUNT; i++) {
            pos[i * 3 + 1] =
                1.2 + Math.sin(t * 1.4 + phases[i]) * 0.6 + Math.sin(t * 0.6 + phases[i] * 2) * 0.3;
        }
        pointsRef.current.geometry.attributes.position.needsUpdate = true;
        const mat = pointsRef.current.material as THREE.PointsMaterial;
        const base = night ? 0.72 : 0.45;
        mat.opacity = base + Math.sin(t * 1.5) * 0.2;
        mat.size = night ? 0.09 : 0.065;
    });

    return (
        <points ref={pointsRef} geometry={geometry}>
            <pointsMaterial color="#d4ff70" size={0.065} transparent opacity={0.6} sizeAttenuation />
        </points>
    );
}

// ─── Ground Mist ─────────────────────────────────────────────────────────────

function Mist() {
    const pointsRef = useRef<THREE.Points>(null);
    const COUNT = 350;

    const geometry = useMemo(() => {
        const positions = new Float32Array(COUNT * 3);
        for (let i = 0; i < COUNT; i++) {
            positions[i * 3] = (Math.random() - 0.5) * 160;
            positions[i * 3 + 1] = Math.random() * 0.7;
            positions[i * 3 + 2] = (Math.random() - 0.5) * 160;
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        return geo;
    }, []);

    useFrame((state) => {
        if (pointsRef.current) {
            pointsRef.current.rotation.y = state.clock.elapsedTime * 0.004;
        }
    });

    return (
        <points ref={pointsRef} geometry={geometry}>
            <pointsMaterial color="#c8e6c0" size={0.9} transparent opacity={0.07} sizeAttenuation />
        </points>
    );
}

// ─── Clouds ──────────────────────────────────────────────────────────────────

const CLOUD_PUFFS: [number, number, number, number][] = [
    [0,    0,   0,   2.2],
    [2.2,  0.5, 0,   1.8],
    [-2.0, 0.4, 0.3, 1.6],
    [1.0,  1.2, 0,   1.3],
    [-0.8, 1.1, 0.2, 1.1],
    [3.2, -0.2, 0.2, 1.2],
    [-3.0,-0.2,-0.2, 1.1],
    [0.3,  1.8, 0,   0.9],
];

function CloudPuff({ position, scale, color }: { position: [number, number, number]; scale: number; color: string }) {
    return (
        <group position={position} scale={scale}>
            {CLOUD_PUFFS.map(([x, y, z, r], i) => (
                <mesh key={i} position={[x, y, z]}>
                    <sphereGeometry args={[r, 7, 5]} />
                    <meshLambertMaterial color={color} transparent opacity={0.82} />
                </mesh>
            ))}
        </group>
    );
}

function Clouds({ night }: { night: boolean }) {
    const cloudData = useMemo(() => {
        const rng = (n: number) => { const x = Math.sin(n + 1) * 43758.5453; return x - Math.floor(x); };
        return Array.from({ length: 14 }, (_, i) => ({
            id: i,
            x: (rng(i * 7.33) - 0.5) * 220,
            y: 42 + rng(i * 3.11) * 18,
            z: (rng(i * 11.71) - 0.5) * 220,
            scale: 0.9 + rng(i * 5.9) * 1.4,
            speed: 0.6 + rng(i * 2.3) * 0.8,
        }));
    }, []);

    const refs = useRef<(THREE.Group | null)[]>([]);

    useFrame((_, delta) => {
        refs.current.forEach((ref, i) => {
            if (!ref) return;
            ref.position.x += cloudData[i].speed * delta;
            if (ref.position.x > 120) ref.position.x = -120;
        });
    });

    const cloudColor = night ? '#1a1f2a' : '#f0f4f0';

    return (
        <>
            {cloudData.map((c, i) => (
                <group key={c.id} ref={(el) => { refs.current[i] = el; }} position={[c.x, c.y, c.z]}>
                    <CloudPuff position={[0, 0, 0]} scale={c.scale} color={cloudColor} />
                </group>
            ))}
        </>
    );
}

// ─── Moon ─────────────────────────────────────────────────────────────────────

function Moon() {
    return (
        <mesh position={[-200, 150, -200]}>
            <sphereGeometry args={[8, 16, 12]} />
            <meshStandardMaterial
                color="#e8eef5"
                emissive={new THREE.Color('#c8d8f0')}
                emissiveIntensity={0.6}
                roughness={0.9}
            />
        </mesh>
    );
}

// ─── Grass Border ─────────────────────────────────────────────────────────────
// Static grass clumps ringing r≈112 to fill the visual gap between the player's
// movement area and the first trunk ring.  No animation — zero per-frame cost.

function GrassBorder() {
    const blades = useMemo(() => {
        const rng = (n: number) => { const x = Math.sin(n + 77) * 43758.5453; return x - Math.floor(x); };
        const colors = ['#2d6020', '#3d7828', '#4a8a2a', '#234e18', '#3a6e24'];
        const out: Array<{
            id: number;
            position: [number, number, number];
            rotY: number;
            rotX: number;
            width: number;
            height: number;
            color: string;
        }> = [];

        let id = 0;

        // Ring 1 — inner boundary edge (r≈109–115), dense
        const ring1Count = 260;
        for (let c = 0; c < ring1Count; c++) {
            const baseAngle = (c / ring1Count) * Math.PI * 2;
            for (let b = 0; b < 7; b++) {  // 7 blades per clump
                const sc = c * 17.3 + b * 3.7;
                const jitterAngle = baseAngle + (rng(sc) - 0.5) * 0.14;
                const jitterR = 112 + (rng(sc + 1) - 0.5) * 6;
                out.push({
                    id: id++,
                    position: [Math.cos(jitterAngle) * jitterR, 0, Math.sin(jitterAngle) * jitterR],
                    rotY: rng(sc + 2) * Math.PI * 2,
                    rotX: 0.08 + rng(sc + 3) * 0.18,
                    width: 0.12 + rng(sc + 4) * 0.09,
                    height: 1.4 + rng(sc + 5) * 1.2,
                    color: colors[Math.floor(rng(sc + 6) * 5)],
                });
            }
        }

        // Ring 2 — deeper, into the tree ring zone (r≈117–125), tall & wispy
        const ring2Count = 160;
        for (let c = 0; c < ring2Count; c++) {
            const baseAngle = (c / ring2Count) * Math.PI * 2 + Math.PI / ring2Count;
            for (let b = 0; b < 5; b++) {
                const sc = c * 23.7 + b * 5.1 + 9000;
                const jitterAngle = baseAngle + (rng(sc) - 0.5) * 0.16;
                const jitterR = 121 + (rng(sc + 1) - 0.5) * 8;
                out.push({
                    id: id++,
                    position: [Math.cos(jitterAngle) * jitterR, 0, Math.sin(jitterAngle) * jitterR],
                    rotY: rng(sc + 2) * Math.PI * 2,
                    rotX: 0.05 + rng(sc + 3) * 0.12,
                    width: 0.14 + rng(sc + 4) * 0.10,
                    height: 2.0 + rng(sc + 5) * 1.5,  // taller between trunks
                    color: colors[Math.floor(rng(sc + 6) * 5)],
                });
            }
        }

        return out;
    }, []);

    return (
        <>
            {blades.map((b) => (
                <mesh
                    key={b.id}
                    position={[b.position[0], b.height / 2, b.position[2]]}
                    rotation={[b.rotX, b.rotY, 0]}
                >
                    <planeGeometry args={[b.width, b.height]} />
                    <meshLambertMaterial color={b.color} side={THREE.DoubleSide} />
                </mesh>
            ))}
        </>
    );
}

// ─── Boundary Wall ────────────────────────────────────────────────────────────

function BoundaryWall() {
    const wallTrees = useMemo(() => {
        const rng = (n: number) => { const x = Math.sin(n + 99) * 43758.5453; return x - Math.floor(x); };
        const trees: Array<{ id: number; position: [number, number, number]; scale: number; variety: number }> = [];

        // Ring 1: radius 118, spacing ~3.5 units
        const r1 = 118;
        const count1 = Math.floor((2 * Math.PI * r1) / 3.5);
        for (let i = 0; i < count1; i++) {
            const angle = (i / count1) * Math.PI * 2;
            const spread = (rng(i * 3.7) - 0.5) * 2; // slight radial jitter
            const r = r1 + spread;
            trees.push({
                id: i,
                position: [Math.cos(angle) * r, 0, Math.sin(angle) * r],
                scale: 2.0 + rng(i * 2.1) * 0.8,
                variety: i % 3,
            });
        }

        // Ring 2: radius 122, offset by half a step
        const r2 = 122;
        const count2 = Math.floor((2 * Math.PI * r2) / 3.8);
        const offset2 = Math.PI / count2;
        for (let i = 0; i < count2; i++) {
            const angle = (i / count2) * Math.PI * 2 + offset2;
            const spread = (rng(i * 5.3 + 500) - 0.5) * 2;
            const r = r2 + spread;
            trees.push({
                id: count1 + i,
                position: [Math.cos(angle) * r, 0, Math.sin(angle) * r],
                scale: 2.1 + rng(i * 3.3 + 500) * 0.9,
                variety: (i + 1) % 3,
            });
        }

        // Ring 3: radius 126, tighter spacing to fill gaps
        const r3 = 126;
        const count3 = Math.floor((2 * Math.PI * r3) / 2.8);
        const offset3 = (Math.PI * 0.7) / count3;
        for (let i = 0; i < count3; i++) {
            const angle = (i / count3) * Math.PI * 2 + offset3;
            const spread = (rng(i * 4.1 + 1000) - 0.5) * 1.5;
            const r = r3 + spread;
            trees.push({
                id: count1 + count2 + i,
                position: [Math.cos(angle) * r, 0, Math.sin(angle) * r],
                scale: 2.2 + rng(i * 2.7 + 1000) * 0.7,
                variety: (i + 2) % 3,
            });
        }

        // Ring 4: radius 130, deepest ring — closes all remaining sight-lines
        const r4 = 130;
        const count4 = Math.floor((2 * Math.PI * r4) / 3.2);
        const offset4 = Math.PI / count4;
        for (let i = 0; i < count4; i++) {
            const angle = (i / count4) * Math.PI * 2 + offset4;
            const spread = (rng(i * 6.1 + 1500) - 0.5) * 1.8;
            const r = r4 + spread;
            trees.push({
                id: count1 + count2 + count3 + i,
                position: [Math.cos(angle) * r, 0, Math.sin(angle) * r],
                scale: 2.0 + rng(i * 4.1 + 1500) * 1.0,
                variety: i % 3,
            });
        }

        return trees;
    }, []);

    return (
        <>
            {wallTrees.map((t) => (
                <Tree key={t.id} position={t.position} scale={t.scale} variety={t.variety} />
            ))}
        </>
    );
}

// ─── Forest Scene ─────────────────────────────────────────────────────────────

function ForestScene() {
    const data = useMemo(() => {
        const rng = (n: number) => {
            const x = Math.sin(n + 1) * 43758.5453;
            return x - Math.floor(x);
        };

        const trees: Array<{ id: number; position: [number, number, number]; scale: number; variety: number }> = [];
        const rocks: Array<{ id: number; position: [number, number, number]; scale: number }> = [];
        const mushrooms: Array<{ id: number; position: [number, number, number] }> = [];

        for (let i = 0; i < 240; i++) {
            const s = i * 7.331;
            const angle = rng(s) * Math.PI * 2;
            const minR = i < 30 ? 7 : 15;
            const radius = minR + rng(s + 1) * 95; // expanded from 72
            trees.push({
                id: i,
                position: [Math.cos(angle) * radius, 0, Math.sin(angle) * radius],
                scale: TREE_SCALE(s),  // uses module-level helper (in sync with TREE_COLLIDERS)
                variety: Math.floor(rng(s + 3) * 3),
            });
        }

        for (let i = 0; i < 45; i++) {
            const s = i * 13.71 + 1000;
            const angle = rng(s) * Math.PI * 2;
            const radius = 4 + rng(s + 1) * 60; // expanded from 45
            rocks.push({
                id: i,
                position: [Math.cos(angle) * radius, 0.18, Math.sin(angle) * radius],
                scale: 0.5 + rng(s + 2) * 1.6,
            });
        }

        for (let i = 0; i < 35; i++) {
            const s = i * 19.27 + 2000;
            const angle = rng(s) * Math.PI * 2;
            const radius = 3 + rng(s + 1) * 45; // expanded from 30
            mushrooms.push({
                id: i,
                position: [Math.cos(angle) * radius, 0, Math.sin(angle) * radius],
            });
        }

        return { trees, rocks, mushrooms };
    }, []);

    return (
        <>
            {data.trees.map((t) => (
                <Tree key={t.id} position={t.position} scale={t.scale} variety={t.variety} />
            ))}
            {data.rocks.map((r) => (
                <Rock key={r.id} position={r.position} scale={r.scale} />
            ))}
            {data.mushrooms.map((m) => (
                <Mushroom key={m.id} position={m.position} />
            ))}
        </>
    );
}

// ─── Tiki Torches ─────────────────────────────────────────────────────────────

function TikiTorch({ position, phase }: { position: [number, number, number]; phase: number }) {
    const innerFlameRef = useRef<THREE.Mesh>(null);
    const midFlameRef   = useRef<THREE.Mesh>(null);
    const glowRef       = useRef<THREE.Mesh>(null);
    const lightRef      = useRef<THREE.PointLight>(null);

    useFrame((state) => {
        const t = state.clock.elapsedTime;
        const flicker = Math.sin(t * 7 + phase) * 0.5 + Math.sin(t * 13 + phase * 2) * 0.3;

        if (innerFlameRef.current) {
            innerFlameRef.current.scale.y = 0.85 + flicker * 0.18;
            innerFlameRef.current.position.y = 2.55 + flicker * 0.05;
            const mat = innerFlameRef.current.material as THREE.MeshStandardMaterial;
            mat.emissiveIntensity = 2.0 + flicker * 2.5;
        }
        if (midFlameRef.current) {
            midFlameRef.current.scale.y = 0.9 + flicker * 0.12;
            const mat = midFlameRef.current.material as THREE.MeshStandardMaterial;
            mat.emissiveIntensity = 1.2 + flicker * 1.3;
        }
        if (glowRef.current) {
            const mat = glowRef.current.material as THREE.MeshStandardMaterial;
            mat.opacity = 0.18 + flicker * 0.10;
        }
        if (lightRef.current) {
            lightRef.current.intensity = 9 + flicker * 2;
        }
    });

    return (
        <group position={position}>
            {/* Pole */}
            <mesh position={[0, 1.1, 0]}>
                <cylinderGeometry args={[0.06, 0.08, 2.2, 6]} />
                <meshLambertMaterial color="#6b3e1a" />
            </mesh>
            {/* Bamboo notches */}
            {[0.5, 1.0, 1.5].map((y, i) => (
                <mesh key={i} position={[0, y, 0]}>
                    <cylinderGeometry args={[0.075, 0.075, 0.07, 6]} />
                    <meshLambertMaterial color="#8a5a28" />
                </mesh>
            ))}
            {/* Torch head */}
            <mesh position={[0, 2.35, 0]}>
                <cylinderGeometry args={[0.18, 0.12, 0.28, 7]} />
                <meshLambertMaterial color="#3a2000" />
            </mesh>
            {/* Base bloom — widest, translucent */}
            <mesh position={[0, 2.38, 0]}>
                <coneGeometry args={[0.20, 0.12, 6]} />
                <meshStandardMaterial color="#ffaa00" transparent opacity={0.55} />
            </mesh>
            {/* Mid flame body */}
            <mesh ref={midFlameRef} position={[0, 2.44, 0]}>
                <coneGeometry args={[0.13, 0.22, 6]} />
                <meshStandardMaterial
                    color="#ff6600"
                    emissive={new THREE.Color('#ff4400')}
                    emissiveIntensity={1.2}
                />
            </mesh>
            {/* Inner hot core — narrow, tall */}
            <mesh ref={innerFlameRef} position={[0, 2.55, 0]}>
                <coneGeometry args={[0.06, 0.32, 6]} />
                <meshStandardMaterial
                    color="#ff2200"
                    emissive={new THREE.Color('#ff0000')}
                    emissiveIntensity={2.0}
                />
            </mesh>
            {/* Outer glow halo */}
            <mesh ref={glowRef} position={[0, 2.48, 0]}>
                <sphereGeometry args={[0.22, 8, 6]} />
                <meshStandardMaterial color="#ffaa00" transparent opacity={0.18} />
            </mesh>
            {/* Point light */}
            <pointLight ref={lightRef} color="#ff8833" intensity={9} distance={44} decay={1.5} />
        </group>
    );
}

function TikiTorches() {
    const torches = useMemo(() => {
        const positions: { pos: [number, number, number]; phase: number }[] = [];
        // Four rings spread across the full map interior.
        // Each candidate position is nudged up to 8 times to avoid landing inside a tree trunk.
        const rings = [
            { r: 8,  count: 6,  offset: 0 },
            { r: 25, count: 8,  offset: Math.PI / 8 },
            { r: 50, count: 12, offset: Math.PI / 12 },
            { r: 80, count: 16, offset: Math.PI / 16 },
        ];
        let id = 0;
        for (const { r, count, offset } of rings) {
            for (let i = 0; i < count; i++) {
                let angle = (i / count) * Math.PI * 2 + offset;
                for (let attempt = 0; attempt <= 8; attempt++) {
                    const cx = Math.cos(angle) * r;
                    const cz = Math.sin(angle) * r;
                    const blocked = TREE_COLLIDERS.some((t) => {
                        const dx = cx - t.x, dz = cz - t.z;
                        return dx * dx + dz * dz < (t.r + 1.5) * (t.r + 1.5);
                    });
                    if (!blocked) {
                        positions.push({ pos: [cx, 0, cz], phase: id * 1.37 });
                        id++;
                        break;
                    }
                    angle += 0.12; // nudge ~7° and retry
                }
            }
        }
        return positions;
    }, []);

    return (
        <>
            {torches.map((t, i) => (
                <TikiTorch key={i} position={t.pos} phase={t.phase} />
            ))}
        </>
    );
}

// ─── Flashlight ───────────────────────────────────────────────────────────────
// Attaches a SpotLight as a child of the camera so it automatically follows
// position and look direction — no per-frame work required.

function Flashlight() {
    const { camera, scene } = useThree();
    const lightRef = useRef<THREE.SpotLight | null>(null);
    const dir = useMemo(() => new THREE.Vector3(), []);

    // Add light + target to the scene (not camera) so Three.js can update matrices
    useEffect(() => {
        const light = new THREE.SpotLight('#ccdeff', 16, 65, 0.4, 0.5, 1.4);
        light.castShadow = false;
        scene.add(light);
        scene.add(light.target);
        lightRef.current = light;
        return () => {
            scene.remove(light);
            scene.remove(light.target);
            lightRef.current = null;
        };
    }, [scene]);

    // Each frame: snap light to camera, point target 6 units ahead
    useFrame(() => {
        const light = lightRef.current;
        if (!light) return;
        camera.getWorldDirection(dir);
        light.position.copy(camera.position);
        light.target.position.copy(camera.position).addScaledVector(dir, 6);
        light.target.updateMatrixWorld();
    });

    return null;
}

// ─── Player Controller ────────────────────────────────────────────────────────

const GROUND_Y = 1.7;
const GRAVITY   = 22;
const JUMP_VEL  = 9;

function Player() {
    const { camera } = useThree();
    const keys       = useRef<Record<string, boolean>>({});
    const localVel   = useRef(new THREE.Vector2(0, 0));
    const verticalVel = useRef(0);
    const isGrounded  = useRef(true);

    useEffect(() => {
        camera.position.set(0, GROUND_Y, 0);

        const down = (e: KeyboardEvent) => {
            keys.current[e.code] = true;
            // Jump on Space — only if grounded
            if (e.code === 'Space' && isGrounded.current) {
                verticalVel.current = JUMP_VEL;
                isGrounded.current = false;
                e.preventDefault(); // prevent page scroll
            }
        };
        const up = (e: KeyboardEvent) => { keys.current[e.code] = false; };

        window.addEventListener('keydown', down);
        window.addEventListener('keyup', up);
        return () => {
            window.removeEventListener('keydown', down);
            window.removeEventListener('keyup', up);
        };
    }, [camera]);

    useFrame((_, delta) => {
        const k = keys.current;

        // Horizontal movement (local camera space)
        const input = new THREE.Vector2(0, 0);
        if (k['KeyW'] || k['ArrowUp'])    input.y += 1;
        if (k['KeyS'] || k['ArrowDown'])  input.y -= 1;
        if (k['KeyA'] || k['ArrowLeft'])  input.x -= 1;
        if (k['KeyD'] || k['ArrowRight']) input.x += 1;

        const speed = (k['ShiftLeft'] || k['ShiftRight']) ? 9 : 5;
        if (input.lengthSq() > 0) input.normalize().multiplyScalar(speed);
        localVel.current.lerp(input, 0.15);

        const camForward = new THREE.Vector3();
        camera.getWorldDirection(camForward);
        camForward.y = 0;
        camForward.normalize();

        const camRight = new THREE.Vector3();
        camRight.crossVectors(camForward, new THREE.Vector3(0, 1, 0));

        const move = new THREE.Vector3();
        move.addScaledVector(camForward, localVel.current.y * delta);
        move.addScaledVector(camRight,   localVel.current.x * delta);

        // Circular boundary (matches the circular tree wall) then tree collision
        let nx = camera.position.x + move.x;
        let nz = camera.position.z + move.z;
        const boundDist = Math.sqrt(nx * nx + nz * nz);
        if (boundDist > 115) { nx = (nx / boundDist) * 115; nz = (nz / boundDist) * 115; }

        for (const t of TREE_COLLIDERS) {
            const dx = nx - t.x;
            const dz = nz - t.z;
            const distSq = dx * dx + dz * dz;
            if (distSq > 225 || distSq === 0) continue; // skip trees >15 units away
            const minDist = t.r;
            if (distSq < minDist * minDist) {
                const dist = Math.sqrt(distSq);
                nx = t.x + (dx / dist) * minDist;
                nz = t.z + (dz / dist) * minDist;
            }
        }

        camera.position.x = nx;
        camera.position.z = nz;

        // Vertical physics
        if (!isGrounded.current) {
            verticalVel.current -= GRAVITY * delta;
            camera.position.y += verticalVel.current * delta;
            if (camera.position.y <= GROUND_Y) {
                camera.position.y = GROUND_Y;
                verticalVel.current = 0;
                isGrounded.current = true;
            }
        }
    });

    return null;
}

// ─── Scene ────────────────────────────────────────────────────────────────────

function Scene({
    onLock,
    onUnlock,
    night,
    flashlightOn,
}: {
    onLock: () => void;
    onUnlock: () => void;
    night: boolean;
    flashlightOn: boolean;
}) {
    return (
        <>
            {/* Night: solid dark background replaces the Sky shader entirely */}
            {night && <color attach="background" args={['#050914']} />}

            {/* Fog — night has tighter far plane so torches pop against darkness */}
            {night
                ? <fog attach="fog" args={['#060d1a', 20, 85]} />
                : <fog attach="fog" args={['#8aba82', 28, 130]} />
            }

            {/* Ambient */}
            <ambientLight
                intensity={night ? 0.06 : 0.55}
                color={night ? '#1a2a50' : '#c0d8a8'}
            />

            {/* Main directional (sun day / moon night) */}
            <directionalLight
                position={night ? [-60, 90, -40] : [60, 80, 40]}
                intensity={night ? 0.18 : 1.6}
                color={night ? '#8aa8d0' : '#fde68a'}
                castShadow
                shadow-mapSize={[2048, 2048] as unknown as number}
                shadow-camera-far={200}
                shadow-camera-left={-100}
                shadow-camera-right={100}
                shadow-camera-top={100}
                shadow-camera-bottom={-100}
            />

            {/* Fill light */}
            <directionalLight
                position={[-50, 25, -50]}
                intensity={night ? 0.03 : 0.28}
                color={night ? '#040810' : '#a8d4f5'}
            />

            {/* Sky — day only; at night the solid background + Stars take over */}
            {!night && (
                <Sky
                    sunPosition={[60, 12, 40]}
                    turbidity={5}
                    rayleigh={2.2}
                    mieCoefficient={0.004}
                    mieDirectionalG={0.8}
                />
            )}

            {/* Stars — faint by day, vivid at night */}
            <Stars
                radius={280}
                depth={50}
                count={night ? 3000 : 800}
                factor={night ? 6 : 4}
                fade
                speed={0.5}
            />

            {/* Moon mesh — night only */}
            {night && <Moon />}

            <Ground />
            <Pond />
            <ForestScene />
            <GrassBorder />
            <BoundaryWall />
            <Clouds night={night} />
            <Fireflies night={night} />
            <Mist />
            {/* Tiki torches — night only */}
            {night && <TikiTorches />}
            {/* Flashlight — night only, toggled by F key */}
            {night && flashlightOn && <Flashlight />}
            <Player />

            <PointerLockControls onLock={onLock} onUnlock={onUnlock} />
        </>
    );
}

// ─── Export ───────────────────────────────────────────────────────────────────

export function ForestExplorerGame() {
    const [locked, setLocked] = useState(false);
    const [mode, setMode] = useState<TimeOfDay>('day');
    const [flashlightOn, setFlashlightOn] = useState(false);
    const night = mode === 'night';

    // Stable refs so the keydown listener never needs to be re-added
    const nightRef  = useRef(night);
    const lockedRef = useRef(locked);
    useEffect(() => { nightRef.current  = night;  }, [night]);
    useEffect(() => { lockedRef.current = locked; }, [locked]);

    // F key toggles flashlight (night + locked only)
    useEffect(() => {
        const fn = (e: KeyboardEvent) => {
            if (e.code === 'KeyF' && nightRef.current && lockedRef.current)
                setFlashlightOn((f) => !f);
        };
        window.addEventListener('keydown', fn);
        return () => window.removeEventListener('keydown', fn);
    }, []);

    // Reset flashlight when switching to day
    useEffect(() => { if (!night) setFlashlightOn(false); }, [night]);

    return (
        <div className="w-full h-full relative select-none" style={{ touchAction: 'none' }}>
            <Canvas
                shadows
                gl={{ antialias: true }}
                camera={{ fov: 75, near: 0.1, far: 600 }}
            >
                <Scene
                    onLock={() => setLocked(true)}
                    onUnlock={() => setLocked(false)}
                    night={night}
                    flashlightOn={flashlightOn}
                />
            </Canvas>

            {/* Entry overlay */}
            {!locked && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/55 backdrop-blur-sm">
                    <div className="text-center text-white px-8 py-9 rounded-2xl bg-black/30 border border-white/10 max-w-xs w-full space-y-3">
                        <div className="text-5xl">🌲</div>
                        <h1 className="text-3xl font-bold tracking-wide text-green-200">
                            Forest Explorer
                        </h1>
                        <p className="text-green-300/70 text-sm">Wander a peaceful ancient forest</p>

                        {/* Time of day selector */}
                        <div className="flex gap-2 pt-1">
                            <button
                                className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors cursor-pointer ${
                                    mode === 'day'
                                        ? 'bg-amber-500/80 text-white'
                                        : 'bg-white/10 text-zinc-400 hover:bg-white/15'
                                }`}
                                onClick={() => setMode('day')}
                            >
                                ☀ Day
                            </button>
                            <button
                                className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors cursor-pointer ${
                                    mode === 'night'
                                        ? 'bg-indigo-700/80 text-white'
                                        : 'bg-white/10 text-zinc-400 hover:bg-white/15'
                                }`}
                                onClick={() => setMode('night')}
                            >
                                ☾ Night
                            </button>
                        </div>

                        <div className="pt-1 space-y-1 text-xs text-zinc-400">
                            <p>
                                <span className="text-zinc-200">WASD</span> — walk &nbsp;·&nbsp;{' '}
                                <span className="text-zinc-200">Shift</span> — run &nbsp;·&nbsp;{' '}
                                <span className="text-zinc-200">Space</span> — jump
                            </p>
                            <p>
                                <span className="text-zinc-200">Mouse</span> — look &nbsp;·&nbsp;{' '}
                                <span className="text-zinc-200">ESC</span> — pause
                            </p>
                        </div>
                        <button
                            className="mt-2 w-full py-2.5 bg-green-800 hover:bg-green-700 active:bg-green-900 text-green-100 rounded-xl font-medium transition-colors text-sm cursor-pointer"
                            onClick={() => {
                                const canvas = document.querySelector('canvas');
                                canvas?.click();
                            }}
                        >
                            Enter the Forest
                        </button>
                    </div>
                </div>
            )}

            {/* In-game top-right controls */}
            {locked && (
                <div className="absolute top-3 right-3 z-50 flex items-center gap-2">
                    {/* Flashlight indicator — only shown at night */}
                    {night && (
                        <span
                            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border backdrop-blur-sm transition-colors ${
                                flashlightOn
                                    ? 'bg-amber-500/30 border-amber-400/40 text-amber-200'
                                    : 'bg-black/50 border-white/10 text-white/40'
                            }`}
                        >
                            🔦 {flashlightOn ? 'ON' : 'OFF'}
                        </span>
                    )}
                    <button
                        className="px-3 py-1.5 rounded-lg bg-black/50 backdrop-blur-sm border border-white/10 text-white/60 hover:text-white text-xs font-medium transition-colors cursor-pointer"
                        onClick={() => setMode((m) => m === 'day' ? 'night' : 'day')}
                    >
                        {night ? '☀ Day' : '☾ Night'}
                    </button>
                </div>
            )}

            {/* Crosshair */}
            {locked && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <svg width="18" height="18" viewBox="0 0 18 18">
                        <line x1="9" y1="2" x2="9" y2="16" stroke="white" strokeWidth="1" strokeOpacity="0.45" />
                        <line x1="2" y1="9" x2="16" y2="9" stroke="white" strokeWidth="1" strokeOpacity="0.45" />
                    </svg>
                </div>
            )}

            {/* Controls hint */}
            {locked && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/30 text-xs tracking-widest whitespace-nowrap">
                    WASD · SHIFT run · SPACE jump{night ? ' · F flashlight' : ''} · ESC pause
                </div>
            )}
        </div>
    );
}
