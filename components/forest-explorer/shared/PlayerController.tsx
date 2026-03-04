'use client';

import { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
    distToRiver,
    RIVER_HALF_WIDTH,
    RIVER_SAMPLE_POINTS,
    isOnBridge,
    TREE_COLLIDERS,
    PLAYER_POS,
    GROUND_Y,
    GRAVITY,
    JUMP_VEL,
} from './constants';

export function Player() {
    const { camera } = useThree();
    const keys       = useRef<Record<string, boolean>>({});
    const localVel   = useRef(new THREE.Vector2(0, 0));
    const verticalVel = useRef(0);
    const isGrounded  = useRef(true);

    useEffect(() => {
        camera.position.set(0, GROUND_Y, 0);

        const down = (e: KeyboardEvent) => {
            keys.current[e.code] = true;
            if (e.code === 'Space' && isGrounded.current) {
                verticalVel.current = JUMP_VEL;
                isGrounded.current = false;
                e.preventDefault();
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

        // Circular boundary (matches the circular tree wall) then collisions
        let nx = camera.position.x + move.x;
        let nz = camera.position.z + move.z;
        const boundDist = Math.sqrt(nx * nx + nz * nz);
        if (boundDist > 115) { nx = (nx / boundDist) * 115; nz = (nz / boundDist) * 115; }

        // River collision — push to nearest edge unless on a bridge
        const rDist = distToRiver(nx, nz);
        if (rDist < RIVER_HALF_WIDTH && !isOnBridge(nx, nz)) {
            let nearIdx = 0;
            let nearDistSq = Infinity;
            for (let i = 0; i < RIVER_SAMPLE_POINTS.length; i++) {
                const p = RIVER_SAMPLE_POINTS[i];
                const dx = nx - p.x, dz = nz - p.z;
                const d = dx * dx + dz * dz;
                if (d < nearDistSq) { nearDistSq = d; nearIdx = i; }
            }
            const nearP = RIVER_SAMPLE_POINTS[nearIdx];
            const dx = nx - nearP.x, dz = nz - nearP.z;
            const dist = Math.sqrt(dx * dx + dz * dz) || 0.001;
            nx = nearP.x + (dx / dist) * RIVER_HALF_WIDTH;
            nz = nearP.z + (dz / dist) * RIVER_HALF_WIDTH;
        }

        for (const t of TREE_COLLIDERS) {
            const dx = nx - t.x;
            const dz = nz - t.z;
            const distSq = dx * dx + dz * dz;
            if (distSq > 225 || distSq === 0) continue;
            const minDist = t.r;
            if (distSq < minDist * minDist) {
                const dist = Math.sqrt(distSq);
                nx = t.x + (dx / dist) * minDist;
                nz = t.z + (dz / dist) * minDist;
            }
        }

        camera.position.x = nx;
        camera.position.z = nz;

        // Update shared player position for torch light culling
        PLAYER_POS.x = nx;
        PLAYER_POS.z = nz;

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
