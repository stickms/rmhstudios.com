'use client';

import * as THREE from 'three';

export function Moon() {
    return (
        <mesh position={[-200, 150, -200]}>
            <sphereGeometry args={[8, 16, 12]} />
            <meshStandardMaterial
                color="#e8eef5"
                emissive={new THREE.Color('#c8d8f0')}
                emissiveIntensity={0.6}
                roughness={0.9}
            />
        </mesh>
    );
}
