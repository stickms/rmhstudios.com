/**
 * The 3D canvas for the builder's player: the class body, animated, with the equipped cosmetics and
 * the held weapon on it. Loaded lazily with the rest of three.js.
 *
 * The class body is a skinned model with the game's own loadout-screen idle baked in (`idle`); a taunt
 * is a separate file holding just the skeleton and one clip, played on the same bones and looped. The
 * converter writes, for every cosmetic or weapon, the bone it follows and its pose on that bone
 * (`attach`). Each one is added to that bone, so it moves with the animation exactly as the game's
 * bone-merge does, and sits in the right place in the reference pose.
 *
 * The player wears its team's skin: the body and every item with team colours switch to BLU's
 * textures (decoded on first use, lib/tf2-loadout/team-skins.ts) when `team` is `blu`.
 */
'use client';

import { classVariant, selectionKey } from '@/lib/tf2-loadout/bodygroups';
import type { Bodygroups } from '@/lib/tf2-loadout/catalog-types';
import { boneMerge } from '@/lib/tf2-loadout/bone-merge';
import { Tf2GLTFLoader } from '@/lib/tf2-loadout/gltf-loader';
import {
  hasTeamVariants,
  loadTeamTextures,
  type Team,
  type TeamSkinSource,
} from '@/lib/tf2-loadout/team-skins';
import {
  renameSkeleton,
  setupJiggle,
  stepJiggle,
  type JiggleBone,
  type JiggleSpec,
} from '@/lib/tf2-loadout/jiggle';
import StudioLight from './StudioLight';
import { ResetViewButton, ViewerOrbit, rememberView, useResetView } from './viewer-controls';
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  AnimationMixer,
  type AnimationAction,
  type Texture,
  type AnimationClip,
  Box3,
  LoopRepeat,
  MathUtils,
  Vector3,
  type Mesh,
  type SkinnedMesh,
  type Object3D,
  type PerspectiveCamera,
} from 'three';
import { SilentErrorBoundary } from '@/components/errors/SilentErrorBoundary';
import EffectParticles, { type EffectSpec } from './EffectParticles';
import {
  applyBodygroups,
  applyFestive,
  applyPaintTexture,
  applyTeam,
  applyTint,
  cloneWithMaterials,
  type WarPaint,
} from './model-utils';
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
  festive?: boolean;
  /** The class wearing it, to show a per-class cosmetic's own submodel. */
  cls?: string;
}

/**
 * BLU's textures of a loaded model while the player is BLU (null: none needed, or still loading — RED's
 * show meanwhile). Loaded once per file and shared by every viewer.
 */
function useTeamTextures(gltf: TeamSkinSource, team: Team): ReadonlyMap<number, Texture> | null {
  const [textures, setTextures] = useState<ReadonlyMap<number, Texture> | null>(null);
  const variants = useMemo(() => hasTeamVariants(gltf.scene), [gltf]);
  const wanted = team === 'blu' && variants;
  useEffect(() => {
    if (!wanted) return undefined;
    let alive = true;
    void loadTeamTextures(gltf).then((t) => alive && setTextures(t));
    return () => {
      alive = false;
    };
  }, [gltf, wanted]);
  return wanted ? textures : null;
}

interface BodyState {
  root: Object3D;
  mixer: AnimationMixer;
  /** The class body's own idle clip, when it has one. */
  idle?: AnimationClip;
  height: number;
  box: Box3;
}

// The mixer hands back the same action for the same clip and root, so a pending "stop once faded" from
// a taunt that just ended would also stop the one that replaced it (the body re-frames when the orbit
// controls arrive, which re-runs the effect below). Each start cancels the timer its predecessor left.
const pendingStops = new WeakMap<AnimationAction, ReturnType<typeof setTimeout>>();

/** Plays a taunt clip on the body, looped, easing in over the idle and back out when it goes. */
function Taunt({ url, body }: { url: string; body: BodyState }) {
  const { animations } = useLoader(Tf2GLTFLoader, url);
  useEffect(() => {
    const clip = animations[0];
    if (!clip) return undefined;
    const action = body.mixer.clipAction(clip, body.root);
    clearTimeout(pendingStops.get(action));
    action.setLoop(LoopRepeat, Infinity);
    action.reset().fadeIn(0.25).play();
    // `existingAction('idle')` looks the name up on the root, which carries no clips: it never finds it,
    // and the idle kept playing underneath the taunt. Fade the clip itself.
    const idle = body.idle ? body.mixer.clipAction(body.idle, body.root) : null;
    idle?.fadeOut(0.25);
    return () => {
      action.fadeOut(0.25);
      idle?.reset().fadeIn(0.25).play();
      // Stop it once it has faded, so a finished taunt leaves no tracks fighting the idle.
      pendingStops.set(
        action,
        setTimeout(() => action.stop(), 300),
      );
    };
  }, [animations, body]);
  return null;
}

function Body({
  url,
  bodygroups,
  team,
  tauntUrl,
  onReady,
}: {
  url: string;
  team: Team;
  /** The submodel to show per body group, from what is worn. */
  bodygroups: Bodygroups;
  tauntUrl?: string;
  onReady: (body: BodyState) => void;
}) {
  const gltf = useLoader(Tf2GLTFLoader, url);
  const { camera, controls } = useThree();
  const root = useMemo(() => cloneWithMaterials(gltf.scene), [gltf.scene]);
  const mixer = useMemo(() => new AnimationMixer(root), [root]);
  const [state, setState] = useState<BodyState | null>(null);
  const teamTextures = useTeamTextures(gltf, team);
  useLayoutEffect(() => {
    applyTeam(root, team, teamTextures ?? undefined);
    applyTint(root);
  }, [root, team, teamTextures]);

  useLayoutEffect(() => {
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

  // A worn cosmetic takes the part of the body it replaces (the class's own hat, headphones, …) off. This
  // runs before the framing below, so the bounds never include a part that is hidden.
  const groupsKey = selectionKey(bodygroups);
  useLayoutEffect(() => {
    applyBodygroups(root, bodygroups);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `groupsKey` is the selection's value
  }, [root, groupsKey]);

  // Frame the whole player, front on, from a distance that fits its height.
  useLayoutEffect(() => {
    root.updateMatrixWorld(true);
    root.traverse((o) => {
      const mesh = o as SkinnedMesh;
      if (mesh.isSkinnedMesh) mesh.computeBoundingBox();
    });
    const box = new Box3().setFromObject(root);
    const size = box.getSize(new Vector3());
    const centre = box.getCenter(new Vector3());
    const cam = camera as PerspectiveCamera;
    const halfSpan = Math.max(size.y, size.x / cam.aspect) / 2;
    const dist = (halfSpan / Math.tan(MathUtils.degToRad(cam.fov) / 2)) * 1.15;
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
    rememberView(controls);
    const next = {
      root,
      mixer,
      idle: gltf.animations.find((a) => a.name === 'idle'),
      height: size.y,
      box,
    };
    setState(next);
    onReady(next);
  }, [root, mixer, camera, controls, onReady, gltf.animations]);

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
  cls,
  team,
  tint,
  effect,
  paint,
  festive,
  body,
}: {
  url: string;
  cls?: string;
  team: Team;
  tint?: string;
  effect?: EffectSpec;
  paint?: WarPaint;
  festive?: boolean;
  body: BodyState;
}) {
  const gltf = useLoader(Tf2GLTFLoader, url);
  const { scene } = gltf;
  const root = useMemo(() => cloneWithMaterials(scene), [scene]);
  const teamTextures = useTeamTextures(gltf, team);
  const [mount, setMount] = useState<{ bone: Object3D; box: Box3 } | null>(null);
  const jiggle = useRef<JiggleBone[]>([]);

  useLayoutEffect(() => applyFestive(root, festive), [root, festive]);
  // A cosmetic modelled once per class (`use_per_class_bodygroups`) shows the wearer's own.
  useLayoutEffect(() => applyBodygroups(root, classVariant(cls)), [root, cls]);

  useLayoutEffect(() => {
    type Attachment = { bone: string; pose: number[] };
    const data = scene.userData.attach as (Attachment & { fallbacks?: Attachment[] }) | undefined;
    const attach = data
      ? [data, ...(data.fallbacks ?? [])].find((a) => body.root.getObjectByName(a.bone))
      : undefined;
    const bone = attach ? body.root.getObjectByName(attach.bone) : undefined;
    if (!attach || !bone) {
      // No known attachment (an older file, or a bone this class lacks): show nothing rather than
      // a cosmetic floating at the feet.
      setMount(null);
      return undefined;
    }
    // Boots, gloves and capes follow several bones: they deform with the player's skeleton, as the game's
    // bone-merge does. Everything else sits rigidly on the one bone it follows.
    const merge = scene.userData.boneMerge === true ? boneMerge(root, body.root) : null;
    const merged = merge !== null;
    if (merged) {
      body.root.add(root);
    } else {
      root.matrixAutoUpdate = false;
      root.matrix.fromArray(attach.pose);
      bone.add(root);
    }
    body.root.updateMatrixWorld(true);
    // Where the cosmetic sits on its bone, for an effect that follows it.
    const box = new Box3().setFromObject(root);
    setMount({ bone, box });
    // Flexible jiggle bones swing on their own springs; their skeleton rides on the bone it is mounted on.
    jiggle.current = setupJiggle(
      root,
      scene.userData.jiggle as JiggleSpec[] | undefined,
      merge?.moved,
    );
    if (merged) {
      // Deformed by bones far from the one it was framed on, so the bind-pose bounds do not hold. Its own
      // bones now live in the player's skeleton: rename them so no lookup by name finds a copy.
      merge.moved.forEach(renameSkeleton);
      root.traverse((o) => {
        if ((o as Mesh).isMesh) o.frustumCulled = false;
      });
    } else if (jiggle.current.length) {
      renameSkeleton(root);
      // A swinging bone can leave the bind-pose bounds the renderer culls by.
      root.traverse((o) => {
        if ((o as Mesh).isMesh) o.frustumCulled = false;
      });
    }
    return () => {
      jiggle.current = [];
      merge?.moved.forEach((b) => b.removeFromParent());
      root.removeFromParent();
    };
  }, [root, scene, body]);

  // The team's skin first: it can change the default tint the paint falls back to.
  useEffect(() => {
    applyTeam(root, team, teamTextures ?? undefined);
    applyTint(root, tint);
  }, [root, tint, team, teamTextures]);

  // After the body's animation for the frame (it is mounted first), so the springs see this frame's motion.
  useFrame((_, dt) => {
    if (jiggle.current.length) stepJiggle(jiggle.current, Math.min(dt, 0.1));
  });

  const paintTexture = useWarPaintTexture(paint?.script, paint?.wear ?? 1, paint?.seed ?? 0);
  useEffect(() => {
    applyPaintTexture(root, paintTexture);
  }, [root, paintTexture, teamTextures]);

  return effect && mount ? (
    <EffectParticles spec={effect} box={mount.box} owner={root} body={body.root} />
  ) : null;
}

export default function PlayerScene({
  body,
  bodygroups,
  parts,
  bodyEffect,
  tauntUrl,
  team = 'red',
  bare = false,
}: {
  body: string;
  /** The team whose skin the player and its items wear. */
  team?: Team;
  /** The submodel to show per class-body group (a worn cosmetic hides the part it replaces). */
  bodygroups: Bodygroups;
  parts: PlayerPart[];
  /** A taunt's unusual effect, around the whole player. */
  bodyEffect?: EffectSpec;
  /** The taunt clip to play (looped) instead of the idle. */
  tauntUrl?: string;
  /** No controls: the player is scenery (the HUD editor's backdrop and model panels), not something to turn around. */
  bare?: boolean;
}) {
  const [ready, setReady] = useState<BodyState | null>(null);
  const { ref, reset } = useResetView();
  return (
    <div className="relative size-full">
      <Canvas
        dpr={[1, 1.5]}
        flat
        camera={{ fov: 30, position: [0, 1, 4] }}
        gl={{ antialias: true, alpha: true }}
      >
        <StudioLight />
        <ViewerOrbit
          resetRef={ref}
          enablePan={!bare}
          enableZoom={!bare}
          enableRotate={!bare}
          minPolarAngle={Math.PI / 3}
          maxPolarAngle={(Math.PI * 2) / 3}
          minDistance={ready ? ready.height * 0.8 : 1}
          maxDistance={ready ? ready.height * 3.5 : 8}
        />
        <Suspense fallback={null}>
          <Body
            url={body}
            bodygroups={bodygroups}
            team={team}
            tauntUrl={tauntUrl}
            onReady={setReady}
          />
        </Suspense>
        {ready && bodyEffect ? (
          <EffectParticles spec={bodyEffect} box={ready.box} owner={ready.root} body={ready.root} />
        ) : null}
        {ready
          ? parts.map((p) => (
              // One missing or broken cosmetic must not take the player down with it.
              <SilentErrorBoundary key={p.key} label="tf2-player-part" fallback={null}>
                <Suspense fallback={null}>
                  <Part
                    url={p.url}
                    cls={p.cls}
                    team={team}
                    tint={p.tint}
                    effect={p.effect}
                    paint={p.paint}
                    festive={p.festive}
                    body={ready}
                  />
                </Suspense>
              </SilentErrorBoundary>
            ))
          : null}
      </Canvas>
      {bare ? null : <ResetViewButton onClick={reset} />}
    </div>
  );
}
