"use client";
import { PALETTE, matteMaterialProps } from '../palette';

interface Props {
  position?: [number, number, number];
  rotation?: [number, number, number];
}

// Accent with slight translucency for glassware — still uses palette color.
function glasswareProps() {
  return { color: PALETTE.accent, roughness: 0.2, metalness: 0.1, transparent: true, opacity: 0.72 };
}

export function ChemStationModel({ position = [0, 0, 0], rotation = [0, 0, 0] }: Props) {
  return (
    <group position={position} rotation={rotation}>
      {/* bench body (wood) — base y=0, top y=0.72 */}
      <mesh castShadow receiveShadow position={[0, 0.36, 0]}>
        <boxGeometry args={[1.4, 0.72, 0.65]} />
        <meshStandardMaterial {...matteMaterialProps(PALETTE.wood)} />
      </mesh>

      {/* bench top surface (stucco) */}
      <mesh castShadow receiveShadow position={[0, 0.745, 0]}>
        <boxGeometry args={[1.42, 0.05, 0.67]} />
        <meshStandardMaterial {...matteMaterialProps(PALETTE.stucco)} />
      </mesh>

      {/* back panel (metal) — low backsplash */}
      <mesh castShadow receiveShadow position={[0, 0.98, -0.3]}>
        <boxGeometry args={[1.38, 0.46, 0.05]} />
        <meshStandardMaterial {...matteMaterialProps(PALETTE.metal)} />
      </mesh>

      {/* shelf on back panel */}
      <mesh castShadow receiveShadow position={[0, 1.17, -0.26]}>
        <boxGeometry args={[1.28, 0.04, 0.14]} />
        <meshStandardMaterial {...matteMaterialProps(PALETTE.stucco)} />
      </mesh>

      {/* --- glassware: flask (cone + cylinder body) --- */}
      {/* flask body — short wide cylinder */}
      <mesh castShadow position={[-0.42, 0.87, 0.05]}>
        <cylinderGeometry args={[0.1, 0.1, 0.12, 7]} />
        <meshStandardMaterial {...glasswareProps()} />
      </mesh>
      {/* flask neck — narrow cylinder */}
      <mesh castShadow position={[-0.42, 0.99, 0.05]}>
        <cylinderGeometry args={[0.03, 0.03, 0.1, 6]} />
        <meshStandardMaterial {...glasswareProps()} />
      </mesh>
      {/* flask shoulder — cone */}
      <mesh castShadow position={[-0.42, 0.935, 0.05]}>
        <coneGeometry args={[0.1, 0.08, 7]} />
        <meshStandardMaterial {...glasswareProps()} />
      </mesh>

      {/* --- beaker (short wide cylinder) --- */}
      <mesh castShadow position={[-0.14, 0.84, 0.06]}>
        <cylinderGeometry args={[0.07, 0.065, 0.16, 7]} />
        <meshStandardMaterial {...glasswareProps()} />
      </mesh>

      {/* --- tall test tube --- */}
      <mesh castShadow position={[0.08, 0.88, 0.05]}>
        <cylinderGeometry args={[0.03, 0.025, 0.22, 6]} />
        <meshStandardMaterial {...glasswareProps()} />
      </mesh>

      {/* --- retort stand (metal rod + clamp block) --- */}
      {/* stand base */}
      <mesh castShadow receiveShadow position={[0.3, 0.77, 0]}>
        <boxGeometry args={[0.22, 0.04, 0.16]} />
        <meshStandardMaterial {...matteMaterialProps(PALETTE.metal)} />
      </mesh>
      {/* stand rod */}
      <mesh castShadow position={[0.36, 1.02, 0]}>
        <cylinderGeometry args={[0.02, 0.02, 0.5, 6]} />
        <meshStandardMaterial {...matteMaterialProps(PALETTE.metal)} />
      </mesh>
      {/* clamp arm */}
      <mesh castShadow position={[0.28, 1.1, 0]}>
        <boxGeometry args={[0.18, 0.03, 0.04]} />
        <meshStandardMaterial {...matteMaterialProps(PALETTE.metal)} />
      </mesh>

      {/* small bottles on back shelf (accent) */}
      <mesh castShadow position={[-0.35, 1.22, -0.25]}>
        <cylinderGeometry args={[0.04, 0.04, 0.1, 6]} />
        <meshStandardMaterial {...matteMaterialProps(PALETTE.accent)} />
      </mesh>
      <mesh castShadow position={[-0.2, 1.22, -0.25]}>
        <cylinderGeometry args={[0.035, 0.035, 0.09, 6]} />
        <meshStandardMaterial {...matteMaterialProps(PALETTE.sidingA)} />
      </mesh>
    </group>
  );
}
