"use client";
import { RigidBody } from '@react-three/rapier';

// Anchor positions consumed by Interactables (Tasks 8/10) and station meshes.
export const STATION_POSITIONS = {
  supplier: [-8, 0, -3] as [number, number, number],
  mixing: [6, 0, -3] as [number, number, number],
  packaging: [9, 0, -3] as [number, number, number],
};
export const BUYER_POSITIONS = {
  doug: [-6, 0, 8] as [number, number, number],
  kim: [0, 0, 10] as [number, number, number],
  pablo: [7, 0, 8] as [number, number, number],
};
export const PLOT_POSITIONS: [number, number, number][] = [
  [-4, 0, -8], [0, 0, -8], [4, 0, -8],
];
export const DRYING_POSITION: [number, number, number] = [-9, 0, 2];
export const CHEM_POSITION: [number, number, number] = [12, 0, -3];

function Wall({ pos, size }: { pos: [number, number, number]; size: [number, number, number] }) {
  return (
    <RigidBody type="fixed" colliders="cuboid" position={pos}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={size} />
        <meshStandardMaterial color="#374151" />
      </mesh>
    </RigidBody>
  );
}

function Building({ pos, size, color }: { pos: [number, number, number]; size: [number, number, number]; color: string }) {
  return (
    <RigidBody type="fixed" colliders="cuboid" position={pos}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={size} />
        <meshStandardMaterial color={color} />
      </mesh>
    </RigidBody>
  );
}

export function TownScene() {
  return (
    <group>
      {/* ground */}
      <RigidBody type="fixed" colliders="cuboid">
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, 0, 0]}>
          <planeGeometry args={[40, 40]} />
          <meshStandardMaterial color="#1f2937" />
        </mesh>
      </RigidBody>

      {/* lab building (player property) + supplier shop */}
      <Building pos={[8, 1.5, -6]} size={[6, 3, 4]} color="#4b5563" />
      <Building pos={[-8, 1.5, -6]} size={[5, 3, 4]} color="#6b7280" />

      {/* decorative street strip */}
      <mesh position={[0, 0.01, 4]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[30, 6]} />
        <meshStandardMaterial color="#111827" />
      </mesh>

      {/* station markers */}
      <mesh position={[STATION_POSITIONS.supplier[0], 0.5, STATION_POSITIONS.supplier[2]]} castShadow>
        <boxGeometry args={[1.2, 1, 1.2]} />
        <meshStandardMaterial color="#22c55e" />
      </mesh>
      <mesh position={[STATION_POSITIONS.mixing[0], 0.5, STATION_POSITIONS.mixing[2]]} castShadow>
        <boxGeometry args={[1.2, 1, 1.2]} />
        <meshStandardMaterial color="#e879f9" />
      </mesh>
      <mesh position={[STATION_POSITIONS.packaging[0], 0.5, STATION_POSITIONS.packaging[2]]} castShadow>
        <boxGeometry args={[1.2, 1, 1.2]} />
        <meshStandardMaterial color="#f59e0b" />
      </mesh>

      {/* grow plot markers */}
      {PLOT_POSITIONS.map((pos, i) => (
        <mesh key={i} position={[pos[0], 0.3, pos[2]]} castShadow>
          <boxGeometry args={[1.2, 0.6, 1.2]} />
          <meshStandardMaterial color="#7c4a2d" />
        </mesh>
      ))}

      {/* drying rack marker */}
      <mesh position={[DRYING_POSITION[0], 0.5, DRYING_POSITION[2]]} castShadow>
        <boxGeometry args={[1.8, 1, 0.2]} />
        <meshStandardMaterial color="#9ca3af" />
      </mesh>

      {/* chemistry station marker */}
      <mesh position={[CHEM_POSITION[0], 0.5, CHEM_POSITION[2]]} castShadow>
        <boxGeometry args={[1.2, 1, 1.2]} />
        <meshStandardMaterial color="#22d3ee" />
      </mesh>

      {/* boundary walls */}
      <Wall pos={[0, 2, -20]} size={[40, 4, 0.5]} />
      <Wall pos={[0, 2, 20]} size={[40, 4, 0.5]} />
      <Wall pos={[-20, 2, 0]} size={[0.5, 4, 40]} />
      <Wall pos={[20, 2, 0]} size={[0.5, 4, 40]} />
    </group>
  );
}
