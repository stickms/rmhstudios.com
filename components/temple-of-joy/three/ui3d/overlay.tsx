'use client';

import { createContext, useContext, useMemo, useRef, type ReactNode } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';

interface OverlaySize { w: number; h: number }
const OverlayCtx = createContext<OverlaySize>({ w: 7, h: 4 });
export const useOverlaySize = () => useContext(OverlayCtx);

/**
 * Screen-anchored 3D UI without drei <Hud>. The chrome rides in a group pinned to
 * the main camera (so it stays fixed on screen as the camera orbits) and is drawn
 * in the normal render pass — no second camera, no render-priority takeover (both
 * of which blanked the scene). Materials are forced to depthTest:false so the UI
 * always paints on top of the world. The frustum extents at the UI plane are
 * provided via context so layouts can position against the screen edges.
 */
export function CameraOverlay({ children, distance = 6 }: { children: ReactNode; distance?: number }) {
  const root = useRef<THREE.Group>(null);
  const { camera, size } = useThree();

  const fov = (camera as THREE.PerspectiveCamera).fov ?? 45;
  const hh = Math.tan((fov * Math.PI) / 360) * distance;
  const hw = hh * (size.width / Math.max(1, size.height));
  const value = useMemo<OverlaySize>(() => ({ w: hw * 2, h: hh * 2 }), [hw, hh]);

  useFrame(() => {
    const g = root.current;
    if (!g) return;
    g.position.copy(camera.position);
    g.quaternion.copy(camera.quaternion);
    g.traverse((o) => {
      o.renderOrder = 20;
      const mat = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      if (!mat) return;
      const arr = Array.isArray(mat) ? mat : [mat];
      for (const m of arr) { m.depthTest = false; m.depthWrite = false; m.transparent = true; }
    });
  });

  return (
    <group ref={root}>
      <group position={[0, 0, -distance]}>
        <OverlayCtx.Provider value={value}>{children}</OverlayCtx.Provider>
      </group>
    </group>
  );
}
