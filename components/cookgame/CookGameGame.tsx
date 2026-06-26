"use client";
import { Canvas } from '@react-three/fiber';
import { Physics } from '@react-three/rapier';

export function CookGameGame() {
  return (
    <Canvas shadows camera={{ position: [0, 6, 10], fov: 55 }} className="w-full h-full">
      <ambientLight intensity={0.6} />
      <directionalLight position={[10, 12, 6]} intensity={1.2} castShadow />
      <Physics>
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[40, 40]} />
          <meshStandardMaterial color="#1f2937" />
        </mesh>
        <mesh position={[0, 1, 0]} castShadow>
          <boxGeometry args={[1, 2, 1]} />
          <meshStandardMaterial color="#84cc16" />
        </mesh>
      </Physics>
    </Canvas>
  );
}
