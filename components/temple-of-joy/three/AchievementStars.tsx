'use client';

import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useTempleStore } from '@/lib/temple-of-joy/store';
import { ACHIEVEMENTS } from '@/lib/temple-of-joy/data/achievements';

/**
 * Every achievement is a star on the sky-dome. Earned ones blaze gold and twinkle;
 * locked ones sit faint. Rendered as a single InstancedMesh (one draw call) so all
 * ~140 stars stay essentially free, even on mobile.
 */
export function AchievementStars() {
  const count = ACHIEVEMENTS.length;
  const mesh = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const earned = useRef<boolean[]>(new Array(count).fill(false));
  const gold = useMemo(() => new THREE.Color('#ffd166'), []);
  const faint = useMemo(() => new THREE.Color('#4a5a7a'), []);

  // Fixed star positions on a large dome (golden-spiral distribution).
  const positions = useMemo(() => {
    const arr: THREE.Vector3[] = [];
    const R = 46;
    for (let i = 0; i < count; i++) {
      const y = 0.15 + (i / count) * 0.8; // keep them in the upper hemisphere
      const r = Math.sqrt(1 - y * y);
      const theta = i * 2.399963; // golden angle
      arr.push(new THREE.Vector3(Math.cos(theta) * r * R, y * R, Math.sin(theta) * r * R));
    }
    return arr;
  }, [count]);

  useEffect(() => {
    const sample = () => {
      const s = useTempleStore.getState();
      earned.current = ACHIEVEMENTS.map((a) => s.achievements.has(a.id));
    };
    sample();
    const id = window.setInterval(sample, 2000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const m = mesh.current;
    if (!m) return;
    for (let i = 0; i < count; i++) {
      dummy.position.copy(positions[i]);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
      m.setColorAt(i, faint);
    }
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [count, positions, dummy, faint]);

  useFrame((state) => {
    const m = mesh.current;
    if (!m) return;
    const t = state.clock.elapsedTime;
    for (let i = 0; i < count; i++) {
      const isEarned = earned.current[i];
      const twinkle = isEarned ? 1.4 + Math.sin(t * 2 + i) * 0.5 : 0.55;
      dummy.position.copy(positions[i]);
      dummy.scale.setScalar(twinkle);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
      m.setColorAt(i, isEarned ? gold : faint);
    }
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, count]} frustumCulled={false}>
      <sphereGeometry args={[0.18, 6, 6]} />
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  );
}
