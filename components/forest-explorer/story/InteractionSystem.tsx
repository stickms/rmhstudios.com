'use client';

import { useFrame, useThree } from '@react-three/fiber';
import { useRef, useMemo } from 'react';
import * as THREE from 'three';
import { useStoryStore } from '@/lib/forest-explorer/store';
import { getInteractablesByAct } from '@/lib/forest-explorer/interactables';

/**
 * R3F component that runs every frame to:
 * 1. Check flashlight angle against flashlight_only interactables → reveal
 * 2. Check proximity to revealed interactables → set nearbyInteractable
 */
export function InteractionSystem() {
    const { camera } = useThree();
    const dir = useMemo(() => new THREE.Vector3(), []);

    const currentAct = useStoryStore(s => s.currentAct);
    const flashlightOn = useStoryStore(s => s.flashlightOn);
    const setFlashlightRevealed = useStoryStore(s => s.setFlashlightRevealed);
    const setNearbyInteractable = useStoryStore(s => s.setNearbyInteractable);
    const puzzleStates = useStoryStore(s => s.puzzleStates);
    const storyFlags = useStoryStore(s => s.storyFlags);

    const interactables = useMemo(() => getInteractablesByAct(currentAct), [currentAct]);

    // Throttle to avoid hammering every frame
    const frameCount = useRef(0);

    useFrame(() => {
        frameCount.current++;
        if (frameCount.current % 3 !== 0) return; // Check every 3rd frame

        camera.getWorldDirection(dir);
        const px = camera.position.x;
        const pz = camera.position.z;

        const revealedIds: string[] = [];
        let closest: { id: string; dist: number } | null = null;

        for (const inter of interactables) {
            // Skip portals until their gate puzzle is solved
            if (inter.type === 'portal') {
                const gatePuzzle = inter.act === 'act1' ? 'act1_gateway_opened' :
                    inter.act === 'act2' ? 'act2_gateway_opened' : null;
                if (gatePuzzle && !storyFlags[gatePuzzle]) continue;
            }

            // Skip already-solved puzzle stones (still interactable for re-read but with different state)
            const isPuzzleSolved = inter.puzzleId && puzzleStates[inter.puzzleId]?.status === 'solved';

            const dx = inter.position[0] - px;
            const dz = inter.position[2] - pz;
            const dist = Math.sqrt(dx * dx + dz * dz);

            // Flashlight reveal check
            if (inter.revealMethod === 'flashlight_only' && !isPuzzleSolved) {
                if (flashlightOn && dist < 40) {
                    const toObj = new THREE.Vector3(dx, 0, dz).normalize();
                    const angle = dir.angleTo(toObj);
                    if (angle < 0.35) { // ~20 degrees
                        revealedIds.push(inter.id);
                    }
                }
            } else {
                // Always-visible items are always "revealed"
                revealedIds.push(inter.id);
            }

            // Proximity check for interaction
            if (dist < inter.interactionRadius && revealedIds.includes(inter.id)) {
                if (!closest || dist < closest.dist) {
                    closest = { id: inter.id, dist };
                }
            }
        }

        setFlashlightRevealed(revealedIds);
        setNearbyInteractable(closest?.id ?? null);
    });

    return null;
}
