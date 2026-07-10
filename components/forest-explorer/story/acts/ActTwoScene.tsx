'use client';

import { useRef, useMemo, useEffect, useState, useCallback } from 'react';
import { Stars } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import type { Group, AmbientLight } from 'three';
import type { TreeData } from '../../shared/types';
import { buildTreeInstancedMeshes } from '../../shared/buildTreeInstancedMeshes';
import { Ground } from '../../shared/Ground';
import { Fireflies } from '../../shared/Fireflies';
import { Mist } from '../../shared/Mist';
import { Clouds } from '../../shared/Clouds';
import { Rock } from '../../shared/Rock';
import { Mushroom } from '../../shared/Mushroom';
import { Flashlight } from '../../shared/Flashlight';
import { HollowTree } from '../landmarks/HollowTree';
import { CrystalCluster } from '../landmarks/CrystalCluster';
import { EchoChamber } from '../landmarks/EchoChamber';
import { GatewayArch } from '../landmarks/GatewayArch';
import { Interactables3D } from '../Interactables3D';
import { CorridorLanterns } from '../scenery/CorridorLanterns';
import { PathStrips } from '../scenery/PathStrips';
import { ScatterDecor } from '../scenery/ScatterDecor';
import { DriftParticles } from '../scenery/DriftParticles';
import { useStoryStore } from '@/lib/forest-explorer/store';
import { actMaps, isInCorridor } from '@/lib/forest-explorer/actMaps';

const FERN_PALETTE = ['#3a2c14', '#4a3618', '#2c220f'];
const FLOWER_PALETTE = ['#d8823a', '#c05a2a', '#e0a04a'];

/**
 * Act 2 — Confronting the Shifting Canopy
 *
 * Dusk/twilight atmosphere, maze-like corridors, narrower paths.
 * When a puzzle is solved with worldEvent 'trees_calm_briefly',
 * trees rearrange (seed offset changes) via a brief darkness transition.
 */
export function ActTwoScene() {
    const groupRef = useRef<Group>(null);
    const flashlightOn = useStoryStore(s => s.flashlightOn);
    const storyFlags = useStoryStore(s => s.storyFlags);
    const treesShiftCount = useStoryStore(s => s.treesShiftCount);
    const incrementTreeSeedOffset = useStoryStore(s => s.incrementTreeSeedOffset);
    const config = actMaps.act2;

    // CSS overlay darkness for shift transition
    const [shifting, setShifting] = useState(false);

    // Listen for tree-shift world events
    useEffect(() => {
        if (storyFlags.trees_calm_briefly) {
            setShifting(true);
            // After 1.5s darkness, swap tree positions (updates store so colliders sync)
            const shiftTimer = setTimeout(() => {
                incrementTreeSeedOffset();
                useStoryStore.getState().setStoryFlag('trees_calm_briefly', false);
            }, 1500);
            // After 3s total, clear the darkness
            const clearTimer = setTimeout(() => {
                setShifting(false);
            }, 3000);
            return () => {
                clearTimeout(shiftTimer);
                clearTimeout(clearTimer);
            };
        }
    }, [storyFlags.trees_calm_briefly, incrementTreeSeedOffset]);

    // Procedural trees with shifting seed
    const { treeMeshes, rocks, mushrooms } = useMemo(() => {
        const actualSeed = config.treeSeed + treesShiftCount * 97;
        const rng = (n: number) => {
            const x = Math.sin(n + actualSeed) * 43758.5453;
            return x - Math.floor(x);
        };

        const p = config.treeGenParams;
        const landmarkPositions = config.landmarks.map(l => ({
            x: l.position[0], z: l.position[2], r: p.landmarkRadius,
        }));

        // Also keep corridor interiors clear
        const corridors = config.corridors;

        const trees: TreeData[] = [];
        for (let i = 0; i < config.treeCount; i++) {
            const s = i * 7.331;
            const angle = rng(s) * Math.PI * 2;
            const minR = i < p.minRThreshold ? p.minRInner : p.minROuter;
            const radius = minR + rng(s + 1) * (config.mapRadius * p.radiusMultiplier);
            const x = Math.cos(angle) * radius;
            const z = Math.sin(angle) * radius;

            // Reject near landmarks
            const nearLandmark = landmarkPositions.some(l => {
                const dx = x - l.x, dz = z - l.z;
                return dx * dx + dz * dz < l.r * l.r;
            });
            if (nearLandmark) continue;

            // Reject if inside corridor paths (keep corridors navigable)
            const inCorridor = corridors.some(c => {
                const [sx, sz] = c.start;
                const [ex, ez] = c.end;
                // Point-to-segment distance
                const dx = ex - sx, dz = ez - sz;
                const len2 = dx * dx + dz * dz;
                const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - sx) * dx + (z - sz) * dz) / len2)) : 0;
                const px = sx + t * dx, pz = sz + t * dz;
                const dist = Math.sqrt((x - px) * (x - px) + (z - pz) * (z - pz));
                return dist < c.width * 0.5;
            });
            if (inCorridor) continue;

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
            const radius = 4 + rng(s + 1) * 70;
            rockData.push({ id: i, position: [Math.cos(angle) * radius, 0.18, Math.sin(angle) * radius], scale: 0.5 + rng(s + 2) * 1.4 });
        }

        const mushroomData: Array<{ id: number; position: [number, number, number] }> = [];
        for (let i = 0; i < config.mushroomCount; i++) {
            const s = i * 19.27 + 2000;
            const angle = rng(s) * Math.PI * 2;
            const radius = 3 + rng(s + 1) * 55;
            mushroomData.push({ id: i, position: [Math.cos(angle) * radius, 0, Math.sin(angle) * radius] });
        }

        return { treeMeshes: buildTreeInstancedMeshes(trees), rocks: rockData, mushrooms: mushroomData };
    }, [config, treesShiftCount]);

    useEffect(() => {
        const group = groupRef.current;
        if (!group) return;
        treeMeshes.forEach(m => group.add(m));
        return () => { treeMeshes.forEach(m => group.remove(m)); };
    }, [treeMeshes]);

    // Ground cover stays off the paths
    const rejectScatter = useCallback(
        (x: number, z: number) => isInCorridor(config, x, z, 0.5),
        [config],
    );

    return (
        <>
            {/* Atmosphere: orange-red dusk */}
            <color attach="background" args={['#0d0806']} />
            <fog attach="fog" args={['#1a0f0a', 12, 65]} />
            <ambientLight intensity={0.08} color="#3a2010" />
            {/* No shadow pass: dusk light is too dim for visible shadows,
                but the pass re-rendered every tree */}
            <directionalLight
                position={[40, 60, -30]}
                intensity={0.25}
                color="#d4713a"
            />
            <directionalLight position={[-30, 15, 40]} intensity={0.04} color="#1a0806" />

            {/* Dim stars — dusk has fewer visible */}
            <Stars radius={280} depth={50} count={800} factor={4} fade speed={0.3} />

            {/* Terrain */}
            <Ground />
            <group ref={groupRef}>
                {rocks.map(r => <Rock key={r.id} position={r.position} scale={r.scale} />)}
                {mushrooms.map(m => <Mushroom key={m.id} position={m.position} />)}
            </group>

            {/* Atmosphere effects (reduced for dusk) */}
            <Clouds night />
            <Fireflies night />
            <Mist />

            {/* Rising embers — the deep wood smoulders */}
            <DriftParticles mode="embers" count={110} area={120} />

            {/* Worn paths + amber Warden lanterns (replace the old misplaced torches) */}
            <PathStrips corridors={config.corridors} color="#453320" />
            <CorridorLanterns corridors={config.corridors} color="#ffab5e" spacing={19} />

            {/* Scorched undergrowth + ember-colored blooms */}
            <ScatterDecor
                seed={config.treeSeed}
                radius={80}
                fernCount={150}
                flowerCount={70}
                fernPalette={FERN_PALETTE}
                flowerPalette={FLOWER_PALETTE}
                reject={rejectScatter}
            />

            {/* Flashlight */}
            {flashlightOn && <Flashlight />}

            {/* Physical puzzle stones + journal pages */}
            <Interactables3D />

            {/* Landmarks */}
            <HollowTree position={[0, 0, -30]} scale={1.8} />
            <CrystalCluster id="mirror_pool" position={[-30, 0, -60]} scale={1.0} />
            <EchoChamber id="echo_chamber" position={[40, 0, -20]} scale={1.0} />
            <GatewayArch id="act2_root_gate" position={[70, 0, -40]} scale={1.5} />

            {/* Shifting darkness overlay — rendered as a CSS overlay in the parent,
                but we also dim the scene lights during shift */}
            <ShiftDarknessEffect active={shifting} />
        </>
    );
}

/** Temporarily dims the scene during tree-shift transitions */
function ShiftDarknessEffect({ active }: { active: boolean }) {
    const lightRef = useRef<AmbientLight>(null);

    useFrame(() => {
        if (!lightRef.current) return;
        const target = active ? 0.0 : 0.08;
        lightRef.current.intensity += (target - lightRef.current.intensity) * 0.05;
    });

    return <ambientLight ref={lightRef} intensity={active ? 0 : 0.08} color="#1a0f0a" />;
}
