'use client';

import { Suspense, useCallback, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, AdaptiveDpr, AdaptiveEvents, PerformanceMonitor } from '@react-three/drei';
import * as THREE from 'three';
import { useTempleStore } from '@/lib/temple-of-joy/store';
import { fmt } from '@/lib/temple-of-joy/numbers';
import { SceneEnvironment } from './SceneEnvironment';
import { GrandTemple } from './GrandTemple';
import { SunCore } from './SunCore';
import { SourceStructures } from './SourceStructures';
import { UpgradeOrbs } from './UpgradeOrbs';
import { AscensionMonument } from './AscensionMonument';
import { RelicAltar } from './RelicAltar';
import { SamsaraWheel } from './SamsaraWheel';
import { AchievementStars } from './AchievementStars';
import { ClickBurst, type ClickBurstHandle } from './ClickBurst';
import { FloatingJoy } from './FloatingJoy';
import { AmbientJoy } from './AmbientJoy';
import { Chrome3D } from './Chrome3D';

interface Float {
  id: number;
  point: THREE.Vector3;
  text: string;
}

const MAX_FLOATS = 12;

function SceneContents() {
  const burst = useRef<ClickBurstHandle>(null);
  const counter = useRef(0);
  const [floats, setFloats] = useState<Float[]>([]);

  const handleJoy = useCallback((point: THREE.Vector3) => {
    const { getHPC, numberFormat } = useTempleStore.getState();
    const id = ++counter.current;
    const text = `+${fmt(getHPC(), numberFormat)}`;
    setFloats((prev) => [...prev.slice(-(MAX_FLOATS - 1)), { id, point, text }]);
    window.setTimeout(() => setFloats((prev) => prev.filter((f) => f.id !== id)), 1100);
    burst.current?.emit(point);
  }, []);

  return (
    <>
      <SceneEnvironment />
      <AchievementStars />
      <GrandTemple />
      <SunCore onJoy={handleJoy} />
      <SourceStructures />
      <UpgradeOrbs />
      <AscensionMonument />
      <RelicAltar />
      <SamsaraWheel />
      <AmbientJoy />
      <ClickBurst ref={burst} />
      {floats.map((f) => (
        <FloatingJoy key={f.id} point={f.point} text={f.text} />
      ))}
      <OrbitControls
        makeDefault
        target={[0, 3, 0]}
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        minDistance={9}
        maxDistance={24}
        minPolarAngle={0.3}
        maxPolarAngle={1.5}
        autoRotate
        autoRotateSpeed={0.3}
        rotateSpeed={0.7}
        zoomSpeed={0.7}
      />
    </>
  );
}

/** Full-screen 3D temple world. Mobile-optimized: capped DPR, adaptive
 *  resolution/events under load, `touch-action: none` so gestures drive the
 *  camera instead of scrolling the page. */
export function TempleScene() {
  const [dpr, setDpr] = useState(1.5);

  return (
    <Canvas
      shadows={false}
      dpr={dpr}
      gl={{ antialias: true, powerPreference: 'high-performance', alpha: false }}
      camera={{ position: [0, 7, 16], fov: 45, near: 0.1, far: 120 }}
      style={{ touchAction: 'none' }}
    >
      <PerformanceMonitor
        onDecline={() => setDpr(1)}
        onIncline={() => setDpr(1.5)}
      />
      <AdaptiveDpr pixelated />
      <AdaptiveEvents />
      <Suspense fallback={null}>
        <SceneContents />
        <Chrome3D />
      </Suspense>
    </Canvas>
  );
}
