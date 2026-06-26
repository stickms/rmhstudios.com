"use client";
import { RigidBody, CuboidCollider } from '@react-three/rapier';
import { Building } from '../models/Building';
import { PALETTE, matteMaterialProps } from '../models/palette';
import { SupplierStallModel } from '../models/stations/SupplierStallModel';
import { MixingBenchModel } from '../models/stations/MixingBenchModel';
import { PackagingModel } from '../models/stations/PackagingModel';
import { GrowPlotModel } from '../models/stations/GrowPlotModel';
import { DryingRackModel } from '../models/stations/DryingRackModel';
import { ChemStationModel } from '../models/stations/ChemStationModel';
import { StreetProps } from '../models/props/StreetProps';
import { useCookgameStore } from '@/lib/cookgame/store';

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
export const PROPERTY_POSITION: [number, number, number] = [8, 0, -4];

// Stage-aware plot wrapper — the single allowed world-layer store read (selector, no writes).
function PlotVisual({ index, position }: { index: number; position: [number, number, number] }) {
  const stage = useCookgameStore((s) => s.inventory.plots[index]?.stage ?? 'empty');
  return <GrowPlotModel stage={stage} position={position} />;
}

function Wall({ pos, size }: { pos: [number, number, number]; size: [number, number, number] }) {
  return (
    <RigidBody type="fixed" colliders="cuboid" position={pos}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={size} />
        <meshStandardMaterial {...matteMaterialProps(PALETTE.wall)} />
      </mesh>
    </RigidBody>
  );
}


export function TownScene() {
  return (
    <group>
      {/* ground — grass, keep RigidBody collider */}
      <RigidBody type="fixed" colliders="cuboid">
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, 0, 0]}>
          <planeGeometry args={[40, 40]} />
          <meshStandardMaterial {...matteMaterialProps(PALETTE.grass)} />
        </mesh>
      </RigidBody>

      {/* lab building (player property) — house variant, collider [6,3,4] centred at y=1.5 */}
      <RigidBody type="fixed" colliders={false} position={[8, 1.5, -6]}>
        <CuboidCollider args={[3, 1.5, 2]} />
        {/* shift Building down by h/2 so its base (y=0) aligns with collider bottom (world y=0) */}
        <group position={[0, -1.5, 0]}>
          <Building variant="house" size={[6, 3, 4]} />
        </group>
      </RigidBody>

      {/* supplier shop — shop variant, collider [5,3,4] centred at y=1.5 */}
      <RigidBody type="fixed" colliders={false} position={[-8, 1.5, -6]}>
        <CuboidCollider args={[2.5, 1.5, 2]} />
        <group position={[0, -1.5, 0]}>
          <Building variant="shop" size={[5, 3, 4]} />
        </group>
      </RigidBody>

      {/* asphalt road — visual only, no collider */}
      <mesh position={[0, 0.01, 4]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[30, 6]} />
        <meshStandardMaterial {...matteMaterialProps(PALETTE.asphalt)} />
      </mesh>
      {/* sidewalk north edge */}
      <mesh position={[0, 0.015, 0.5]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[32, 1]} />
        <meshStandardMaterial {...matteMaterialProps(PALETTE.sidewalk)} />
      </mesh>
      {/* sidewalk south edge */}
      <mesh position={[0, 0.015, 7.5]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[32, 1]} />
        <meshStandardMaterial {...matteMaterialProps(PALETTE.sidewalk)} />
      </mesh>
      {/* road centre-line dashes */}
      {([-12, -9, -6, -3, 0, 3, 6, 9, 12] as number[]).map((x) => (
        <mesh key={x} position={[x, 0.02, 4]}>
          <boxGeometry args={[1.8, 0.01, 0.12]} />
          <meshStandardMaterial {...matteMaterialProps(PALETTE.roadMark)} />
        </mesh>
      ))}

      {/* station models */}
      <SupplierStallModel position={STATION_POSITIONS.supplier} />
      <MixingBenchModel position={STATION_POSITIONS.mixing} />
      <PackagingModel position={STATION_POSITIONS.packaging} />

      {/* grow plots — stage-aware via PlotVisual store selector */}
      {PLOT_POSITIONS.map((p, i) => (
        <PlotVisual key={i} index={i} position={p} />
      ))}

      {/* drying rack */}
      <DryingRackModel position={DRYING_POSITION} />

      {/* chemistry station */}
      <ChemStationModel position={CHEM_POSITION} />

      {/* boundary walls */}
      <Wall pos={[0, 2, -20]} size={[40, 4, 0.5]} />
      <Wall pos={[0, 2, 20]} size={[40, 4, 0.5]} />
      <Wall pos={[-20, 2, 0]} size={[0.5, 4, 40]} />
      <Wall pos={[20, 2, 0]} size={[0.5, 4, 40]} />

      {/* instanced street set dressing */}
      <StreetProps />
    </group>
  );
}
