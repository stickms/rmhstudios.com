/**
 * One perspective camera, two ways of seeing the world. Each frame this advances the view transition,
 * steps the avatar, and writes the camera: the isometric pose (a very long, very narrow lens that reads as
 * orthographic), the third-person pose behind the avatar, or the dolly-zoom between them
 * (lib/hearthworks/camera.ts). It also owns every control: drag/wheel/pinch in the isometric view; WASD, Q/E,
 * Space and drag in third-person; V to switch.
 */

import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { stepAvatar } from '@/lib/hearthworks/avatar';
import {
  blendPose,
  easeProgress,
  isoPose,
  stepViewProgress,
  thirdPose,
  ISO_FOV,
} from '@/lib/hearthworks/camera';
import { cameraRelativeMove, createRuntime } from '@/lib/hearthworks/runtime';
import { runtime } from '@/lib/hearthworks/runtime-instance';
import { hearthworksStore } from '@/lib/hearthworks/store';
import { interactAt, tileInFront } from '@/lib/hearthworks/tools';

const MIN_DISTANCE = 40;
const MAX_DISTANCE = 330;
/** Ground-plane axes of the isometric view (45° azimuth): screen-right and into-the-screen. */
const RIGHT = [Math.SQRT1_2, -Math.SQRT1_2] as const;
const FORWARD = [-Math.SQRT1_2, -Math.SQRT1_2] as const;
const ISO_ELEVATION_SIN = 19 / Math.hypot(22, 19, 22);
const POINTER_SLOP = 6;
const MOVE_SYNC_MS = 100;

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);

export function CameraRig() {
  const { camera, gl } = useThree();
  const keys = useRef(new Set<string>());
  const sync = useRef(0);
  const world = useRef(hearthworksStore.getState().world);

  // ---- controls -----------------------------------------------------------------------------------
  useEffect(() => {
    const el = gl.domElement;
    const rt = runtime;
    const pointers = new Map<number, { x: number; y: number }>();
    let pinch = 0;
    let travelled = 0;

    const view = () => hearthworksStore.getState().view;
    const bounds = () => hearthworksStore.getState().world.size - 1;

    const onDown = (e: PointerEvent) => {
      el.setPointerCapture?.(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      travelled = 0;
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = Math.hypot(a.x - b.x, a.y - b.y);
      }
    };
    const onMove = (e: PointerEvent) => {
      const prev = pointers.get(e.pointerId);
      if (!prev) return;
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      travelled += Math.hypot(dx, dy);
      if (view() === 'third' || rt.progress > 0.001) {
        if (view() === 'third' && travelled > POINTER_SLOP) rt.camYaw -= dx * 0.006;
        return;
      }
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch > 0) rt.isoDistance = clamp(rt.isoDistance * (pinch / d), MIN_DISTANCE, MAX_DISTANCE);
        pinch = d;
      }
      if (travelled < POINTER_SLOP) return;
      // A road or zone stroke owns a single-finger / left-button drag; two fingers or the right button still pan.
      const armed = hearthworksStore.getState().tool.kind;
      if ((armed === 'road' || armed === 'zone') && pointers.size === 1 && (e.buttons & 1) === 1) return;
      // Pixels → ground units at the point we look at: a screen pixel covers 2·d·tan(fov/2)/height.
      const unit = (2 * rt.isoDistance * Math.tan((ISO_FOV * Math.PI) / 360)) / el.clientHeight;
      const k = 1 / ISO_ELEVATION_SIN;
      const n = pointers.size === 2 ? 0.5 : 1;
      rt.isoCenter.x = clamp(rt.isoCenter.x - (RIGHT[0] * dx - FORWARD[0] * dy * k) * unit * n, 0, bounds());
      rt.isoCenter.z = clamp(rt.isoCenter.z - (RIGHT[1] * dx - FORWARD[1] * dy * k) * unit * n, 0, bounds());
    };
    const onUp = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      pinch = 0;
    };
    const onWheel = (e: WheelEvent) => {
      if (view() !== 'iso') return;
      e.preventDefault();
      rt.isoDistance = clamp(rt.isoDistance * Math.exp(e.deltaY * 0.0012), MIN_DISTANCE, MAX_DISTANCE);
    };

    const onKey = (down: boolean) => (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      const k = e.key.toLowerCase();
      if (down && !e.repeat && (k === 'v' || k === 'tab')) {
        e.preventDefault();
        hearthworksStore.getState().toggleView();
        return;
      }
      if (['w', 'a', 's', 'd', 'q', 'e', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift'].includes(k)) {
        if (down) keys.current.add(k);
        else keys.current.delete(k);
        if (k.startsWith('arrow')) e.preventDefault();
      }
      if (down && !e.repeat && (k === ' ' || k === 'f') && view() === 'third') {
        e.preventDefault();
        const t = tileInFront(rt.avatar.x, rt.avatar.z, rt.avatar.yaw);
        interactAt(hearthworksStore, t.x, t.z);
      }
    };
    const kd = onKey(true);
    const ku = onKey(false);
    const blur = () => keys.current.clear();

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    el.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    window.addEventListener('blur', blur);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      el.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
      window.removeEventListener('blur', blur);
    };
  }, [gl]);

  // ---- per frame ------------------------------------------------------------------------------------
  useFrame((_, delta) => {
    const dtMs = Math.min(delta * 1000, 100);
    const st = hearthworksStore.getState();
    const rt = runtime;

    // A different world (a loaded save): put everything back at its middle.
    if (world.current !== st.world) {
      world.current = st.world;
      const mid = Math.floor(st.world.size / 2);
      Object.assign(rt, createRuntime({ x: mid, z: mid }), { isoDistance: rt.isoDistance });
    }

    // Keyboard intent (touch sticks write rt.input directly; keys layer on top).
    const k = keys.current;
    const kf = (k.has('w') || k.has('arrowup') ? 1 : 0) - (k.has('s') || k.has('arrowdown') ? 1 : 0);
    const kr = (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0);
    const forward = clamp(kf + rt.input.forward, -1, 1);
    const right = clamp(kr + rt.input.right, -1, 1);
    if (k.has('q')) rt.camYaw += 1.8 * (dtMs / 1000);
    if (k.has('e')) rt.camYaw -= 1.8 * (dtMs / 1000);

    // Switching view: land the isometric camera over the avatar, so the "plan" view starts where you were.
    if (rt.lastView !== st.view) {
      if (st.view === 'iso') {
        rt.isoCenter.x = clamp(rt.avatar.x, 0, st.world.size - 1);
        rt.isoCenter.z = clamp(rt.avatar.z, 0, st.world.size - 1);
      }
      rt.lastView = st.view;
    }
    rt.progress = stepViewProgress(rt.progress, st.view, dtMs);

    // The avatar only takes input in third-person; otherwise it just settles to a stop.
    const intent = st.view === 'third' ? cameraRelativeMove({ forward, right }, rt.camYaw) : { x: 0, z: 0 };
    const run = k.has('shift') || rt.input.run;
    if (st.view === 'third' || rt.avatar.speed > 0.001) {
      rt.avatar = stepAvatar(st.world, rt.avatar, { x: intent.x, z: intent.z, run }, dtMs);
    }

    // Tell the world where we are (10 Hz) — the host will need this for everyone else's view.
    sync.current += dtMs;
    if (sync.current >= MOVE_SYNC_MS && st.view === 'third' && rt.avatar.speed > 0.05) {
      sync.current = 0;
      st.dispatch({ type: 'move', x: rt.avatar.x, z: rt.avatar.z });
    }

    // Camera.
    const pose = blendPose(
      isoPose(rt.isoCenter, rt.isoDistance),
      thirdPose({ x: rt.avatar.x, z: rt.avatar.z, yaw: rt.camYaw, y: rt.avatarY }),
      easeProgress(rt.progress),
    );
    const cam = camera as THREE.PerspectiveCamera;
    cam.position.set(pose.position[0], pose.position[1], pose.position[2]);
    if (cam.fov !== pose.fov) {
      cam.fov = pose.fov;
      cam.updateProjectionMatrix();
    }
    cam.lookAt(pose.target[0], pose.target[1], pose.target[2]);
  });

  return null;
}
