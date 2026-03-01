'use client';

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { PointerLockControls, Sky, Stars } from '@react-three/drei';
import { useRef, useState, useEffect, useMemo } from 'react';
import * as THREE from 'three';

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
            {/* Trunk */}
            <mesh position={[0, 1.5 * scale, 0]} castShadow>
                <cylinderGeometry args={[0.16 * scale, 0.26 * scale, 3 * scale, 7]} />
                <meshLambertMaterial color={trunkColors[variety % 3]} />
            </mesh>

            {/* Bottom foliage */}
            <mesh position={[0, 3.6 * scale, 0]} castShadow>
                <coneGeometry args={[1.9 * scale, 2.8 * scale, 7]} />
                <meshLambertMaterial color={dark} />
            </mesh>

            {/* Mid foliage */}
            <mesh position={[0, 5.3 * scale, 0]} castShadow>
                <coneGeometry args={[1.35 * scale, 2.4 * scale, 7]} />
                <meshLambertMaterial color={mid} />
            </mesh>

            {/* Top foliage */}
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
        <mesh
            position={position}
            rotation={[rotX, rotY, 0]}
            castShadow
            receiveShadow
        >
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
                <planeGeometry args={[200, 200]} />
                <meshLambertMaterial color="#3a6b2e" />
            </mesh>
            {/* Darker moss patches */}
            {[
                [5, 5, 5] as [number, number, number],
                [-10, 0, 14] as [number, number, number],
                [18, 0, -8] as [number, number, number],
                [-6, 0, -20] as [number, number, number],
            ].map(([x, , z], i) => (
                <mesh
                    key={i}
                    rotation={[-Math.PI / 2, 0, 0]}
                    position={[x, 0.001, z]}
                    receiveShadow
                >
                    <circleGeometry args={[3 + i * 1.5, 10]} />
                    <meshLambertMaterial color="#2b5220" transparent opacity={0.55} />
                </mesh>
            ))}
        </>
    );
}

// ─── Fireflies ────────────────────────────────────────────────────────────────

function Fireflies() {
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
        const pos = pointsRef.current.geometry.attributes.position
            .array as Float32Array;
        const t = state.clock.elapsedTime;
        for (let i = 0; i < COUNT; i++) {
            pos[i * 3 + 1] =
                1.2 + Math.sin(t * 1.4 + phases[i]) * 0.6 + Math.sin(t * 0.6 + phases[i] * 2) * 0.3;
        }
        pointsRef.current.geometry.attributes.position.needsUpdate = true;
        const mat = pointsRef.current.material as THREE.PointsMaterial;
        mat.opacity = 0.45 + Math.sin(t * 1.5) * 0.25;
    });

    return (
        <points ref={pointsRef} geometry={geometry}>
            <pointsMaterial
                color="#d4ff70"
                size={0.065}
                transparent
                opacity={0.6}
                sizeAttenuation
            />
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
            positions[i * 3] = (Math.random() - 0.5) * 130;
            positions[i * 3 + 1] = Math.random() * 0.7;
            positions[i * 3 + 2] = (Math.random() - 0.5) * 130;
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
            <pointsMaterial
                color="#c8e6c0"
                size={0.9}
                transparent
                opacity={0.07}
                sizeAttenuation
            />
        </points>
    );
}

// ─── Clouds ──────────────────────────────────────────────────────────────────

// Each cloud is a cluster of overlapping spheres that slowly drifts overhead.
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

function CloudPuff({ position, scale }: { position: [number, number, number]; scale: number }) {
    return (
        <group position={position} scale={scale}>
            {CLOUD_PUFFS.map(([x, y, z, r], i) => (
                <mesh key={i} position={[x, y, z]}>
                    <sphereGeometry args={[r, 7, 5]} />
                    <meshLambertMaterial color="#f0f4f0" transparent opacity={0.82} />
                </mesh>
            ))}
        </group>
    );
}

function Clouds() {
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

    return (
        <>
            {cloudData.map((c, i) => (
                <group
                    key={c.id}
                    ref={(el) => { refs.current[i] = el; }}
                    position={[c.x, c.y, c.z]}
                >
                    <CloudPuff position={[0, 0, 0]} scale={c.scale} />
                </group>
            ))}
        </>
    );
}

// ─── Forest Scene ─────────────────────────────────────────────────────────────

function ForestScene() {
    const data = useMemo(() => {
        // Deterministic seeded-ish RNG
        const rng = (n: number) => {
            const x = Math.sin(n + 1) * 43758.5453;
            return x - Math.floor(x);
        };

        const trees: Array<{
            id: number;
            position: [number, number, number];
            scale: number;
            variety: number;
        }> = [];

        const rocks: Array<{
            id: number;
            position: [number, number, number];
            scale: number;
        }> = [];

        const mushrooms: Array<{
            id: number;
            position: [number, number, number];
        }> = [];

        // Sparse trees near clearing, denser further out
        for (let i = 0; i < 240; i++) {
            const s = i * 7.331;
            const angle = rng(s) * Math.PI * 2;
            const minR = i < 30 ? 7 : 15;
            const radius = minR + rng(s + 1) * 72;
            trees.push({
                id: i,
                position: [Math.cos(angle) * radius, 0, Math.sin(angle) * radius],
                scale: 0.55 + rng(s + 2) * 0.95,
                variety: Math.floor(rng(s + 3) * 3),
            });
        }

        for (let i = 0; i < 45; i++) {
            const s = i * 13.71 + 1000;
            const angle = rng(s) * Math.PI * 2;
            const radius = 4 + rng(s + 1) * 45;
            rocks.push({
                id: i,
                position: [Math.cos(angle) * radius, 0.18, Math.sin(angle) * radius],
                scale: 0.5 + rng(s + 2) * 1.6,
            });
        }

        for (let i = 0; i < 35; i++) {
            const s = i * 19.27 + 2000;
            const angle = rng(s) * Math.PI * 2;
            const radius = 3 + rng(s + 1) * 30;
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
                <Tree
                    key={t.id}
                    position={t.position}
                    scale={t.scale}
                    variety={t.variety}
                />
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

// ─── Player Controller ────────────────────────────────────────────────────────

function Player() {
    const { camera } = useThree();
    const keys = useRef<Record<string, boolean>>({});
    // Velocity stored in LOCAL camera space: x = strafe, y = forward/back
    // This means turning instantly re-projects velocity onto the new heading
    const localVel = useRef(new THREE.Vector2(0, 0));

    useEffect(() => {
        camera.position.set(0, 1.7, 0);
        const down = (e: KeyboardEvent) => { keys.current[e.code] = true; };
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

        // Local-space input: y = forward (+) / back (−), x = right (+) / left (−)
        const input = new THREE.Vector2(0, 0);
        if (k['KeyW'] || k['ArrowUp'])    input.y += 1;
        if (k['KeyS'] || k['ArrowDown'])  input.y -= 1;
        if (k['KeyA'] || k['ArrowLeft'])  input.x -= 1;
        if (k['KeyD'] || k['ArrowRight']) input.x += 1;

        const speed = (k['ShiftLeft'] || k['ShiftRight']) ? 9 : 5;
        if (input.lengthSq() > 0) input.normalize().multiplyScalar(speed);

        // Smooth acceleration/deceleration in local space
        localVel.current.lerp(input, 0.15);

        // Derive world-space basis from the camera's CURRENT orientation every frame
        const camForward = new THREE.Vector3();
        camera.getWorldDirection(camForward);
        camForward.y = 0;
        camForward.normalize();

        // right = cross(camForward, worldUp)
        const camRight = new THREE.Vector3();
        camRight.crossVectors(camForward, new THREE.Vector3(0, 1, 0));
        // no need to normalize — cross of two unit perpendicular vectors is unit

        const move = new THREE.Vector3();
        move.addScaledVector(camForward, localVel.current.y * delta);
        move.addScaledVector(camRight,   localVel.current.x * delta);

        camera.position.x = Math.max(-90, Math.min(90, camera.position.x + move.x));
        camera.position.z = Math.max(-90, Math.min(90, camera.position.z + move.z));
        camera.position.y = 1.7;
    });

    return null;
}

// ─── Scene ────────────────────────────────────────────────────────────────────

function Scene({ onLock, onUnlock }: { onLock: () => void; onUnlock: () => void }) {
    return (
        <>
            <fog attach="fog" args={['#8aba82', 28, 130]} />

            <ambientLight intensity={0.55} color="#c0d8a8" />
            <directionalLight
                position={[60, 80, 40]}
                intensity={1.6}
                color="#fde68a"
                castShadow
                shadow-mapSize={[2048, 2048] as unknown as number}
                shadow-camera-far={200}
                shadow-camera-left={-80}
                shadow-camera-right={80}
                shadow-camera-top={80}
                shadow-camera-bottom={-80}
            />
            <directionalLight position={[-50, 25, -50]} intensity={0.28} color="#a8d4f5" />

            <Sky
                sunPosition={[60, 12, 40]}
                turbidity={5}
                rayleigh={2.2}
                mieCoefficient={0.004}
                mieDirectionalG={0.8}
            />
            <Stars
                radius={280}
                depth={50}
                count={800}
                factor={4}
                fade
                speed={0.5}
            />

            <Ground />
            <ForestScene />
            <Clouds />
            <Fireflies />
            <Mist />
            <Player />

            <PointerLockControls onLock={onLock} onUnlock={onUnlock} />
        </>
    );
}

// ─── Export ───────────────────────────────────────────────────────────────────

export function ForestExplorerGame() {
    const [locked, setLocked] = useState(false);

    return (
        <div className="w-full h-full relative select-none" style={{ touchAction: 'none' }}>
            <Canvas
                shadows
                gl={{ antialias: true }}
                camera={{ fov: 75, near: 0.1, far: 500 }}
            >
                <Scene onLock={() => setLocked(true)} onUnlock={() => setLocked(false)} />
            </Canvas>

            {/* Entry overlay */}
            {!locked && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/55 backdrop-blur-sm">
                    <div className="text-center text-white px-8 py-9 rounded-2xl bg-black/30 border border-white/10 max-w-xs w-full space-y-3">
                        <div className="text-5xl">🌲</div>
                        <h1 className="text-3xl font-bold tracking-wide text-green-200">
                            Forest Explorer
                        </h1>
                        <p className="text-green-300/70 text-sm">
                            Wander a peaceful ancient forest
                        </p>
                        <div className="pt-1 space-y-1 text-xs text-zinc-400">
                            <p>
                                <span className="text-zinc-200">WASD</span> — walk &nbsp;·&nbsp;{' '}
                                <span className="text-zinc-200">Shift</span> — run
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
                    WASD · SHIFT to run · ESC to pause
                </div>
            )}
        </div>
    );
}