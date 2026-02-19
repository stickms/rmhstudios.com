'use client';

import { useThree, useFrame } from '@react-three/fiber';
import { useState, useRef, useEffect, useCallback } from 'react';
import * as THREE from 'three';
import { useNarrativeStore } from '@/lib/echoes/campaign/NarrativeStore';
import { Text as Text3D } from '@react-three/drei';

export default function InteractionController() {
    const { camera, scene } = useThree();
    const [hovered, setHovered] = useState<string | null>(null);
    const { startDialogue, addItem } = useNarrativeStore();

    const interact = useCallback(() => {
        if (!hovered) return;
        
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
        const intersects = raycaster.intersectObjects(scene.children, true);
        const hit = intersects.find(i => i.object.uuid === hovered);
        
        if (hit) {
            const data = hit.object.userData;
            if (data.type === 'npc') {
                startDialogue(data.dialogueId);
            } else if (data.type === 'item') {
                addItem(data.item);
                // Remove object?
                hit.object.visible = false; // Simple hide
            } else if (data.onClick) {
                data.onClick();
            }
        }
    }, [hovered, camera, scene, startDialogue, addItem]);

    useEffect(() => {
        const handleInteract = (e: KeyboardEvent) => {
            if (e.key === 'e' || e.key === 'E') {
                interact();
            }
        };
        window.addEventListener('keydown', handleInteract);
        return () => window.removeEventListener('keydown', handleInteract);
    }, [interact]);

    useFrame(() => {
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
        
        // Raycast against everything for now
        // In reality, we should tag interactive objects
        const intersects = raycaster.intersectObjects(scene.children, true);
        
        // Filter for interactive
        const hit = intersects.find(i => i.object.userData && i.object.userData.interactive);
        
        if (hit && hit.distance < 3) { // 3 meters range
            if (hovered !== hit.object.uuid) {
                setHovered(hit.object.uuid);
                // Show prompt logic here (global UI state?)
                document.body.style.cursor = 'pointer'; // Simple debug feedback
            }
        } else {
            if (hovered) {
                setHovered(null);
                document.body.style.cursor = 'auto';
            }
        }
    });

    return (
        <group>
            {/* Overlay */}
            {hovered && (
                <Text3D 
                    position={[0, 0, -1]} 
                    fontSize={0.1}
                    color="white"
                    anchorX="center"
                    anchorY="middle"
                >
                    [E] Interact
                </Text3D>
            )}
        </group>
    );
}

