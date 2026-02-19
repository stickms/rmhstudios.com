'use client';

import { useFrame } from '@react-three/fiber';
import { InstancedRigidBodies, RapierRigidBody, RigidBody, InstancedRigidBodyProps } from '@react-three/rapier';
import { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import * as THREE from 'three';

const MAX_ENEMIES = 100;
const SPAWN_RATE = 2; // Seconds

export default function EnemyManager() {
    const [enemies, setEnemies] = useState<{ id: number; active: boolean }[]>([]);
    const meshRef = useRef<THREE.InstancedMesh>(null);
    const rigidBodiesRef = useRef<RapierRigidBody[]>(null);
    const lastSpawn = useRef(0);
    const playerPos = useRef(new THREE.Vector3());


// ...
    const instances = useMemo(() => {
        const instances: InstancedRigidBodyProps[] = [];
        for (let i = 0; i < MAX_ENEMIES; i++) {
            instances.push({
                key: i,
                position: [0, -200, 0] as [number, number, number], // Spawn far below world initially
                rotation: [0, 0, 0],
                scale: [1, 1, 1]
            });
        }
        return instances;
    }, []);

    const spawnEnemyLocal = useCallback(() => {
        // Find inactive slot
        const index = enemies.findIndex(e => !e.active);
        const slot = index === -1 ? enemies.length : index;
        
        if (slot >= MAX_ENEMIES) return;

        // Random Spawn Position
        const angle = Math.random() * Math.PI * 2;
        const dist = 20 + Math.random() * 10;
        const x = playerPos.current.x + Math.cos(angle) * dist;
        const z = playerPos.current.z + Math.sin(angle) * dist;

        if (index === -1) {
             setEnemies(prev => [...prev, { id: slot, active: true }]);
        } else {
             const newEnemies = [...enemies];
             newEnemies[slot].active = true;
             setEnemies(newEnemies);
        }

        // Teleport RB
        if (rigidBodiesRef.current && rigidBodiesRef.current[slot]) {
            rigidBodiesRef.current[slot].setTranslation({ x, y: 1, z }, true); // y:1 = ground level (half of 2-unit tall box)
            rigidBodiesRef.current[slot].setLinvel({ x: 0, y: 0, z: 0 }, true);
        }
    }, [enemies]);

    useFrame((state, delta) => {
        // Spawning Logic
        if (state.clock.getElapsedTime() > lastSpawn.current + SPAWN_RATE) {
            spawnEnemyLocal();
            lastSpawn.current = state.clock.getElapsedTime();
        }

        // AI Logic (Move towards player)
        if (rigidBodiesRef.current) {
            enemies.forEach((enemy, i) => {
                if (!enemy.active) return;
                
                const rb = rigidBodiesRef.current![i];
                if (!rb) return;

                const pos = rb.translation();
                // Read from global or local ref
                if (window.playerPos) {
                     playerPos.current.copy(window.playerPos);
                }
                const pPos = playerPos.current;
                
                const dir = new THREE.Vector3(pPos.x - pos.x, 0, pPos.z - pos.z).normalize();
                const speed = 5;
                
                rb.setLinvel({ x: dir.x * speed, y: rb.linvel().y, z: dir.z * speed }, true);
                
                // Update Instance Matrix (Visuals)
                const dummy = new THREE.Object3D();
                dummy.position.set(pos.x, pos.y, pos.z);
                dummy.updateMatrix();
                meshRef.current!.setMatrixAt(i, dummy.matrix);
            });
            meshRef.current!.instanceMatrix.needsUpdate = true;
        }
    });

    // Exposed method for weapon system to call
    useEffect(() => {
        // Global event listener for damage? Or pass prop?
        // Ideally we use a store. For now, simple event.
        const handleDamage = (e: CustomEvent<{ id: number; damage: number }>) => {
             // Handle death
             // console.log('Enemy Hit', e.detail);
        };
        // window.addEventListener('enemy-hit', handleDamage as any);
        // return () => window.removeEventListener('enemy-hit', handleDamage as any);
    }, []);

    return (
        <InstancedRigidBodies
            ref={rigidBodiesRef}
            instances={instances}
            colliders="cuboid"
        >
            <instancedMesh ref={meshRef} args={[undefined, undefined, MAX_ENEMIES]}>
                <boxGeometry args={[1, 2, 1]} />
                <meshStandardMaterial color="#ff2200" emissive="#ff0000" emissiveIntensity={1.5} roughness={0.4} />
            </instancedMesh>
        </InstancedRigidBodies>
    );
}


