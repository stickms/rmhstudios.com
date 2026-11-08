'use client';

/**
 * The isometric board: a fixed-angle orthographic camera over the world's tiles.
 *
 * Left-click applies the armed tool to a tile; dragging (left or right) pans, the wheel and two
 * fingers zoom. A press that moves under CLICK_SLOP px is a click, so a trackpad placement is never a
 * two-pixel pan. The world is drawn from `world`/`rev` only — nothing here owns game state.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { PALETTE, PROCEDURAL_MODELS, buildTerrainMesh } from '@/lib/hearthworks/art';
import { CROPS } from '@/lib/hearthworks/content';
import { hearthworksStore, useHearthworks } from '@/lib/hearthworks/store';
import { runtime } from '@/lib/hearthworks/runtime-instance';
import { interactAt } from '@/lib/hearthworks/tools';
import { roadCommands, zoneCommand, type Tile } from '@/lib/hearthworks/city-input';
import { Avatar } from './Avatar';
import { FigureSystem } from './figure-system';
import Combat from './Combat';
import { People } from './People';
import { RemotePlayers } from './RemotePlayers';
import { CameraRig } from './CameraRig';
import { cropStage, tileTop, type Rot, type World } from '@/lib/hearthworks/world';
import { CityLayer, StrokePreview } from './City';
import { InstancedModels, type ModelInstance } from './InstancedModels';

const CLICK_SLOP = 6;

/** Stable per-tile pseudo-random in [0,1) so trees vary without any per-frame state. */
function hash(x: number, z: number, salt: number): number {
  let h = Math.imul(x + 374761393, 668265263) ^ Math.imul(z + 1274126177, 2246822519) ^ salt;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function treeInstances(world: World): ModelInstance[] {
  const out: ModelInstance[] = [];
  for (let z = 0; z < world.size; z++) {
    for (let x = 0; x < world.size; x++) {
      if (world.terrain[z * world.size + x] !== 'forest') continue;
      const pine = hash(x, z, 1) > 0.5;
      out.push({
        spec: PROCEDURAL_MODELS[pine ? 'pine' : 'tree'],
        x: x + (hash(x, z, 2) - 0.5) * 0.3,
        z: z + (hash(x, z, 3) - 0.5) * 0.3,
        y: tileTop(world, x, z),
        scale: 0.85 + hash(x, z, 4) * 0.4,
      });
    }
  }
  return out;
}

function entityInstances(world: World): ModelInstance[] {
  const out: ModelInstance[] = [];
  for (const b of world.buildings) {
    out.push({
      spec: PROCEDURAL_MODELS[`building:${b.kind}`],
      x: b.x,
      z: b.z,
      y: tileTop(world, b.x, b.z),
      rotY: (b.rot as Rot) * (Math.PI / 2),
    });
  }
  for (const c of world.crops) {
    const def = CROPS[c.kind];
    const growth = cropStage(world, c) / def.stages;
    out.push({
      spec: PROCEDURAL_MODELS[`crop:${c.kind}`],
      x: c.x,
      z: c.z,
      y: tileTop(world, c.x, c.z) + 0.1,
      scale: 0.3 + 0.7 * growth,
    });
  }
  return out;
}

/** Steps the simulation once per rendered frame; the store decides when anything visible changed. */
function Ticker() {
  useFrame((_, delta) => {
    hearthworksStore.getState().advance(delta * 1000);
  });
  return null;
}

function Board() {
  const world = useHearthworks((s) => s.world);
  const rev = useHearthworks((s) => s.rev);
  const toolKind = useHearthworks((s) => s.tool.kind);
  const view = useHearthworks((s) => s.view);
  const trees = useMemo(() => treeInstances(world), [world]);
  // `rev` is the signal that the (mutated-in-place) world changed what is drawn.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const entities = useMemo(() => entityInstances(world), [world, rev]);
  const ground = useMemo(() => {
    const data = buildTerrainMesh(world);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(data.normals, 3));
    g.setAttribute('color', new THREE.BufferAttribute(data.colors, 3));
    g.setIndex(new THREE.BufferAttribute(data.indices, 1));
    g.computeBoundingSphere();
    return { geometry: g, faceTile: data.faceTile };
  }, [world]);
  useEffect(() => () => ground.geometry.dispose(), [ground]);
  const [hover, setHover] = useState<{ x: number; z: number } | null>(null);
  const down = useRef<{ x: number; y: number } | null>(null);
  const tool = useHearthworks((s) => s.tool);
  // A road or zone drag in progress: where it began and the tile under the pointer now.
  const [stroke, setStroke] = useState<{ from: Tile; to: Tile } | null>(null);
  const strokeRef = useRef(stroke);
  strokeRef.current = stroke;
  const toolRef = useRef(tool);
  toolRef.current = tool;
  const dragTool = tool.kind === 'road' || tool.kind === 'zone';

  // Lift anywhere (even off the board, over the HUD) finishes the stroke; Escape drops it.
  useEffect(() => {
    if (!stroke) return;
    const finish = () => {
      const s = strokeRef.current;
      const t = toolRef.current;
      setStroke(null);
      if (!s) return;
      const { dispatch } = hearthworksStore.getState();
      if (t.kind === 'road') for (const c of roadCommands(s.from, s.to)) dispatch(c);
      else if (t.kind === 'zone') dispatch(zoneCommand(t.zone, s.from, s.to));
    };
    const cancel = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setStroke(null);
    };
    window.addEventListener('pointerup', finish);
    window.addEventListener('keydown', cancel);
    return () => {
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('keydown', cancel);
    };
  }, [stroke === null]); // eslint-disable-line react-hooks/exhaustive-deps

  const tileOf = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      if (e.faceIndex == null) return null;
      const tile = ground.faceTile[e.faceIndex];
      if (tile === undefined) return null;
      return { x: tile % world.size, z: Math.floor(tile / world.size) };
    },
    [ground, world.size],
  );

  return (
    <>
      <mesh
        geometry={ground.geometry}
        onPointerMove={(e) => {
          const t = tileOf(e);
          setHover((h) => (h?.x === t?.x && h?.z === t?.z ? h : t));
          if (t) setStroke((s) => (s && (s.to.x !== t.x || s.to.z !== t.z) ? { from: s.from, to: t } : s));
        }}
        onPointerLeave={() => setHover(null)}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          const t = tileOf(e);
          if (dragTool && t && hearthworksStore.getState().view === 'iso' && runtime.progress < 0.01) {
            setStroke({ from: t, to: t });
            return;
          }
          down.current = { x: e.clientX, y: e.clientY };
        }}
        onPointerUp={(e) => {
          const d = down.current;
          down.current = null;
          if (!d || e.button !== 0) return;
          if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > CLICK_SLOP) return;
          const t = tileOf(e);
          if (t && hearthworksStore.getState().view === 'iso' && runtime.progress < 0.01) interactAt(hearthworksStore, t.x, t.z);
        }}
      >
        <meshStandardMaterial vertexColors roughness={0.95} metalness={0} />
      </mesh>
      <InstancedModels instances={trees} />
      <CityLayer world={world} rev={rev} markers={view === 'iso'} />
      <InstancedModels instances={entities} />
      {stroke && <StrokePreview world={world} tool={tool} from={stroke.from} to={stroke.to} />}
      {hover && toolKind !== 'inspect' && !stroke && (
        <mesh position={[hover.x, tileTop(world, hover.x, hover.z) + 0.03, hover.z]} rotation-x={-Math.PI / 2} renderOrder={2}>
          <planeGeometry args={[0.96, 0.96]} />
          <meshBasicMaterial color={PALETTE.ink} transparent opacity={0.3} depthWrite={false} />
        </mesh>
      )}
    </>
  );
}

/** `paused` stops drawing and the sim with it (the main menu is up); a shared world is never paused. */
export default function Scene({ paused = false }: { paused?: boolean }) {
  const size = useHearthworks((s) => s.world.size);
  const mid = (size - 1) / 2;
  return (
    <Canvas
      dpr={[1, 2]}
      frameloop={paused ? 'never' : 'always'}
      camera={{ position: [mid + 100, 90, mid + 100], fov: 6, near: 0.3, far: 900 }}
      gl={{ antialias: true }}
      style={{ touchAction: 'none' }}
    >
      <color attach="background" args={[PALETTE.sky]} />
      <ambientLight intensity={1.7} />
      <directionalLight position={[mid + 10, 16, mid + 6]} intensity={1.3} />
      <Ticker />
      <CameraRig />
      <Board />
      <FigureSystem>
        <Avatar />
        <People />
        <Combat />
        <RemotePlayers />
      </FigureSystem>
    </Canvas>
  );
}
