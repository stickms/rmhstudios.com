'use client';

import { useEffect, useState } from 'react';
import { Sparkles } from '@react-three/drei';
import * as THREE from 'three';
import { useTempleStore } from '@/lib/temple-of-joy/store';

/**
 * Ambient joy motes drifting around the temple. Density/size/speed scale with
 * passive HPS so a thriving temple visibly shimmers. The particle count is kept
 * fixed (changing it would rebuild buffers) — only cheap visual params animate,
 * sampled once per second to avoid per-frame React work.
 */
export function AmbientJoy() {
  const [factor, setFactor] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      const hps = useTempleStore.getState().getHPS();
      setFactor(THREE.MathUtils.clamp(Math.log10(hps + 1) / 11, 0, 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <Sparkles
      count={70}
      scale={[14, 8, 14]}
      position={[0, 3, 0]}
      size={2 + factor * 5}
      speed={0.3 + factor * 0.8}
      opacity={0.35 + factor * 0.5}
      color="#ffd98a"
    />
  );
}
