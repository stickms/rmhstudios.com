'use client';

import { RigidBody } from '@react-three/rapier';
import { useNarrativeStore } from '@/lib/echoes/campaign/NarrativeStore';
import { useRef, useMemo } from 'react';
import * as THREE from 'three';

// Procedural texture generator
function createGridTexture(size = 512, color1 = '#1a1a2e', color2 = '#16213e', gridColor = '#0f3460') {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    // Base fill
    ctx.fillStyle = color1;
    ctx.fillRect(0, 0, size, size);

    // Grid lines
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    const gridSize = size / 8;
    for (let i = 0; i <= size; i += gridSize) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, size);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(size, i);
        ctx.stroke();
    }

    // Subtle noise
    for (let i = 0; i < 2000; i++) {
        const x = Math.random() * size;
        const y = Math.random() * size;
        ctx.fillStyle = `rgba(100,150,255,${Math.random() * 0.05})`;
        ctx.fillRect(x, y, 2, 2);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(4, 4);
    return texture;
}

function createMetalTexture(size = 512) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#2a2a3a';
    ctx.fillRect(0, 0, size, size);

    // Horizontal brushed metal lines
    for (let i = 0; i < size; i += 4) {
        ctx.strokeStyle = `rgba(${80 + Math.random() * 40}, ${80 + Math.random() * 40}, ${100 + Math.random() * 40}, 0.3)`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(size, i);
        ctx.stroke();
    }

    // Rivets
    for (let x = 32; x < size; x += 64) {
        for (let y = 32; y < size; y += 64) {
            ctx.fillStyle = '#555';
            ctx.beginPath();
            ctx.arc(x, y, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#888';
            ctx.beginPath();
            ctx.arc(x - 1, y - 1, 2, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    return texture;
}

function createGlowTexture(color = '#00ffff') {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    const gradient = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    gradient.addColorStop(0, color);
    gradient.addColorStop(0.3, color + '88');
    gradient.addColorStop(1, 'transparent');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 256, 256);

    return new THREE.CanvasTexture(canvas);
}

export default function OutpostLevel() {
    const floorTexture = useMemo(() => typeof window !== 'undefined' ? createGridTexture() : null, []);
    const metalTexture = useMemo(() => typeof window !== 'undefined' ? createMetalTexture() : null, []);

    return (
        <group>
            {/* Main Hall Floor */}
            <RigidBody type="fixed" friction={2}>
                <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
                    <planeGeometry args={[60, 60]} />
                    <meshStandardMaterial
                        map={floorTexture}
                        roughness={0.3}
                        metalness={0.2}
                        color="#aaaaff"
                    />
                </mesh>
            </RigidBody>

            {/* Ceiling */}
            <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 8, 0]}>
                <planeGeometry args={[60, 60]} />
                <meshStandardMaterial map={metalTexture} roughness={0.8} color="#334" />
            </mesh>

            {/* Walls */}
            <Wall position={[0, 4, -30]} rotation={[0, 0, 0]} size={[60, 8]} texture={metalTexture} />
            <Wall position={[0, 4, 30]} rotation={[0, Math.PI, 0]} size={[60, 8]} texture={metalTexture} />
            <Wall position={[-30, 4, 0]} rotation={[0, Math.PI / 2, 0]} size={[60, 8]} texture={metalTexture} />
            <Wall position={[30, 4, 0]} rotation={[0, -Math.PI / 2, 0]} size={[60, 8]} texture={metalTexture} />

            {/* Cryo Pods */}
            <CryoPod position={[-5, 0, -8]} />
            <CryoPod position={[5, 0, -8]} />
            <CryoPod position={[-5, 0, 8]} />
            <CryoPod position={[5, 0, 8]} />

            {/* Glowing floor strips */}
            <GlowStrip position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]} color="#00ffff" />
            <GlowStrip position={[0, 0.01, -5]} rotation={[-Math.PI / 2, 0, 0]} color="#ff00ff" />

            {/* NPC Elara */}
            <InteractiveNPC
                position={[0, 0, -12]}
                dialogueId="intro_elara"
                color="#ff00ff"
            />

            {/* Terminal */}
            <InteractiveObject
                position={[10, 0, 0]}
                dialogueId="examine_terminal"
                color="#00ffff"
            />

            {/* Atmospheric lights */}
            <pointLight position={[0, 6, 0]} color="#ffffff" intensity={3} castShadow distance={30} />
            <pointLight position={[-10, 3, -10]} color="#ff00ff" intensity={2} distance={15} />
            <pointLight position={[10, 3, 10]} color="#00ffff" intensity={2} distance={15} />
            <pointLight position={[-10, 3, 10]} color="#0088ff" intensity={1.5} distance={15} />
            <pointLight position={[10, 3, -10]} color="#ff8800" intensity={1} distance={15} />
        </group>
    );
}

function Wall({ position, rotation, size, texture }: {
    position: [number, number, number],
    rotation: [number, number, number],
    size: [number, number],
    texture: THREE.CanvasTexture | null
}) {
    return (
        <RigidBody type="fixed">
            <mesh position={position} rotation={rotation} receiveShadow>
                <planeGeometry args={size} />
                <meshStandardMaterial map={texture} roughness={0.7} metalness={0.3} color="#8899bb" />
            </mesh>
        </RigidBody>
    );
}

function GlowStrip({ position, rotation, color }: {
    position: [number, number, number],
    rotation: [number, number, number],
    color: string
}) {
    return (
        <mesh position={position} rotation={rotation}>
            <planeGeometry args={[20, 0.3]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={2} />
        </mesh>
    );
}

function CryoPod({ position }: { position: [number, number, number] }) {
    const metalTexture = useMemo(() => typeof window !== 'undefined' ? createMetalTexture() : null, []);

    return (
        <RigidBody position={position} type="fixed" colliders="cuboid">
            {/* Pod body */}
            <mesh castShadow receiveShadow position={[0, 1.5, 0]}>
                <boxGeometry args={[2, 3, 4]} />
                <meshStandardMaterial map={metalTexture} roughness={0.2} metalness={0.9} color="#aabbcc" />
            </mesh>
            {/* Glass panel */}
            <mesh position={[0, 1.8, 2.01]}>
                <planeGeometry args={[1.6, 2.4]} />
                <meshStandardMaterial color="#00ffff" transparent opacity={0.25} emissive="#00ffff" emissiveIntensity={0.3} />
            </mesh>
            {/* Status light */}
            <pointLight position={[0, 3.2, 0]} color="#00ff88" intensity={0.8} distance={3} />
        </RigidBody>
    );
}

function InteractiveNPC({ position, dialogueId, color }: {
    position: [number, number, number],
    dialogueId: string,
    color: string
}) {
    return (
        <RigidBody position={position} type="fixed" colliders="cuboid">
            {/* Body */}
            <mesh
                castShadow
                position={[0, 1, 0]}
                userData={{ interactive: true, type: 'npc', dialogueId }}
            >
                <capsuleGeometry args={[0.4, 1.6, 8, 16]} />
                <meshStandardMaterial color="#334" roughness={0.5} metalness={0.5} />
            </mesh>
            {/* Head */}
            <mesh position={[0, 2.2, 0]}>
                <sphereGeometry args={[0.35, 16, 16]} />
                <meshStandardMaterial color="#cc9977" roughness={0.8} />
            </mesh>
            {/* Suit glow trim */}
            <mesh position={[0, 1, 0]}>
                <capsuleGeometry args={[0.42, 1.6, 8, 16]} />
                <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.3} transparent opacity={0.15} wireframe />
            </mesh>
            {/* Name light */}
            <pointLight position={[0, 3, 0]} color={color} intensity={2} distance={5} />
        </RigidBody>
    );
}

function InteractiveObject({ position, dialogueId, color }: {
    position: [number, number, number],
    dialogueId: string,
    color: string
}) {
    const metalTexture = useMemo(() => typeof window !== 'undefined' ? createMetalTexture() : null, []);

    return (
        <RigidBody position={position} type="fixed" colliders="cuboid">
            {/* Terminal base */}
            <mesh castShadow position={[0, 0.6, 0]}>
                <boxGeometry args={[1.2, 1.2, 0.4]} />
                <meshStandardMaterial map={metalTexture} roughness={0.3} metalness={0.8} color="#aabbcc" />
            </mesh>
            {/* Screen */}
            <mesh
                position={[0, 0.6, 0.21]}
                userData={{ interactive: true, type: 'npc', dialogueId }}
            >
                <planeGeometry args={[0.9, 0.7]} />
                <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1} />
            </mesh>
            {/* Screen glow */}
            <pointLight position={[0, 0.6, 0.5]} color={color} intensity={1.5} distance={4} />
        </RigidBody>
    );
}
