"use client";
import { Canvas } from '@react-three/fiber';
import { Physics } from '@react-three/rapier';
import { TownScene } from './world/TownScene';
import { PlayerController } from './world/PlayerController';

export function CookGameGame() {
  return (
    <Canvas shadows camera={{ position: [0, 7, 17], fov: 55 }} className="w-full h-full">
      <ambientLight intensity={0.6} />
      <directionalLight position={[10, 12, 6]} intensity={1.2} castShadow />
      <Physics>
        <TownScene />
        <PlayerController />
      </Physics>
    </Canvas>
  );
}
