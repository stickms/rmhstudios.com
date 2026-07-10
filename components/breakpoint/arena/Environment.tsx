'use client';

import { useMemo } from 'react';
import * as THREE from 'three';
import { MAP_BOXES, ARENA, SITES, GROUND_TILE } from '@/lib/breakpoint/map';
import { PALETTE } from '@/lib/breakpoint/constants';

/** Static map geometry — rendered once. Flat-shaded boxes for the retro look. */
export function MapGeometry() {
  return (
    <group>
      {MAP_BOXES.map((b, i) => (
        <mesh key={i} position={[b.cx, b.cy, b.cz]} castShadow receiveShadow>
          <boxGeometry args={[b.hx * 2, b.hy * 2, b.hz * 2]} />
          <meshLambertMaterial color={b.color} />
        </mesh>
      ))}
    </group>
  );
}

/** Checkerboard ground built as a single canvas texture (cheap + pixelated). */
export function Ground() {
  const tex = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = PALETTE.ground;
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = PALETTE.groundLine;
    ctx.fillRect(0, 0, 32, 32);
    ctx.fillRect(32, 32, 32, 32);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    const span = (ARENA.maxX - ARENA.minX) / GROUND_TILE;
    t.repeat.set(span, span);
    return t;
  }, []);

  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[ARENA.maxX - ARENA.minX, ARENA.maxZ - ARENA.minZ]} />
        <meshLambertMaterial map={tex} />
      </mesh>
      {/* Site markers painted on the floor */}
      {Object.values(SITES).map((s) => (
        <group key={s.label}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[s.x, 0.02, s.z]}>
            <ringGeometry args={[s.r - 0.4, s.r, 4, 1]} />
            <meshBasicMaterial color={PALETTE.spike} transparent opacity={0.5} side={THREE.DoubleSide} />
          </mesh>
        </group>
      ))}
    </>
  );
}
