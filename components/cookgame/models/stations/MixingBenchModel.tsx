"use client";
import { PALETTE, matteMaterialProps } from '../palette';

interface Props {
  position?: [number, number, number];
  rotation?: [number, number, number];
}

const LEG_POSITIONS: [number, number][] = [
  [-0.52, -0.2],
  [0.52, -0.2],
  [-0.52, 0.2],
  [0.52, 0.2],
];

export function MixingBenchModel({ position = [0, 0, 0], rotation = [0, 0, 0] }: Props) {
  return (
    <group position={position} rotation={rotation}>
      {/* bench top (wood) — bottom at y=0.68, top at y=0.76 */}
      <mesh castShadow receiveShadow position={[0, 0.72, 0]}>
        <boxGeometry args={[1.2, 0.08, 0.5]} />
        <meshStandardMaterial {...matteMaterialProps(PALETTE.wood)} />
      </mesh>

      {/* legs (metal) — 4 corners, 0 to y=0.68 */}
      {LEG_POSITIONS.map(([x, z], i) => (
        <mesh key={i} castShadow position={[x, 0.34, z]}>
          <boxGeometry args={[0.06, 0.68, 0.06]} />
          <meshStandardMaterial {...matteMaterialProps(PALETTE.metal)} />
        </mesh>
      ))}

      {/* bowl / mortar outer (metal cylinder) */}
      <mesh castShadow receiveShadow position={[0, 0.82, 0]}>
        <cylinderGeometry args={[0.22, 0.24, 0.14, 8]} />
        <meshStandardMaterial {...matteMaterialProps(PALETTE.metal)} />
      </mesh>

      {/* bowl interior fill (stucco sphere — the mixture) */}
      <mesh position={[0, 0.89, 0]}>
        <sphereGeometry args={[0.17, 8, 6]} />
        <meshStandardMaterial {...matteMaterialProps(PALETTE.stucco)} />
      </mesh>

      {/* pestle handle (wood) — leaning at an angle */}
      <mesh castShadow position={[0.14, 1.06, 0]} rotation={[0, 0, -0.45]}>
        <cylinderGeometry args={[0.025, 0.03, 0.38, 6]} />
        <meshStandardMaterial {...matteMaterialProps(PALETTE.wood)} />
      </mesh>

      {/* jar 1 (accent) */}
      <mesh castShadow position={[-0.38, 0.83, 0.06]}>
        <cylinderGeometry args={[0.06, 0.065, 0.15, 7]} />
        <meshStandardMaterial {...matteMaterialProps(PALETTE.accent)} />
      </mesh>

      {/* jar 2 (sidingA) */}
      <mesh castShadow position={[-0.26, 0.82, -0.1]}>
        <cylinderGeometry args={[0.05, 0.055, 0.12, 7]} />
        <meshStandardMaterial {...matteMaterialProps(PALETTE.sidingA)} />
      </mesh>

      {/* jar 3 (roof tone) */}
      <mesh castShadow position={[0.4, 0.82, 0.02]}>
        <cylinderGeometry args={[0.055, 0.055, 0.11, 7]} />
        <meshStandardMaterial {...matteMaterialProps(PALETTE.roof)} />
      </mesh>
    </group>
  );
}
