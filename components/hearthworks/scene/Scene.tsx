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
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { PALETTE, PROCEDURAL_MODELS, buildTerrainMesh } from '@/lib/hearthworks/art';
import { CROPS } from '@/lib/hearthworks/content';
import { hearthworksStore, useHearthworks } from '@/lib/hearthworks/store';
import { cropStage, tileTop, type Rot, type World } from '@/lib/hearthworks/world';
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
        <meshStandardMaterial vertexColors roughness={0.95} metalness={0} />
      </mesh>
      <InstancedModels instances={trees} />
      <InstancedModels instances={entities} />
      {hover && toolKind !== 'inspect' && (
        <mesh position={[hover.x, tileTop(world, hover.x, hover.z) + 0.03, hover.z]} rotation-x={-Math.PI / 2} renderOrder={2}>
          <planeGeometry args={[0.96, 0.96]} />
          <meshBasicMaterial color={PALETTE.ink} transparent opacity={0.3} depthWrite={false} />
        </mesh>
      )}
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
