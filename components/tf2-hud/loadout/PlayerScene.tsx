/**
 * The 3D canvas for the builder's player: the class body, animated, with the equipped cosmetics and
 * the held weapon on it. Loaded lazily with the rest of three.js.
 *
 * The class body is a skinned model with the game's own loadout-screen idle baked in (`idle`); a taunt
 * is a separate file holding just the skeleton and one clip, played on the same bones and looped. The
 * converter writes, for every cosmetic or weapon, the bone it follows and its pose on that bone
 * (`attach`). Each one is added to that bone, so it moves with the animation exactly as the game's
 * bone-merge does, and sits in the right place in the reference pose.
 */
'use client';

import { OrbitControls, useGLTF } from '@react-three/drei';
import { Canvas, createPortal, useFrame, useThree } from '@react-three/fiber';
import { Suspense, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import {
  AnimationMixer,
  Box3,
  LoopRepeat,
  MathUtils,
  Matrix4,
  Vector3,
  type Mesh,
  type Object3D,
  type PerspectiveCamera,
} from 'three';
import { SilentErrorBoundary } from '@/components/errors/SilentErrorBoundary';
import EffectParticles, { type EffectSpec } from './EffectParticles';
import { applyPaintTexture, applyTint, cloneWithMaterials, type WarPaint } from './model-utils';
import { useWarPaintTexture } from './use-war-paint';

export interface PlayerPart {
  key: string;
  url: string;
  /** Paint colour, `#rrggbb`. */
  tint?: string;
  /** An unusual effect around this cosmetic. */
  effect?: EffectSpec;
  /** A war paint on this weapon. */
  paint?: WarPaint;
}

interface BodyState {
  root: Object3D;
  mixer: AnimationMixer;
  height: number;
  box: Box3;
}

/** Plays a taunt clip on the body, looped, easing in over the idle and back out when it goes. */
function Taunt({ url, body }: { url: string; body: BodyState }) {
  const { animations } = useGLTF(url);
  useEffect(() => {
    const clip = animations[0];
    if (!clip) return undefined;
    const action = body.mixer.clipAction(clip, body.root);
    action.setLoop(LoopRepeat, Infinity);
    action.reset().fadeIn(0.25).play();
    const idle = body.mixer.existingAction('idle');
    idle?.fadeOut(0.25);
    return () => {
      action.fadeOut(0.25);
      idle?.reset().fadeIn(0.25).play();
      // Stop it once it has faded, so a finished taunt leaves no tracks fighting the idle.
      setTimeout(() => action.stop(), 300);
    };
  }, [animations, body]);
  return null;
}

function Body({
  url,
  tauntUrl,
  onReady,
}: {
  url: string;
  tauntUrl?: string;
  onReady: (body: BodyState) => void;
}) {
  const gltf = useGLTF(url);
  const { camera, controls } = useThree();
  const root = useMemo(() => cloneWithMaterials(gltf.scene), [gltf.scene]);
  const mixer = useMemo(() => new AnimationMixer(root), [root]);
  const [state, setState] = useState<BodyState | null>(null);

  useEffect(() => {
    // A pose moves limbs outside the bind-pose bounds the renderer culls by.
    root.traverse((o) => {
      if ((o as Mesh).isMesh) o.frustumCulled = false;
    });
    const idle = gltf.animations.find((a) => a.name === 'idle');
    if (idle) mixer.clipAction(idle, root).setLoop(LoopRepeat, Infinity).play();
    mixer.update(0);
    return () => {
      mixer.stopAllAction();
      mixer.uncacheRoot(root);
    };
  }, [root, mixer, gltf.animations]);

  // Frame the whole player, front on, from a distance that fits its height.
  useLayoutEffect(() => {
    root.updateMatrixWorld(true);
    const box = new Box3().setFromObject(root);
    const size = box.getSize(new Vector3());
    const centre = box.getCenter(new Vector3());
    const cam = camera as PerspectiveCamera;
    const dist = (size.y / 2 / Math.tan(MathUtils.degToRad(cam.fov) / 2)) * 1.05;
    cam.position.set(centre.x, centre.y, centre.z + dist);
    cam.near = dist / 100;
    cam.far = dist * 100;
    cam.updateProjectionMatrix();
    cam.lookAt(centre);
    const orbit = controls as unknown as { target: Vector3; update: () => void } | null;
    if (orbit) {
      orbit.target.copy(centre);
      orbit.update();
    }
    const next = { root, mixer, height: size.y, box };
    setState(next);
    onReady(next);
  }, [root, mixer, camera, controls, onReady]);

  useFrame((_, dt) => mixer.update(Math.min(dt, 0.1)));

  return (
    <>
      <primitive object={root} />
      {state && tauntUrl ? (
        <SilentErrorBoundary label="tf2-player-taunt" fallback={null}>
          <Suspense fallback={null}>
            <Taunt url={tauntUrl} body={state} />
          </Suspense>
        </SilentErrorBoundary>
      ) : null}
    </>
  );
}

function Part({
  url,
  tint,
  effect,
  paint,
  body,
}: {
  url: string;
  tint?: string;
  effect?: EffectSpec;
  paint?: WarPaint;
  body: BodyState;
}) {
  const { scene } = useGLTF(url);
  const root = useMemo(() => cloneWithMaterials(scene), [scene]);
  const [mount, setMount] = useState<{ bone: Object3D; box: Box3 } | null>(null);

  useLayoutEffect(() => {
    const attach = scene.userData.attach as { bone: string; pose: number[] } | undefined;
    const bone = attach ? body.root.getObjectByName(attach.bone) : undefined;
    if (!attach || !bone) {
      // No known attachment (an older file, or a bone this class lacks): show nothing rather than
      // a cosmetic floating at the feet.
      setMount(null);
      return undefined;
    }
    root.matrixAutoUpdate = false;
    root.matrix.fromArray(attach.pose);
    bone.add(root);
    body.root.updateMatrixWorld(true);
    // Where the cosmetic sits on its bone, for an effect that follows it.
    const box = new Box3()
      .setFromObject(root)
      .applyMatrix4(new Matrix4().copy(bone.matrixWorld).invert());
    setMount({ bone, box });
    return () => {
      bone.remove(root);
    };
  }, [root, scene, body]);

  useEffect(() => {
    applyTint(root, tint);
  }, [root, tint]);

  const paintTexture = useWarPaintTexture(paint?.script, paint?.wear ?? 1, paint?.seed ?? 0);
  useEffect(() => {
    applyPaintTexture(root, paintTexture);
  }, [root, paintTexture]);

  return effect && mount
    ? createPortal(<EffectParticles spec={effect} box={mount.box} />, mount.bone)
    : null;
}

export default function PlayerScene({
  body,
  parts,
  bodyEffect,
  tauntUrl,
}: {
  body: string;
  parts: PlayerPart[];
  /** A taunt's unusual effect, around the whole player. */
  bodyEffect?: EffectSpec;
  /** The taunt clip to play (looped) instead of the idle. */
  tauntUrl?: string;
}) {
  const [ready, setReady] = useState<BodyState | null>(null);
  return (
    <Canvas
      dpr={[1, 1.5]}
      camera={{ fov: 30, position: [0, 1, 4] }}
      gl={{ antialias: true, alpha: true }}
    >
      <ambientLight intensity={1.1} />
      <directionalLight position={[3, 4, 5]} intensity={2.2} />
      <directionalLight position={[-4, 1, -2]} intensity={0.8} color="#ffd9b0" />
      <OrbitControls
        makeDefault
        enablePan={false}
        enableDamping
        minPolarAngle={Math.PI / 3}
        maxPolarAngle={(Math.PI * 2) / 3}
        minDistance={ready ? ready.height * 0.8 : 1}
        maxDistance={ready ? ready.height * 3.5 : 8}
      />
      <Suspense fallback={null}>
        <Body url={body} tauntUrl={tauntUrl} onReady={setReady} />
      </Suspense>
      {ready && bodyEffect ? <EffectParticles spec={bodyEffect} box={ready.box} /> : null}
      {ready
        ? parts.map((p) => (
            // One missing or broken cosmetic must not take the player down with it.
            <SilentErrorBoundary key={p.key} label="tf2-player-part" fallback={null}>
              <Suspense fallback={null}>
                <Part url={p.url} tint={p.tint} effect={p.effect} paint={p.paint} body={ready} />
              </Suspense>
            </SilentErrorBoundary>
          ))
        : null}
    </Canvas>
  );
}
