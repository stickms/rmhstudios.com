'use client';

import { useRef, useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useStoryStore } from '@/lib/forest-explorer/store';
import { getInteractableById } from '@/lib/forest-explorer/interactables';
import { getActMap } from '@/lib/forest-explorer/actMaps';
import { GROUND_Y, GRAVITY, JUMP_VEL } from '../shared/constants';
import type { CorridorSegment } from '@/lib/forest-explorer/types';

// ─── Tree collider generation (mirrors act scene RNG) ──────────────────────

function buildTreeColliders(
    treeSeed: number,
    treeCount: number,
    mapRadius: number,
    landmarks: Array<{ position: [number, number, number] }>,
    corridors: CorridorSegment[],
) {
    const rng = (n: number) => {
        const x = Math.sin(n + treeSeed) * 43758.5453;
        return x - Math.floor(x);
    };

    const landmarkZones = landmarks.map(l => ({
        x: l.position[0], z: l.position[2], r: 8,
    }));

    const colliders: Array<{ x: number; z: number; r: number }> = [];

    for (let i = 0; i < treeCount; i++) {
        const s = i * 7.331;
        const angle = rng(s) * Math.PI * 2;
        const minR = i < 30 ? 8 : 15;
        const radius = minR + rng(s + 1) * (mapRadius * 0.7);
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;

        // Same rejection logic as act scenes
        const nearLandmark = landmarkZones.some(l => {
            const dx = x - l.x, dz = z - l.z;
            return dx * dx + dz * dz < l.r * l.r;
        });
        if (nearLandmark) continue;

        // Reject trees inside corridors (same as ActTwoScene/ActThreeScene)
        const inCorridor = corridors.some(c => {
            return distToSegment(x, z, c.start[0], c.start[1], c.end[0], c.end[1]) < c.width / 2;
        });
        if (inCorridor) continue;

        const giant = rng(s + 4) < 0.22;
        const scale = giant
            ? 1.8 + rng(s + 2) * 0.75
            : 0.45 + rng(s + 2) * 0.90;

        colliders.push({ x, z, r: 0.28 * scale + 0.45 });
    }

    return colliders;
}

/** Distance from point (px,pz) to line segment (ax,az)-(bx,bz) */
function distToSegment(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
    const dx = bx - ax, dz = bz - az;
    const lenSq = dx * dx + dz * dz;
    if (lenSq === 0) return Math.sqrt((px - ax) ** 2 + (pz - az) ** 2);
    let t = ((px - ax) * dx + (pz - az) * dz) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const projX = ax + t * dx, projZ = az + t * dz;
    return Math.sqrt((px - projX) ** 2 + (pz - projZ) ** 2);
}

/**
 * Story mode player controller.
 * WASD/jump/sprint movement with E-key interaction, Tab journal, F flashlight.
 * Includes circular boundary, tree collision, and corridor-aware collision.
 * Pushes player position into the Zustand store (throttled) for interaction checks.
 */
export function StoryPlayer() {
    const { camera } = useThree();
    const keys = useRef<Record<string, boolean>>({});
    const localVel = useRef(new THREE.Vector2(0, 0));
    const verticalVel = useRef(0);
    const isGrounded = useRef(true);
    const posFrameCount = useRef(0);

    const currentAct = useStoryStore(s => s.currentAct);
    const setPlayerPosition = useStoryStore(s => s.setPlayerPosition);
    const setPlayerRotation = useStoryStore(s => s.setPlayerRotation);
    const setFlashlight = useStoryStore(s => s.setFlashlight);
    const toggleJournal = useStoryStore(s => s.toggleJournal);
    const openPuzzle = useStoryStore(s => s.openPuzzle);
    const discoverEntry = useStoryStore(s => s.discoverEntry);
    const visitLandmark = useStoryStore(s => s.visitLandmark);
    const showPuzzleOverlay = useStoryStore(s => s.showPuzzleOverlay);
    const journalOpen = useStoryStore(s => s.journalOpen);
    const playerPosition = useStoryStore(s => s.playerPosition);

    // Derive map config from current act
    const actConfig = useMemo(() => getActMap(currentAct), [currentAct]);

    // Build tree colliders once per act (deterministic, mirrors act scene generation)
    const treeColliders = useMemo(() =>
        buildTreeColliders(
            actConfig.treeSeed,
            actConfig.treeCount,
            actConfig.mapRadius,
            actConfig.landmarks,
            actConfig.corridors,
        ),
        [actConfig],
    );

    // Spawn at checkpoint position
    useEffect(() => {
        camera.position.set(playerPosition[0], playerPosition[1], playerPosition[2]);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        const down = (e: KeyboardEvent) => {
            keys.current[e.code] = true;

            if (e.code === 'Space' && isGrounded.current) {
                verticalVel.current = JUMP_VEL;
                isGrounded.current = false;
                e.preventDefault();
            }

            // F — toggle flashlight
            if (e.code === 'KeyF') {
                setFlashlight(!useStoryStore.getState().flashlightOn);
            }

            // Tab — toggle journal
            if (e.code === 'Tab') {
                e.preventDefault();
                toggleJournal();
            }

            // E — interact with nearby object
            if (e.code === 'KeyE') {
                const state = useStoryStore.getState();
                if (state.showPuzzleOverlay || state.journalOpen) return;
                const nearby = state.nearbyInteractable;
                if (nearby) {
                    const inter = getInteractableById(nearby);
                    if (inter?.puzzleId) {
                        openPuzzle(inter.puzzleId);
                    } else if (inter?.journalEntryId) {
                        discoverEntry(inter.journalEntryId);
                        // Also save checkpoint if this is a landmark
                        if (inter.type === 'landmark') {
                            visitLandmark(inter.id, inter.label);
                        }
                    } else if (inter?.type === 'portal') {
                        useStoryStore.getState().setStoryFlag('portal_activated', true);
                    }
                }
            }
        };
        const up = (e: KeyboardEvent) => { keys.current[e.code] = false; };

        window.addEventListener('keydown', down);
        window.addEventListener('keyup', up);
        return () => {
            window.removeEventListener('keydown', down);
            window.removeEventListener('keyup', up);
        };
    }, [setFlashlight, toggleJournal, openPuzzle, discoverEntry, visitLandmark]);

    useFrame((_, delta) => {
        // Don't move if puzzle or journal is open
        if (showPuzzleOverlay || journalOpen) return;

        const k = keys.current;
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
        move.addScaledVector(camRight, localVel.current.x * delta);

        let nx = camera.position.x + move.x;
        let nz = camera.position.z + move.z;

        // Circular boundary (from act config)
        const boundDist = Math.sqrt(nx * nx + nz * nz);
        if (boundDist > actConfig.mapRadius) {
            nx = (nx / boundDist) * actConfig.mapRadius;
            nz = (nz / boundDist) * actConfig.mapRadius;
        }

        // Tree collision
        for (const t of treeColliders) {
            const dx = nx - t.x;
            const dz = nz - t.z;
            const distSq = dx * dx + dz * dz;
            if (distSq > 225 || distSq === 0) continue; // Skip if far away
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

        // Throttled store updates: position every 3rd frame, rotation every 6th
        posFrameCount.current++;
        if (posFrameCount.current % 3 === 0) {
            setPlayerPosition([camera.position.x, camera.position.y, camera.position.z]);
        }
        if (posFrameCount.current % 6 === 0) {
            const euler = new THREE.Euler().setFromQuaternion(camera.quaternion);
            setPlayerRotation([euler.x, euler.y]);
        }
    });

    return null;
}
