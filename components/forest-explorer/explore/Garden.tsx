'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Color, Vector3, type Group, type PointLight } from 'three';
import { useGardenStore } from '@/lib/forest-explorer/gardenStore';
import {
    type GardenPlant, SPECIES_COLORS, stageOf, growthProgress,
} from '@/lib/forest-explorer/garden';

/**
 * The Free Explore garden. Press G to plant a seed a couple of steps ahead;
 * press E near one of your plants to water it. Plants grow through
 * seed → sprout → bud → bloom over real time (they keep growing while
 * you're away) and persist in localStorage.
 */
export function Garden({ night, locked }: { night: boolean; locked: boolean }) {
    const { camera } = useThree();
    const plants = useGardenStore(s => s.plants);
    const nowTick = useGardenStore(s => s.nowTick);
    const init = useGardenStore(s => s.init);
    const plantAt = useGardenStore(s => s.plantAt);
    const waterNear = useGardenStore(s => s.waterNear);
    const tick = useGardenStore(s => s.tick);

    const lockedRef = useRef(locked);
    useEffect(() => { lockedRef.current = locked; }, [locked]);

    // Load persisted garden + keep growth stages ticking while playing
    useEffect(() => {
        init();
        const interval = setInterval(tick, 3000);
        return () => clearInterval(interval);
    }, [init, tick]);

    // G = plant ahead · E = water nearby
    useEffect(() => {
        const dir = new Vector3();
        const fn = (e: KeyboardEvent) => {
            if (!lockedRef.current) return;
            if (e.code === 'KeyG') {
                camera.getWorldDirection(dir);
                dir.y = 0;
                dir.normalize();
                const x = camera.position.x + dir.x * 2.2;
                const z = camera.position.z + dir.z * 2.2;
                plantAt(x, z);
            }
            if (e.code === 'KeyE') {
                waterNear(camera.position.x, camera.position.z);
            }
        };
        window.addEventListener('keydown', fn);
        return () => window.removeEventListener('keydown', fn);
    }, [camera, plantAt, waterNear]);

    return (
        <>
            {plants.map(p => (
                <Flower key={p.id} plant={p} now={nowTick} night={night} />
            ))}
        </>
    );
}

// ─── Single flower ───────────────────────────────────────────────────────────

function Flower({ plant, now, night }: { plant: GardenPlant; now: number; night: boolean }) {
    const groupRef = useRef<Group>(null);
    const lightRef = useRef<PointLight>(null);
    const stage = stageOf(plant, now);
    const progress = growthProgress(plant, now);
    const colors = SPECIES_COLORS[plant.species];

    // Stable per-plant variation
    const { lean, spin, sway } = useMemo(() => {
        const h = Math.abs(Math.sin(plant.x * 7.13 + plant.z * 3.71) * 43758.5453);
        const frac = h - Math.floor(h);
        return {
            lean: (frac - 0.5) * 0.16,
            spin: frac * Math.PI * 2,
            sway: 0.6 + frac * 0.8,
        };
    }, [plant.x, plant.z]);

    // Gentle sway once grown; halo lights only near the player
    useFrame((state) => {
        const t = state.clock.elapsedTime;
        if (groupRef.current) {
            groupRef.current.rotation.z = lean + (stage === 'seed' ? 0 : Math.sin(t * sway + spin) * 0.05);
        }
        if (lightRef.current) {
            const dx = plant.x - state.camera.position.x;
            const dz = plant.z - state.camera.position.z;
            lightRef.current.visible = dx * dx + dz * dz < 625; // within 25m
        }
    });

    const glow = night && (plant.species === 'moonpetal' || plant.species === 'riverlily');
    const stemHeight = 0.15 + progress * 0.5;

    return (
        <group position={[plant.x, 0, plant.z]} rotation={[0, spin, 0]}>
            {/* Soil mound (always) */}
            <mesh position={[0, 0.035, 0]}>
                <sphereGeometry args={[0.14, 8, 5]} />
                <meshLambertMaterial color="#3d2e1c" />
            </mesh>

            <group ref={groupRef}>
                {stage === 'seed' && (
                    // A hopeful sparkle over fresh soil
                    <mesh position={[0, 0.14, 0]}>
                        <sphereGeometry args={[0.03, 6, 5]} />
                        <meshStandardMaterial
                            color="#d4ff70"
                            emissive={new Color('#d4ff70')}
                            emissiveIntensity={0.7}
                            transparent
                            opacity={0.85}
                        />
                    </mesh>
                )}

                {stage !== 'seed' && (
                    <>
                        {/* Stem */}
                        <mesh position={[0, 0.05 + stemHeight / 2, 0]}>
                            <cylinderGeometry args={[0.018, 0.026, stemHeight, 5]} />
                            <meshLambertMaterial color="#3f7a2f" />
                        </mesh>
                        {/* Leaves */}
                        <mesh position={[0.06, 0.1 + stemHeight * 0.4, 0]} rotation={[0, 0, -0.9]}>
                            <coneGeometry args={[0.045, 0.16, 4]} />
                            <meshLambertMaterial color="#4a8a38" />
                        </mesh>
                        <mesh position={[-0.055, 0.08 + stemHeight * 0.3, 0.02]} rotation={[0, 1.2, 0.95]}>
                            <coneGeometry args={[0.04, 0.14, 4]} />
                            <meshLambertMaterial color="#427f33" />
                        </mesh>
                    </>
                )}

                {stage === 'bud' && (
                    <mesh position={[0, 0.08 + stemHeight, 0]}>
                        <sphereGeometry args={[0.075, 7, 6]} />
                        <meshLambertMaterial color={colors.heart} />
                    </mesh>
                )}

                {stage === 'bloom' && (
                    <group position={[0, 0.08 + stemHeight, 0]}>
                        {/* Petal ring */}
                        {Array.from({ length: 6 }, (_, i) => {
                            const a = (i / 6) * Math.PI * 2;
                            return (
                                <mesh
                                    key={i}
                                    position={[Math.cos(a) * 0.085, 0, Math.sin(a) * 0.085]}
                                    rotation={[Math.PI / 2.6, 0, -a]}
                                >
                                    <coneGeometry args={[0.05, 0.14, 5]} />
                                    <meshStandardMaterial
                                        color={colors.petal}
                                        emissive={new Color(colors.glow)}
                                        emissiveIntensity={glow ? 0.55 : 0.06}
                                    />
                                </mesh>
                            );
                        })}
                        {/* Heart */}
                        <mesh position={[0, 0.02, 0]}>
                            <sphereGeometry args={[0.055, 7, 6]} />
                            <meshStandardMaterial
                                color={colors.heart}
                                emissive={new Color(colors.glow)}
                                emissiveIntensity={glow ? 0.4 : 0.03}
                            />
                        </mesh>
                        {/* Night halo for the glowing species (distance-culled) */}
                        {glow && (
                            <pointLight ref={lightRef} color={colors.glow} intensity={0.35} distance={3.5} decay={2} />
                        )}
                    </group>
                )}
            </group>
        </group>
    );
}
