/**
 * Massive March — walking.
 *
 * Travel time is the game (§7): walking somewhere is not the loading screen
 * before the content, it is where the conversation happens. So the movement
 * model is unhurried and physical — you accelerate, you slow down going uphill,
 * a steep slope will take your feet out from under you if you sit down on it,
 * and there is no sprint that trivialises the island.
 *
 * The camera is the only thing this client owns. Position is reported to the
 * hub fifteen times a second and re-clamped there against the same collision
 * and the same coastline, so what this file computes is a proposal, not a fact.
 *
 * Input comes through `lib/massive-march/input.ts` rather than from listeners
 * here, so a thumbstick drawn on a phone and a held W key are the same thing by
 * the time movement reads them.
 */

'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3 } from 'three';
import {
  CROUCH_EYE_HEIGHT,
  CROUCH_SPEED,
  EYE_HEIGHT,
  GRAVITY,
  JUMP_VELOCITY,
  MOVE_SEND_HZ,
  PLAYER_RADIUS,
  RUN_SPEED,
  SIT_EYE_HEIGHT,
  SLIDE_ACCEL,
  SLIDE_MAX_SPEED,
  SLIDE_SLOPE,
  WALK_SPEED,
} from '@/lib/massive-march/constants';
import { consume, input } from '@/lib/massive-march/input';
import { live, smooth } from '@/lib/massive-march/live';
import { BIT } from '@/lib/massive-march/net/events';
import { mm } from '@/lib/massive-march/net/client';
import { settings } from '@/lib/massive-march/settings';
import { COLLIDERS, resolveCollisions } from '@/lib/massive-march/world/regions';
import { clampToLand, groundY, slopeAt } from '@/lib/massive-march/world/terrain';
import { pad } from '@/lib/massive-march/world/terrain';

const SEND_INTERVAL = 1000 / MOVE_SEND_HZ;
const LANDING = pad('landing');

export function PlayerController({ onInteract }: { onInteract: () => void }) {
  const { camera } = useThree();

  const state = useRef({
    x: LANDING.x,
    z: LANDING.z + 10,
    y: 0,
    velocityY: 0,
    grounded: true,
    /** Horizontal velocity, world space — momentum survives releasing the key. */
    vx: 0,
    vz: 0,
    yaw: Math.PI,
    pitch: 0,
    sliding: false,
    lastSend: 0,
  });

  const scratch = useMemo(
    () => ({ forward: new Vector3(), right: new Vector3(), move: new Vector3() }),
    [],
  );

  // Start on the beach, looking inland at whatever the group is about to walk
  // toward, rather than at the sea behind them.
  useEffect(() => {
    const s = state.current;
    s.y = groundY(s.x, s.z);
    camera.position.set(s.x, s.y + EYE_HEIGHT, s.z);
  }, [camera]);

  useFrame((_, rawDelta) => {
    const delta = Math.min(0.06, rawDelta);
    const s = state.current;
    const options = settings();

    // ── Look ───────────────────────────────────────────────────────────────
    if (input.lookX !== 0 || input.lookY !== 0) {
      const speed = 0.0022 * options.sensitivity;
      s.yaw -= input.lookX * speed;
      s.pitch -= input.lookY * speed * (options.invertY ? -1 : 1);
      s.pitch = Math.max(-1.5, Math.min(1.5, s.pitch));
      input.lookX = 0;
      input.lookY = 0;
    }

    // ── Intent ─────────────────────────────────────────────────────────────
    const slope = slopeAt(s.x, s.z);
    const wantsSit = input.sit;
    const steep = slope.grade > SLIDE_SLOPE;

    // Sitting on a slope steep enough turns the hillside into a toy (§7). It is
    // also, occasionally, the fastest way down — which is the joke and the
    // shortcut at the same time.
    if (wantsSit && steep) s.sliding = true;
    if (!wantsSit || slope.grade < SLIDE_SLOPE * 0.6) s.sliding = false;

    const crouching = input.crouch && !wantsSit;
    const running = input.run && !crouching && !wantsSit;
    const maxSpeed = wantsSit ? 0 : crouching ? CROUCH_SPEED : running ? RUN_SPEED : WALK_SPEED;

    camera.getWorldDirection(scratch.forward);
    scratch.forward.y = 0;
    if (scratch.forward.lengthSq() < 1e-6) scratch.forward.set(0, 0, -1);
    scratch.forward.normalize();
    scratch.right.set(scratch.forward.z, 0, -scratch.forward.x);

    let inputX = input.moveX;
    let inputY = input.moveY;
    const magnitude = Math.hypot(inputX, inputY);
    if (magnitude > 1) {
      inputX /= magnitude;
      inputY /= magnitude;
    }

    const desired = scratch.move.set(0, 0, 0);
    desired.addScaledVector(scratch.forward, inputY * maxSpeed);
    desired.addScaledVector(scratch.right, inputX * maxSpeed);

    if (s.sliding) {
      // On a slide you do not steer, you fall downhill and hope. Gravity along
      // the surface, capped, with a little air resistance.
      s.vx -= slope.gx * SLIDE_ACCEL * delta;
      s.vz -= slope.gz * SLIDE_ACCEL * delta;
      const speed = Math.hypot(s.vx, s.vz);
      if (speed > SLIDE_MAX_SPEED) {
        s.vx = (s.vx / speed) * SLIDE_MAX_SPEED;
        s.vz = (s.vz / speed) * SLIDE_MAX_SPEED;
      }
      s.vx *= 0.995;
      s.vz *= 0.995;
    } else {
      // Ordinary movement eases toward the desired velocity; in the air the
      // easing is much weaker, so a jump commits you to where you were going.
      const grip = s.grounded ? 1 - Math.exp(-11 * delta) : 1 - Math.exp(-1.6 * delta);
      s.vx += (desired.x - s.vx) * grip;
      s.vz += (desired.z - s.vz) * grip;
    }

    // Uphill is slower. Not a stamina system — just the honest observation that
    // a 30% grade is not the same walk as a beach.
    const climb = slope.gx * s.vx + slope.gz * s.vz;
    if (climb > 0 && !s.sliding) {
      const penalty = 1 / (1 + climb * 0.22);
      s.vx *= penalty;
      s.vz *= penalty;
    }

    // ── Integrate + collide ────────────────────────────────────────────────
    let nx = s.x + s.vx * delta;
    let nz = s.z + s.vz * delta;

    const resolved = resolveCollisions(nx, nz, PLAYER_RADIUS, COLLIDERS);
    if (resolved.x !== nx || resolved.z !== nz) {
      // Bumped a wall: kill the component into it rather than all momentum, so
      // sliding along a booth wall works instead of stopping dead.
      s.vx = (resolved.x - s.x) / Math.max(delta, 1e-4);
      s.vz = (resolved.z - s.z) / Math.max(delta, 1e-4);
      nx = resolved.x;
      nz = resolved.z;
    }
    const landed = clampToLand(nx, nz);
    if (landed.x !== nx || landed.z !== nz) {
      s.vx = 0;
      s.vz = 0;
    }
    s.x = landed.x;
    s.z = landed.z;

    const floor = groundY(s.x, s.z);
    if (consume('jump') && s.grounded && !wantsSit) {
      s.velocityY = JUMP_VELOCITY;
      s.grounded = false;
    }

    if (!s.grounded) {
      s.velocityY -= GRAVITY * delta;
      s.y += s.velocityY * delta;
      if (s.y <= floor) {
        s.y = floor;
        s.velocityY = 0;
        s.grounded = true;
      }
    } else {
      // Stick to the ground rather than tracking it exactly, so walking over a
      // dune does not feel like riding a lift.
      s.y += (floor - s.y) * Math.min(1, delta * 18);
      if (floor - s.y > 1.2) s.grounded = false;
    }

    const eye = wantsSit ? SIT_EYE_HEIGHT : crouching ? CROUCH_EYE_HEIGHT : EYE_HEIGHT;
    camera.position.set(s.x, s.y + eye, s.z);
    camera.rotation.order = 'YXZ';
    camera.rotation.set(s.pitch, s.yaw, 0);

    // ── Publish ────────────────────────────────────────────────────────────
    let bits = 0;
    if (running && Math.hypot(s.vx, s.vz) > 0.4) bits |= BIT.RUN;
    if (crouching) bits |= BIT.CROUCH;
    if (wantsSit) bits |= BIT.SIT;
    if (!s.grounded) bits |= BIT.AIR;

    live.self.x = s.x;
    live.self.y = s.y;
    live.self.z = s.z;
    live.self.yaw = s.yaw;
    live.self.pitch = s.pitch;
    live.self.bits = bits;
    live.self.ground = floor;

    const now = performance.now();
    if (now - s.lastSend >= SEND_INTERVAL) {
      s.lastSend = now;
      mm.move(s.x, s.y, s.z, s.yaw, s.pitch, bits);
    }

    if (consume('interact')) onInteract();

    smooth(delta);
  });

  return null;
}

/**
 * Pointer lock, mouse look, and the keyboard.
 *
 * Lives outside the Canvas because it is document-level: the click that locks
 * the pointer has to be allowed to land on the HUD as well as the world, and a
 * key pressed while a chat field has focus is text, not movement.
 */
export function useDesktopInput(enabled: boolean, canvas: HTMLElement | null): void {
  useEffect(() => {
    if (!enabled || !canvas) return;
    const keys = settings().keys;

    const down = (event: KeyboardEvent) => {
      if (input.typing) return;
      const code = event.code;
      if (code === keys.forward) input.moveY = 1;
      else if (code === keys.back) input.moveY = -1;
      else if (code === keys.left) input.moveX = -1;
      else if (code === keys.right) input.moveX = 1;
      else if (code === keys.jump) {
        input.jump = true;
        event.preventDefault();
      } else if (code === keys.run) {
        input.run = settings().runMode === 'toggle' ? !input.run : true;
      } else if (code === keys.crouch) {
        input.crouch = settings().crouchMode === 'toggle' ? !input.crouch : true;
      } else if (code === keys.sit) {
        input.sit = !input.sit;
      } else if (code === keys.interact) input.interact = true;
      else if (code === keys.drop) input.drop = true;
      else if (code === keys.use) input.use = true;
      else if (code === keys.throwItem) input.throwing = true;
    };

    const up = (event: KeyboardEvent) => {
      const code = event.code;
      if (code === keys.forward && input.moveY > 0) input.moveY = 0;
      else if (code === keys.back && input.moveY < 0) input.moveY = 0;
      else if (code === keys.left && input.moveX < 0) input.moveX = 0;
      else if (code === keys.right && input.moveX > 0) input.moveX = 0;
      else if (code === keys.run && settings().runMode === 'hold') input.run = false;
      else if (code === keys.crouch && settings().crouchMode === 'hold') input.crouch = false;
    };

    const move = (event: MouseEvent) => {
      if (!input.looking) return;
      input.lookX += event.movementX;
      input.lookY += event.movementY;
    };

    const lockChange = () => {
      input.looking = document.pointerLockElement === canvas;
      if (!input.looking) {
        // Releasing the pointer should not leave you walking into the sea.
        input.moveX = 0;
        input.moveY = 0;
      }
    };

    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    document.addEventListener('mousemove', move);
    document.addEventListener('pointerlockchange', lockChange);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      document.removeEventListener('mousemove', move);
      document.removeEventListener('pointerlockchange', lockChange);
    };
  }, [enabled, canvas]);
}
