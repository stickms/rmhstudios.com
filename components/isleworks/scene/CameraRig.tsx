'use client';

/**
 * Isleworks — camera and pointer input.
 *
 * A fixed-pitch orthographic camera that orbits in 90° steps. Orthographic
 * because the whole art direction is "a model on a table": perspective makes the
 * far corner of the island smaller than the near one, and the diorama read
 * collapses.
 *
 * ## The one input decision worth explaining
 *
 * Left-drag has to mean two different things — *paint* (drawing a road, dropping
 * a row of houses) and *pan*. Rather than a modifier key nobody discovers, the
 * armed tool decides:
 *
 *   tool armed  → left-drag paints, middle/right-drag pans
 *   no tool     → left-drag pans
 *
 * Two-finger touch and the wheel always mean camera, in both modes, so there is
 * always a way to move the view without disarming what you were doing.
 *
 * A left press that travels less than `CLICK_SLOP` px is a click, not a drag —
 * without that, every single-tile placement on a trackpad would be a two-pixel
 * pan instead.
 */

import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

/** Camera pitch. 35.26° is the true isometric angle; a touch steeper reads better. */
const PITCH = THREE.MathUtils.degToRad(38);
const MIN_ZOOM = 22;
const MAX_ZOOM = 130;
const CLICK_SLOP = 6;

export interface RigHandle {
  /** Frame the whole island. */
  reset: () => void;
  rotate: (steps: number) => void;
  zoomBy: (factor: number) => void;
}

interface CameraRigProps {
  /** Half-extent of the board in world units. */
  radius: number;
  /** True while a build/bulldoze tool is armed. */
  toolArmed: boolean;
  reducedMotion: boolean;
  onClick: () => void;
  onPaintStart: () => void;
  onPaintEnd: () => void;
  handleRef: React.MutableRefObject<RigHandle | null>;
}

export function CameraRig({
  radius,
  toolArmed,
  reducedMotion,
  onClick,
  onPaintStart,
  onPaintEnd,
  handleRef,
}: CameraRigProps) {
  const { camera, gl, size } = useThree();

  const state = useRef({
    target: new THREE.Vector3(0, 0, 0),
    goalTarget: new THREE.Vector3(0, 0, 0),
    yaw: Math.PI / 4,
    goalYaw: Math.PI / 4,
    zoom: 46,
    goalZoom: 46,
  });

  const drag = useRef({
    mode: 'none' as 'none' | 'camera' | 'paint',
    id: -1,
    x: 0,
    y: 0,
    travelled: 0,
    /** Active touch points, for pinch. */
    touches: new Map<number, { x: number; y: number }>(),
    pinchDistance: 0,
  });

  const armedRef = useRef(toolArmed);
  armedRef.current = toolArmed;

  /* ── imperative handle for the HUD buttons ─────────────────────────────── */
  useEffect(() => {
    handleRef.current = {
      reset: () => {
        state.current.goalTarget.set(0, 0, 0);
        state.current.goalZoom = 46;
        state.current.goalYaw = Math.PI / 4;
      },
      rotate: (steps: number) => {
        state.current.goalYaw += (steps * Math.PI) / 2;
      },
      zoomBy: (factor: number) => {
        state.current.goalZoom = THREE.MathUtils.clamp(
          state.current.goalZoom * factor,
          MIN_ZOOM,
          MAX_ZOOM,
        );
      },
    };
    return () => {
      handleRef.current = null;
    };
  }, [handleRef]);

  /* ── pointer + wheel + keys ────────────────────────────────────────────── */
  useEffect(() => {
    const element = gl.domElement;
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const hit = new THREE.Vector3();

    /** World point under a client position, on the ground plane. */
    const groundAt = (clientX: number, clientY: number): THREE.Vector3 | null => {
      const rect = element.getBoundingClientRect();
      ndc.set(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(ndc, camera);
      return raycaster.ray.intersectPlane(plane, hit) ? hit.clone() : null;
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === 'touch') {
        drag.current.touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (drag.current.touches.size === 2) {
          const [a, b] = [...drag.current.touches.values()];
          drag.current.pinchDistance = Math.hypot(a.x - b.x, a.y - b.y);
          drag.current.mode = 'camera';
          onPaintEnd();
          return;
        }
      }
      if (drag.current.mode !== 'none') return;

      const paints = armedRef.current && (event.button === 0 || event.pointerType !== 'mouse');
      drag.current.mode = paints ? 'paint' : 'camera';
      drag.current.id = event.pointerId;
      drag.current.x = event.clientX;
      drag.current.y = event.clientY;
      drag.current.travelled = 0;
      element.setPointerCapture?.(event.pointerId);
      if (paints) onPaintStart();
    };

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType === 'touch' && drag.current.touches.has(event.pointerId)) {
        drag.current.touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
      }

      // Pinch: two fingers scale the zoom and pan by their midpoint.
      if (drag.current.touches.size === 2) {
        const [a, b] = [...drag.current.touches.values()];
        const distance = Math.hypot(a.x - b.x, a.y - b.y);
        if (drag.current.pinchDistance > 0) {
          const factor = distance / drag.current.pinchDistance;
          state.current.goalZoom = THREE.MathUtils.clamp(
            state.current.goalZoom * factor,
            MIN_ZOOM,
            MAX_ZOOM,
          );
        }
        drag.current.pinchDistance = distance;
        return;
      }

      if (drag.current.mode === 'none' || event.pointerId !== drag.current.id) return;

      const dx = event.clientX - drag.current.x;
      const dy = event.clientY - drag.current.y;
      drag.current.x = event.clientX;
      drag.current.y = event.clientY;
      drag.current.travelled += Math.abs(dx) + Math.abs(dy);
      if (drag.current.mode !== 'camera') return;

      panByPixels(state.current, camera, size.height, dx, dy, radius);
    };

    const finish = (event: PointerEvent) => {
      drag.current.touches.delete(event.pointerId);
      if (drag.current.touches.size < 2) drag.current.pinchDistance = 0;
      if (event.pointerId !== drag.current.id && drag.current.mode !== 'none') {
        if (!drag.current.touches.size) drag.current.mode = 'none';
        return;
      }
      const wasPainting = drag.current.mode === 'paint';
      const tapped = drag.current.travelled < CLICK_SLOP;
      drag.current.mode = 'none';
      drag.current.id = -1;
      element.releasePointerCapture?.(event.pointerId);
      if (wasPainting) onPaintEnd();
      // A paint drag has already applied itself tile by tile; only a genuine
      // click needs the single-shot action.
      if (tapped && !wasPainting) onClick();
    };

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const before = groundAt(event.clientX, event.clientY);
      const factor = Math.exp(-event.deltaY * 0.0016);
      state.current.goalZoom = THREE.MathUtils.clamp(
        state.current.goalZoom * factor,
        MIN_ZOOM,
        MAX_ZOOM,
      );
      // Anchor the point under the cursor by nudging the target the same way the
      // zoom would have pushed it. Without this, zooming always drifts to centre.
      if (before) {
        const scale = 1 - 1 / factor;
        state.current.goalTarget.x += (before.x - state.current.goalTarget.x) * scale;
        state.current.goalTarget.z += (before.z - state.current.goalTarget.z) * scale;
        clampTarget(state.current.goalTarget, radius);
      }
    };

    const onKey = (event: KeyboardEvent) => {
      const step = 1.6;
      switch (event.key.toLowerCase()) {
        case 'q':
          state.current.goalYaw += Math.PI / 2;
          break;
        case 'e':
          state.current.goalYaw -= Math.PI / 2;
          break;
        case 'w':
        case 'arrowup':
          nudge(state.current, 0, -step);
          break;
        case 's':
        case 'arrowdown':
          nudge(state.current, 0, step);
          break;
        case 'a':
        case 'arrowleft':
          nudge(state.current, -step, 0);
          break;
        case 'd':
        case 'arrowright':
          nudge(state.current, step, 0);
          break;
        default:
          return;
      }
      clampTarget(state.current.goalTarget, radius);
    };

    element.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
    element.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKey);
    return () => {
      element.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      element.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKey);
    };
  }, [camera, gl, size.height, onClick, onPaintStart, onPaintEnd, radius]);

  /* ── the frame ─────────────────────────────────────────────────────────── */
  useFrame((_, delta) => {
    const s = state.current;
    // Critically-damped-ish smoothing, frame-rate independent.
    const k = reducedMotion ? 1 : 1 - Math.exp(-delta * 11);
    s.target.lerp(s.goalTarget, k);
    s.yaw += (s.goalYaw - s.yaw) * k;
    s.zoom += (s.goalZoom - s.zoom) * k;

    const distance = radius * 3.2;
    const cos = Math.cos(PITCH);
    camera.position.set(
      s.target.x + Math.sin(s.yaw) * distance * cos,
      s.target.y + Math.sin(PITCH) * distance,
      s.target.z + Math.cos(s.yaw) * distance * cos,
    );
    camera.lookAt(s.target);
    const ortho = camera as THREE.OrthographicCamera;
    if (ortho.isOrthographicCamera && Math.abs(ortho.zoom - s.zoom) > 0.001) {
      ortho.zoom = s.zoom;
      ortho.updateProjectionMatrix();
    }
  });

  return null;
}

type RigState = {
  target: THREE.Vector3;
  goalTarget: THREE.Vector3;
  yaw: number;
  goalYaw: number;
  zoom: number;
  goalZoom: number;
};

const right = new THREE.Vector3();
const forward = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

/** Drag the ground under the cursor by (dx, dy) screen pixels. */
function panByPixels(
  s: RigState,
  camera: THREE.Camera,
  viewportHeight: number,
  dx: number,
  dy: number,
  radius: number,
): void {
  const ortho = camera as THREE.OrthographicCamera;
  if (!ortho.isOrthographicCamera) return;
  const worldPerPixel = (ortho.top - ortho.bottom) / ortho.zoom / viewportHeight;

  right.setFromMatrixColumn(camera.matrix, 0).setY(0).normalize();
  forward.crossVectors(right, UP).normalize();

  // A screen-vertical pixel covers less ground the flatter the camera looks.
  // `forward` points back toward the camera, so dragging DOWN has to push the
  // target the other way for the ground to follow the finger.
  const vertical = worldPerPixel / Math.sin(PITCH);
  s.goalTarget.addScaledVector(right, -dx * worldPerPixel);
  s.goalTarget.addScaledVector(forward, -dy * vertical);
  clampTarget(s.goalTarget, radius);
  // Dragging is direct manipulation: the ground must stay pinned under the
  // finger, so this one path skips the smoothing every other input goes through.
  s.target.copy(s.goalTarget);
}

/** Keyboard pan, in camera-local axes: +x is screen-right, +z is toward the camera. */
function nudge(s: RigState, dx: number, dz: number): void {
  const yaw = s.goalYaw;
  s.goalTarget.x += Math.cos(yaw) * dx + Math.sin(yaw) * dz;
  s.goalTarget.z += -Math.sin(yaw) * dx + Math.cos(yaw) * dz;
}

/** Keep the island on screen — the void is pretty, but it is not the game. */
function clampTarget(target: THREE.Vector3, radius: number): void {
  const limit = radius * 0.9;
  target.x = THREE.MathUtils.clamp(target.x, -limit, limit);
  target.z = THREE.MathUtils.clamp(target.z, -limit, limit);
}

export { PITCH, MIN_ZOOM, MAX_ZOOM };
