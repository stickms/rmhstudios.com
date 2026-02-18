'use client';

import { useThree, useFrame, createPortal } from '@react-three/fiber';
import { useRef, useState, useEffect } from 'react';
import * as THREE from 'three';

type WeaponState = 'idle' | 'firing' | 'reloading';

export default function WeaponSystem() {
    const { camera, scene } = useThree();

    // Weapon Stats (CS2 Style)
    const fireRate = 0.1; // 100ms between shots
    const damage = 25;

    // State
    const lastFire = useRef(0);
    const recoil = useRef(new THREE.Vector2(0, 0));
    const isFiring = useRef(false);
    const [tracers, setTracers] = useState<{ id: number; start: THREE.Vector3; end: THREE.Vector3 }[]>([]);

    // Listen for mouse clicks to fire
    useEffect(() => {
        const onMouseDown = (e: MouseEvent) => {
            // Only fire on left click and when pointer is locked
            if (e.button === 0 && document.pointerLockElement) {
                isFiring.current = true;
            }
        };
        const onMouseUp = () => (isFiring.current = false);
        document.addEventListener('mousedown', onMouseDown);
        document.addEventListener('mouseup', onMouseUp);
        return () => {
            document.removeEventListener('mousedown', onMouseDown);
            document.removeEventListener('mouseup', onMouseUp);
        };
    }, []);

    useFrame((state) => {
        // Recoil recovery
        recoil.current.lerp(new THREE.Vector2(0, 0), 0.1);

        // Auto-fire while held
        if (isFiring.current && state.clock.getElapsedTime() > lastFire.current + fireRate) {
            fire(state.clock.getElapsedTime());
        }
    });

    const fire = (time: number) => {
        lastFire.current = time;

        // Add recoil
        recoil.current.add(new THREE.Vector2((Math.random() - 0.5) * 0.05, 0.05));

        // Hitscan raycast from center of screen
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);

        const intersects = raycaster.intersectObjects(scene.children, true);
        const hit = intersects.find(i => i.object.type === 'Mesh' || i.object.type === 'InstancedMesh');

        const start = new THREE.Vector3(0.3, -0.3, -0.5).applyMatrix4(camera.matrixWorld);
        let end = raycaster.ray.at(150, new THREE.Vector3());

        if (hit) {
            end = hit.point.clone();
            if (hit.object.userData.isEnemy) {
                hit.object.userData.takeDamage?.(damage);
            }
        }

        // Spawn tracer
        const id = Date.now() + Math.random();
        setTracers(prev => [...prev, { id, start, end }]);
        setTimeout(() => setTracers(prev => prev.filter(t => t.id !== id)), 80);
    };

    return (
        <group>
            {/* Bullet tracers */}
            {tracers.map(t => (
                <line key={t.id}>
                    <bufferGeometry>
                        <float32BufferAttribute
                            attach="attributes-position"
                            args={[new Float32Array([
                                t.start.x, t.start.y, t.start.z,
                                t.end.x, t.end.y, t.end.z
                            ]), 3]}
                        />
                    </bufferGeometry>
                    <lineBasicMaterial color="#ffee44" transparent opacity={0.9} />
                </line>
            ))}

            {/* Gun model — rendered in camera space via portal */}
            {createPortal(
                <group position={[0.28, -0.22, -0.5]}>
                    {/* Barrel */}
                    <mesh>
                        <boxGeometry args={[0.06, 0.06, 0.35]} />
                        <meshStandardMaterial color="#222" metalness={0.9} roughness={0.2} />
                    </mesh>
                    {/* Body */}
                    <mesh position={[0, -0.05, 0.05]}>
                        <boxGeometry args={[0.08, 0.12, 0.22]} />
                        <meshStandardMaterial color="#333" metalness={0.7} roughness={0.4} />
                    </mesh>
                    {/* Grip */}
                    <mesh position={[0, -0.14, 0.1]} rotation={[0.3, 0, 0]}>
                        <boxGeometry args={[0.07, 0.14, 0.07]} />
                        <meshStandardMaterial color="#1a1a1a" roughness={0.8} />
                    </mesh>
                    {/* Sight */}
                    <mesh position={[0, 0.05, -0.05]}>
                        <boxGeometry args={[0.02, 0.03, 0.02]} />
                        <meshStandardMaterial color="#ff0000" emissive="#ff0000" emissiveIntensity={2} />
                    </mesh>
                </group>,
                camera
            )}
        </group>
    );
}
