/**
 * The page the model harness opens in a real Chromium: ONE Hearthworks person (`SkinFigure`, the production
 * component) on a ground plane, driven from the outside through `window.hw`. The figure loads its model exactly as
 * the game does: manifest.json → the asset channel's `mdl/index.json` → mesh GLB + anim pack, by same-origin URLs
 * (the harness server forwards those to the live site).
 *
 *   /?skin=gman&view=front|three|side|back|top&held=1
 *   window.hw.status()          -> { status, game, mdl, ... } once the model is (not) there
 *   window.hw.set({ speed, air, dead, busy })   -> the FigureDrive the animator reads
 *   window.hw.trigger('shoot')  -> a one-shot
 */

import { StrictMode, useEffect, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { Canvas, useThree } from '@react-three/fiber';
import { SkinFigure } from '../../../components/hearthworks/scene/SkinFigure';
import { GunProp } from '../../../components/hearthworks/scene/GunProp';
import { useSkinModel } from '../../../components/hearthworks/scene/useSkinModel';
import { newDrive, pushTrigger, type AirState, type FigureDrive } from '../../../lib/hearthworks/skins/animator';
import { figureWorldHeight } from '../../../lib/hearthworks/skins/figure-scale';
import { SKIN_IDS, isSkinId, type SkinId } from '../../../lib/hearthworks/skins/catalog';
import type { OneShotSlot } from '../../../lib/hearthworks/skins/model-manifest';

interface HwProbe {
  status(): { status: string; skin: string; mdl: string | null; triangles: number | null; height: number | null; clips: string[] };
  set(v: Partial<Pick<FigureDrive, 'speed' | 'dead' | 'busy'>> & { air?: AirState }): void;
  trigger(slot: OneShotSlot): void;
  drive: FigureDrive;
}

declare global {
  interface Window {
    hw: HwProbe;
    __hwState: ReturnType<HwProbe['status']>;
  }
}

const params = new URLSearchParams(location.search);
const skinParam = params.get('skin') ?? 'citizen';
const skin: SkinId = isSkinId(skinParam) ? skinParam : SKIN_IDS[0];
const view = params.get('view') ?? 'three';
const withProp = params.get('held') !== '0';
const drive = newDrive();

const H = figureWorldHeight(1);

function Camera() {
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    const d = H * 3.1;
    const at: Record<string, [number, number, number]> = {
      front: [0, H * 0.55, d],
      back: [0, H * 0.55, -d],
      side: [d, H * 0.55, 0],
      three: [d * 0.62, H * 0.75, d * 0.78],
      top: [0, d * 1.05, 0.001],
    };
    const p = at[view] ?? at.three;
    camera.position.set(...p);
    camera.lookAt(0, H * 0.5, 0);
    camera.updateProjectionMatrix();
  }, [camera]);
  return null;
}

/** World axes on the ground: red = +Z (the way a person must face), green = +X. */
function Axes() {
  return (
    <group position={[0, 0.002, 0]}>
      <mesh position={[0, 0, 0.22]}>
        <boxGeometry args={[0.01, 0.004, 0.44]} />
        <meshBasicMaterial color="#d33" />
      </mesh>
      <mesh position={[0.15, 0, 0]}>
        <boxGeometry args={[0.3, 0.004, 0.01]} />
        <meshBasicMaterial color="#2a2" />
      </mesh>
    </group>
  );
}

function Probe() {
  const state = useSkinModel(skin, true, true);
  useEffect(() => {
    const m = state.model;
    window.__hwState = {
      status: state.status,
      skin,
      mdl: state.entry?.mdl ?? null,
      triangles: m ? Math.round(m.triangles) : null,
      height: m ? m.height : null,
      clips: m ? [...m.clips.keys()] : [],
    };
  }, [state]);
  return null;
}

function Scene() {
  const held = useMemo(() => (withProp ? <GunProp color="#222" /> : null), []);
  return (
    <>
      <color attach="background" args={['#dde6e9']} />
      <ambientLight intensity={1.1} />
      <directionalLight position={[1.5, 3, 2]} intensity={2.2} />
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[4, 4]} />
        <meshStandardMaterial color="#b9c8c2" />
      </mesh>
      <gridHelper args={[2, 40, '#8a9a94', '#a9b8b2']} position={[0, 0.001, 0]} />
      <Axes />
      <SkinFigure skin={skin} drive={drive} held={held} pinned />
      <Probe />
      <Camera />
    </>
  );
}

window.hw = {
  drive,
  status: () => window.__hwState,
  set(v) {
    if (v.speed !== undefined) drive.speed = v.speed;
    if (v.air !== undefined) drive.air = v.air;
    if (v.dead !== undefined) drive.dead = v.dead;
    if (v.busy !== undefined) drive.busy = v.busy;
  },
  trigger(slot) {
    pushTrigger(drive, slot);
  },
};
window.__hwState = { status: 'starting', skin, mdl: null, triangles: null, height: null, clips: [] };

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Canvas
      camera={{ fov: 28, near: 0.01, far: 50 }}
      gl={{ preserveDrawingBuffer: true, antialias: true }}
      style={{ width: '100%', height: '100%' }}
    >
      <Scene />
    </Canvas>
  </StrictMode>,
);
