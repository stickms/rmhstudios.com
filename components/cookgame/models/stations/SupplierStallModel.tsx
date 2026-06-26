"use client";
import { PALETTE, matteMaterialProps } from '../palette';

interface Props {
  position?: [number, number, number];
  rotation?: [number, number, number];
}

export function SupplierStallModel({ position = [0, 0, 0], rotation = [0, 0, 0] }: Props) {
  return (
    <group position={position} rotation={rotation}>
      {/* counter body (wood) — base at y=0, top at y=0.7 */}
      <mesh castShadow receiveShadow position={[0, 0.35, 0]}>
        <boxGeometry args={[1.2, 0.7, 0.5]} />
        <meshStandardMaterial {...matteMaterialProps(PALETTE.wood)} />
      </mesh>

      {/* counter top surface (stucco) */}
      <mesh castShadow receiveShadow position={[0, 0.725, 0]}>
        <boxGeometry args={[1.25, 0.05, 0.52]} />
        <meshStandardMaterial {...matteMaterialProps(PALETTE.stucco)} />
      </mesh>

      {/* back shelf board (wood) */}
      <mesh castShadow receiveShadow position={[0, 0.52, -0.22]}>
        <boxGeometry args={[1.1, 0.04, 0.08]} />
        <meshStandardMaterial {...matteMaterialProps(PALETTE.wood)} />
      </mesh>

      {/* left awning post */}
      <mesh castShadow position={[-0.55, 0.975, -0.2]}>
        <boxGeometry args={[0.06, 0.55, 0.06]} />
        <meshStandardMaterial {...matteMaterialProps(PALETTE.wood)} />
      </mesh>

      {/* right awning post */}
      <mesh castShadow position={[0.55, 0.975, -0.2]}>
        <boxGeometry args={[0.06, 0.55, 0.06]} />
        <meshStandardMaterial {...matteMaterialProps(PALETTE.wood)} />
      </mesh>

      {/* awning main panel (stucco) */}
      <mesh castShadow receiveShadow position={[0, 1.22, 0.06]} rotation={[0.18, 0, 0]}>
        <boxGeometry args={[1.4, 0.07, 0.68]} />
        <meshStandardMaterial {...matteMaterialProps(PALETTE.stucco)} />
      </mesh>

      {/* awning accent stripe */}
      <mesh castShadow position={[0, 1.232, 0.08]} rotation={[0.18, 0, 0]}>
        <boxGeometry args={[1.4, 0.075, 0.16]} />
        <meshStandardMaterial {...matteMaterialProps(PALETTE.accent)} />
      </mesh>

      {/* crate — left front */}
      <mesh castShadow receiveShadow position={[-0.44, 0.15, 0.42]}>
        <boxGeometry args={[0.28, 0.3, 0.28]} />
        <meshStandardMaterial {...matteMaterialProps(PALETTE.wood)} />
      </mesh>

      {/* crate — right front (smaller) */}
      <mesh castShadow receiveShadow position={[0.44, 0.12, 0.44]}>
        <boxGeometry args={[0.24, 0.24, 0.24]} />
        <meshStandardMaterial {...matteMaterialProps(PALETTE.sidingB)} />
      </mesh>

      {/* goods on counter — small box left */}
      <mesh castShadow position={[-0.28, 0.795, 0]}>
        <boxGeometry args={[0.18, 0.12, 0.12]} />
        <meshStandardMaterial {...matteMaterialProps(PALETTE.accent)} />
      </mesh>

      {/* goods on counter — small box right */}
      <mesh castShadow position={[0.12, 0.78, 0.04]}>
        <boxGeometry args={[0.12, 0.08, 0.1]} />
        <meshStandardMaterial {...matteMaterialProps(PALETTE.sidingA)} />
      </mesh>
    </group>
  );
}
