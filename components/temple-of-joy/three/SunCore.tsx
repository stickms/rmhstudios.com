'use client';

import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useTempleStore } from '@/lib/temple-of-joy/store';
import { templeAudio } from '@/lib/temple-of-joy/audio';
import { getGlowTexture } from './glowTexture';
import { getProgression, sunColors } from './progression';
import { useTap } from './useTap';

interface SunCoreProps {
  onJoy: (point: THREE.Vector3) => void;
}

/**
 * The Sun of Joy — the central, ever-growing light that the player taps to spread
 * joy. Instead of the whole temple scaling, *this* scales and intensifies with
 * progression: it grows, brightens, shifts colour (gold → white-hot → violet) and
 * flares on every tap. All progression/HPS values are read inside the render loop
 * (throttled) so it never forces a React re-render.
 */
export function SunCore({ onJoy }: SunCoreProps) {
  const glow = useMemo(() => getGlowTexture(), []);
  const dark = useTempleStore((s) => s.theme) === 'dark';

  const group = useRef<THREE.Group>(null);
  const coreMat = useRef<THREE.MeshStandardMaterial>(null);
  const halo = useRef<THREE.Sprite>(null);
  const corona = useRef<THREE.Sprite>(null);
  const light = useRef<THREE.PointLight>(null);

  const flash = useRef(0);
  const punch = useRef(0);
  const sampler = useRef(0);
  const cached = useRef({ scale: 1, intensity: 0.4, heat: 0, hps: 0 });
  const color = useMemo(() => new THREE.Color('#ffcf6b'), []);
  const emissive = useMemo(() => new THREE.Color('#ffaa2c'), []);
  const lightColor = useMemo(() => new THREE.Color('#ffc964'), []);

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;

    // Re-sample (relatively heavy) progression ~3×/sec.
    sampler.current += dt;
    if (sampler.current > 0.33) {
      sampler.current = 0;
      const gs = useTempleStore.getState();
      const p = getProgression(gs);
      cached.current.scale = p.sunScale;
      cached.current.intensity = p.intensity;
      cached.current.heat = p.heat;
      cached.current.hps = gs.getHPS();
      const c = sunColors(p.heat);
      color.set(c.core);
      emissive.set(c.emissive);
      lightColor.set(c.light);
    }

    flash.current = Math.max(0, flash.current - dt * 2.4);
    punch.current = Math.max(0, punch.current - dt * 3.5);

    const { scale, intensity, hps } = cached.current;
    const hpsFactor = THREE.MathUtils.clamp(Math.log10(hps + 1) / 11, 0, 1);
    const breathe = Math.sin(t * (1.0 + hpsFactor * 1.8)) * (0.03 + hpsFactor * 0.04);
    const s = scale * (1 + breathe) * (1 + punch.current * 0.3);

    if (group.current) {
      group.current.scale.setScalar(s);
      group.current.rotation.y += dt * (0.1 + hpsFactor * 0.3);
    }
    if (coreMat.current) {
      coreMat.current.color.copy(color);
      coreMat.current.emissive.copy(emissive);
      coreMat.current.emissiveIntensity = 1 + intensity * 3 + flash.current * 6 + Math.sin(t * 3) * 0.2;
    }
    if (halo.current) {
      const m = halo.current.material as THREE.SpriteMaterial;
      m.color.copy(emissive);
      m.opacity = (dark ? 0.55 : 0.4) + intensity * 0.3 + flash.current * 0.4;
      halo.current.scale.setScalar(3.2 + intensity * 2.5 + flash.current * 3 + Math.sin(t * 2) * 0.12);
    }
    if (corona.current) {
      const m = corona.current.material as THREE.SpriteMaterial;
      m.color.copy(emissive);
      m.opacity = 0.18 + intensity * 0.22 + flash.current * 0.3;
      corona.current.scale.setScalar(6 + intensity * 5 + Math.sin(t * 0.7) * 0.4);
      corona.current.material.rotation += dt * 0.05;
    }
    if (light.current) {
      light.current.color.copy(lightColor);
      light.current.intensity = (dark ? 14 : 7) + intensity * 30 + flash.current * 40;
    }
  });

  const tap = useTap((e) => {
    const store = useTempleStore.getState();
    if (store.pilgrimageActive) return;
    store.click();
    templeAudio.playClick();
    flash.current = 1;
    punch.current = 1;
    onJoy(e.point.clone());
  });

  // Sun + collider sit elevated above the temple so it reads as the apex light.
  return (
    <group position={[0, 4.6, 0]}>
      {/* Generous transparent tap collider (transparent, not `visible={false}`,
          so the raycaster still reports hits for pointer events) */}
      <mesh {...tap}>
        <sphereGeometry args={[2.4, 16, 16]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
      </mesh>

      <group ref={group}>
        <mesh>
          <icosahedronGeometry args={[1, 3]} />
          <meshStandardMaterial
            ref={coreMat}
            color="#ffcf6b"
            emissive="#ffaa2c"
            emissiveIntensity={1.4}
            metalness={0.2}
            roughness={0.35}
            toneMapped={false}
          />
        </mesh>
      </group>

      {/* Inner bloom halo */}
      <sprite ref={halo} scale={3.2}>
        <spriteMaterial map={glow} color="#ffd27a" transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </sprite>
      {/* Outer soft corona */}
      <sprite ref={corona} scale={6}>
        <spriteMaterial map={glow} color="#ffd27a" transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} opacity={0.2} />
      </sprite>

      <pointLight ref={light} intensity={16} distance={40} decay={2} color="#ffc964" />
    </group>
  );
}
