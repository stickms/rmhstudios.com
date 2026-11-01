'use client';

import { useFrame, useThree } from '@react-three/fiber';
import { Euler } from 'three';
import { touchInput } from './touchInput';

const euler = new Euler(0, 0, 0, 'YXZ');
const MAX_PITCH = Math.PI / 2 - 0.05;

/** Applies the look-pad deltas to the camera (the touch stand-in for PointerLockControls). */
export function TouchLook() {
  const camera = useThree((s) => s.camera);

  useFrame(() => {
    if (touchInput.lookYaw === 0 && touchInput.lookPitch === 0) return;
    euler.setFromQuaternion(camera.quaternion, 'YXZ');
    euler.y -= touchInput.lookYaw;
    euler.x = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, euler.x - touchInput.lookPitch));
    camera.quaternion.setFromEuler(euler);
    touchInput.lookYaw = 0;
    touchInput.lookPitch = 0;
  });

  return null;
}
