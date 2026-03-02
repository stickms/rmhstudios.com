'use client';

import { useRef, useMemo, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

export function Flashlight() {
    const { camera, scene } = useThree();
    const lightRef = useRef<THREE.SpotLight | null>(null);
    const dir = useMemo(() => new THREE.Vector3(), []);

    useEffect(() => {
        const light = new THREE.SpotLight('#ccdeff', 16, 65, 0.4, 0.5, 1.4);
        light.castShadow = false;
        scene.add(light);
        scene.add(light.target);
        lightRef.current = light;
        return () => {
            scene.remove(light);
            scene.remove(light.target);
            lightRef.current = null;
        };
    }, [scene]);

    useFrame(() => {
        const light = lightRef.current;
        if (!light) return;
        camera.getWorldDirection(dir);
        light.position.copy(camera.position);
        light.target.position.copy(camera.position).addScaledVector(dir, 6);
        light.target.updateMatrixWorld();
    });

    return null;
}
