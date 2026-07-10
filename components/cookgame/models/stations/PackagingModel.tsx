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

export function PackagingModel({ position = [0, 0, 0], rotation = [0, 0, 0] }: Props) {
  return (
    <group position={position} rotation={rotation}>
      {/* table top (wood) — bottom at y=0.69, top at y=0.75 */}
      <mesh castShadow receiveShadow position={[0, 0.72, 0]}>
        <boxGeometry args={[1.2, 0.06, 0.5]} />
        <meshStandardMaterial {...matteMaterialProps(PALETTE.wood)} />
      </mesh>

      {/* table legs (metal) */}
      {LEG_POSITIONS.map(([x, z], i) => (
        <mesh key={i} castShadow position={[x, 0.34, z]}>
          <boxGeometry args={[0.05, 0.68, 0.05]} />
          <meshStandardMaterial {...matteMaterialProps(PALETTE.metal)} />
        </mesh>
      ))}

      {/* scale base platform (metal) */}
      <mesh castShadow receiveShadow position={[-0.3, 0.79, 0]}>
        <boxGeometry args={[0.3, 0.07, 0.24]} />
        <meshStandardMaterial {...matteMaterialProps(PALETTE.metal)} />
      </mesh>

      {/* scale vertical post */}
      <mesh castShadow position={[-0.3, 0.94, 0]}>
        <boxGeometry args={[0.03, 0.24, 0.03]} />
        <meshStandardMaterial {...matteMaterialProps(PALETTE.metal)} />
      </mesh>

      {/* scale arm (slightly tilted) */}
      <mesh castShadow position={[-0.3, 1.06, 0]} rotation={[0, 0, 0.12]}>
        <boxGeometry args={[0.34, 0.025, 0.025]} />
        <meshStandardMaterial {...matteMaterialProps(PALETTE.metal)} />
      </mesh>

      {/* scale pan (sidingA) */}
      <mesh castShadow position={[-0.15, 1.08, 0]}>
        <boxGeometry args={[0.15, 0.02, 0.13]} />
        <meshStandardMaterial {...matteMaterialProps(PALETTE.sidingA)} />
      </mesh>

      {/* baggie stack — 3 flat boxes */}
      <mesh castShadow receiveShadow position={[0.3, 0.775, 0.06]}>
        <boxGeometry args={[0.24, 0.03, 0.16]} />
        <meshStandardMaterial {...matteMaterialProps(PALETTE.stucco)} />
      </mesh>
      <mesh castShadow receiveShadow position={[0.3, 0.805, 0.06]}>
        <boxGeometry args={[0.24, 0.03, 0.16]} />
        <meshStandardMaterial {...matteMaterialProps(PALETTE.stucco)} />
      </mesh>
      <mesh castShadow receiveShadow position={[0.3, 0.835, 0.06]}>
        <boxGeometry args={[0.24, 0.03, 0.16]} />
        <meshStandardMaterial {...matteMaterialProps(PALETTE.roadMark)} />
      </mesh>

      {/* tape dispenser blob (accent) */}
      <mesh castShadow position={[0.3, 0.79, -0.12]}>
        <sphereGeometry args={[0.07, 7, 6]} />
        <meshStandardMaterial {...matteMaterialProps(PALETTE.accent)} />
      </mesh>
    </group>
  );
}
