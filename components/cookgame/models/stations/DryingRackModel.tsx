"use client";
import { PALETTE, matteMaterialProps } from '../palette';

interface Props {
  position?: [number, number, number];
  rotation?: [number, number, number];
}

export function DryingRackModel({ position = [0, 0, 0], rotation = [0, 0, 0] }: Props) {
  return (
    <group position={position} rotation={rotation}>
      {/* left upright (wood) */}
      <mesh castShadow receiveShadow position={[-0.8, 0.75, 0]}>
        <boxGeometry args={[0.08, 1.5, 0.08]} />
        <meshStandardMaterial {...matteMaterialProps(PALETTE.wood)} />
      </mesh>
      {/* right upright (wood) */}
      <mesh castShadow receiveShadow position={[0.8, 0.75, 0]}>
        <boxGeometry args={[0.08, 1.5, 0.08]} />
        <meshStandardMaterial {...matteMaterialProps(PALETTE.wood)} />
      </mesh>
      {/* top rail (metal) */}
      <mesh castShadow receiveShadow position={[0, 1.52, 0]}>
        <boxGeometry args={[1.7, 0.06, 0.06]} />
        <meshStandardMaterial {...matteMaterialProps(PALETTE.metal)} />
      </mesh>
      {/* lower cross-brace (wood) */}
      <mesh castShadow receiveShadow position={[0, 0.3, 0]}>
        <boxGeometry args={[1.66, 0.05, 0.05]} />
        <meshStandardMaterial {...matteMaterialProps(PALETTE.wood)} />
      </mesh>
      {/* back leg brace left */}
      <mesh castShadow receiveShadow position={[-0.8, 0.55, -0.22]} rotation={[0.38, 0, 0]}>
        <boxGeometry args={[0.06, 0.5, 0.06]} />
        <meshStandardMaterial {...matteMaterialProps(PALETTE.wood)} />
      </mesh>
      {/* back leg brace right */}
      <mesh castShadow receiveShadow position={[0.8, 0.55, -0.22]} rotation={[0.38, 0, 0]}>
        <boxGeometry args={[0.06, 0.5, 0.06]} />
        <meshStandardMaterial {...matteMaterialProps(PALETTE.wood)} />
      </mesh>

      {/* hanging bundle A — three small foliage rods, slightly angled */}
      <group position={[-0.42, 1.35, 0]}>
        <mesh castShadow position={[0, -0.15, 0]} rotation={[0.1, 0, 0.04]}>
          <cylinderGeometry args={[0.04, 0.06, 0.32, 5]} />
          <meshStandardMaterial {...matteMaterialProps(PALETTE.foliage)} />
        </mesh>
        <mesh castShadow position={[0.08, -0.13, 0.04]} rotation={[-0.08, 0, 0.08]}>
          <cylinderGeometry args={[0.03, 0.05, 0.28, 5]} />
          <meshStandardMaterial {...matteMaterialProps(PALETTE.foliage)} />
        </mesh>
        <mesh castShadow position={[-0.07, -0.16, -0.03]} rotation={[0.05, 0, -0.06]}>
          <cylinderGeometry args={[0.03, 0.04, 0.25, 5]} />
          <meshStandardMaterial {...matteMaterialProps(PALETTE.foliage)} />
        </mesh>
        {/* twine knot (metal) */}
        <mesh castShadow position={[0, 0, 0]}>
          <boxGeometry args={[0.06, 0.05, 0.06]} />
          <meshStandardMaterial {...matteMaterialProps(PALETTE.metal)} />
        </mesh>
      </group>

      {/* hanging bundle B */}
      <group position={[0, 1.35, 0]}>
        <mesh castShadow position={[0, -0.18, 0]} rotation={[-0.06, 0, 0.03]}>
          <cylinderGeometry args={[0.05, 0.07, 0.38, 5]} />
          <meshStandardMaterial {...matteMaterialProps(PALETTE.foliage)} />
        </mesh>
        <mesh castShadow position={[-0.09, -0.14, 0.05]} rotation={[0.07, 0, -0.05]}>
          <cylinderGeometry args={[0.03, 0.05, 0.26, 5]} />
          <meshStandardMaterial {...matteMaterialProps(PALETTE.foliage)} />
        </mesh>
        <mesh castShadow position={[0, 0, 0]}>
          <boxGeometry args={[0.06, 0.05, 0.06]} />
          <meshStandardMaterial {...matteMaterialProps(PALETTE.metal)} />
        </mesh>
      </group>

      {/* hanging bundle C */}
      <group position={[0.42, 1.35, 0]}>
        <mesh castShadow position={[0, -0.14, 0]} rotation={[0.08, 0, -0.04]}>
          <cylinderGeometry args={[0.04, 0.06, 0.3, 5]} />
          <meshStandardMaterial {...matteMaterialProps(PALETTE.foliage)} />
        </mesh>
        <mesh castShadow position={[0, 0, 0]}>
          <boxGeometry args={[0.06, 0.05, 0.06]} />
          <meshStandardMaterial {...matteMaterialProps(PALETTE.metal)} />
        </mesh>
      </group>
    </group>
  );
}
