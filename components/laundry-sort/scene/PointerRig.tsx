'use client';

/**
 * Input. One code path for mouse, touch and pen, plus a keyboard fallback.
 *
 * **Pointer Events, not mouse+touch.** The old build had two near-identical
 * handler sets and neither used pointer capture, so a drag that left the canvas
 * silently dropped the garment and a stylus was unsupported. One set of
 * `pointer*` handlers with `setPointerCapture` covers every input device and
 * keeps the grab alive to the edge of the screen and beyond.
 *
 * **One grab at a time, on every platform.** A touchscreen can report ten
 * simultaneous pinches and a mouse can only ever report one. Allowing
 * multi-touch grabs would hand phones a structural advantage on a shared
 * leaderboard, so the first pointer down owns the grab until it lifts —
 * the same rule as the locked aspect ratio, for the same reason.
 *
 * **Keyboard.** Arrows/WASD steer a reticle, Space or Enter pinches and
 * releases. Slower than a pointer, but a drag-only game is otherwise entirely
 * closed to anyone who cannot use one.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { LaundryMatch } from '@/lib/laundry-sort/match';
import type { Ray } from '@/lib/laundry-sort/solver';

/** Reticle travel in NDC units per second. */
const KEY_SPEED = 1.5;

interface Props {
  matchRef: React.RefObject<LaundryMatch | null>;
  /** Input is ignored unless a match is actually running. */
  enabled: boolean;
}

export function PointerRig({ matchRef, enabled }: Props) {
  const gl = useThree((state) => state.gl);
  const camera = useThree((state) => state.camera);

  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const ndc = useMemo(() => new THREE.Vector2(), []);

  const activePointer = useRef<number | null>(null);
  const keyCursor = useRef({ x: 0, y: 0.15 });
  const keysDown = useRef(new Set<string>());
  const keyGrabbing = useRef(false);
  const [keyboardMode, setKeyboardMode] = useState(false);
  const reticleRef = useRef<THREE.Mesh>(null);

  const rayFromNdc = useMemo(
    () =>
      (x: number, y: number): Ray => {
        ndc.set(x, y);
        raycaster.setFromCamera(ndc, camera);
        const { origin, direction } = raycaster.ray;
        return {
          ox: origin.x,
          oy: origin.y,
          oz: origin.z,
          dx: direction.x,
          dy: direction.y,
          dz: direction.z,
        };
      },
    [camera, ndc, raycaster],
  );

  // ── Pointer ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const element = gl.domElement;
    if (!enabled) return;

    const toNdc = (event: PointerEvent): { x: number; y: number } => {
      const rect = element.getBoundingClientRect();
      return {
        x: ((event.clientX - rect.left) / rect.width) * 2 - 1,
        y: -((event.clientY - rect.top) / rect.height) * 2 + 1,
      };
    };

    const onDown = (event: PointerEvent) => {
      if (activePointer.current !== null) return;
      const match = matchRef.current;
      if (!match) return;

      const { x, y } = toNdc(event);
      if (!match.beginGrab(rayFromNdc(x, y))) return;

      activePointer.current = event.pointerId;
      setKeyboardMode(false);
      keyGrabbing.current = false;
      // Capture so a fast drag past the letterbox keeps hold of the garment
      // instead of dropping it at the canvas edge.
      try {
        element.setPointerCapture(event.pointerId);
      } catch {
        // Safari throws for a pointer that has already been released.
      }
      event.preventDefault();
    };

    const onMove = (event: PointerEvent) => {
      if (activePointer.current !== event.pointerId) return;
      const { x, y } = toNdc(event);
      matchRef.current?.moveGrab(rayFromNdc(x, y));
      event.preventDefault();
    };

    const onUp = (event: PointerEvent) => {
      if (activePointer.current !== event.pointerId) return;
      activePointer.current = null;
      matchRef.current?.endGrab();
      try {
        element.releasePointerCapture(event.pointerId);
      } catch {
        /* already released */
      }
    };

    // `passive: false` so preventDefault actually suppresses the browser's
    // scroll/zoom gesture on touch — without it a drag scrolls the page.
    element.addEventListener('pointerdown', onDown, { passive: false });
    element.addEventListener('pointermove', onMove, { passive: false });
    element.addEventListener('pointerup', onUp);
    element.addEventListener('pointercancel', onUp);
    // A pointer that leaves the window without an up event (browser chrome,
    // an OS gesture) would otherwise leave the garment stuck to nothing.
    window.addEventListener('blur', onUpAll);

    function onUpAll() {
      if (activePointer.current === null) return;
      activePointer.current = null;
      matchRef.current?.endGrab();
    }

    return () => {
      element.removeEventListener('pointerdown', onDown);
      element.removeEventListener('pointermove', onMove);
      element.removeEventListener('pointerup', onUp);
      element.removeEventListener('pointercancel', onUp);
      window.removeEventListener('blur', onUpAll);
      onUpAll();
    };
  }, [enabled, gl, matchRef, rayFromNdc]);

  // ── Keyboard ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!enabled) return;
    // Captured so the cleanup clears the same Set the listeners wrote to,
    // rather than whatever the ref happens to hold when the effect tears down.
    const pressed = keysDown.current;

    const isTyping = (): boolean => {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return false;
      const tag = el.tagName;
      return (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        tag === 'BUTTON' ||
        el.isContentEditable
      );
    };

    const MOVE_KEYS = new Set([
      'ArrowUp',
      'ArrowDown',
      'ArrowLeft',
      'ArrowRight',
      'KeyW',
      'KeyA',
      'KeyS',
      'KeyD',
    ]);

    const onKeyDown = (event: KeyboardEvent) => {
      if (isTyping()) return;

      if (MOVE_KEYS.has(event.code)) {
        pressed.add(event.code);
        setKeyboardMode(true);
        event.preventDefault();
        return;
      }

      if (event.code === 'Space' || event.code === 'Enter') {
        event.preventDefault();
        setKeyboardMode(true);
        const match = matchRef.current;
        if (!match) return;
        if (keyGrabbing.current) {
          keyGrabbing.current = false;
          match.endGrab();
        } else if (activePointer.current === null) {
          keyGrabbing.current = match.beginGrab(
            rayFromNdc(keyCursor.current.x, keyCursor.current.y),
          );
        }
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      pressed.delete(event.code);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      pressed.clear();
      keyGrabbing.current = false;
    };
  }, [enabled, matchRef, rayFromNdc]);

  useFrame((_, delta) => {
    if (!enabled) return;
    const keys = keysDown.current;
    if (keys.size > 0) {
      const step = KEY_SPEED * Math.min(delta, 0.05);
      if (keys.has('ArrowLeft') || keys.has('KeyA')) keyCursor.current.x -= step;
      if (keys.has('ArrowRight') || keys.has('KeyD')) keyCursor.current.x += step;
      if (keys.has('ArrowUp') || keys.has('KeyW')) keyCursor.current.y += step;
      if (keys.has('ArrowDown') || keys.has('KeyS')) keyCursor.current.y -= step;
      keyCursor.current.x = clamp(keyCursor.current.x, -0.98, 0.98);
      keyCursor.current.y = clamp(keyCursor.current.y, -0.98, 0.98);
    }

    if (keyGrabbing.current) {
      matchRef.current?.moveGrab(rayFromNdc(keyCursor.current.x, keyCursor.current.y));
    }

    // Park the reticle on the middle of the play slab so it sits where the
    // cloth actually is.
    const reticle = reticleRef.current;
    if (reticle && keyboardMode) {
      const ray = rayFromNdc(keyCursor.current.x, keyCursor.current.y);
      if (Math.abs(ray.dz) > 1e-6) {
        const t = -ray.oz / ray.dz;
        if (t > 0) reticle.position.set(ray.ox + ray.dx * t, ray.oy + ray.dy * t, 0);
      }
    }
  });

  if (!keyboardMode || !enabled) return null;

  return (
    <mesh ref={reticleRef} rotation={[0, 0, 0]} frustumCulled={false}>
      <ringGeometry args={[0.11, 0.15, 24]} />
      <meshBasicMaterial
        color={keyGrabbing.current ? '#facc15' : '#ffffff'}
        transparent
        opacity={0.9}
        depthTest={false}
        toneMapped={false}
      />
    </mesh>
  );
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
