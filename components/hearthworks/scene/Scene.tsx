'use client';

/**
 * The isometric board: a fixed-angle orthographic camera over the world's tiles.
 *
 * Left-click applies the armed tool to a tile; dragging (left or right) pans, the wheel and two
 * fingers zoom. A press that moves under CLICK_SLOP px is a click, so a trackpad placement is never a
 * two-pixel pan. The world is drawn from `world`/`rev` only — nothing here owns game state.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, type ThreeEvent } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { PALETTE, PROCEDURAL_MODELS, type ModelSpec } from '@/lib/hearthworks/art';
import { CROPS } from '@/lib/hearthworks/content';
import { hearthworksStore, useHearthworks } from '@/lib/hearthworks/store';
import { cropStage, type Rot, type World } from '@/lib/hearthworks/world';
import { InstancedModels, type ModelInstance } from './InstancedModels';

const CLICK_SLOP = 6;
const TILE_TOP = new Map<string, ModelSpec>();

function slab(id: string, color: 'aqua' | 'leaf' | 'water', height: number): ModelSpec {
  const cached = TILE_TOP.get(id);
  if (cached) return cached;
  const spec: ModelSpec = {
    id,
    parts: [{ shape: 'box', size: [1, height, 1], pos: [0, height / 2, 0], color }],
  };
  TILE_TOP.set(id, spec);
  return spec;
}

/** Stable per-tile pseudo-random in [0,1) so trees vary without any per-frame state. */
function hash(x: number, z: number, salt: number): number {
  let h = Math.imul(x + 374761393, 668265263) ^ Math.imul(z + 1274126177, 2246822519) ^ salt;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function terrainInstances(world: World): ModelInstance[] {
  const out: ModelInstance[] = [];
  for (let z = 0; z < world.size; z++) {
    for (let x = 0; x < world.size; x++) {
      const t = world.terrain[z * world.size + x];
      if (t === 'water') out.push({ spec: slab('water', 'water', 0.2), x, z, y: -0.34 });
      else if (t === 'forest') {
        out.push({ spec: slab('forest', 'leaf', 0.2), x, z, y: -0.2 });
        const pine = hash(x, z, 1) > 0.5;
        out.push({
          spec: PROCEDURAL_MODELS[pine ? 'pine' : 'tree'],
          x: x + (hash(x, z, 2) - 0.5) * 0.3,
          z: z + (hash(x, z, 3) - 0.5) * 0.3,
          scale: 0.85 + hash(x, z, 4) * 0.4,
        });
      } else out.push({ spec: slab('grass', 'aqua', 0.2), x, z, y: -0.2 });
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
      y: 0.1,
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

function applyTool(tx: number, tz: number) {
  const { tool, dispatch } = hearthworksStore.getState();
  switch (tool.kind) {
    case 'build':
      dispatch({ type: 'place', kind: tool.building, x: tx, z: tz });
      break;
    case 'remove':
      dispatch({ type: 'remove', x: tx, z: tz });
      break;
    case 'plant':
      dispatch({ type: 'plant', crop: tool.crop, x: tx, z: tz });
      break;
    case 'harvest':
      dispatch({ type: 'harvest', x: tx, z: tz });
      break;
    case 'inspect':
      break;
  }
}

function Board() {
  const world = useHearthworks((s) => s.world);
  const rev = useHearthworks((s) => s.rev);
  const toolKind = useHearthworks((s) => s.tool.kind);
  const terrain = useMemo(() => terrainInstances(world), [world]);
  // `rev` is the signal that the (mutated-in-place) world changed what is drawn.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const entities = useMemo(() => entityInstances(world), [world, rev]);
  const [hover, setHover] = useState<{ x: number; z: number } | null>(null);
  const down = useRef<{ x: number; y: number } | null>(null);

  const tileOf = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      const x = Math.round(e.point.x);
      const z = Math.round(e.point.z);
      return x >= 0 && z >= 0 && x < world.size && z < world.size ? { x, z } : null;
    },
    [world.size],
  );

  const mid = (world.size - 1) / 2;
  return (
    <>
      <InstancedModels instances={terrain} />
      <InstancedModels instances={entities} />
      {hover && toolKind !== 'inspect' && (
        <mesh position={[hover.x, 0.03, hover.z]} rotation-x={-Math.PI / 2} renderOrder={2}>
          <planeGeometry args={[0.96, 0.96]} />
          <meshBasicMaterial color={PALETTE.ink} transparent opacity={0.28} depthWrite={false} />
        </mesh>
      )}
      <mesh
        position={[mid, 0, mid]}
        rotation-x={-Math.PI / 2}
        onPointerMove={(e) => {
          const t = tileOf(e);
          setHover((h) => (h?.x === t?.x && h?.z === t?.z ? h : t));
        }}
        onPointerLeave={() => setHover(null)}
        onPointerDown={(e) => {
          if (e.button === 0) down.current = { x: e.clientX, y: e.clientY };
        }}
        onPointerUp={(e) => {
          const d = down.current;
          down.current = null;
          if (!d || e.button !== 0) return;
          if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > CLICK_SLOP) return;
          const t = tileOf(e);
          if (t) applyTool(t.x, t.z);
        }}
      >
        <planeGeometry args={[world.size, world.size]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </>
  );
}

function Controls({ size }: { size: number }) {
  const mid = (size - 1) / 2;
  const controls = useRef<React.ComponentRef<typeof OrbitControls>>(null);
  // Keep the view over the board: shift camera and target together when the target strays.
  const clamp = useCallback(() => {
    const c = controls.current;
    if (!c) return;
    const t = c.target as THREE.Vector3;
    const nx = THREE.MathUtils.clamp(t.x, 0, size - 1);
    const nz = THREE.MathUtils.clamp(t.z, 0, size - 1);
    if (nx === t.x && nz === t.z) return;
    const cam = c.object as THREE.Camera;
    cam.position.x += nx - t.x;
    cam.position.z += nz - t.z;
    t.x = nx;
    t.z = nz;
  }, [size]);
  return (
    <OrbitControls
      ref={controls}
      makeDefault
      target={[mid, 0, mid]}
      enableRotate={false}
      screenSpacePanning={false}
      enableDamping
      dampingFactor={0.12}
      minZoom={16}
      maxZoom={110}
      mouseButtons={{ LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }}
      touches={{ ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN }}
      onChange={clamp}
    />
  );
}

export default function Scene() {
  const size = useHearthworks((s) => s.world.size);
  const mid = (size - 1) / 2;
  return (
    <Canvas
      orthographic
      dpr={[1, 2]}
      camera={{ position: [mid + 22, 19, mid + 22], zoom: 44, near: -50, far: 300 }}
      gl={{ antialias: true }}
      style={{ touchAction: 'none' }}
    >
      <color attach="background" args={[PALETTE.sky]} />
      <ambientLight intensity={1.7} />
      <directionalLight position={[mid + 10, 16, mid + 6]} intensity={1.3} />
      <Ticker />
      <Board />
      <Controls size={size} />
    </Canvas>
  );
}
