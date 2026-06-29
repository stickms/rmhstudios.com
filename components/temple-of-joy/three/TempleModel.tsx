'use client';

import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { useTempleStore } from '@/lib/temple-of-joy/store';
import { templeAudio } from '@/lib/temple-of-joy/audio';
import { getGlowTexture } from './glowTexture';

const PILLAR_COUNT = 8;
const TAP_THRESHOLD = 12; // px of movement still counts as a tap, not a drag

interface TempleModelProps {
  onJoy: (point: THREE.Vector3) => void;
}

/**
 * The procedural temple — the click target of the game. It reacts to every
 * interaction (punch + emissive flash), breathes with passive HPS, lights up
 * additional pillars and orbiting joy-orbs as the player expands the temple, and
 * reads live numbers from the store inside the render loop (no React re-renders
 * per frame) to stay smooth on mobile.
 */
export function TempleModel({ onJoy }: TempleModelProps) {
  // Structural subscriptions only — these change rarely (on purchase / prestige).
  const sources = useTempleStore((s) => s.sources);
  const dark = useTempleStore((s) => s.theme) === 'dark';

  const tiersUnlocked = useMemo(
    () => Object.values(sources).filter((n) => n > 0).length,
    [sources],
  );
  const litPillars = Math.min(PILLAR_COUNT, tiersUnlocked);
  const orbCount = Math.min(6, Math.max(1, Math.floor(tiersUnlocked / 2)));

  const glow = useMemo(() => getGlowTexture(), []);

  // Animation refs — mutated in useFrame, never trigger React renders.
  const group = useRef<THREE.Group>(null);
  const idol = useRef<THREE.Mesh>(null);
  const idolMat = useRef<THREE.MeshPhysicalMaterial>(null);
  const haloRef = useRef<THREE.Sprite>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const orbsRef = useRef<THREE.Group>(null);

  // Transient animation state.
  const flash = useRef(0); // 0..1 decaying click flash
  const punch = useRef(0); // 0..1 decaying click scale punch
  const hpsCache = useRef(0);
  const hpsTimer = useRef(0);
  const pointerDown = useRef<{ x: number; y: number } | null>(null);

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;

    // Throttle the (relatively heavy) HPS computation to ~3×/sec.
    hpsTimer.current += dt;
    if (hpsTimer.current > 0.33) {
      hpsTimer.current = 0;
      hpsCache.current = useTempleStore.getState().getHPS();
    }
    const hpsFactor = THREE.MathUtils.clamp(Math.log10(hpsCache.current + 1) / 11, 0, 1);
    const pilgrimage = useTempleStore.getState().pilgrimageActive;

    // Decay transients.
    flash.current = Math.max(0, flash.current - dt * 2.5);
    punch.current = Math.max(0, punch.current - dt * 4);

    // Breathing pulse: faster + deeper with more HPS.
    const pulse = Math.sin(t * (1.2 + hpsFactor * 2.2)) * (0.02 + hpsFactor * 0.03);
    const punchScale = 1 + punch.current * 0.28;
    const breath = pilgrimage ? 0.6 : 1; // calm during pilgrimage

    if (group.current) {
      const s = (1 + pulse * breath) * punchScale;
      group.current.scale.setScalar(s);
    }

    if (idol.current) {
      idol.current.rotation.y += dt * (0.25 + hpsFactor * 0.5);
      idol.current.position.y = 2.45 + Math.sin(t * 1.5) * 0.08;
    }

    if (idolMat.current) {
      const base = 0.9 + hpsFactor * 2.4;
      idolMat.current.emissiveIntensity = base + flash.current * 5 + Math.sin(t * 3) * 0.15;
    }

    if (haloRef.current) {
      const hs = 4.2 + hpsFactor * 2.5 + flash.current * 3 + Math.sin(t * 2) * 0.15;
      haloRef.current.scale.setScalar(hs);
      const m = haloRef.current.material as THREE.SpriteMaterial;
      m.opacity = (dark ? 0.55 : 0.4) + flash.current * 0.4;
    }

    if (ringRef.current) {
      ringRef.current.rotation.z += dt * (0.15 + hpsFactor * 0.4);
      ringRef.current.rotation.x = 0.4 + Math.sin(t * 0.4) * 0.05;
    }

    if (orbsRef.current) {
      orbsRef.current.rotation.y += dt * (0.4 + hpsFactor * 0.6);
      orbsRef.current.children.forEach((orb, i) => {
        orb.position.y = 1.6 + Math.sin(t * 1.4 + i) * 0.25;
      });
    }
  });

  const handleDown = (e: ThreeEvent<PointerEvent>) => {
    pointerDown.current = { x: e.nativeEvent.clientX, y: e.nativeEvent.clientY };
  };

  const handleUp = (e: ThreeEvent<PointerEvent>) => {
    const start = pointerDown.current;
    pointerDown.current = null;
    if (!start) return;
    const dx = e.nativeEvent.clientX - start.x;
    const dy = e.nativeEvent.clientY - start.y;
    if (Math.hypot(dx, dy) > TAP_THRESHOLD) return; // it was a camera drag

    const store = useTempleStore.getState();
    if (store.pilgrimageActive) return; // no clicking during pilgrimage
    e.stopPropagation();
    store.click();
    templeAudio.playClick();
    flash.current = 1;
    punch.current = 1;
    onJoy(e.point.clone());
  };

  const stoneColor = dark ? '#9c7038' : '#c9a05a';

  return (
    <group ref={group} position={[0, 0, 0]}>
      {/* Invisible generous collider so taps near the temple register reliably. */}
      <mesh
        position={[0, 1.8, 0]}
        visible={false}
        onPointerDown={handleDown}
        onPointerUp={handleUp}
      >
        <sphereGeometry args={[3.1, 12, 12]} />
      </mesh>

      {/* Stepped ziggurat base */}
      {[
        { y: 0.25, r: 3.0, h: 0.5 },
        { y: 0.75, r: 2.4, h: 0.5 },
        { y: 1.2, r: 1.85, h: 0.45 },
      ].map((step, i) => (
        <mesh key={i} position={[0, step.y, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[step.r, step.r + 0.18, step.h, 6]} />
          <meshStandardMaterial color={stoneColor} metalness={0.35} roughness={0.55} />
        </mesh>
      ))}

      {/* Altar plinth */}
      <mesh position={[0, 1.62, 0]} castShadow>
        <cylinderGeometry args={[0.75, 0.95, 0.4, 8]} />
        <meshStandardMaterial color={dark ? '#6f4e25' : '#a07c41'} metalness={0.5} roughness={0.4} />
      </mesh>

      {/* Glowing joy core (the idol) */}
      <mesh ref={idol} position={[0, 2.45, 0]} castShadow>
        <icosahedronGeometry args={[0.7, 1]} />
        <meshPhysicalMaterial
          ref={idolMat}
          color="#ffcf6b"
          emissive="#ffaa2c"
          emissiveIntensity={1.2}
          metalness={1}
          roughness={0.12}
          clearcoat={1}
          clearcoatRoughness={0.15}
        />
      </mesh>

      {/* Additive halo around the core — cheap, optimized bloom */}
      <sprite ref={haloRef} position={[0, 2.45, 0]} scale={4.2}>
        <spriteMaterial
          map={glow}
          color="#ffd27a"
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </sprite>

      {/* Ceremonial floating ring above the core */}
      <mesh ref={ringRef} position={[0, 2.45, 0]} rotation={[0.4, 0, 0]}>
        <torusGeometry args={[1.25, 0.06, 12, 48]} />
        <meshStandardMaterial color="#e8b860" emissive="#c98e2a" emissiveIntensity={0.6} metalness={1} roughness={0.25} />
      </mesh>

      {/* Ring of pillars; lit ones glow + carry a flame as the temple grows */}
      {Array.from({ length: PILLAR_COUNT }).map((_, i) => {
        const a = (i / PILLAR_COUNT) * Math.PI * 2;
        const x = Math.cos(a) * 2.85;
        const z = Math.sin(a) * 2.85;
        const lit = i < litPillars;
        return (
          <group key={i} position={[x, 0, z]}>
            <mesh position={[0, 1.25, 0]} castShadow>
              <cylinderGeometry args={[0.16, 0.2, 2.5, 8]} />
              <meshStandardMaterial
                color={stoneColor}
                metalness={0.4}
                roughness={0.5}
                emissive={lit ? '#ff9d2a' : '#000000'}
                emissiveIntensity={lit ? 0.35 : 0}
              />
            </mesh>
            <mesh position={[0, 2.62, 0]}>
              <boxGeometry args={[0.5, 0.18, 0.5]} />
              <meshStandardMaterial color={dark ? '#7a572b' : '#b08850'} metalness={0.4} roughness={0.5} />
            </mesh>
            {lit && (
              <sprite position={[0, 2.95, 0]} scale={0.7}>
                <spriteMaterial
                  map={glow}
                  color="#ffb347"
                  transparent
                  depthWrite={false}
                  blending={THREE.AdditiveBlending}
                  toneMapped={false}
                />
              </sprite>
            )}
          </group>
        );
      })}

      {/* Orbiting joy orbs — count scales with progression */}
      <group ref={orbsRef} position={[0, 0, 0]}>
        {Array.from({ length: orbCount }).map((_, i) => {
          const a = (i / orbCount) * Math.PI * 2;
          return (
            <mesh key={i} position={[Math.cos(a) * 3.6, 1.6, Math.sin(a) * 3.6]}>
              <sphereGeometry args={[0.16, 16, 16]} />
              <meshStandardMaterial
                color="#ffe1a0"
                emissive="#ffb347"
                emissiveIntensity={1.6}
                toneMapped={false}
              />
            </mesh>
          );
        })}
      </group>

      {/* Sacred dais */}
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[6, 48]} />
        <meshStandardMaterial color={dark ? '#241809' : '#cdbb95'} metalness={0.2} roughness={0.85} />
      </mesh>
    </group>
  );
}
