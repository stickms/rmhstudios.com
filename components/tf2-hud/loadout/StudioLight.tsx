/**
 * The light both 3D viewers share. A fixed world-space rig turned black as a model rotated, so this one
 * travels with the camera: a key light up and to the left of the viewer, a dimmer fill from the other
 * side, and a sky/ground hemisphere so no side is ever fully dark. Plain analytic lights only — an
 * environment map made some devices overexpose to pure white, and the intensities here are chosen to
 * leave headroom for bright textures (white gloves, socks) rather than clip them.
 */
'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { DirectionalLight, Vector3 } from 'three';

const KEY = new Vector3(-0.6, 0.8, 0.5);
const FILL = new Vector3(0.8, 0.2, 0.4);

export default function StudioLight() {
  const key = useRef<DirectionalLight>(null);
  const fill = useRef<DirectionalLight>(null);
  const scratch = useMemo(() => new Vector3(), []);
  const aim = useMemo(() => new Vector3(), []);

  // Both lights sit around wherever the camera is, aimed down its view.
  useFrame(({ camera }) => {
    const reach = Math.max(camera.position.length(), 1);
    camera.getWorldDirection(aim);
    for (const [light, offset] of [
      [key.current, KEY],
      [fill.current, FILL],
    ] as const) {
      if (!light) continue;
      scratch.copy(offset).applyQuaternion(camera.quaternion).multiplyScalar(reach);
      light.position.copy(camera.position).add(scratch);
      light.target.position.copy(camera.position).addScaledVector(aim, reach);
      light.target.updateMatrixWorld();
    }
  });

  return (
    <>
      <hemisphereLight args={['#ffffff', '#8a7f74', 1.5]} />
      <directionalLight ref={key} intensity={1.9} color="#fff4e6" />
      <directionalLight ref={fill} intensity={0.6} color="#dfe8ff" />
    </>
  );
}
