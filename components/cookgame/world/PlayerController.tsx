"use client";
import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { RigidBody, CapsuleCollider, type RapierRigidBody } from '@react-three/rapier';
import { Vector3 } from 'three';
import { useCookgameStore } from '@/lib/cookgame/store';
import Character from '@/components/cookgame/models/Character';

const WALK_SPEED = 5;
const SPRINT_SPEED = 9;
// Third-person camera sits behind/above the player (W moves away from camera, into −Z).
const CAMERA_OFFSET = new Vector3(0, 7, 11);

export function PlayerController() {
  const body = useRef<RapierRigidBody>(null);
  const keys = useRef<Record<string, boolean>>({});
  const camTarget = useRef(new Vector3());
  const frame = useRef(0);
  const charMoving = useRef(false);
  const charFacing = useRef(0);
  const { camera } = useThree();

  useEffect(() => {
    const down = (e: KeyboardEvent) => { keys.current[e.code] = true; };
    const up = (e: KeyboardEvent) => { keys.current[e.code] = false; };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  useFrame(() => {
    const rb = body.current;
    if (!rb) return;

    // Freeze movement while an overlay is open so typing/clicking can't drive the player.
    const overlayOpen = useCookgameStore.getState().activeOverlay !== null;
    const k = keys.current;
    let x = 0;
    let z = 0;
    if (!overlayOpen) {
      if (k['KeyW'] || k['ArrowUp']) z -= 1;
      if (k['KeyS'] || k['ArrowDown']) z += 1;
      if (k['KeyA'] || k['ArrowLeft']) x -= 1;
      if (k['KeyD'] || k['ArrowRight']) x += 1;
    }
    const speed = k['ShiftLeft'] || k['ShiftRight'] ? SPRINT_SPEED : WALK_SPEED;
    const len = Math.hypot(x, z);
    if (len > 0) {
      x = (x / len) * speed;
      z = (z / len) * speed;
    }
    const vel = rb.linvel();
    rb.setLinvel({ x, y: vel.y, z }, true);

    // Update character animation refs (no React state — read by Character's useFrame).
    const isMoving = Math.hypot(x, z) > 0.1;
    charMoving.current = isMoving;
    if (isMoving) {
      charFacing.current = Math.atan2(x, z);
    }

    // Camera follows the body; lerp for smoothness.
    const t = rb.translation();
    camTarget.current.set(t.x + CAMERA_OFFSET.x, t.y + CAMERA_OFFSET.y, t.z + CAMERA_OFFSET.z);
    camera.position.lerp(camTarget.current, 0.12);
    camera.lookAt(t.x, t.y + 1, t.z);

    // Throttle store writes (~every 5 frames) to avoid render thrash.
    frame.current = (frame.current + 1) % 5;
    if (frame.current === 0) {
      useCookgameStore.getState().setPlayerPosition([t.x, t.y, t.z]);
    }
  });

  return (
    <RigidBody
      ref={body}
      type="dynamic"
      colliders={false}
      mass={1}
      enabledRotations={[false, false, false]}
      position={[0, 2, 6]}
    >
      <CapsuleCollider args={[0.6, 0.5]} />
      {/* Character feet at local y=0; RigidBody origin at capsule center (halfHeight+radius=1.1 up),
          so shift the group down by 1.1 to plant feet at the capsule base. */}
      <group position={[0, -1.1, 0]}>
        <Character lookId="player" movingRef={charMoving} facingRef={charFacing} />
      </group>
    </RigidBody>
  );
}
