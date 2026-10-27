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
  NormalBlending,
  Points,
  ShaderMaterial,
  type Box3,
  type PerspectiveCamera,
} from 'three';
import { jellyMotionLevel } from '@/lib/jelly/tiers';
import type { EffectPlacement } from '@/lib/tf2-loadout/catalog-types';
import type { EffectKind, EffectProfile } from '@/lib/tf2-loadout/fx';
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

/** Kinds that read as light add; the rest (smoke, snow, leaves, bubbles) are matter and blend normally. */
const LUMINOUS = new Set<EffectKind>(['flame', 'electric', 'sparkle', 'orbit', 'glow']);

/** How big a particle of each kind is, relative to the effect radius (the motion module sets the spread). */
const SIZE: Record<EffectKind, number> = {
  flame: 1.1,
  smoke: 1.2,
  electric: 0.7,
  sparkle: 0.8,
  snow: 0.9,
  bubble: 0.9,
  leaf: 0.9,
  orbit: 0.6,
  glow: 0.8,
};

// A point sprite with its own size and alpha per particle (PointsMaterial has one size for all).
const VERTEX = `
  attribute float aSize;
  attribute float aAlpha;
  varying vec3 vColor;
  varying float vAlpha;
  uniform float uScale;
  void main() {
    vColor = color;
    vAlpha = aAlpha;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = max(1.0, aSize * uScale / max(0.01, -mv.z));
    gl_Position = projectionMatrix * mv;
  }
`;
const FRAGMENT = `
  uniform sampler2D uMap;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float a = texture2D(uMap, gl_PointCoord).a * vAlpha;
    gl_FragColor = vec4(vColor, a);
  }
`;

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

  const additive = LUMINOUS.has(profile.kind);
  const { points, geometry, material } = useMemo(() => {
    const n = profile.count;
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(n * 3), 3));
    geometry.setAttribute('color', new BufferAttribute(new Float32Array(n * 3), 3));
    geometry.setAttribute('aSize', new BufferAttribute(new Float32Array(n), 1));
    geometry.setAttribute('aAlpha', new BufferAttribute(new Float32Array(n), 1));
    const material = new ShaderMaterial({
      uniforms: { uMap: { value: dot() }, uScale: { value: 400 } },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: additive ? AdditiveBlending : NormalBlending,
    });
    const points = new Points(geometry, material);
    points.frustumCulled = false;
    return { points, geometry, material };
  }, [profile.count, additive]);

  useEffect(() => () => void (geometry.dispose(), material.dispose()), [geometry, material]);

  const c0 = useMemo(() => new Color(profile.colors[0]), [profile.colors]);
  const c1 = useMemo(() => new Color(profile.colors[1]), [profile.colors]);
  const tmp = useMemo(() => new Color(), []);
  const { camera, size: view, gl } = useThree();

  const write = (t: number) => {
    const pos = geometry.getAttribute('position') as BufferAttribute;
    const col = geometry.getAttribute('color') as BufferAttribute;
    const sz = geometry.getAttribute('aSize') as BufferAttribute;
    const al = geometry.getAttribute('aAlpha') as BufferAttribute;
    const n = profile.count;
    // Pixels per world unit at distance 1, so a particle's size is its world size on screen.
    const fov = ((camera as PerspectiveCamera).fov * Math.PI) / 180;
    material.uniforms.uScale.value = (view.height * gl.getPixelRatio()) / (2 * Math.tan(fov / 2));
    const base = Math.max(frame.r, 0.005) * SIZE[profile.kind];
    for (let i = 0; i < n; i++) {
      const p = particleAt(profile.kind, i, n, t);
      pos.setXYZ(
        i,
        frame.c.x + p.x * frame.r,
        frame.c.y + p.y * frame.r,
        frame.c.z + p.z * frame.r,
      );
      // Colour follows brightness (hot core to cool edge) and stays saturated: no whitening.
      tmp.copy(c1).lerp(c0, 1 - p.a);
      col.setXYZ(i, tmp.r, tmp.g, tmp.b);
      sz.setX(i, p.size * base);
      al.setX(i, Math.min(1, p.a * (additive ? 1.15 : profile.kind === 'smoke' ? 0.55 : 1)));
    }
    pos.needsUpdate = col.needsUpdate = sz.needsUpdate = al.needsUpdate = true;
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
