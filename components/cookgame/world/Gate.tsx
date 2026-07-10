"use client";
import { RigidBody, CuboidCollider } from '@react-three/rapier';
import { Html } from '@react-three/drei';
import { useCookgameStore } from '@/lib/cookgame/store';
import { rankForXp } from '@/lib/cookgame/progression';
import { DISTRICTS, isDistrictUnlocked } from '@/lib/cookgame/districts';
import { PALETTE, matteMaterialProps } from '../models/palette';

interface GateProps {
  districtId: string;
  position: [number, number, number];
  size: [number, number, number];
}

/** Convert snake_case keyId to "Title Case" label, e.g. docks_key → "Docks Key". */
function keyIdToLabel(keyId: string): string {
  return keyId
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Derive the human-readable requirement from the district's gate config. */
function gateRequirementLabel(districtId: string): string {
  const d = DISTRICTS[districtId];
  if (!d || !d.gate) return '';
  if (d.gate.type === 'rank') return `🔒 Reach rank ${d.gate.rank}`;
  return `🔒 Need the ${keyIdToLabel(d.gate.keyId)}`;
}

/**
 * Gate — physics-gated corridor barrier.
 *
 * LOCKED:   solid barrier mesh + fixed CuboidCollider (blocks player) + floating label.
 * UNLOCKED: two thin flank posts, NO barrier collider, NO label.
 */
export function Gate({ districtId, position, size }: GateProps) {
  const xp = useCookgameStore((s) => s.xp);
  const keys = useCookgameStore((s) => s.keys);

  const rank = rankForXp(xp).rank;
  const unlocked = isDistrictUnlocked(districtId, rank, keys);

  const [px, py, pz] = position;
  const [sx, sy, sz] = size;

  if (unlocked) {
    // Open gate visual: two thin flank posts at the corridor edges.
    // If X-span > Z-span it's a N-S gate; posts sit at x=-sx/2 and x=+sx/2.
    // Otherwise it's an E-W gate; posts sit at z=-sz/2 and z=+sz/2.
    const isNS = sx > sz;
    const postThick = 0.3;
    return (
      <group>
        {isNS ? (
          <>
            <mesh position={[px - sx / 2 + postThick / 2, py, pz]} castShadow>
              <boxGeometry args={[postThick, sy, Math.max(sz, postThick)]} />
              <meshStandardMaterial {...matteMaterialProps(PALETTE.metal)} />
            </mesh>
            <mesh position={[px + sx / 2 - postThick / 2, py, pz]} castShadow>
              <boxGeometry args={[postThick, sy, Math.max(sz, postThick)]} />
              <meshStandardMaterial {...matteMaterialProps(PALETTE.metal)} />
            </mesh>
          </>
        ) : (
          <>
            <mesh position={[px, py, pz - sz / 2 + postThick / 2]} castShadow>
              <boxGeometry args={[Math.max(sx, postThick), sy, postThick]} />
              <meshStandardMaterial {...matteMaterialProps(PALETTE.metal)} />
            </mesh>
            <mesh position={[px, py, pz + sz / 2 - postThick / 2]} castShadow>
              <boxGeometry args={[Math.max(sx, postThick), sy, postThick]} />
              <meshStandardMaterial {...matteMaterialProps(PALETTE.metal)} />
            </mesh>
          </>
        )}
      </group>
    );
  }

  // Locked: barrier mesh + physics collider + floating label.
  const label = gateRequirementLabel(districtId);

  return (
    <group>
      {/* Visual barrier — matte metal colour */}
      <mesh position={position} castShadow receiveShadow>
        <boxGeometry args={size} />
        <meshStandardMaterial {...matteMaterialProps('#555555')} />
      </mesh>

      {/* Physics barrier — fixed RigidBody so Rapier blocks the player */}
      <RigidBody type="fixed" position={position}>
        <CuboidCollider args={[sx / 2, sy / 2, sz / 2]} />
      </RigidBody>

      {/* Floating requirement label — slightly above the barrier top */}
      <Html
        position={[px, py + sy / 2 + 0.5, pz]}
        center
        distanceFactor={12}
        occlude={false}
        zIndexRange={[10, 0]}
        style={{ pointerEvents: 'none' }}
      >
        <div
          style={{
            background: 'rgba(0,0,0,0.78)',
            color: '#ffffff',
            padding: '4px 10px',
            borderRadius: '4px',
            fontSize: '13px',
            fontFamily: 'monospace',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
          }}
        >
          {label}
        </div>
      </Html>
    </group>
  );
}
