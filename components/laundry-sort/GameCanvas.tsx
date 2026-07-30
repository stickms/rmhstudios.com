'use client';

/**
 * The WebGL stage.
 *
 * Two things here exist for fairness rather than looks:
 *
 * - **The camera aspect is pinned to `ASPECT`**, not derived from the drawing
 *   buffer. `AspectStage` already sizes the canvas to 16:9, but sub-pixel
 *   rounding on a fractional-DPR display would otherwise let one player's
 *   horizontal field of view drift a hair wider than another's. Pinning it
 *   makes the framing byte-identical everywhere.
 * - **The simulation is fed real time and consumes it in fixed ticks.** A
 *   144 Hz monitor does not sort laundry faster than a 60 Hz one, and a 30 fps
 *   phone gets the same garments, just over more wall-clock seconds.
 *
 * Everything else — DPR, antialiasing, shadows, cloth shading model — scales
 * with the device through `useRenderQuality`, because pixels are not reach.
 */

import { useCallback, useEffect, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import type * as THREE from 'three';
import AdaptiveQuality from '@/components/render/AdaptiveQuality';
import { useRenderQuality } from '@/lib/render/useRenderQuality';
import { ASPECT, CAMERA } from '@/lib/laundry-sort/constants';
import type { LaundryMatch, MatchEvent } from '@/lib/laundry-sort/match';
import { Arena } from './scene/Arena';
import { Garments } from './scene/Garments';
import { Lighting } from './scene/Lighting';
import { PointerRig } from './scene/PointerRig';

interface Props {
  matchRef: React.RefObject<LaundryMatch | null>;
  /** True only while a round is actually being played. */
  running: boolean;
  onEvents: (events: MatchEvent[]) => void;
  onFinished: () => void;
  /** Fired when the browser drops the WebGL context (tab suspended, GPU reset). */
  onContextLost?: () => void;
  onContextRestored?: () => void;
}

/** Pins the camera. Runs on mount and on every resize. */
function CameraLock() {
  const camera = useThree((state) => state.camera) as THREE.PerspectiveCamera;
  const size = useThree((state) => state.size);

  useEffect(() => {
    camera.aspect = ASPECT;
    camera.fov = CAMERA.fov;
    camera.near = CAMERA.near;
    camera.far = CAMERA.far;
    camera.position.set(CAMERA.position[0], CAMERA.position[1], CAMERA.position[2]);
    camera.lookAt(CAMERA.target[0], CAMERA.target[1], CAMERA.target[2]);
    camera.updateProjectionMatrix();
  }, [camera, size.width, size.height]);

  return null;
}

function MatchDriver({
  matchRef,
  running,
  onEvents,
  onFinished,
}: Pick<Props, 'matchRef' | 'running' | 'onEvents' | 'onFinished'>) {
  const announced = useRef(false);

  useEffect(() => {
    if (running) announced.current = false;
  }, [running]);

  useFrame((_, delta) => {
    const match = matchRef.current;
    if (!match || !running) return;

    match.advance(delta);
    // `match.events` is a reused buffer cleared on the next advance, so hand
    // the consumer a copy rather than a view that will change under it.
    if (match.events.length > 0) onEvents(match.events.slice());
    if (match.finished && !announced.current) {
      announced.current = true;
      onFinished();
    }
  });

  return null;
}

export function GameCanvas({
  matchRef,
  running,
  onEvents,
  onFinished,
  onContextLost,
  onContextRestored,
}: Props) {
  const { quality, dpr, downscale } = useRenderQuality();

  const handleCreated = useCallback(
    ({ gl }: { gl: THREE.WebGLRenderer }) => {
      const canvas = gl.domElement;
      // Without this a touch drag scrolls the page instead of moving cloth.
      canvas.style.touchAction = 'none';
      canvas.style.outline = 'none';

      const lost = (event: Event) => {
        // Preventing the default is what makes a restore possible at all.
        event.preventDefault();
        onContextLost?.();
      };
      const restored = () => onContextRestored?.();
      canvas.addEventListener('webglcontextlost', lost as EventListener, false);
      canvas.addEventListener('webglcontextrestored', restored, false);
    },
    [onContextLost, onContextRestored],
  );

  return (
    <Canvas
      dpr={dpr}
      shadows={quality.shadows}
      // Idle screens (menu, lobby, results) draw once instead of burning a
      // phone's battery re-rendering a static room at 60 fps.
      frameloop={running ? 'always' : 'demand'}
      gl={{
        antialias: quality.antialias,
        alpha: false,
        powerPreference: 'high-performance',
        // The context survives a GPU reset instead of going permanently black.
        failIfMajorPerformanceCaveat: false,
      }}
      camera={{
        fov: CAMERA.fov,
        near: CAMERA.near,
        far: CAMERA.far,
        position: [CAMERA.position[0], CAMERA.position[1], CAMERA.position[2]],
      }}
      onCreated={handleCreated}
      className="h-full w-full"
    >
      <color attach="background" args={['#0b0d14']} />
      <fog attach="fog" args={['#0b0d14', 12, 26]} />

      <AdaptiveQuality onDownscale={downscale} />
      <CameraLock />
      <Lighting quality={quality} />
      <Arena />
      <Garments matchRef={matchRef} quality={quality} />
      <PointerRig matchRef={matchRef} enabled={running} />
      <MatchDriver
        matchRef={matchRef}
        running={running}
        onEvents={onEvents}
        onFinished={onFinished}
      />
    </Canvas>
  );
}
