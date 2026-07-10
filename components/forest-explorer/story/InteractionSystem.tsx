'use client';

import { useFrame, useThree } from '@react-three/fiber';
import { useRef, useMemo } from 'react';
import { Vector3 } from 'three';
import { useStoryStore } from '@/lib/forest-explorer/store';
import { getInteractablesByAct } from '@/lib/forest-explorer/interactables';

/**
 * R3F component that runs every frame to:
 * 1. Check flashlight angle against flashlight_only interactables → reveal
 * 2. Check proximity to revealed interactables → set nearbyInteractable
 */
export function InteractionSystem() {
    const { camera } = useThree();
    const dir = useMemo(() => new Vector3(), []);

    const currentAct = useStoryStore(s => s.currentAct);
    const flashlightOn = useStoryStore(s => s.flashlightOn);
    const setFlashlightRevealed = useStoryStore(s => s.setFlashlightRevealed);
    const setNearbyInteractable = useStoryStore(s => s.setNearbyInteractable);
    const puzzleStates = useStoryStore(s => s.puzzleStates);
    const storyFlags = useStoryStore(s => s.storyFlags);

    const interactables = useMemo(() => getInteractablesByAct(currentAct), [currentAct]);

    // Throttle to avoid hammering every frame
    const frameCount = useRef(0);

    // Reusable vectors for flashlight cone checks (no per-item allocation)
    const flatDir = useMemo(() => new Vector3(), []);
    const toObj = useMemo(() => new Vector3(), []);

    useFrame(() => {
        frameCount.current++;
        if (frameCount.current % 3 !== 0) return; // Check every 3rd frame

        camera.getWorldDirection(dir);
        const px = camera.position.x;
        const pz = camera.position.z;

        // Flatten camera direction to XZ plane so vertical tilt doesn't break reveal
        flatDir.set(dir.x, 0, dir.z).normalize();

        const revealedIds: string[] = [];
        let closest: { id: string; dist: number } | null = null;
        let closestPortal: { id: string; dist: number } | null = null;

        for (const inter of interactables) {
            // Skip portals until their gate puzzle is solved
            if (inter.type === 'portal') {
                const gatePuzzle = inter.act === 'act1' ? 'act1_gateway_opened' :
                    inter.act === 'act2' ? 'act2_gateway_opened' : null;
                if (gatePuzzle && !storyFlags[gatePuzzle]) continue;
            }

            const isPuzzleSolved = inter.puzzleId && puzzleStates[inter.puzzleId]?.status === 'solved';

            const dx = inter.position[0] - px;
            const dz = inter.position[2] - pz;
            const dist = Math.sqrt(dx * dx + dz * dz);

            // Reveal check per method
            if (inter.revealMethod === 'flashlight_only' && !isPuzzleSolved) {
                if (flashlightOn && dist < 40) {
                    toObj.set(dx, 0, dz).normalize();
                    const angle = flatDir.angleTo(toObj);
                    if (angle < 0.4) { // ~23 degrees — matches visual spotlight cone
                        revealedIds.push(inter.id);
                    }
                }
            } else if (inter.revealMethod === 'proximity' && !isPuzzleSolved) {
                // Proximity secrets fade in as the player draws near
                if (dist < 14) {
                    revealedIds.push(inter.id);
                }
            } else {
                // Always-visible items are always "revealed"
                revealedIds.push(inter.id);
            }

            // Proximity check — skip solved puzzles, track portals separately for priority
            if (dist < inter.interactionRadius && revealedIds.includes(inter.id) && !isPuzzleSolved) {
                if (inter.type === 'portal') {
                    if (!closestPortal || dist < closestPortal.dist) {
                        closestPortal = { id: inter.id, dist };
                    }
                } else {
                    if (!closest || dist < closest.dist) {
                        closest = { id: inter.id, dist };
                    }
                }
            }
        }

        // Only publish when the revealed set actually changed — a fresh array
        // every check re-rendered every landmark ~20×/sec for nothing
        const prev = useStoryStore.getState().flashlightRevealedIds;
        if (prev.length !== revealedIds.length || revealedIds.some((id, i) => id !== prev[i])) {
            setFlashlightRevealed(revealedIds);
        }
        // Portals always take priority when in range
        setNearbyInteractable((closestPortal ?? closest)?.id ?? null);
    });

    return null;
}
