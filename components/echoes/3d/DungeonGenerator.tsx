'use client';

import { RigidBody, CuboidCollider } from '@react-three/rapier';
import { useMemo } from 'react';
import * as THREE from 'three';

const WALL_HEIGHT = 8;
const ROOM_SIZE = 20;
const WALL_THICKNESS = 1;

interface RoomData {
    x: number;
    z: number;
    doors: { top: boolean; bottom: boolean; left: boolean; right: boolean };
}

// Seed a simple random generator for consistent results
function seededRandom(seed: number): number {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
}

export default function DungeonGenerator() {
    // Procedural Generation Logic (Simplified for 3D)
    // Same Random Walker as before, but mapped to 3D coords
    
    const rooms = useMemo(() => {
        const generatedRooms: RoomData[] = [];
        const roomMap = new Map<string, RoomData>();

        let cx = 0;
        let cz = 0;

        const addRoom = (x: number, z: number) => {
            if (roomMap.has(`${x},${z}`)) return;
            const room = { x, z, doors: { top: false, bottom: false, left: false, right: false } };
            generatedRooms.push(room);
            roomMap.set(`${x},${z}`, room);
        };

        addRoom(0, 0); // Start

        for (let i = 0; i < 15; i++) {
            const dir = Math.floor(seededRandom(i * 7919) * 4); // Use fixed seed based on i
            if (dir === 0) cz -= 1;
            else if (dir === 1) cz += 1;
            else if (dir === 2) cx -= 1;
            else if (dir === 3) cx += 1;
            
            addRoom(cx, cz);
        }

        // Compute Doors
        generatedRooms.forEach(room => {
            room.doors.top = roomMap.has(`${room.x},${room.z - 1}`);
            room.doors.bottom = roomMap.has(`${room.x},${room.z + 1}`);
            room.doors.left = roomMap.has(`${room.x - 1},${room.z}`);
            room.doors.right = roomMap.has(`${room.x + 1},${room.z}`);
        });

        return generatedRooms;
    }, []);

    return (
        <group>
            {rooms.map((room, i) => (
                <Room key={i} data={room} />
            ))}
        </group>
    );
}

function Room({ data }: { data: RoomData }) {
    const { x, z, doors } = data;
    const wx = x * ROOM_SIZE;
    const wz = z * ROOM_SIZE;
    
    // Determine light color based on room position (deterministic, not random)
    const lightColor = (x + z) % 2 === 0 ? '#bf00ff' : '#00ffff';
    
    // Floor
    // const floorGeo = new THREE.PlaneGeometry(ROOM_SIZE, ROOM_SIZE);

    return (
        <group position={[wx, 0, wz]}>
            {/* Floor */}
            <RigidBody type="fixed" friction={2}>
                <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
                     <planeGeometry args={[ROOM_SIZE, ROOM_SIZE]} />
                     <meshStandardMaterial color="#1a1a1a" roughness={0.8} />
                </mesh>
            </RigidBody>

            {/* Ceiling */}
             <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, WALL_HEIGHT, 0]}>
                 <planeGeometry args={[ROOM_SIZE, ROOM_SIZE]} />
                 <meshStandardMaterial color="#111" />
            </mesh>

            {/* Walls */}
            <Wall pos={[0, WALL_HEIGHT / 2, -ROOM_SIZE / 2]} rot={[0, 0, 0]} hasDoor={doors.top} />
            <Wall pos={[0, WALL_HEIGHT / 2, ROOM_SIZE / 2]} rot={[0, 0, 0]} hasDoor={doors.bottom} />
            <Wall pos={[-ROOM_SIZE / 2, WALL_HEIGHT / 2, 0]} rot={[0, Math.PI / 2, 0]} hasDoor={doors.left} />
            <Wall pos={[ROOM_SIZE / 2, WALL_HEIGHT / 2, 0]} rot={[0, Math.PI / 2, 0]} hasDoor={doors.right} />
            
            {/* Light */}
             <pointLight position={[0, WALL_HEIGHT - 2, 0]} intensity={0.5} distance={15} color={lightColor} />
        </group>
    );
}

function Wall({ pos, rot, hasDoor }: { pos: [number, number, number], rot: [number, number, number], hasDoor: boolean }) {
    if (hasDoor) {
        // Door frame logic (skip for now, just open)
        // Maybe two side pillars?
        const offset = ROOM_SIZE / 4 + 2; // Open gap of 4 units
        const width = ROOM_SIZE / 2 - 2;
        
        return (
            <group position={pos} rotation={new THREE.Euler(...rot)}>
                <RigidBody type="fixed">
                    <mesh position={[-offset, 0, 0]} castShadow>
                        <boxGeometry args={[width, WALL_HEIGHT, WALL_THICKNESS]} />
                        <meshStandardMaterial color="#333" />
                    </mesh>
                </RigidBody>
                <RigidBody type="fixed">
                     <mesh position={[offset, 0, 0]} castShadow>
                        <boxGeometry args={[width, WALL_HEIGHT, WALL_THICKNESS]} />
                        <meshStandardMaterial color="#333" />
                    </mesh>
                </RigidBody>
                
                {/* Door Header */}
                <RigidBody type="fixed">
                     <mesh position={[0, 3, 0]} castShadow>
                        <boxGeometry args={[4, WALL_HEIGHT - 6, WALL_THICKNESS]} />
                        <meshStandardMaterial color="#333" />
                    </mesh>
                </RigidBody>
            </group>
        );
    }

    return (
        <RigidBody type="fixed" position={pos} rotation={new THREE.Euler(...rot)}>
             <mesh castShadow>
                <boxGeometry args={[ROOM_SIZE, WALL_HEIGHT, WALL_THICKNESS]} />
                <meshStandardMaterial color="#333" />
            </mesh>
        </RigidBody>
    );
}
