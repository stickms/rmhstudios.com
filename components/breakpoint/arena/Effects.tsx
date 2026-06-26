'use client';

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { World } from '@/lib/breakpoint/engine/world';
import { PALETTE } from '@/lib/breakpoint/constants';

const MAX_TRACERS = 48;

/** Bullet tracers — a recycled pool of thin glowing lines. */
export function Tracers({ world }: { world: World }) {
  const group = useRef<THREE.Group>(null);
  const meshes = useRef<THREE.Mesh[]>([]);

  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const now = world.now;
    const list = world.tracers;
    for (let i = 0; i < MAX_TRACERS; i++) {
      const m = meshes.current[i];
      if (!m) continue;
      const tr = list[i];
      if (!tr) { m.visible = false; continue; }
      const age = now - tr.bornAt;
      const a = 1 - age / 90;
      if (a <= 0) { m.visible = false; continue; }
      m.visible = true;
      const from = new THREE.Vector3(tr.from.x, tr.from.y, tr.from.z);
      const to = new THREE.Vector3(tr.to.x, tr.to.y, tr.to.z);
      const mid = from.clone().add(to).multiplyScalar(0.5);
      const len = from.distanceTo(to);
      m.position.copy(mid);
      m.scale.set(1, 1, len);
      m.lookAt(to);
      const mat = m.material as THREE.MeshBasicMaterial;
      mat.opacity = a;
      mat.color.set(tr.team === 'attackers' ? '#ffd35a' : '#9affe0');
    }
  });

  return (
    <group ref={group}>
      {Array.from({ length: MAX_TRACERS }).map((_, i) => (
        <mesh key={i} ref={(el) => { if (el) meshes.current[i] = el; }} visible={false}>
          <boxGeometry args={[0.035, 0.035, 1]} />
          <meshBasicMaterial transparent color="#ffd35a" />
        </mesh>
      ))}
    </group>
  );
}

/** Deployed ability effects: smokes, mollies, flashes, walls, recon. */
export function WorldEffects({ world }: { world: World }) {
  const group = useRef<THREE.Group>(null);

  useFrame(() => {
    const g = group.current;
    if (!g) return;
    // Rebuild children list lazily: we keep it simple by syncing count.
    // Remove stale
    const fx = world.fx;
    // ensure capacity
    while (g.children.length < fx.length) {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(1, 8, 6),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.6 }),
      );
      g.add(mesh);
    }
    for (let i = 0; i < g.children.length; i++) {
      const child = g.children[i] as THREE.Mesh;
      const f = fx[i];
      if (!f) { child.visible = false; continue; }
      child.visible = true;
      child.position.set(f.pos.x, f.pos.y + (f.kind === 'smoke' ? 1.4 : 0.4), f.pos.z);
      const mat = child.material as THREE.MeshBasicMaterial;
      const remain = (f.endsAt - world.now) / 1000;
      switch (f.kind) {
        case 'smoke':
          child.scale.setScalar(f.radius);
          mat.color.set('#cdd2dd'); mat.opacity = 0.82; break;
        case 'molly':
          child.scale.set(f.radius, 0.6 + Math.sin(world.now * 0.02) * 0.2, f.radius);
          mat.color.set('#ff6b2a'); mat.opacity = 0.55; break;
        case 'flash':
          child.scale.setScalar(0.6 + (0.4 - remain) * 6);
          mat.color.set('#ffffff'); mat.opacity = Math.max(0, remain / 0.4); break;
        case 'wall':
          child.visible = false; break; // wall rendered as dynamic box below
        case 'recon':
          child.scale.set(f.radius, 0.1, f.radius);
          mat.color.set(PALETTE.defender); mat.opacity = 0.18 + Math.sin(world.now * 0.01) * 0.1; break;
        default:
          mat.opacity = 0.4;
      }
    }
  });

  return <group ref={group} />;
}

/** Deployable walls — synced from the engine's live dynamic boxes. */
export function DynamicWalls({ world }: { world: World }) {
  const group = useRef<THREE.Group>(null);
  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const boxes = world.wallBoxes;
    while (g.children.length < boxes.length) {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshLambertMaterial({ transparent: true, opacity: 0.9 }),
      );
      g.add(m);
    }
    for (let i = 0; i < g.children.length; i++) {
      const child = g.children[i] as THREE.Mesh;
      const b = boxes[i];
      if (!b) { child.visible = false; continue; }
      child.visible = true;
      child.position.set(b.cx, b.cy, b.cz);
      child.scale.set(b.hx * 2, b.hy * 2, b.hz * 2);
      (child.material as THREE.MeshLambertMaterial).color.set(b.color);
    }
  });
  return <group ref={group} />;
}

/** The spike: glowing object on the floor (carried = hidden, planted = shown). */
export function SpikeMesh({ world }: { world: World }) {
  const ref = useRef<THREE.Group>(null);
  const light = useRef<THREE.Mesh>(null);
  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    if (world.spike.planted && world.spike.pos) {
      g.visible = true;
      g.position.set(world.spike.pos.x, 0.25, world.spike.pos.z);
      const blink = Math.sin(world.now * 0.012) > 0;
      if (light.current) (light.current.material as THREE.MeshBasicMaterial).opacity = blink ? 1 : 0.2;
    } else {
      g.visible = false;
    }
  });
  return (
    <group ref={ref} visible={false}>
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[0.4, 0.5, 0.3]} />
        <meshLambertMaterial color="#c23a3a" />
      </mesh>
      <mesh ref={light} position={[0, 0.3, 0]}>
        <boxGeometry args={[0.12, 0.12, 0.12]} />
        <meshBasicMaterial color="#ff2222" transparent />
      </mesh>
    </group>
  );
}
