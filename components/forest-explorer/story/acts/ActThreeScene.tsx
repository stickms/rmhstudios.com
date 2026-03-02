'use client';

import { useRef, useMemo, useEffect } from 'react';
import { Stars, Sky } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { TreeData } from '../../shared/types';
import { buildTreeInstancedMeshes } from '../../shared/buildTreeInstancedMeshes';
import { Ground } from '../../shared/Ground';
import { Fireflies } from '../../shared/Fireflies';
import { Mist } from '../../shared/Mist';
import { Rock } from '../../shared/Rock';
import { Mushroom } from '../../shared/Mushroom';
import { Flashlight } from '../../shared/Flashlight';
import { CrystalCluster } from '../landmarks/CrystalCluster';
import { AncientStone } from '../landmarks/AncientStone';
import { HollowTree } from '../landmarks/HollowTree';
import { useStoryStore } from '@/lib/forest-explorer/store';
import { actMaps } from '@/lib/forest-explorer/actMaps';

/**
 * Act 3 — Sunrise Over the Tranquil Grove
 *
 * Dawn → sunrise (gradual brightening during act).
 * Corruption zones with purple particles that clear as puzzles are solved.
 * Sparser forest, larger map, branching paths.
 */
export function ActThreeScene() {
    const groupRef = useRef<THREE.Group>(null);
    const flashlightOn = useStoryStore(s => s.flashlightOn);
    const puzzleStates = useStoryStore(s => s.puzzleStates);
    const playtime = useStoryStore(s => s.playtime);
    const config = actMaps.act3;

    // Count solved puzzles in act 3 to drive dawn progression + corruption clearing
    const act3Solved = useMemo(() => {
        return ['act3_corrupted_glyph', 'act3_constellation', 'act3_reflection', 'act3_ward_seal']
            .filter(id => puzzleStates[id]?.status === 'solved').length;
    }, [puzzleStates]);

    // Dawn progression: 0 = purple twilight, 1 = full golden dawn
    // Driven by puzzle completion (each puzzle = 25%) + slight time factor
    const dawnProgress = Math.min(1, act3Solved * 0.25 + Math.min(0.1, playtime * 0.0001));

    // Procedural trees
    const { treeMeshes, rocks, mushrooms, corruptedTrees } = useMemo(() => {
        const rng = (n: number) => {
            const x = Math.sin(n + config.treeSeed) * 43758.5453;
            return x - Math.floor(x);
        };

        const landmarkPositions = config.landmarks.map(l => ({
            x: l.position[0], z: l.position[2], r: 10,
        }));

        const corridors = config.corridors;
        const trees: TreeData[] = [];
        const corrupted: [number, number][] = []; // positions of corrupted trees

        for (let i = 0; i < config.treeCount; i++) {
            const s = i * 7.331;
            const angle = rng(s) * Math.PI * 2;
            const minR = i < 25 ? 8 : 18;
            const radius = minR + rng(s + 1) * (config.mapRadius * 0.6);
            const x = Math.cos(angle) * radius;
            const z = Math.sin(angle) * radius;

            const nearLandmark = landmarkPositions.some(l => {
                const dx = x - l.x, dz = z - l.z;
                return dx * dx + dz * dz < l.r * l.r;
            });
            if (nearLandmark) continue;

            const inCorridor = corridors.some(c => {
                const [sx, sz] = c.start;
                const [ex, ez] = c.end;
                const dx = ex - sx, dz = ez - sz;
                const len2 = dx * dx + dz * dz;
                const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - sx) * dx + (z - sz) * dz) / len2)) : 0;
                const px = sx + t * dx, pz = sz + t * dz;
                const dist = Math.sqrt((x - px) * (x - px) + (z - pz) * (z - pz));
                return dist < c.width * 0.5;
            });
            if (inCorridor) continue;

            // Some trees are "corrupted" (clustered in zones)
            if (rng(s + 5) < 0.15) {
                corrupted.push([x, z]);
            }

            const giant = rng(s + 4) < 0.15;
            const scale = giant
                ? 2.0 + rng(s + 2) * 0.8
                : 0.5 + rng(s + 2) * 1.0;

            trees.push({ x, z, scale, variety: Math.floor(rng(s + 3) * 3) });
        }

        const rockData: Array<{ id: number; position: [number, number, number]; scale: number }> = [];
        for (let i = 0; i < config.rockCount; i++) {
            const s = i * 13.71 + 1000;
            const angle = rng(s) * Math.PI * 2;
            const radius = 5 + rng(s + 1) * 90;
            rockData.push({ id: i, position: [Math.cos(angle) * radius, 0.18, Math.sin(angle) * radius], scale: 0.5 + rng(s + 2) * 1.8 });
        }

        const mushroomData: Array<{ id: number; position: [number, number, number] }> = [];
        for (let i = 0; i < config.mushroomCount; i++) {
            const s = i * 19.27 + 2000;
            const angle = rng(s) * Math.PI * 2;
            const radius = 4 + rng(s + 1) * 70;
            mushroomData.push({ id: i, position: [Math.cos(angle) * radius, 0, Math.sin(angle) * radius] });
        }

        return {
            treeMeshes: buildTreeInstancedMeshes(trees),
            rocks: rockData,
            mushrooms: mushroomData,
            corruptedTrees: corrupted,
        };
    }, [config]);

    useEffect(() => {
        const group = groupRef.current;
        if (!group) return;
        treeMeshes.forEach(m => group.add(m));
        return () => { treeMeshes.forEach(m => group.remove(m)); };
    }, [treeMeshes]);

    // Interpolated atmosphere colors based on dawn progress
    const fogColor = useMemo(() => {
        const start = new THREE.Color('#1a0a1a');
        const end = new THREE.Color('#c4956a');
        return `#${start.lerp(end, dawnProgress).getHexString()}`;
    }, [dawnProgress]);

    const bgColor = useMemo(() => {
        const start = new THREE.Color('#0a0510');
        const end = new THREE.Color('#e8c4a0');
        return `#${start.lerp(end, dawnProgress).getHexString()}`;
    }, [dawnProgress]);

    const ambientIntensity = 0.12 + dawnProgress * 0.5;
    const dirIntensity = 0.4 + dawnProgress * 0.6;
    const fogFar = 100 + dawnProgress * 80;

    return (
        <>
            {/* Atmosphere: purple twilight → golden dawn */}
            <color attach="background" args={[bgColor]} />
            <fog attach="fog" args={[fogColor, 20, fogFar]} />
            <ambientLight intensity={ambientIntensity} color={dawnProgress > 0.5 ? '#e8a060' : '#2a1040'} />
            <directionalLight
                position={[80, 40, 60]}
                intensity={dirIntensity}
                color="#e8a060"
                castShadow
                shadow-mapSize={[1024, 1024] as unknown as number}
                shadow-camera-far={250}
                shadow-camera-left={-120}
                shadow-camera-right={120}
                shadow-camera-top={120}
                shadow-camera-bottom={-120}
            />

            {/* Secondary fill light from opposite side */}
            <directionalLight
                position={[-60, 20, -40]}
                intensity={0.08 + dawnProgress * 0.15}
                color="#604080"
            />

            {/* Stars fade as dawn progresses */}
            {dawnProgress < 0.8 && (
                <Stars
                    radius={280}
                    depth={50}
                    count={Math.floor(600 * (1 - dawnProgress))}
                    factor={4}
                    fade
                    speed={0.3}
                />
            )}

            {/* Sky becomes visible as dawn progresses */}
            {dawnProgress > 0.3 && (
                <Sky
                    distance={450000}
                    sunPosition={[80, 10 + dawnProgress * 40, 60]}
                    inclination={0.2 + dawnProgress * 0.3}
                    azimuth={0.25}
                    rayleigh={3 - dawnProgress * 2}
                    turbidity={8}
                />
            )}

            {/* Terrain */}
            <Ground />
            <group ref={groupRef}>
                {rocks.map(r => <Rock key={r.id} position={r.position} scale={r.scale} />)}
                {mushrooms.map(m => <Mushroom key={m.id} position={m.position} />)}
            </group>

            {/* Reduced atmosphere effects for dawn */}
            <Fireflies night />
            <Mist />

            {/* Flashlight — less needed as dawn brightens */}
            {flashlightOn && <Flashlight />}

            {/* Landmarks */}
            <AncientStone id="shattered_monument" position={[20, 0, -40]} scale={1.0} />
            <CrystalCluster id="twilight_observatory" position={[-20, 0, -80]} scale={1.3} />
            <CrystalCluster id="crystal_nexus" position={[0, 0, -50]} scale={1.5} />
            <HeartwoodTree position={[40, 0, -70]} scale={2.0} solved={act3Solved >= 4} />

            {/* Corruption zones — purple particle lights that fade as puzzles are solved */}
            <CorruptionZones
                positions={corruptedTrees}
                intensity={1 - act3Solved * 0.25}
            />

            {/* Dawn warmth lights near landmarks */}
            {dawnProgress > 0.3 && (
                <>
                    <pointLight position={[20, 3, -40]} color="#ffcc88" intensity={dawnProgress * 0.4} distance={15} decay={2} />
                    <pointLight position={[-20, 3, -80]} color="#ffcc88" intensity={dawnProgress * 0.3} distance={12} decay={2} />
                    <pointLight position={[0, 3, -50]} color="#ffcc88" intensity={dawnProgress * 0.4} distance={15} decay={2} />
                    <pointLight position={[40, 4, -70]} color="#ffd090" intensity={dawnProgress * 0.5} distance={20} decay={2} />
                </>
            )}
        </>
    );
}

/** The Heartwood — the ancient tree at the climax of Act 3 */
function HeartwoodTree({ position, scale = 1, solved }: { position: [number, number, number]; scale?: number; solved: boolean }) {
    const glowRef = useRef<THREE.PointLight>(null);

    useFrame((state) => {
        if (!glowRef.current) return;
        const t = state.clock.elapsedTime;
        if (solved) {
            glowRef.current.intensity = 2.0 + Math.sin(t * 1.5) * 0.8;
            glowRef.current.color.set('#44ff88');
        } else {
            glowRef.current.intensity = 0.3 + Math.sin(t * 0.8) * 0.15;
            glowRef.current.color.set('#8844aa');
        }
    });

    return (
        <group position={position} scale={scale}>
            {/* Massive ancient trunk */}
            <mesh position={[0, 4, 0]} castShadow>
                <cylinderGeometry args={[2.0, 3.0, 8, 14]} />
                <meshLambertMaterial color="#5a3a1a" />
            </mesh>
            {/* Inner glow hollow */}
            <mesh position={[0, 2, 2.2]} rotation={[0.2, 0, 0]}>
                <cylinderGeometry args={[1.0, 1.2, 3, 8]} />
                <meshStandardMaterial
                    color={solved ? '#114422' : '#1a0a20'}
                    emissive={new THREE.Color(solved ? '#22ff66' : '#440066')}
                    emissiveIntensity={solved ? 0.5 : 0.15}
                />
            </mesh>
            {/* Deep roots */}
            {Array.from({ length: 8 }, (_, i) => {
                const angle = (i / 8) * Math.PI * 2;
                const rootLen = 4 + (i % 3) * 1.5;
                return (
                    <mesh
                        key={i}
                        position={[Math.cos(angle) * 3.5, 0.2, Math.sin(angle) * 3.5]}
                        rotation={[0.4, angle, 0.15]}
                        castShadow
                    >
                        <cylinderGeometry args={[0.18, 0.4, rootLen, 5]} />
                        <meshLambertMaterial color="#4a2a10" />
                    </mesh>
                );
            })}
            {/* Grand canopy */}
            <mesh position={[0, 10, 0]}>
                <coneGeometry args={[6, 7, 10]} />
                <meshLambertMaterial color={solved ? '#2a7a1a' : '#1a3010'} />
            </mesh>
            <mesh position={[0, 13, 0]}>
                <coneGeometry args={[4, 5, 10]} />
                <meshLambertMaterial color={solved ? '#3a9a2a' : '#223a18'} />
            </mesh>
            <mesh position={[0, 15.5, 0]}>
                <coneGeometry args={[2.5, 3.5, 8]} />
                <meshLambertMaterial color={solved ? '#4abb3a' : '#2a4a20'} />
            </mesh>
            {/* Heart glow */}
            <pointLight ref={glowRef} position={[0, 3, 2]} distance={solved ? 25 : 8} decay={2} />
        </group>
    );
}

/** Corruption zones: purple particles/lights at specified positions, fading as puzzles solve */
function CorruptionZones({ positions, intensity }: { positions: [number, number][]; intensity: number }) {
    if (intensity <= 0.01 || positions.length === 0) return null;

    return (
        <>
            {positions.slice(0, 20).map(([x, z], i) => (
                <group key={`corrupt-${i}`} position={[x, 0, z]}>
                    {/* Purple corruption glow */}
                    <pointLight
                        color="#8833aa"
                        intensity={intensity * 0.4}
                        distance={6}
                        decay={2}
                        position={[0, 1.5, 0]}
                    />
                    {/* Corruption tendril mesh */}
                    <mesh position={[0, 0.8, 0]} rotation={[0, i * 1.3, 0]}>
                        <cylinderGeometry args={[0.05, 0.15, 1.6, 4]} />
                        <meshStandardMaterial
                            color="#6622aa"
                            emissive={new THREE.Color('#8833cc')}
                            emissiveIntensity={intensity * 0.6}
                            transparent
                            opacity={intensity * 0.7}
                        />
                    </mesh>
                    <mesh position={[0.3, 0.5, 0.2]} rotation={[0.3, i * 2.1, 0.2]}>
                        <cylinderGeometry args={[0.03, 0.1, 1.0, 4]} />
                        <meshStandardMaterial
                            color="#5511aa"
                            emissive={new THREE.Color('#7722bb')}
                            emissiveIntensity={intensity * 0.5}
                            transparent
                            opacity={intensity * 0.6}
                        />
                    </mesh>
                </group>
            ))}
        </>
    );
}
