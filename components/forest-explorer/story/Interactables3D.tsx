'use client';

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, type Group, type Mesh, type PointLight, type MeshStandardMaterial } from 'three';
import { useStoryStore } from '@/lib/forest-explorer/store';
import { getInteractablesByAct } from '@/lib/forest-explorer/interactables';
import { isPuzzleLocked } from '@/lib/forest-explorer/puzzleDefinitions';
import type { InteractableDefinition } from '@/lib/forest-explorer/types';

/**
 * Physical presence for every puzzle stone and journal item in the current
 * act. Previously these were invisible trigger points — impossible to find.
 *
 * - Puzzle stones: a rune pedestal with a floating sigil.
 *   hidden → faint shimmer · revealed → blue glow · locked → amber · solved → green ember
 * - Journal items: a floating page that glows when revealed; before being
 *   revealed, a tiny firefly-like spark marks the spot so sharp eyes can
 *   catch it in the dark.
 */
export function Interactables3D() {
    const currentAct = useStoryStore(s => s.currentAct);
    const items = useMemo(() => getInteractablesByAct(currentAct), [currentAct]);

    return (
        <>
            {items.map(item => {
                if (item.type === 'puzzle_stone') return <RunePedestal key={item.id} item={item} />;
                if (item.type === 'journal_item') return <JournalPage key={item.id} item={item} />;
                return null; // landmarks & portals have their own scene meshes
            })}
        </>
    );
}

// ─── Puzzle stone pedestal ──────────────────────────────────────────────────

function RunePedestal({ item }: { item: InteractableDefinition }) {
    const sigilRef = useRef<Mesh>(null);
    const lightRef = useRef<PointLight>(null);
    const revealed = useStoryStore(s => s.flashlightRevealedIds.includes(item.id));
    const solved = useStoryStore(s => item.puzzleId ? s.puzzleStates[item.puzzleId]?.status === 'solved' : false);
    const locked = useStoryStore(s => item.puzzleId ? isPuzzleLocked(item.puzzleId, s.puzzleStates) : false);

    const color = solved ? '#33cc77' : locked ? '#e09a3a' : '#5f8dff';

    useFrame((state) => {
        const t = state.clock.elapsedTime;
        if (sigilRef.current) {
            sigilRef.current.rotation.y = t * (solved ? 0.25 : 0.8);
            sigilRef.current.position.y = 1.35 + Math.sin(t * 1.6 + item.position[0]) * 0.08;
            const mat = sigilRef.current.material as MeshStandardMaterial;
            const target = solved ? 0.45 : revealed ? 1.2 + Math.sin(t * 3) * 0.35 : 0.08;
            mat.emissiveIntensity += (target - mat.emissiveIntensity) * 0.1;
            mat.emissive.set(color);
            mat.opacity += (((revealed || solved) ? 0.95 : 0.25) - mat.opacity) * 0.1;
        }
        if (lightRef.current) {
            const target = solved ? 0.5 : revealed ? 1.1 + Math.sin(t * 3) * 0.25 : 0;
            lightRef.current.intensity += (target - lightRef.current.intensity) * 0.1;
            lightRef.current.color.set(color);
        }
    });

    return (
        <group position={[item.position[0], 0, item.position[2]]}>
            {/* Stone pedestal */}
            <mesh position={[0, 0.42, 0]} castShadow>
                <cylinderGeometry args={[0.3, 0.44, 0.84, 6]} />
                <meshLambertMaterial color="#54544a" />
            </mesh>
            <mesh position={[0, 0.88, 0]}>
                <cylinderGeometry args={[0.36, 0.3, 0.1, 6]} />
                <meshLambertMaterial color="#66665a" />
            </mesh>
            {/* Floating sigil */}
            <mesh ref={sigilRef} position={[0, 1.35, 0]}>
                <octahedronGeometry args={[0.22, 0]} />
                <meshStandardMaterial
                    color={color}
                    transparent
                    opacity={0.25}
                    emissive={new Color(color)}
                    emissiveIntensity={0.08}
                />
            </mesh>
            <pointLight ref={lightRef} position={[0, 1.4, 0]} intensity={0} distance={7} decay={2} />
        </group>
    );
}

// ─── Journal page ───────────────────────────────────────────────────────────

function JournalPage({ item }: { item: InteractableDefinition }) {
    const groupRef = useRef<Group>(null);
    const pageRef = useRef<Mesh>(null);
    const sparkRef = useRef<Mesh>(null);
    const revealed = useStoryStore(s => s.flashlightRevealedIds.includes(item.id));
    const discovered = useStoryStore(s =>
        item.journalEntryId ? s.discoveredEntries.includes(item.journalEntryId) : false);

    useFrame((state) => {
        const t = state.clock.elapsedTime;
        if (groupRef.current) {
            groupRef.current.position.y = item.position[1] + 0.35 + Math.sin(t * 1.3 + item.position[2]) * 0.07;
            groupRef.current.rotation.y = Math.sin(t * 0.5 + item.position[0]) * 0.4;
        }
        if (pageRef.current) {
            const mat = pageRef.current.material as MeshStandardMaterial;
            const targetEm = discovered ? 0.12 : revealed ? 0.85 : 0.15;
            mat.emissiveIntensity += (targetEm - mat.emissiveIntensity) * 0.1;
            const targetOp = revealed || discovered ? 0.95 : 0.3;
            mat.opacity += (targetOp - mat.opacity) * 0.1;
        }
        if (sparkRef.current) {
            // The unrevealed marker: a tiny drifting spark
            const mat = sparkRef.current.material as MeshStandardMaterial;
            const active = !revealed && !discovered;
            mat.emissiveIntensity = active ? 0.9 + Math.sin(t * 2.4 + item.position[0] * 3) * 0.5 : 0;
            mat.opacity = active ? 0.8 : 0;
            sparkRef.current.position.y = 0.25 + Math.sin(t * 1.8 + item.position[2] * 2) * 0.12;
        }
    });

    return (
        <group position={[item.position[0], 0, item.position[2]]}>
            <group ref={groupRef} position={[0, item.position[1] + 0.35, 0]}>
                <mesh ref={pageRef} rotation={[-0.35, 0, 0.08]}>
                    <boxGeometry args={[0.26, 0.02, 0.36]} />
                    <meshStandardMaterial
                        color="#e8dcb8"
                        transparent
                        opacity={0.3}
                        emissive={new Color('#ffedaa')}
                        emissiveIntensity={0.15}
                    />
                </mesh>
            </group>
            {/* Faint firefly spark marking undiscovered secrets */}
            <mesh ref={sparkRef} position={[0, 0.25, 0]}>
                <sphereGeometry args={[0.035, 6, 6]} />
                <meshStandardMaterial
                    color="#d4ff70"
                    transparent
                    opacity={0.8}
                    emissive={new Color('#d4ff70')}
                    emissiveIntensity={0.9}
                />
            </mesh>
        </group>
    );
}
