'use client';

import { useRef, useMemo, useEffect } from 'react';
import { Stars } from '@react-three/drei';
import { Color, type Group } from 'three';
import type { TreeData } from '../../shared/types';
import { buildTreeInstancedMeshes } from '../../shared/buildTreeInstancedMeshes';
import { Ground } from '../../shared/Ground';
import { Fireflies } from '../../shared/Fireflies';
import { Mist } from '../../shared/Mist';
import { Moon } from '../../shared/Moon';
import { Clouds } from '../../shared/Clouds';
import { Rock } from '../../shared/Rock';
import { Mushroom } from '../../shared/Mushroom';
import { Flashlight } from '../../shared/Flashlight';
import { TikiTorches } from '../../shared/TikiTorches';
import { AncientStone } from '../landmarks/AncientStone';
import { GatewayArch } from '../landmarks/GatewayArch';
import { CrystalCluster } from '../landmarks/CrystalCluster';
import { useStoryStore } from '@/lib/forest-explorer/store';
import { actMaps } from '@/lib/forest-explorer/actMaps';
import { CONSTELLATION_PATTERNS } from '../puzzles/ConstellationPuzzle';

export function ActOneScene() {
    const groupRef = useRef<Group>(null);
    const flashlightOn = useStoryStore(s => s.flashlightOn);
    const config = actMaps.act1;

    // Procedural trees using act-specific seed, avoiding landmark positions
    const { treeMeshes, rocks, mushrooms } = useMemo(() => {
        const rng = (n: number) => {
            const x = Math.sin(n + config.treeSeed) * 43758.5453;
            return x - Math.floor(x);
        };

        const p = config.treeGenParams;
        const landmarkPositions = config.landmarks.map(l => ({
            x: l.position[0], z: l.position[2], r: p.landmarkRadius,
        }));

        const trees: TreeData[] = [];
        for (let i = 0; i < config.treeCount; i++) {
            const s = i * 7.331;
            const angle = rng(s) * Math.PI * 2;
            const minR = i < p.minRThreshold ? p.minRInner : p.minROuter;
            const radius = minR + rng(s + 1) * (config.mapRadius * p.radiusMultiplier);
            const x = Math.cos(angle) * radius;
            const z = Math.sin(angle) * radius;

            // Reject if too close to landmark
            const nearLandmark = landmarkPositions.some(l => {
                const dx = x - l.x, dz = z - l.z;
                return dx * dx + dz * dz < l.r * l.r;
            });
            if (nearLandmark) continue;

            const giant = rng(s + 4) < p.giantThreshold;
            const scale = giant
                ? p.giantScaleBase + rng(s + 2) * p.giantScaleRange
                : p.normalScaleBase + rng(s + 2) * p.normalScaleRange;

            trees.push({ x, z, scale, variety: Math.floor(rng(s + 3) * 3) });
        }

        const rockData: Array<{ id: number; position: [number, number, number]; scale: number }> = [];
        for (let i = 0; i < config.rockCount; i++) {
            const s = i * 13.71 + 1000;
            const angle = rng(s) * Math.PI * 2;
            const radius = 4 + rng(s + 1) * 80;
            rockData.push({ id: i, position: [Math.cos(angle) * radius, 0.18, Math.sin(angle) * radius], scale: 0.5 + rng(s + 2) * 1.6 });
        }

        const mushroomData: Array<{ id: number; position: [number, number, number] }> = [];
        for (let i = 0; i < config.mushroomCount; i++) {
            const s = i * 19.27 + 2000;
            const angle = rng(s) * Math.PI * 2;
            const radius = 3 + rng(s + 1) * 60;
            mushroomData.push({ id: i, position: [Math.cos(angle) * radius, 0, Math.sin(angle) * radius] });
        }

        return { treeMeshes: buildTreeInstancedMeshes(trees), rocks: rockData, mushrooms: mushroomData };
    }, [config]);

    useEffect(() => {
        const group = groupRef.current;
        if (!group) return;
        treeMeshes.forEach(m => group.add(m));
        return () => { treeMeshes.forEach(m => group.remove(m)); };
    }, [treeMeshes]);

    return (
        <>
            {/* Atmosphere: permanent night */}
            <color attach="background" args={['#050914']} />
            <fog attach="fog" args={['#060d1a', 15, 80]} />
            <ambientLight intensity={0.06} color="#1a2a50" />
            <directionalLight
                position={[-60, 90, -40]}
                intensity={0.18}
                color="#8aa8d0"
                castShadow
                shadow-mapSize={[1024, 1024] as unknown as number}
                shadow-camera-far={200}
                shadow-camera-left={-100}
                shadow-camera-right={100}
                shadow-camera-top={100}
                shadow-camera-bottom={-100}
            />
            <directionalLight position={[-50, 25, -50]} intensity={0.03} color="#040810" />

            <Stars radius={280} depth={50} count={2000} factor={6} fade speed={0.5} />
            <Moon />

            {/* Terrain */}
            <Ground />
            <group ref={groupRef}>
                {rocks.map(r => <Rock key={r.id} position={r.position} scale={r.scale} />)}
                {mushrooms.map(m => <Mushroom key={m.id} position={m.position} />)}
            </group>

            {/* Atmosphere effects */}
            <Clouds night />
            <Fireflies night />
            <Mist />
            <TikiTorches />

            {/* Flashlight */}
            {flashlightOn && <Flashlight />}

            {/* Worn notebook near spawn */}
            <group position={[2, 0.3, 2]}>
                <mesh rotation={[-0.1, 0.3, 0]}>
                    <boxGeometry args={[0.3, 0.04, 0.4]} />
                    <meshStandardMaterial
                        color="#8B7355"
                        emissive={new Color('#44ffaa')}
                        emissiveIntensity={0.3}
                    />
                </mesh>
                <pointLight color="#44ffaa" intensity={0.4} distance={4} decay={2} />
            </group>

            {/* Constellation hint tree — carved star pattern on trunk */}
            <group position={[25, 0, -50]}>
                {/* Large ancient trunk */}
                <mesh position={[0, 4, 0]} castShadow>
                    <cylinderGeometry args={[0.8, 1.2, 8, 8]} />
                    <meshLambertMaterial color="#2a1f15" />
                </mesh>
                {/* Canopy */}
                <mesh position={[0, 9, 0]}>
                    <sphereGeometry args={[3.5, 8, 8]} />
                    <meshLambertMaterial color="#1a3a1a" />
                </mesh>
                {/* Carved constellation on trunk face */}
                <group position={[0.85, 4, 0]} rotation={[0, Math.PI / 2, 0]}>
                    {/* Star dots */}
                    {CONSTELLATION_PATTERNS.tree_of_life.stars.map((star, i) => (
                        <mesh
                            key={`cs-${i}`}
                            position={[(star.x - 200) * 0.008, (200 - star.y) * 0.008, 0]}
                        >
                            <sphereGeometry args={[0.035, 6, 6]} />
                            <meshStandardMaterial
                                color="#44ddff"
                                emissive={new Color('#44ddff')}
                                emissiveIntensity={0.9}
                            />
                        </mesh>
                    ))}
                    {/* Edge lines as thin cylinders */}
                    {CONSTELLATION_PATTERNS.tree_of_life.edges.map(([a, b], i) => {
                        const sa = CONSTELLATION_PATTERNS.tree_of_life.stars[a];
                        const sb = CONSTELLATION_PATTERNS.tree_of_life.stars[b];
                        const ax = (sa.x - 200) * 0.008, ay = (200 - sa.y) * 0.008;
                        const bx = (sb.x - 200) * 0.008, by = (200 - sb.y) * 0.008;
                        const mx = (ax + bx) / 2, my = (ay + by) / 2;
                        const len = Math.sqrt((bx - ax) ** 2 + (by - ay) ** 2);
                        const angle = Math.atan2(by - ay, bx - ax);
                        return (
                            <mesh
                                key={`ce-${i}`}
                                position={[mx, my, 0]}
                                rotation={[0, 0, angle]}
                            >
                                <boxGeometry args={[len, 0.015, 0.015]} />
                                <meshStandardMaterial
                                    color="#44ddff"
                                    emissive={new Color('#44ddff')}
                                    emissiveIntensity={0.6}
                                />
                            </mesh>
                        );
                    })}
                </group>
                <pointLight color="#44ddff" intensity={0.3} distance={6} decay={2} position={[1, 4, 0]} />
            </group>

            {/* Landmarks */}
            <AncientStone id="stone_circle" position={[0, 0, -60]} scale={1.2} />
            <CrystalCluster id="stargazer_clearing" position={[50, 0, -40]} scale={1.0} />
            <AncientStone id="shadow_wall" position={[30, 0, 30]} scale={1.0} />
            <GatewayArch id="act1_gateway_arch" position={[-40, 0, 20]} scale={1.5} />

            {/* Bioluminescent mushrooms near landmarks */}
            {[
                [2, 0, -57], [-3, 0, -62], [5, 0, -58],
                [48, 0, -37], [52, 0, -42],
                [28, 0, 28], [32, 0, 32],
            ].map(([x, y, z], i) => (
                <group key={`bio-${i}`} position={[x, y, z]}>
                    <mesh position={[0, 0.13, 0]}>
                        <cylinderGeometry args={[0.04, 0.07, 0.26, 6]} />
                        <meshLambertMaterial color="#ede0c8" />
                    </mesh>
                    <mesh position={[0, 0.32, 0]}>
                        <coneGeometry args={[0.22, 0.26, 8]} />
                        <meshStandardMaterial
                            color="#44ffaa"
                            emissive={new Color('#22ff88')}
                            emissiveIntensity={0.8}
                            transparent
                            opacity={0.85}
                        />
                    </mesh>
                    <pointLight color="#44ffaa" intensity={0.5} distance={5} decay={2} />
                </group>
            ))}
        </>
    );
}
