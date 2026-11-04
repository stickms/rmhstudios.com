'use client';

/**
 * The crime route in the scene: the police (drawn with the same Figure as everyone, at their live mover position),
 * the gun in the player's hand, tracers and muzzle flashes, and the F / R keys. The sim owns every outcome; this
 * only shows it. Tracers and flashes live in two fixed InstancedMeshes (no allocation per shot or per frame).
 */

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { PALETTE } from '@/lib/hearthworks/art';
import { createCombatControls } from '@/lib/hearthworks/combat-input';
import { moverY } from '@/lib/hearthworks/nav';
import { runtime } from '@/lib/hearthworks/runtime-instance';
import { SKIN_LOOKS } from '@/lib/hearthworks/skins';
import { hearthworksStore, useHearthworks } from '@/lib/hearthworks/store';
import { tileTop, type WorldEvent } from '@/lib/hearthworks/world';
import { Figure } from './Figure';

const SLOTS = 24;
const TRACER_MS = 130;
const FLASH_MS = 70;
/** Muzzle and chest height above the tile top, in world units (a person is ~0.4 tall). */
const MUZZLE_Y = 0.22;

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement &&
  (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);

function GunProp({ color }: { color: string }) {
  return (
    <mesh position={[0, 0, 0.07]}>
      <boxGeometry args={[0.022, 0.034, 0.15]} />
      <meshStandardMaterial color={color} roughness={0.7} />
    </mesh>
  );
}

function OfficerFigure({ id }: { id: number }) {
  const root = useRef<THREE.Group>(null);
  const legL = useRef<THREE.Group>(null);
  const legR = useRef<THREE.Group>(null);
  const flash = useRef<THREE.Mesh>(null);
  const kind = useHearthworks((s) => s.world.officers.find((o) => o.id === id)?.kind ?? 'metrocop');
  const look = SKIN_LOOKS[kind];
  const phase = useRef(0);

  useFrame((_, delta) => {
    const w = hearthworksStore.getState().world;
    const o = w.officers.find((q) => q.id === id);
    const g = root.current;
    if (!g) return;
    if (!o) {
      g.visible = false;
      return;
    }
    g.visible = true;
    g.position.set(o.mover.x, moverY(w, o.mover), o.mover.z);
    g.rotation.y = o.aim;
    const walking = o.mover.path.length > 0;
    phase.current += walking ? Math.min(delta, 0.1) * 9 : 0;
    const swing = walking ? Math.sin(phase.current) * 0.7 : 0;
    if (legL.current) legL.current.rotation.x = swing;
    if (legR.current) legR.current.rotation.x = -swing;
    if (flash.current) flash.current.visible = w.tick - o.firedTick <= 1;
  });

  return (
    <group ref={root}>
      <Figure look={look} refs={{ legL, legR }} />
      <group position={[-0.07, 0.2, 0.06]}>
        <GunProp color={PALETTE.ink} />
        <mesh ref={flash} position={[0, 0, 0.17]} visible={false}>
          <sphereGeometry args={[0.04, 8, 6]} />
          <meshBasicMaterial color={PALETTE.butter} />
        </mesh>
      </group>
    </group>
  );
}

function Officers() {
  const officers = useHearthworks((s) => s.world.officers);
  useHearthworks((s) => s.rev);
  return (
    <>
      {officers.map((o) => (
        <OfficerFigure key={o.id} id={o.id} />
      ))}
    </>
  );
}

interface Fx {
  fx: number;
  fy: number;
  fz: number;
  tx: number;
  ty: number;
  tz: number;
  t0: number;
  mine: boolean;
}

/** The player's gun, tracers, flashes, and the keyboard. */
function PlayerCombat() {
  const gun = useRef<THREE.Group>(null);
  const tracers = useRef<THREE.InstancedMesh>(null);
  const flashes = useRef<THREE.InstancedMesh>(null);
  const fxs = useRef<Fx[]>([]);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const controls = useMemo(() => createCombatControls(hearthworksStore, runtime), []);
  const held = useRef(false);
  const equipped = useHearthworks((s) => s.world.players[s.playerId]?.arms.equipped ?? null);

  useEffect(() => {
    // Shots and respawns arrive as events; turn them into short-lived effects.
    const onEvents = (events: readonly WorldEvent[]) => {
      const st = hearthworksStore.getState();
      const w = st.world;
      for (const e of events) {
        if (e.type === 'shot') {
          const list = fxs.current;
          if (list.length >= SLOTS) list.shift();
          list.push({
            fx: e.fx,
            fy: tileTop(w, e.fx, e.fz) + MUZZLE_Y,
            fz: e.fz,
            tx: e.tx,
            ty: tileTop(w, e.tx, e.tz) + MUZZLE_Y,
            tz: e.tz,
            t0: performance.now(),
            mine: e.by.kind === 'player' && e.by.id === st.playerId,
          });
        } else if (e.type === 'respawned' && e.playerId === st.playerId) {
          // Carried back to the meadow: the avatar goes with them.
          runtime.avatar = { ...runtime.avatar, x: e.x, z: e.z, speed: 0 };
          runtime.isoCenter.x = e.x;
          runtime.isoCenter.z = e.z;
        }
      }
    };
    const unsub = hearthworksStore.subscribe((s, prev) => {
      if (s.lastEvents !== prev.lastEvents && s.lastEvents.length > 0) onEvents(s.lastEvents);
    });

    // Capture phase: when armed, F is the trigger and must not also be "use" (CameraRig).
    const onKey = (down: boolean) => (e: KeyboardEvent) => {
      if (isTyping(e.target) || hearthworksStore.getState().view !== 'third') return;
      const k = e.key.toLowerCase();
      if (k === 'f' && controls.armed()) {
        e.preventDefault();
        e.stopPropagation();
        held.current = down;
        if (down) controls.fire();
      } else if (k === 'r' && down && !e.repeat) {
        controls.reload();
      }
    };
    const kd = onKey(true);
    const ku = onKey(false);
    const blur = () => (held.current = false);
    window.addEventListener('keydown', kd, true);
    window.addEventListener('keyup', ku, true);
    window.addEventListener('blur', blur);
    return () => {
      unsub();
      window.removeEventListener('keydown', kd, true);
      window.removeEventListener('keyup', ku, true);
      window.removeEventListener('blur', blur);
    };
  }, [controls]);

  useFrame(() => {
    if (held.current) controls.fire();
    const a = runtime.avatar;
    const g = gun.current;
    if (g) {
      g.position.set(a.x, runtime.avatarY, a.z);
      g.rotation.y = a.yaw;
    }
    const now = performance.now();
    const list = fxs.current;
    while (list.length > 0 && now - list[0].t0 > TRACER_MS) list.shift();
    const tm = tracers.current;
    const fm = flashes.current;
    if (!tm || !fm) return;
    for (let i = 0; i < SLOTS; i++) {
      const fx = list[i];
      if (!fx) {
        dummy.scale.set(0, 0, 0);
        dummy.updateMatrix();
        tm.setMatrixAt(i, dummy.matrix);
        fm.setMatrixAt(i, dummy.matrix);
        continue;
      }
      const dx = fx.tx - fx.fx;
      const dy = fx.ty - fx.fy;
      const dz = fx.tz - fx.fz;
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0.001;
      const life = 1 - (now - fx.t0) / TRACER_MS;
      dummy.position.set(fx.fx + dx / 2, fx.fy + dy / 2, fx.fz + dz / 2);
      dummy.lookAt(fx.tx, fx.ty, fx.tz);
      dummy.scale.set(0.012 * life + 0.004, 0.012 * life + 0.004, len);
      dummy.updateMatrix();
      tm.setMatrixAt(i, dummy.matrix);
      dummy.position.set(fx.fx, fx.fy, fx.fz);
      dummy.rotation.set(0, 0, 0);
      const f = now - fx.t0 < FLASH_MS ? 1 - (now - fx.t0) / FLASH_MS : 0;
      dummy.scale.set(f * 0.035, f * 0.035, f * 0.035);
      dummy.updateMatrix();
      fm.setMatrixAt(i, dummy.matrix);
    }
    tm.visible = true;
    fm.visible = true;
    tm.instanceMatrix.needsUpdate = true;
    fm.instanceMatrix.needsUpdate = true;
  });

  return (
    <>
      <group ref={gun} visible={equipped !== null}>
        <group position={[-0.07, 0.2, 0.06]}>
          <GunProp color={PALETTE.ink} />
        </group>
      </group>
      <instancedMesh
        ref={tracers}
        args={[undefined, undefined, SLOTS]}
        frustumCulled={false}
        renderOrder={3}
        visible={false}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial color={PALETTE.butter} transparent opacity={0.95} depthWrite={false} />
      </instancedMesh>
      <instancedMesh
        ref={flashes}
        args={[undefined, undefined, SLOTS]}
        frustumCulled={false}
        renderOrder={4}
        visible={false}
      >
        <sphereGeometry args={[1, 8, 6]} />
        <meshBasicMaterial color={PALETTE.cream} depthWrite={false} />
      </instancedMesh>
    </>
  );
}

export default function Combat() {
  return (
    <>
      <Officers />
      <PlayerCombat />
    </>
  );
}
