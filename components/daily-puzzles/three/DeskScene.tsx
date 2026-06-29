// components/daily-puzzles/three/DeskScene.tsx
'use client';

import { Suspense, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, AdaptiveDpr, AdaptiveEvents, PerformanceMonitor } from '@react-three/drei';
import * as THREE from 'three';
import { useNavigate } from '@tanstack/react-router';
import { DeskEnvironment } from './DeskEnvironment';
import { DeskProps } from './DeskProps';
import { Newspaper } from './Newspaper';
import { FrontPage } from './FrontPage';
import { DeskGameFrame } from './DeskGameFrame';
import { useDeskStore } from '@/lib/daily-puzzles/desk-store';
import { DESK_MODES } from '@/lib/daily-puzzles/desk-modes';
import { hasCompleted } from '@/lib/daily-puzzles/persistence';
import { formatDateKey, getTodayEST } from '@/lib/daily-puzzles/seed';

// Two camera poses: overview (front page) and leaned-in (playing).
const OVERVIEW = new THREE.Vector3(0, 9.5, 7.5);
const FOCUSED = new THREE.Vector3(0, 6.2, 4.4);
const OVERVIEW_TGT = new THREE.Vector3(0, 0, 0);
const FOCUSED_TGT = new THREE.Vector3(0, 0, -0.3);

function CameraRig({ focused }: { focused: boolean }) {
  const { camera } = useThree();
  const controls = useRef<any>(null);
  useFrame((_, dt) => {
    const k = Math.min(1, dt * 3);
    const destPos = focused ? FOCUSED : OVERVIEW;
    camera.position.lerp(destPos, k);
    if (controls.current) {
      const tgt = focused ? FOCUSED_TGT : OVERVIEW_TGT;
      controls.current.target.lerp(tgt, k);
      controls.current.update();
    }
  });
  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enablePan={false}
      enableDamping
      dampingFactor={0.08}
      minDistance={4}
      maxDistance={16}
      minPolarAngle={0.15}
      maxPolarAngle={1.15}
      rotateSpeed={0.6}
      zoomSpeed={0.6}
    />
  );
}

function Contents({ children }: { children?: React.ReactNode }) {
  const navigate = useNavigate();
  const focusedMode = useDeskStore((s) => s.focusedMode);
  const playing = !!children && !!focusedMode;
  const dateKey = formatDateKey(getTodayEST());
  const solved = DESK_MODES.filter((m) => hasCompleted(m.id, dateKey)).length;

  const back = () => {
    useDeskStore.getState().setFocusedMode(null);
    navigate({ to: '/daily' });
  };

  return (
    <>
      <DeskEnvironment />
      <DeskProps />
      <Newspaper solvedCount={solved} total={DESK_MODES.length} />
      {playing ? (
        <DeskGameFrame onBack={back}>{children}</DeskGameFrame>
      ) : (
        <FrontPage onSelect={() => {}} />
      )}
      <CameraRig focused={playing} />
    </>
  );
}

/** Full-screen persistent desk world. Mobile-optimized: capped/adaptive DPR,
 *  touch-action none so gestures drive the camera. */
export function DeskScene({ children }: { children?: React.ReactNode }) {
  const [dpr, setDpr] = useState(1.5);
  return (
    <Canvas
      shadows={false}
      dpr={dpr}
      gl={{ antialias: true, powerPreference: 'high-performance', alpha: false }}
      camera={{ position: [0, 9.5, 7.5], fov: 45, near: 0.1, far: 140 }}
      style={{ touchAction: 'none' }}
    >
      <PerformanceMonitor onDecline={() => setDpr(1)} onIncline={() => setDpr(1.5)} />
      <AdaptiveDpr pixelated />
      <AdaptiveEvents />
      <Suspense fallback={null}>
        <Contents>{children}</Contents>
      </Suspense>
    </Canvas>
  );
}
