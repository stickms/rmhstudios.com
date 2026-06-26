"use client";
import { useMemo } from 'react';
import { Instances, Instance } from '@react-three/drei';
import { PALETTE, matteMaterialProps } from '../palette';

export function StreetProps() {
  const { hedgesNS, hedgesEW, lampPositions } = useMemo(() => {
    const FENCE = 18.5;
    const STEP = 3;

    // North/South hedges (z = ±FENCE), long axis along X — default rotation
    const hedgesNS: [number, number, number][] = [];
    for (let x = -18; x <= 18; x += STEP) {
      hedgesNS.push([x, 0.6, -FENCE]);
      hedgesNS.push([x, 0.6, FENCE]);
    }

    // East/West hedges (x = ±FENCE), long axis along Z — rotated Y 90°, skip corners
    const hedgesEW: [number, number, number][] = [];
    for (let z = -15; z <= 15; z += STEP) {
      hedgesEW.push([-FENCE, 0.6, z]);
      hedgesEW.push([FENCE, 0.6, z]);
    }

    // Streetlight positions: 4 corners + 2 mid road-facing sides
    const lampPositions: [number, number, number][] = [
      [-16, 0, -16],
      [16, 0, -16],
      [-16, 0, 16],
      [16, 0, 16],
      [0, 0, -16],
      [0, 0, 16],
    ];

    return { hedgesNS, hedgesEW, lampPositions };
  }, []);

  return (
    <group>
      {/* Hedge perimeter — foliage instanced, one draw call */}
      <Instances limit={64}>
        <boxGeometry args={[2.5, 1.2, 0.5]} />
        <meshStandardMaterial {...matteMaterialProps(PALETTE.foliage)} />
        {hedgesNS.map((pos, i) => (
          <Instance key={`ns${i}`} position={pos} />
        ))}
        {hedgesEW.map((pos, i) => (
          <Instance key={`ew${i}`} position={pos} rotation={[0, Math.PI / 2, 0]} />
        ))}
      </Instances>

      {/* Streetlight posts — metal instanced */}
      <Instances limit={8} castShadow>
        <boxGeometry args={[0.15, 3.5, 0.15]} />
        <meshStandardMaterial {...matteMaterialProps(PALETTE.metal)} />
        {lampPositions.map((pos, i) => (
          <Instance key={`lp${i}`} position={[pos[0], 1.75, pos[2]]} />
        ))}
      </Instances>

      {/* Streetlight heads — cream box at top of each post */}
      <Instances limit={8} castShadow>
        <boxGeometry args={[0.7, 0.2, 0.35]} />
        <meshStandardMaterial color="#ddd8c0" roughness={0.5} metalness={0.15} />
        {lampPositions.map((pos, i) => (
          <Instance key={`lh${i}`} position={[pos[0], 3.45, pos[2]]} />
        ))}
      </Instances>

      {/* Trash cans near buildings — individual, no colliders */}
      <mesh position={[6.5, 0.35, -4.2]} castShadow>
        <cylinderGeometry args={[0.22, 0.28, 0.7, 8]} />
        <meshStandardMaterial {...matteMaterialProps(PALETTE.metal)} />
      </mesh>
      <mesh position={[-9.8, 0.35, -4.2]} castShadow>
        <cylinderGeometry args={[0.22, 0.28, 0.7, 8]} />
        <meshStandardMaterial {...matteMaterialProps(PALETTE.metal)} />
      </mesh>
    </group>
  );
}
