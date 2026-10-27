/**
 * The light both 3D viewers share. The old rig was three fixed lights in world space, so rotating the
 * model turned its lit side away and left it black. This one lights it from every side: a soft studio
 * environment (generated here, no download) for even fill, a sky/ground hemisphere, and a key light that
 * travels with the camera so the side you are looking at is always lit.
 */
'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { DirectionalLight, PMREMGenerator, Vector3 } from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

const OFFSET = new Vector3(-0.6, 0.8, 0.5);

export default function StudioLight() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const invalidate = useThree((s) => s.invalidate);
  const key = useRef<DirectionalLight>(null);
  const scratch = useMemo(() => new Vector3(), []);
  const aim = useMemo(() => new Vector3(), []);

  useEffect(() => {
    const pmrem = new PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const target = pmrem.fromScene(room, 0.04);
    scene.environment = target.texture;
    scene.environmentIntensity = 0.85;
    room.dispose();
    invalidate();
    return () => {
      scene.environment = null;
      target.dispose();
      pmrem.dispose();
    };
  }, [gl, scene, invalidate]);

  // The key sits up and to the left of wherever the camera is.
  useFrame(({ camera }) => {
    const light = key.current;
    if (!light) return;
    const reach = Math.max(camera.position.length(), 1);
    scratch.copy(OFFSET).applyQuaternion(camera.quaternion).multiplyScalar(reach);
    light.position.copy(camera.position).add(scratch);
    // Aimed down the camera's view, so it does not matter where the model sits in the scene.
    camera.getWorldDirection(aim);
    light.target.position.copy(camera.position).addScaledVector(aim, reach);
    light.target.updateMatrixWorld();
  });

  return (
    <>
      <hemisphereLight args={['#ffffff', '#8a7f74', 0.7]} />
      <directionalLight ref={key} intensity={1.6} color="#fff4e6" />
    </>
  );
}
