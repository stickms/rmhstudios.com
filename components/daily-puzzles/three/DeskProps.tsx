// components/daily-puzzles/three/DeskProps.tsx
'use client';

import { RoundedBox } from '@react-three/drei';

/** Asset-light desk dressing around the newspaper: desk surface, lamp, coffee,
 *  pencils, sticky notes. Pure primitives — no external models. */
export function DeskProps() {
  return (
    <group>
      {/* Desk surface (large felt/wood slab) */}
      <mesh position={[0, -0.08, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[40, 30]} />
        <meshStandardMaterial color="#5b4a3a" roughness={0.85} metalness={0.05} />
      </mesh>
      {/* Desk edge lip (front) */}
      <mesh position={[0, -0.2, 11]}>
        <boxGeometry args={[40, 0.4, 0.6]} />
        <meshStandardMaterial color="#4a3b2d" roughness={0.8} />
      </mesh>

      {/* Desk lamp (upper-left): base, arm, head */}
      <group position={[-6.2, 0, -3.5]}>
        <mesh position={[0, 0.05, 0]}>
          <cylinderGeometry args={[0.7, 0.8, 0.12, 24]} />
          <meshStandardMaterial color="#2b3340" metalness={0.6} roughness={0.4} />
        </mesh>
        <mesh position={[0.6, 1.4, 0.3]} rotation={[0, 0, -0.5]}>
          <cylinderGeometry args={[0.06, 0.06, 3, 12]} />
          <meshStandardMaterial color="#39424f" metalness={0.7} roughness={0.3} />
        </mesh>
        <mesh position={[1.7, 2.7, 0.9]} rotation={[0.9, 0, -0.8]}>
          <coneGeometry args={[0.6, 0.8, 24, 1, true]} />
          <meshStandardMaterial color="#2b3340" metalness={0.6} roughness={0.35} side={2} />
        </mesh>
        {/* warm bulb glow */}
        <pointLight position={[1.7, 2.5, 1.2]} intensity={5} color="#ffe3b0" distance={12} decay={2} />
      </group>

      {/* Coffee cup + saucer ring (right) */}
      <group position={[4.6, 0, 3.2]}>
        <mesh position={[0, 0.45, 0]}>
          <cylinderGeometry args={[0.5, 0.42, 0.9, 24]} />
          <meshStandardMaterial color="#e8e4dc" roughness={0.5} />
        </mesh>
        <mesh position={[0, 0.84, 0]}>
          <cylinderGeometry args={[0.44, 0.44, 0.06, 24]} />
          <meshStandardMaterial color="#3a2a1c" roughness={0.3} />
        </mesh>
        {/* coffee ring stain on the desk */}
        <mesh position={[-1.1, -0.06, 0.4]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.34, 0.46, 24]} />
          <meshStandardMaterial color="#6b4a2e" transparent opacity={0.5} roughness={1} />
        </mesh>
      </group>

      {/* Pencils (bottom-right) */}
      {[0, 0.18, -0.16].map((rot, i) => (
        <mesh key={i} position={[3.4 + i * 0.22, 0.02, 5.4]} rotation={[-Math.PI / 2, 0, rot + 0.4]}>
          <cylinderGeometry args={[0.05, 0.05, 2.2, 6]} />
          <meshStandardMaterial color={['#e0b53a', '#d96b3a', '#3a72d9'][i]} roughness={0.6} />
        </mesh>
      ))}

      {/* Sticky notes (upper-right) */}
      {[
        { p: [4.2, 0.01, -3.8] as [number, number, number], c: '#f2e15a', r: 0.12 },
        { p: [5.0, 0.012, -3.2] as [number, number, number], c: '#7fe0a8', r: -0.2 },
      ].map((n, i) => (
        <RoundedBox key={i} args={[1.1, 0.02, 1.1]} radius={0.02} position={n.p} rotation={[0, n.r, 0]}>
          <meshStandardMaterial color={n.c} roughness={0.8} />
        </RoundedBox>
      ))}
    </group>
  );
}
