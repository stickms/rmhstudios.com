'use client';

import { Stars, ContactShadows, Environment, Lightformer } from '@react-three/drei';
import { useTempleStore } from '@/lib/temple-of-joy/store';

/**
 * Lighting + atmosphere for the temple. Uses physically-based lights, a locally
 * baked Environment (Lightformers → cubemap, no network asset) for realistic PBR
 * reflections, soft contact shadows and a starfield. Everything is baked once
 * (`frames={1}`) and kept low-resolution so it stays cheap on mobile.
 */
export function SceneEnvironment() {
  const dark = useTempleStore((s) => s.theme) === 'dark';

  return (
    <>
      <color attach="background" args={[dark ? '#0d0904' : '#ece0c8']} />
      <fog attach="fog" args={[dark ? '#0d0904' : '#ece0c8', 17, 44]} />

      {/* Sky/ground fill */}
      <hemisphereLight
        intensity={dark ? 0.35 : 0.8}
        color={dark ? '#4a3720' : '#fff3d6'}
        groundColor={dark ? '#0a0603' : '#b9a273'}
      />
      {/* Key sun */}
      <directionalLight position={[8, 14, 6]} intensity={dark ? 1.6 : 2.4} color="#ffe2a8" />
      {/* Warm core glow from the idol */}
      <pointLight position={[0, 4.2, 0]} intensity={dark ? 22 : 10} color="#ffc964" distance={28} decay={2} />
      {/* Cool rim for separation */}
      <pointLight position={[-7, 2, -5]} intensity={dark ? 10 : 4} color="#9bbcff" distance={26} decay={2} />

      {/* Baked PBR reflections — no external HDR, rendered once. */}
      <Environment resolution={256} frames={1}>
        <Lightformer form="ring" intensity={dark ? 2.5 : 3.5} color="#ffd98a" position={[0, 6, -5]} scale={9} />
        <Lightformer form="circle" intensity={dark ? 1.4 : 2.2} color="#fff1cf" position={[6, 3, 5]} scale={5} />
        <Lightformer form="circle" intensity={dark ? 1.0 : 1.6} color="#d9b3ff" position={[-7, 2, 3]} scale={4} />
        <Lightformer form="rect" intensity={dark ? 0.8 : 1.2} color="#ffffff" position={[0, -3, 4]} scale={6} />
      </Environment>

      {dark && <Stars radius={75} depth={45} count={1500} factor={3.5} fade speed={0.5} />}

      <ContactShadows
        position={[0, -0.02, 0]}
        opacity={dark ? 0.6 : 0.42}
        scale={38}
        blur={2.8}
        far={12}
        resolution={512}
        color="#1a1206"
      />
    </>
  );
}
