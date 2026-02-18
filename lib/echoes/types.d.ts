import * as THREE from 'three';

declare global {
    interface Window {
        playerPos: THREE.Vector3;
    }
}

export {};
