'use client';

/**
 * The laundry room: floor, walls, the chute garments fall from, and the four
 * bins. Static geometry, so it renders once and never re-renders — everything
 * that moves is in `Garments`.
 *
 * The bin meshes are drawn from the same numbers `lib/laundry-sort/arena.ts`
 * builds colliders from, so what a player sees and what the cloth collides with
 * cannot drift apart.
 */

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import * as THREE from 'three';
import { ARENA, BIN, binCenterX, WASH_COLORS } from '@/lib/laundry-sort/constants';
import { FRONT_LIP } from '@/lib/laundry-sort/arena';
import { binDecalTexture } from '../weave';

const ROOM_COLOR = '#252a3d';
const FLOOR_COLOR = '#2b3048';
const TRIM_COLOR = '#3a4160';
const MACHINE_COLOR = '#4b5372';
const MACHINE_TRIM = '#8c96bd';
const GLASS_COLOR = '#12141f';

/**
 * A washer along the back wall.
 *
 * The room needs furniture. Without it the middle two-thirds of a locked 16:9
 * frame is flat dark wall, which reads as an unfinished scene rather than a
 * laundry room — and it gives falling garments nothing to be silhouetted
 * against. These sit behind the play slab, so they are scenery only and never
 * collide with cloth.
 */
function Washer({ x, y }: { x: number; y: number }) {
  return (
    <group position={[x, y, -1.55]}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[1.45, 1.55, 0.9]} />
        <meshStandardMaterial color={MACHINE_COLOR} roughness={0.55} metalness={0.35} />
      </mesh>
      {/* Door: a recessed ring around a dark drum. */}
      <mesh position={[0, -0.1, 0.46]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.46, 0.46, 0.04, 24]} />
        <meshStandardMaterial color={MACHINE_TRIM} roughness={0.35} metalness={0.6} />
      </mesh>
      <mesh position={[0, -0.1, 0.49]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.37, 0.37, 0.04, 24]} />
        <meshStandardMaterial color={GLASS_COLOR} roughness={0.15} metalness={0.1} />
      </mesh>
      {/* Control panel strip along the top. */}
      <mesh position={[0, 0.6, 0.46]}>
        <boxGeometry args={[1.25, 0.22, 0.03]} />
        <meshStandardMaterial color={GLASS_COLOR} roughness={0.4} metalness={0.2} />
      </mesh>
      <mesh position={[-0.45, 0.6, 0.49]}>
        <sphereGeometry args={[0.045, 10, 10]} />
        <meshStandardMaterial
          color="#5eead4"
          emissive={new THREE.Color('#5eead4')}
          emissiveIntensity={1.4}
        />
      </mesh>
    </group>
  );
}

function Bin({ index, label }: { index: number; label: string }) {
  const wash = WASH_COLORS[index];
  const cx = binCenterX(index);
  const t = BIN.wallThickness;
  const halfW = BIN.outerWidth / 2;
  const halfD = BIN.depth / 2;
  const lipHeight = BIN.height * FRONT_LIP;

  const decal = useMemo(() => binDecalTexture(label, wash.weave, wash.hex), [label, wash]);

  return (
    <group position={[cx, 0, 0]}>
      {/* Base */}
      <mesh position={[0, t / 2, 0]} receiveShadow castShadow>
        <boxGeometry args={[BIN.outerWidth, t, BIN.depth]} />
        <meshStandardMaterial color={wash.hex} roughness={0.75} metalness={0.05} />
      </mesh>

      {/* Left / right / back walls at full height. */}
      <mesh position={[-halfW + t / 2, BIN.height / 2, 0]} receiveShadow castShadow>
        <boxGeometry args={[t, BIN.height, BIN.depth]} />
        <meshStandardMaterial color={wash.hex} roughness={0.75} metalness={0.05} />
      </mesh>
      <mesh position={[halfW - t / 2, BIN.height / 2, 0]} receiveShadow castShadow>
        <boxGeometry args={[t, BIN.height, BIN.depth]} />
        <meshStandardMaterial color={wash.hex} roughness={0.75} metalness={0.05} />
      </mesh>
      <mesh position={[0, BIN.height / 2, -halfD + t / 2]} receiveShadow castShadow>
        <boxGeometry args={[BIN.outerWidth, BIN.height, t]} />
        <meshStandardMaterial color={wash.hex} roughness={0.8} metalness={0.05} />
      </mesh>

      {/* Camera-facing lip — low, so the pile inside stays visible. */}
      <mesh position={[0, lipHeight / 2, halfD - t / 2]} receiveShadow castShadow>
        <boxGeometry args={[BIN.outerWidth, lipHeight, t]} />
        <meshStandardMaterial color={wash.hex} roughness={0.75} metalness={0.05} />
      </mesh>

      {/* The decal: weave glyph + translated wash name, on the lip's face. */}
      {decal ? (
        <mesh position={[0, lipHeight / 2, halfD + 0.004]}>
          <planeGeometry args={[BIN.outerWidth * 0.86, lipHeight * 0.8]} />
          <meshBasicMaterial map={decal} toneMapped={false} />
        </mesh>
      ) : null}

      {/* Rim: a glowing lip so the opening reads as a target to aim at, and so
          a bin stays findable in peripheral vision during a frantic round. */}
      {[
        { pos: [0, BIN.height, -halfD + t / 2] as const, size: [BIN.outerWidth, 0.03, t] as const },
        { pos: [-halfW + t / 2, BIN.height, 0] as const, size: [t, 0.03, BIN.depth] as const },
        { pos: [halfW - t / 2, BIN.height, 0] as const, size: [t, 0.03, BIN.depth] as const },
      ].map((rim, i) => (
        <mesh key={i} position={rim.pos}>
          <boxGeometry args={rim.size} />
          <meshStandardMaterial
            color={wash.hex}
            emissive={new THREE.Color(wash.hex)}
            emissiveIntensity={0.55}
            roughness={0.5}
          />
        </mesh>
      ))}
    </group>
  );
}

export function Arena() {
  const { t } = useTranslation('c-laundry-sort');
  const { halfWidth, halfDepth } = ARENA;

  const labels = useMemo(
    () => [
      t('wash-reds', { defaultValue: 'Reds' }),
      t('wash-blues', { defaultValue: 'Blues' }),
      t('wash-golds', { defaultValue: 'Golds' }),
      t('wash-greens', { defaultValue: 'Greens' }),
    ],
    [t],
  );

  return (
    <group>
      {/* Floor — extends past the slab so the room reads as a room. */}
      <mesh position={[0, -0.05, 0]} receiveShadow>
        <boxGeometry args={[halfWidth * 2 + 1.6, 0.1, halfDepth * 2 + 2.4]} />
        <meshStandardMaterial color={FLOOR_COLOR} roughness={0.95} metalness={0.02} />
      </mesh>

      {/* Back wall. */}
      <mesh position={[0, 4, -halfDepth - 0.1]} receiveShadow>
        <boxGeometry args={[halfWidth * 2 + 1.6, 9, 0.2]} />
        <meshStandardMaterial color={ROOM_COLOR} roughness={1} metalness={0} />
      </mesh>

      {/* Side walls. */}
      <mesh position={[-halfWidth - 0.15, 4, 0]} receiveShadow>
        <boxGeometry args={[0.3, 9, halfDepth * 2 + 2.4]} />
        <meshStandardMaterial color={ROOM_COLOR} roughness={1} metalness={0} />
      </mesh>
      <mesh position={[halfWidth + 0.15, 4, 0]} receiveShadow>
        <boxGeometry args={[0.3, 9, halfDepth * 2 + 2.4]} />
        <meshStandardMaterial color={ROOM_COLOR} roughness={1} metalness={0} />
      </mesh>

      {/* Skirting, so the floor/wall join isn't a bare seam. */}
      <mesh position={[0, 0.12, -halfDepth - 0.02]}>
        <boxGeometry args={[halfWidth * 2 + 1.6, 0.24, 0.06]} />
        <meshStandardMaterial color={TRIM_COLOR} roughness={0.85} />
      </mesh>

      {/* A bank of washers behind the bins, and the counter they sit under. */}
      {[-2.72, 0, 2.72].map((x) => (
        <Washer key={x} x={x} y={1.15} />
      ))}
      <mesh position={[0, 1.97, -1.55]} receiveShadow>
        <boxGeometry args={[halfWidth * 2 + 0.4, 0.1, 1.05]} />
        <meshStandardMaterial color={TRIM_COLOR} roughness={0.6} metalness={0.3} />
      </mesh>

      {/* Ceiling strip lights, in their housings — the room's only visible
          source, so the bright key light overhead has somewhere to come from. */}
      {[-2.35, 2.35].map((x) => (
        <group key={x} position={[x, 4.3, -0.55]}>
          <mesh castShadow>
            <boxGeometry args={[2.7, 0.16, 0.44]} />
            <meshStandardMaterial color={TRIM_COLOR} roughness={0.5} metalness={0.4} />
          </mesh>
          <mesh position={[0, -0.09, 0]}>
            <boxGeometry args={[2.45, 0.05, 0.3]} />
            <meshStandardMaterial
              color="#f4f7ff"
              emissive={new THREE.Color('#e8eeff')}
              emissiveIntensity={2.4}
            />
          </mesh>
        </group>
      ))}

      {/* A wash of light thrown up the back wall by those fixtures. Flat dark
          plaster across the middle of a locked frame reads as an unfinished
          scene; this is the cheapest way to give the wall depth without
          competing with the laundry falling in front of it. */}
      <mesh position={[0, 2.9, -halfDepth - 0.19]}>
        <planeGeometry args={[halfWidth * 2 + 1.4, 3.6]} />
        <meshBasicMaterial color="#2f3654" transparent opacity={0.55} />
      </mesh>

      {/* The chute garments drop out of, just above the top of the locked
          frame — visible as the dark soffit the laundry falls from. */}
      <mesh position={[0, ARENA.spawnY + 0.5, 0]} castShadow>
        <boxGeometry args={[halfWidth * 2 + 0.4, 0.8, halfDepth * 2 + 0.6]} />
        <meshStandardMaterial color={TRIM_COLOR} roughness={0.6} metalness={0.25} />
      </mesh>

      {WASH_COLORS.map((wash, index) => (
        <Bin key={wash.id} index={index} label={labels[index]} />
      ))}
    </group>
  );
}
