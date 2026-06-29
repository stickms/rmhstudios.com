'use client';

import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Billboard } from '@react-three/drei';
import { makeLabelTexture } from './ui3d/canvasLabel';

interface FloatingJoyProps {
  point: THREE.Vector3;
  text: string;
}

/** A real 3D "+N happiness" label that rises from the click point and fades. */
export function FloatingJoy({ point, text }: FloatingJoyProps) {
  const label = useMemo(() => makeLabelTexture(text, { color: '#ffe08a', fontSize: 64 }), [text]);
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  const group = useRef<THREE.Group>(null);
  const age = useRef(0);
  const h = 0.5;
  const w = h * label.aspect;

  useFrame((_s, dt) => {
    age.current += dt;
    const k = Math.min(1, age.current / 1.1);
    if (group.current) {
      group.current.position.set(point.x, point.y + k * 1.6, point.z);
      const s = 0.8 + k * 0.4;
      group.current.scale.setScalar(s);
    }
    if (mat.current) mat.current.opacity = 1 - k;
  });

  return (
    <Billboard ref={group} position={[point.x, point.y, point.z]}>
      <mesh renderOrder={5}>
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial ref={mat} map={label.texture} transparent depthWrite={false} toneMapped={false} />
      </mesh>
    </Billboard>
  );
}
