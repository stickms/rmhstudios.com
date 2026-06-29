// components/daily-puzzles/three/DeskEnvironment.tsx
'use client';

import { ContactShadows, Environment, Lightformer } from '@react-three/drei';

/** Cool daylight lighting for the desk: soft sky fill, a warm-white desk-lamp
 *  key light, low bloom, baked PBR reflections (no external HDR). */
export function DeskEnvironment() {
  return (
    <>
      <color attach="background" args={['#cdd4de']} />
      <fog attach="fog" args={['#cdd4de', 22, 60]} />

      {/* Cool sky / cool ground fill */}
      <hemisphereLight intensity={0.85} color="#eaf0fb" groundColor="#9aa3af" />
      {/* Desk lamp key (warm white, from upper-left where the lamp sits) */}
      <directionalLight position={[-6, 11, 5]} intensity={1.8} color="#fff4e0" />
      {/* Cool rim for separation */}
      <pointLight position={[7, 5, -4]} intensity={6} color="#a9c4ff" distance={30} decay={2} />

      <Environment resolution={256} frames={1}>
        <Lightformer form="rect" intensity={2.4} color="#ffffff" position={[-5, 8, 4]} scale={7} />
        <Lightformer form="circle" intensity={1.6} color="#dfe9ff" position={[6, 4, 5]} scale={5} />
        <Lightformer form="circle" intensity={1.1} color="#cdd9f2" position={[-7, 2, -3]} scale={4} />
      </Environment>

      <ContactShadows position={[0, -0.01, 0]} opacity={0.34} scale={40} blur={2.6} far={10} resolution={512} color="#2a2f38" />
    </>
  );
}
