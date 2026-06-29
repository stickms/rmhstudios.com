'use client';

import { Html } from '@react-three/drei';
import type * as THREE from 'three';

interface FloatingJoyProps {
  point: THREE.Vector3;
  text: string;
}

/** A "+N happiness" label that rises from the click point in world space. */
export function FloatingJoy({ point, text }: FloatingJoyProps) {
  return (
    <Html
      position={[point.x, point.y, point.z]}
      center
      zIndexRange={[30, 0]}
      style={{ pointerEvents: 'none', userSelect: 'none' }}
    >
      <div className="temple-float3d">{text}</div>
    </Html>
  );
}
