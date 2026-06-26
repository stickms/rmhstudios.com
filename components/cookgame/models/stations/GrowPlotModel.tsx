"use client";
import type { GrowStage } from '@/lib/cookgame/types';
import { PALETTE, matteMaterialProps } from '../palette';

interface Props {
  stage: GrowStage;
  position?: [number, number, number];
}

// Plant submesh — pure view, switches on stage prop only.
function PlantMesh({ stage }: { stage: GrowStage }) {
  if (stage === 'empty') return null;

  if (stage === 'seedling') {
    return (
      <group>
        {/* tiny stem */}
        <mesh castShadow position={[0, 0.2, 0]}>
          <cylinderGeometry args={[0.03, 0.04, 0.18, 5]} />
          <meshStandardMaterial {...matteMaterialProps(PALETTE.foliage)} />
        </mesh>
        {/* seed leaves — two small flat boxes */}
        <mesh castShadow position={[0.06, 0.3, 0]} rotation={[0, 0, 0.35]}>
          <boxGeometry args={[0.12, 0.04, 0.08]} />
          <meshStandardMaterial {...matteMaterialProps(PALETTE.foliage)} />
        </mesh>
        <mesh castShadow position={[-0.06, 0.3, 0]} rotation={[0, 0, -0.35]}>
          <boxGeometry args={[0.12, 0.04, 0.08]} />
          <meshStandardMaterial {...matteMaterialProps(PALETTE.foliage)} />
        </mesh>
      </group>
    );
  }

  if (stage === 'vegetative') {
    return (
      <group>
        {/* main stem */}
        <mesh castShadow position={[0, 0.35, 0]}>
          <cylinderGeometry args={[0.05, 0.07, 0.5, 6]} />
          <meshStandardMaterial {...matteMaterialProps(PALETTE.wood)} />
        </mesh>
        {/* bushy leaf cluster */}
        <mesh castShadow position={[0, 0.65, 0]}>
          <boxGeometry args={[0.55, 0.4, 0.55]} />
          <meshStandardMaterial {...matteMaterialProps(PALETTE.foliage)} />
        </mesh>
        {/* side sprigs */}
        <mesh castShadow position={[0.24, 0.45, 0]} rotation={[0, 0, 0.5]}>
          <boxGeometry args={[0.26, 0.08, 0.2]} />
          <meshStandardMaterial {...matteMaterialProps(PALETTE.foliage)} />
        </mesh>
        <mesh castShadow position={[-0.24, 0.45, 0]} rotation={[0, 0, -0.5]}>
          <boxGeometry args={[0.26, 0.08, 0.2]} />
          <meshStandardMaterial {...matteMaterialProps(PALETTE.foliage)} />
        </mesh>
      </group>
    );
  }

  // flowering
  return (
    <group>
      {/* thick main stem */}
      <mesh castShadow position={[0, 0.45, 0]}>
        <cylinderGeometry args={[0.06, 0.09, 0.7, 6]} />
        <meshStandardMaterial {...matteMaterialProps(PALETTE.wood)} />
      </mesh>
      {/* full leaf canopy */}
      <mesh castShadow position={[0, 0.9, 0]}>
        <boxGeometry args={[0.75, 0.55, 0.75]} />
        <meshStandardMaterial {...matteMaterialProps(PALETTE.foliage)} />
      </mesh>
      {/* lower side leaves */}
      <mesh castShadow position={[0.3, 0.55, 0]} rotation={[0, 0, 0.45]}>
        <boxGeometry args={[0.32, 0.1, 0.28]} />
        <meshStandardMaterial {...matteMaterialProps(PALETTE.foliage)} />
      </mesh>
      <mesh castShadow position={[-0.3, 0.55, 0]} rotation={[0, 0, -0.45]}>
        <boxGeometry args={[0.32, 0.1, 0.28]} />
        <meshStandardMaterial {...matteMaterialProps(PALETTE.foliage)} />
      </mesh>
      {/* bud spheres (accent) */}
      <mesh castShadow position={[0, 1.22, 0]}>
        <sphereGeometry args={[0.14, 6, 5]} />
        <meshStandardMaterial {...matteMaterialProps(PALETTE.accent)} />
      </mesh>
      <mesh castShadow position={[0.2, 1.1, 0.15]}>
        <sphereGeometry args={[0.1, 6, 5]} />
        <meshStandardMaterial {...matteMaterialProps(PALETTE.accent)} />
      </mesh>
      <mesh castShadow position={[-0.18, 1.08, -0.12]}>
        <sphereGeometry args={[0.09, 6, 5]} />
        <meshStandardMaterial {...matteMaterialProps(PALETTE.accent)} />
      </mesh>
    </group>
  );
}

// GrowPlotModel — PURE VIEW. Reads nothing from the store.
export function GrowPlotModel({ stage, position = [0, 0, 0] }: Props) {
  return (
    <group position={position}>
      {/* planter box walls (wood) — base at y=0, top at y=0.55 */}
      <mesh castShadow receiveShadow position={[0, 0.275, 0]}>
        <boxGeometry args={[1.2, 0.55, 1.2]} />
        <meshStandardMaterial {...matteMaterialProps(PALETTE.wood)} />
      </mesh>
      {/* soil fill — inset slightly */}
      <mesh receiveShadow position={[0, 0.53, 0]}>
        <boxGeometry args={[1.08, 0.06, 1.08]} />
        <meshStandardMaterial {...matteMaterialProps(PALETTE.soil)} />
      </mesh>
      {/* plant submesh — switches by stage */}
      <PlantMesh stage={stage} />
    </group>
  );
}
