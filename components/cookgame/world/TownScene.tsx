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
import { DistrictScene } from './districts/DistrictScene';
import { Gate } from './Gate';

// ─── Suburbs anchors (consumed by Tasks 8/10) ────────────────────────────────

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

// ─── District anchors (Task 8 mounts interactables/NPCs here) ────────────────

/** Downtown — hardware supplier stall ground anchor. */
export const HARDWARE_POSITION: [number, number, number] = [0, 0, -38];
/** Downtown — buyer spot for Marcus. */
export const MARCUS_POSITION: [number, number, number] = [8, 0, -45];
/** Docks — afterhours supplier stall ground anchor. */
export const AFTERHOURS_POSITION: [number, number, number] = [-40, 0, 0];
/** Docks — buyer spot for Vera. */
export const VERA_POSITION: [number, number, number] = [-46, 0, 6];
/** Warehouse — buyer/contact spot for Silas. */
export const SILAS_POSITION: [number, number, number] = [0, 0, -78];

// ─── Stage-aware grow-plot wrapper (single allowed store read) ───────────────

function PlotVisual({ index, position }: { index: number; position: [number, number, number] }) {
  const stage = useCookgameStore((s) => s.inventory.plots[index]?.stage ?? 'empty');
  return <GrowPlotModel stage={stage} position={position} />;
}

// ─── Shared wall helper (Rapier fixed cuboid) ────────────────────────────────

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

// ─── Simple lamp-post helper (visual only, no collider) ──────────────────────

function LampPost({ pos }: { pos: [number, number, number] }) {
  return (
    <group position={pos}>
      <mesh position={[0, 1.75, 0]} castShadow>
        <boxGeometry args={[0.15, 3.5, 0.15]} />
        <meshStandardMaterial {...matteMaterialProps(PALETTE.metal)} />
      </mesh>
      <mesh position={[0, 3.45, 0]} castShadow>
        <boxGeometry args={[0.7, 0.2, 0.35]} />
        <meshStandardMaterial {...matteMaterialProps(PALETTE.lamp)} />
      </mesh>
    </group>
  );
}

// ─── TownScene ───────────────────────────────────────────────────────────────

export function TownScene() {
  return (
    <group>

      {/* ═══════════════════════════════════════════════════════════════════════
          SUBURBS  x[-20,20]  z[-20,20]
          ═══════════════════════════════════════════════════════════════════════ */}

      {/* ground — grass, fixed Rapier collider */}
      <RigidBody type="fixed" colliders="cuboid">
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, 0, 0]}>
          <planeGeometry args={[40, 40]} />
          <meshStandardMaterial {...matteMaterialProps(PALETTE.grass)} />
        </mesh>
      </RigidBody>

      {/* lab building (player property) — house variant */}
      <RigidBody type="fixed" colliders={false} position={[8, 1.5, -6]}>
        <CuboidCollider args={[3, 1.5, 2]} />
        <group position={[0, -1.5, 0]}>
          <Building variant="house" size={[6, 3, 4]} />
        </group>
      </RigidBody>

      {/* supplier shop building */}
      <RigidBody type="fixed" colliders={false} position={[-8, 1.5, -6]}>
        <CuboidCollider args={[2.5, 1.5, 2]} />
        <group position={[0, -1.5, 0]}>
          <Building variant="shop" size={[5, 3, 4]} />
        </group>
      </RigidBody>

      {/* asphalt road — visual only */}
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

      {/* grow plots — stage-aware */}
      {PLOT_POSITIONS.map((p, i) => (
        <PlotVisual key={i} index={i} position={p} />
      ))}

      {/* drying rack */}
      <DryingRackModel position={DRYING_POSITION} />

      {/* chemistry station */}
      <ChemStationModel position={CHEM_POSITION} />

      {/* ── Suburbs boundary walls ──────────────────────────────────────────
          North wall SPLIT at x∈[-4,4] → corridor to Downtown (z -22 to -20).
          West wall  SPLIT at z∈[-4,4] → corridor to Docks   (x -22 to -20).
          South + East walls remain solid.
          ─────────────────────────────────────────────────────────────────── */}

      {/* north: left segment  x[-20,-4] */}
      <Wall pos={[-12, 2, -20]} size={[16, 4, 0.5]} />
      {/* north: right segment x[4,20] */}
      <Wall pos={[12, 2, -20]} size={[16, 4, 0.5]} />

      {/* south wall (solid) */}
      <Wall pos={[0, 2, 20]} size={[40, 4, 0.5]} />

      {/* west: north segment z[-20,-4] */}
      <Wall pos={[-20, 2, -12]} size={[0.5, 4, 16]} />
      {/* west: south segment z[4,20] */}
      <Wall pos={[-20, 2, 12]} size={[0.5, 4, 16]} />

      {/* east wall (solid) */}
      <Wall pos={[20, 2, 0]} size={[0.5, 4, 40]} />

      {/* ── Corridor jamb walls — seal all three inter-district buffers ────────
          Each pair encloses a 2-unit buffer strip so the player cannot stray
          sideways out of a corridor opening into the open buffer shoulders.
          The passage centre (x∈[-4,4] or z∈[-4,4]) remains fully unobstructed.
          ─────────────────────────────────────────────────────────────────── */}

      {/* Suburbs ↔ Downtown  (N-S corridor, buffer z∈[-22,-20]) */}
      <Wall pos={[-4, 2, -21]} size={[0.5, 4, 2]} />
      <Wall pos={[4, 2, -21]} size={[0.5, 4, 2]} />

      {/* Suburbs ↔ Docks  (E-W corridor, buffer x∈[-22,-20]) */}
      <Wall pos={[-21, 2, -4]} size={[2, 4, 0.5]} />
      <Wall pos={[-21, 2, 4]} size={[2, 4, 0.5]} />

      {/* Downtown ↔ Warehouse  (N-S corridor, buffer z∈[-60,-58]) */}
      <Wall pos={[-4, 2, -59]} size={[0.5, 4, 2]} />
      <Wall pos={[4, 2, -59]} size={[0.5, 4, 2]} />

      {/* ── Corridor floor strips — fill the ~2-unit gap between district grounds ─
          Each strip overlaps both adjacent district grounds by ~1 unit so there
          is continuous floor under the player in every corridor.
          Suburbs ground covers z[-20,20]; Downtown ground covers z[-58,-22];
          Docks ground covers x[-58,-22]; Warehouse ground covers z[-94,-60].
          ──────────────────────────────────────────────────────────────────────── */}

      {/* Suburbs ↔ Downtown  — x∈[-4,4] z∈[-23,-19] (overlaps both grounds) */}
      <RigidBody type="fixed" colliders="cuboid">
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, 0, -21]}>
          <planeGeometry args={[8, 4]} />
          <meshStandardMaterial {...matteMaterialProps(PALETTE.asphalt)} />
        </mesh>
      </RigidBody>

      {/* Suburbs ↔ Docks  — z∈[-4,4] x∈[-23,-19] (overlaps both grounds) */}
      <RigidBody type="fixed" colliders="cuboid">
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[-21, 0, 0]}>
          <planeGeometry args={[4, 8]} />
          <meshStandardMaterial {...matteMaterialProps(PALETTE.asphalt)} />
        </mesh>
      </RigidBody>

      {/* Downtown ↔ Warehouse  — x∈[-4,4] z∈[-61,-57] (overlaps both grounds) */}
      <RigidBody type="fixed" colliders="cuboid">
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, 0, -59]}>
          <planeGeometry args={[8, 4]} />
          <meshStandardMaterial {...matteMaterialProps(PALETTE.asphalt)} />
        </mesh>
      </RigidBody>

      {/* ── District gates — block corridors until rank/key condition met ────── */}
      {/* Suburbs ↔ Downtown  corridor gate (x∈[-4,4] z=-21) */}
      <Gate districtId="downtown"   position={[0,  2, -21]} size={[8, 4, 0.6]} />
      {/* Suburbs ↔ Docks    corridor gate (z∈[-4,4] x=-21) */}
      <Gate districtId="docks"      position={[-21, 2,  0]} size={[0.6, 4, 8]} />
      {/* Downtown ↔ Warehouse corridor gate (x∈[-4,4] z=-59) */}
      <Gate districtId="warehouse"  position={[0,  2, -59]} size={[8, 4, 0.6]} />

      {/* instanced street dressing (suburbs) */}
      <StreetProps />

      {/* ═══════════════════════════════════════════════════════════════════════
          DOWNTOWN  x[-16,16]  z[-58,-22]  centre (0,-40)
          Corridors: south z=-22 x∈[-4,4] → Suburbs; north z=-58 x∈[-4,4] → Warehouse
          ═══════════════════════════════════════════════════════════════════════ */}

      <DistrictScene
        ground={{ center: [0, 0, -40], size: [32, 36], color: PALETTE.asphalt }}
        walls={[
          // west wall (solid)
          { pos: [-16, 2, -40], size: [0.5, 4, 36] },
          // east wall (solid)
          { pos: [16, 2, -40], size: [0.5, 4, 36] },
          // south: left x[-16,-4]  gap x∈[-4,4] → suburbs corridor
          { pos: [-10, 2, -22], size: [12, 4, 0.5] },
          // south: right x[4,16]
          { pos: [10, 2, -22], size: [12, 4, 0.5] },
          // north: left x[-16,-4]  gap x∈[-4,4] → warehouse corridor
          { pos: [-10, 2, -58], size: [12, 4, 0.5] },
          // north: right x[4,16]
          { pos: [10, 2, -58], size: [12, 4, 0.5] },
        ]}
      >
        {/* shop building — west */}
        <RigidBody type="fixed" colliders={false} position={[-9, 2, -50]}>
          <CuboidCollider args={[3.5, 2, 2.5]} />
          <group position={[0, -2, 0]}>
            <Building variant="shop" size={[7, 4, 5]} />
          </group>
        </RigidBody>

        {/* house building — east */}
        <RigidBody type="fixed" colliders={false} position={[8, 1.5, -52]}>
          <CuboidCollider args={[2.5, 1.5, 2]} />
          <group position={[0, -1.5, 0]}>
            <Building variant="house" size={[5, 3, 4]} />
          </group>
        </RigidBody>

        {/* hardware supplier stall */}
        <SupplierStallModel position={HARDWARE_POSITION} />

        {/* street props */}
        <LampPost pos={[-10, 0, -30]} />
        <LampPost pos={[10, 0, -30]} />
        <LampPost pos={[-10, 0, -50]} />
        <LampPost pos={[10, 0, -50]} />
        {/* trash cans */}
        <mesh position={[4, 0.35, -37]} castShadow>
          <cylinderGeometry args={[0.22, 0.28, 0.7, 8]} />
          <meshStandardMaterial {...matteMaterialProps(PALETTE.metal)} />
        </mesh>
        <mesh position={[-4, 0.35, -43]} castShadow>
          <cylinderGeometry args={[0.22, 0.28, 0.7, 8]} />
          <meshStandardMaterial {...matteMaterialProps(PALETTE.metal)} />
        </mesh>
        {/* concrete median strip */}
        <mesh position={[0, 0.01, -40]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[28, 4]} />
          <meshStandardMaterial {...matteMaterialProps(PALETTE.sidewalk)} />
        </mesh>
      </DistrictScene>

      {/* ═══════════════════════════════════════════════════════════════════════
          DOCKS  x[-58,-22]  z[-16,16]  centre (-40,0)
          Corridor: east x=-22 z∈[-4,4] → Suburbs
          ═══════════════════════════════════════════════════════════════════════ */}

      <DistrictScene
        ground={{ center: [-40, 0, 0], size: [36, 32], color: PALETTE.sidewalk }}
        walls={[
          // north wall (solid)
          { pos: [-40, 2, -16], size: [36, 4, 0.5] },
          // south wall (solid)
          { pos: [-40, 2, 16], size: [36, 4, 0.5] },
          // west wall (solid)
          { pos: [-58, 2, 0], size: [0.5, 4, 32] },
          // east: north z[-16,-4]  gap z∈[-4,4] → suburbs corridor
          { pos: [-22, 2, -10], size: [0.5, 4, 12] },
          // east: south z[4,16]
          { pos: [-22, 2, 10], size: [0.5, 4, 12] },
        ]}
      >
        {/* shop building — north-west */}
        <RigidBody type="fixed" colliders={false} position={[-45, 2, -8]}>
          <CuboidCollider args={[3, 2, 2.5]} />
          <group position={[0, -2, 0]}>
            <Building variant="shop" size={[6, 4, 5]} />
          </group>
        </RigidBody>

        {/* house building — south-east */}
        <RigidBody type="fixed" colliders={false} position={[-34, 1.5, 8]}>
          <CuboidCollider args={[2.5, 1.5, 2]} />
          <group position={[0, -1.5, 0]}>
            <Building variant="house" size={[5, 3, 4]} />
          </group>
        </RigidBody>

        {/* afterhours supplier stall */}
        <SupplierStallModel position={AFTERHOURS_POSITION} />

        {/* street props */}
        <LampPost pos={[-30, 0, -12]} />
        <LampPost pos={[-30, 0, 12]} />
        <LampPost pos={[-50, 0, -12]} />
        <LampPost pos={[-50, 0, 12]} />
        {/* trash cans */}
        <mesh position={[-38, 0.35, 3]} castShadow>
          <cylinderGeometry args={[0.22, 0.28, 0.7, 8]} />
          <meshStandardMaterial {...matteMaterialProps(PALETTE.metal)} />
        </mesh>
        <mesh position={[-44, 0.35, -5]} castShadow>
          <cylinderGeometry args={[0.22, 0.28, 0.7, 8]} />
          <meshStandardMaterial {...matteMaterialProps(PALETTE.metal)} />
        </mesh>
        {/* dock edge marking */}
        <mesh position={[-55, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[4, 28]} />
          <meshStandardMaterial {...matteMaterialProps(PALETTE.asphalt)} />
        </mesh>
      </DistrictScene>

      {/* ═══════════════════════════════════════════════════════════════════════
          WAREHOUSE  x[-14,14]  z[-94,-60]  centre (0,-77)
          Corridor: south z=-60 x∈[-4,4] → Downtown
          ═══════════════════════════════════════════════════════════════════════ */}

      <DistrictScene
        ground={{ center: [0, 0, -77], size: [28, 34], color: PALETTE.asphalt }}
        walls={[
          // east wall (solid)
          { pos: [14, 2, -77], size: [0.5, 4, 34] },
          // west wall (solid)
          { pos: [-14, 2, -77], size: [0.5, 4, 34] },
          // north wall (solid)
          { pos: [0, 2, -94], size: [28, 4, 0.5] },
          // south: left x[-14,-4]  gap x∈[-4,4] → downtown corridor
          { pos: [-9, 2, -60], size: [10, 4, 0.5] },
          // south: right x[4,14]
          { pos: [9, 2, -60], size: [10, 4, 0.5] },
        ]}
      >
        {/* large warehouse building — north end */}
        <RigidBody type="fixed" colliders={false} position={[0, 3, -84]}>
          <CuboidCollider args={[5, 3, 4]} />
          <group position={[0, -3, 0]}>
            <Building variant="shop" size={[10, 6, 8]} />
          </group>
        </RigidBody>

        {/* street props */}
        <LampPost pos={[-10, 0, -68]} />
        <LampPost pos={[10, 0, -68]} />
        <LampPost pos={[-10, 0, -88]} />
        <LampPost pos={[10, 0, -88]} />
        {/* crates / barrels near warehouse */}
        <mesh position={[5, 0.35, -75]} castShadow>
          <cylinderGeometry args={[0.22, 0.28, 0.7, 8]} />
          <meshStandardMaterial {...matteMaterialProps(PALETTE.metal)} />
        </mesh>
        <mesh position={[-5, 0.15, -75]} castShadow receiveShadow>
          <boxGeometry args={[0.3, 0.3, 0.3]} />
          <meshStandardMaterial {...matteMaterialProps(PALETTE.wood)} />
        </mesh>
        <mesh position={[-5.4, 0.15, -75.5]} castShadow receiveShadow>
          <boxGeometry args={[0.28, 0.28, 0.28]} />
          <meshStandardMaterial {...matteMaterialProps(PALETTE.sidingB)} />
        </mesh>
        {/* loading zone marking */}
        <mesh position={[0, 0.01, -70]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[20, 6]} />
          <meshStandardMaterial {...matteMaterialProps(PALETTE.sidewalk)} />
        </mesh>
      </DistrictScene>

    </group>
  );
}
