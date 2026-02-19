'use client';

import { useKeyboardControls, KeyboardControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { RapierRigidBody, RigidBody, useRapier, CapsuleCollider } from '@react-three/rapier';
import { useRef, useState, useEffect } from 'react';
import * as THREE from 'three';
import { useNarrativeStore } from '@/lib/echoes/campaign/NarrativeStore';
import { useAchievementStore } from '@/lib/echoes/campaign/AchievementStore';

const SPEED = 10;
const SPRINT_mult = 1.5;
const JUMP_FORCE = 8;
const AIR_CONTROL = 0.3; // Source-engine style air strafe factor
const SLIDE_FORCE = 15;
const SLIDE_DECAY = 0.95;

import WeaponSystem from './WeaponSystem';
import InteractionController from './InteractionController';

export default function PlayerController() {
    return (
        <KeyboardControls
            map={[
                { name: 'forward', keys: ['ArrowUp', 'w', 'W'] },
                { name: 'backward', keys: ['ArrowDown', 's', 'S'] },
                { name: 'left', keys: ['ArrowLeft', 'a', 'A'] },
                { name: 'right', keys: ['ArrowRight', 'd', 'D'] },
                { name: 'jump', keys: ['Space'] },
                { name: 'sprint', keys: ['Shift'] },
                { name: 'crouch', keys: ['Control', 'c', 'C'] },
            ]}
        >
            <PlayerBody />
            <WeaponSystem />
            <InteractionController />
        </KeyboardControls>
    );
}

function PlayerBody() {
    const rigidBody = useRef<RapierRigidBody>(null);
    const { camera } = useThree();
    const [sub, get] = useKeyboardControls();
    const { rapier, world } = useRapier();
    const { currentDialogueId, endDialogue } = useNarrativeStore();
    const { unlock } = useAchievementStore();
    
    // State
    const [isGrounded, setIsGrounded] = useState(false);
    const [isSliding, setIsSliding] = useState(false);
    const [slideVector, setSlideVector] = useState(new THREE.Vector3());
    const hasMoved = useRef(false);

    // Refs for mutable values to avoid re-renders on every frame
    const playerPos = useRef(new THREE.Vector3());
    const isJumping = useRef(false);
    const yaw = useRef(0);   // horizontal rotation
    const pitch = useRef(0); // vertical rotation
    const slideVectorRef = useRef(new THREE.Vector3());

    useEffect(() => {
        // Lock cursor on canvas click
        const canvas = document.querySelector('canvas');
        if (canvas) {
            canvas.onclick = () => canvas.requestPointerLock();
        }

        // Keyboard: Enter/Space advances dialogue
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === 'f' || e.key === 'F') {
                if (currentDialogueId) endDialogue();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [currentDialogueId, endDialogue]);

    useFrame((state, delta) => {
        if (!rigidBody.current) return;

        const { forward, backward, left, right, jump, sprint, crouch } = get();
        
        // Sync camera to body
        const pos = rigidBody.current.translation();
        playerPos.current.set(pos.x, pos.y, pos.z);
        window.playerPos = playerPos.current;

        // Apply YXZ rotation (no roll)
        camera.rotation.set(pitch.current, yaw.current, 0, 'YXZ');

        // Camera height offset
        camera.position.copy(playerPos.current).add(new THREE.Vector3(0, isSliding ? 0.5 : 1.5, 0));

        // Achievement: first movement
        if ((forward || backward || left || right) && !hasMoved.current) {
            hasMoved.current = true;
            unlock('first_steps');
        }

        // Get Camera direction
        const frontVector = new THREE.Vector3(0, 0, Number(backward) - Number(forward));
        const sideVector = new THREE.Vector3(Number(left) - Number(right), 0, 0);
        const direction = new THREE.Vector3();
        
        direction
            .subVectors(frontVector, sideVector)
            .normalize()
            .applyEuler(new THREE.Euler(0, camera.rotation.y, 0)); // Relative to camera yaw

        // Raycast for Ground Check
        const rayOrigin = playerPos.current;
        const rayDir = { x: 0, y: -1, z: 0 };
        const ray = new rapier.Ray(rayOrigin, rayDir);
        const hit = world.castRay(ray, 1.1, true); // Slightly longer than half-height (1)
        const grounded = hit && hit.timeOfImpact < 1.1;
        setIsGrounded(!!grounded);

        // Movement Logic
        const currentVel = rigidBody.current.linvel();
        
        // Sliding
        if (crouch && grounded && !isSliding) {
            setIsSliding(true);
            // Boost in current direction
            const slideDir = direction.length() > 0 ? direction : new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(0, camera.rotation.y, 0));
            slideVectorRef.current = slideDir.multiplyScalar(SLIDE_FORCE);
        } else if (!crouch && isSliding) {
            setIsSliding(false);
        }

        let moveForce = direction.clone();
        
        if (isSliding) {
            // Sliding physics
            moveForce = slideVectorRef.current.clone();
            slideVectorRef.current.multiplyScalar(SLIDE_DECAY); // Friction
        } else {
             // Normal walking/sprinting
             const speed = sprint ? SPEED * SPRINT_mult : SPEED;
             moveForce.multiplyScalar(speed);
        }

        // Apply Velocity
        // If airborne, preserve momentum but allow some air strafe
        let newVelX = currentVel.x;
        let newVelZ = currentVel.z;

        if (grounded) {
             if (!isSliding) {
                 // Immediate ground control (Counter-Strike style)
                 newVelX = moveForce.x;
                 newVelZ = moveForce.z;
             } else {
                 newVelX = slideVectorRef.current.x;
                 newVelZ = slideVectorRef.current.z;
             }
        } else {
            // Air control (Physics based add)
            newVelX += moveForce.x * delta * AIR_CONTROL;
            newVelZ += moveForce.z * delta * AIR_CONTROL;
        }


        // Jumping
        if (jump && grounded && !isJumping.current) {
            rigidBody.current.setLinvel({ x: currentVel.x, y: JUMP_FORCE, z: currentVel.z }, true);
            isJumping.current = true;
            setTimeout(() => isJumping.current = false, 200); // Debounce
        } else {
            rigidBody.current.setLinvel({ x: newVelX, y: currentVel.y, z: newVelZ }, true);
        }

    });
    
    // Mouse Look — YXZ Euler order prevents camera roll  
    useEffect(() => {
        if (!camera) return;
        // Set the rotation order once
        const originalOrder = camera.rotation.order;
        // @ts-expect-error - THREE.js Euler type doesn't expose 'order' as settable, but it is at runtime
        camera.rotation.order = 'YXZ';
        
        const onMouseMove = (e: MouseEvent) => {
            if (document.pointerLockElement) {
                yaw.current -= e.movementX * 0.002;
                pitch.current -= e.movementY * 0.002; // -= so mouse up = look up
                pitch.current = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, pitch.current));
            }
        };
        document.addEventListener('mousemove', onMouseMove);
        return () => {
            document.removeEventListener('mousemove', onMouseMove);
            // Restore original order if component unmounts
            // @ts-expect-error - THREE.js Euler type doesn't expose 'order' as settable, but it is at runtime
            camera.rotation.order = originalOrder;
        };
    }, []);

    return (
        <RigidBody 
            ref={rigidBody} 
            colliders={false} 
            mass={1} 
            type="dynamic" 
            position={[0, 10, 0]} 
            enabledRotations={[false, false, false]} // Lock rotation, handle manually
            friction={0}
        >
            <CapsuleCollider args={[0.5, 0.5]} />
        </RigidBody>
    );
}
