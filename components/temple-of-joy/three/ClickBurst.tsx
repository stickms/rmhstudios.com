'use client';

import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

const POOL = 96;
const PER_BURST = 14;

export interface ClickBurstHandle {
  emit: (point: THREE.Vector3) => void;
}

interface Particle {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  max: number;
}

/**
 * A single InstancedMesh pool of joy sparks. `emit(point)` activates a handful of
 * particles at the click location; they fly out, fall under light gravity and
 * shrink away. One draw call, no allocation per frame — cheap on mobile.
 */
export const ClickBurst = forwardRef<ClickBurstHandle, object>(function ClickBurst(_props, ref) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const cursor = useRef(0);
  const particles = useMemo<Particle[]>(
    () =>
      Array.from({ length: POOL }, () => ({
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        life: 0,
        max: 1,
      })),
    [],
  );

  useImperativeHandle(ref, () => ({
    emit(point: THREE.Vector3) {
      for (let i = 0; i < PER_BURST; i++) {
        const p = particles[cursor.current];
        cursor.current = (cursor.current + 1) % POOL;
        p.pos.copy(point);
        const ang = Math.random() * Math.PI * 2;
        const up = 1.5 + Math.random() * 2.5;
        const out = 0.8 + Math.random() * 2;
        p.vel.set(Math.cos(ang) * out, up, Math.sin(ang) * out);
        p.max = 0.6 + Math.random() * 0.5;
        p.life = p.max;
      }
    },
  }));

  useFrame((_state, dt) => {
    const m = mesh.current;
    if (!m) return;
    const step = Math.min(dt, 0.05);
    for (let i = 0; i < POOL; i++) {
      const p = particles[i];
      if (p.life > 0) {
        p.life -= step;
        p.vel.y -= 6 * step;
        p.vel.multiplyScalar(0.94);
        p.pos.addScaledVector(p.vel, step);
        const k = Math.max(0, p.life / p.max);
        dummy.position.copy(p.pos);
        dummy.scale.setScalar(0.06 + k * 0.12);
      } else {
        dummy.scale.setScalar(0);
        dummy.position.set(0, -1000, 0);
      }
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, POOL]} frustumCulled={false}>
      <sphereGeometry args={[1, 8, 8]} />
      <meshBasicMaterial color="#ffd06b" toneMapped={false} />
    </instancedMesh>
  );
});
