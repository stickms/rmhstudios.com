/**
 * An unusual effect, drawn as particles around a box in a three.js scene (see `lib/tf2-loadout/fx.ts`
 * for why this is an approximation of the game's own effects). Lives inside a `<Canvas>`. Animates by
 * asking the on-demand canvas for a frame each tick, and holds still (one frame) when the player has
 * set Jelly motion to Still.
 */
'use client';

import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  Points,
  PointsMaterial,
  type Box3,
} from 'three';
import { jellyMotionLevel } from '@/lib/jelly/tiers';
import type { EffectPlacement } from '@/lib/tf2-loadout/catalog-types';
import type { EffectProfile } from '@/lib/tf2-loadout/fx';
import { particleAt } from '@/lib/tf2-loadout/fx-motion';

export interface EffectSpec {
  profile: EffectProfile;
  placement: Required<EffectPlacement>;
}

let sprite: CanvasTexture | null = null;
/** A soft round dot, made once and shared. */
function dot(): CanvasTexture {
  if (sprite) return sprite;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  sprite = new CanvasTexture(c);
  return sprite;
}

export default function EffectParticles({ spec, box }: { spec: EffectSpec; box: Box3 }) {
  const { invalidate } = useThree();
  const { profile, placement } = spec;
  const still = useRef(false);

  // The effect's centre is the box's centre moved by the placement (as fractions of the box's size),
  // and its radius follows the box's largest side, scaled.
  const frame = useMemo(() => {
    const s = { x: box.max.x - box.min.x, y: box.max.y - box.min.y, z: box.max.z - box.min.z };
    const c = {
      x: (box.max.x + box.min.x) / 2 + placement.x * s.x,
      y: (box.max.y + box.min.y) / 2 + placement.y * s.y,
      z: (box.max.z + box.min.z) / 2 + placement.z * s.z,
    };
    return { c, r: Math.max(s.x, s.y, s.z) * 0.5 * placement.s };
  }, [box, placement]);

  const { points, geometry, material } = useMemo(() => {
    const n = profile.count;
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(n * 3), 3));
    geometry.setAttribute('color', new BufferAttribute(new Float32Array(n * 3), 3));
    const material = new PointsMaterial({
      map: dot(),
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      sizeAttenuation: true,
      size: 1,
    });
    const points = new Points(geometry, material);
    points.frustumCulled = false;
    return { points, geometry, material };
  }, [profile.count]);

  useEffect(() => () => void (geometry.dispose(), material.dispose()), [geometry, material]);

  const c0 = useMemo(() => new Color(profile.colors[0]), [profile.colors]);
  const c1 = useMemo(() => new Color(profile.colors[1]), [profile.colors]);
  const tmp = useMemo(() => new Color(), []);

  const write = (t: number) => {
    const pos = geometry.getAttribute('position') as BufferAttribute;
    const col = geometry.getAttribute('color') as BufferAttribute;
    const n = profile.count;
    // Particle size is relative to the effect radius; PointsMaterial wants world units.
    material.size = Math.max(frame.r * 0.45, 0.005);
    for (let i = 0; i < n; i++) {
      const p = particleAt(profile.kind, i, n, t);
      pos.setXYZ(i, frame.c.x + p.x * frame.r, frame.c.y + p.y * frame.r, frame.c.z + p.z * frame.r);
      tmp.copy(c0).lerp(c1, p.a);
      // Additive blending: dimmer colour is more transparent.
      col.setXYZ(i, tmp.r * p.a, tmp.g * p.a, tmp.b * p.a);
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
  };

  useEffect(() => {
    still.current = jellyMotionLevel() === 'still';
    write(1.3); // a frame that is already full of particles, for Still and for the first paint
    invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frame, profile]);

  useFrame(({ clock, invalidate: again }) => {
    if (still.current) return;
    write(clock.elapsedTime);
    again(); // keep the on-demand canvas drawing while the effect is shown
  });

  return <primitive object={points} />;
}
