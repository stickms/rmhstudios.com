'use client';

import { useRef, useEffect, useLayoutEffect, type MutableRefObject } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { RenderFighter } from '@/lib/kowloon-knockout/net/session';
import { CLIPS, ESSENTIAL_CLIP_KEYS, DEFERRED_CLIP_KEYS, FIGHTER_ASSET_DIR, RIG_FILE, type ClipKey } from '@/lib/kowloon-knockout/render/fighter/clips';
import { loadFighterClip } from '@/lib/kowloon-knockout/render/fighter/clipLoader';
import { resolveClip } from '@/lib/kowloon-knockout/render/fighter/stateMachine';
import { stripRootMotionXZ } from '@/lib/kowloon-knockout/render/fighter/rootMotion';
import { autoScaleToHeight, findBone } from '@/lib/kowloon-knockout/render/fighter/fighterRig';
import FighterTrappings from './FighterTrappings';

type FramesRef = MutableRefObject<RenderFighter[]>;

const TARGET_HEIGHT = 1.8;
const MODEL_YAW_OFFSET = 0;          // tune in browser if Y-Bot faces away from +Z
const HEAD_BONES = ['mixamorigHead', 'mixamorig:Head'];
const HIPS_BONES = ['mixamorigHips', 'mixamorig:Hips'];
const FLASH = new THREE.Color('#ff2244');

const RIG_URL = `${FIGHTER_ASSET_DIR}/${RIG_FILE}`;
const ESSENTIAL_CLIP_URLS = ESSENTIAL_CLIP_KEYS.map((k) => `${FIGHTER_ASSET_DIR}/${CLIPS[k].file}`);

/** Build a mixer action with this clip's loop semantics. */
function configureAction(
    mixer: THREE.AnimationMixer,
    clip: THREE.AnimationClip,
    key: ClipKey,
): THREE.AnimationAction {
    const action = mixer.clipAction(clip);
    if (!CLIPS[key].loop) {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
    }
    return action;
}

interface FighterInstance {
    model: THREE.Group;
    mixer: THREE.AnimationMixer;
    actions: Partial<Record<ClipKey, THREE.AnimationAction>>;
    bodyMats: THREE.MeshStandardMaterial[];
    dispose: () => void;
}

/**
 * Build one seat's renderable fighter: a skeleton clone, tinted materials,
 * bone-parented accessories, and a mixer with the essential clips bound.
 *
 * Creation and disposal are deliberately paired in one object owned by a single
 * effect. They used to be split — resources built in `useMemo`, torn down in an
 * effect cleanup with different dependencies — which meant React could run the
 * cleanup and then re-run the effect against the *same* memoised mixer, whose
 * bindings `uncacheRoot` had already destroyed. The first `play()` after that
 * threw `Cannot set properties of undefined (setting '_cacheIndex')`. Any
 * cleanup must be undoable by its own setup, so both live here.
 */
function createFighterInstance(
    rig: THREE.Group,
    essentialClips: THREE.Group[],
    colorHex: string,
    accentHex: string,
): FighterInstance {
    const model = cloneSkeleton(rig) as THREE.Group;
    autoScaleToHeight(model, TARGET_HEIGHT);

    // Identity: tint every skinned-mesh material (cloned so seats differ).
    const baseColor = new THREE.Color(colorHex);
    const bodyMats: THREE.MeshStandardMaterial[] = [];
    model.traverse((o) => {
        const sm = o as THREE.SkinnedMesh;
        if (sm.isSkinnedMesh) {
            const mat = (sm.material as THREE.MeshStandardMaterial).clone();
            mat.color.copy(baseColor);
            sm.material = mat;
            bodyMats.push(mat);
        }
    });

    // Procedural accessories parented to bones (skip if bone missing).
    const head = findBone(model, HEAD_BONES);
    if (head) {
        const band = new THREE.Mesh(
            new THREE.TorusGeometry(0.12, 0.03, 6, 12),
            new THREE.MeshStandardMaterial({ color: accentHex }),
        );
        band.rotation.x = Math.PI / 2;
        head.add(band);
    }
    const hips = findBone(model, HIPS_BONES);
    if (hips) {
        const belt = new THREE.Mesh(
            new THREE.TorusGeometry(0.16, 0.04, 6, 12),
            new THREE.MeshStandardMaterial({ color: accentHex }),
        );
        belt.rotation.x = Math.PI / 2;
        hips.add(belt);
    }

    const mixer = new THREE.AnimationMixer(model);
    const actions: Partial<Record<ClipKey, THREE.AnimationAction>> = {};
    ESSENTIAL_CLIP_KEYS.forEach((key, i) => {
        const clip = essentialClips[i]?.animations[0];
        if (!clip) return;
        stripRootMotionXZ(clip);
        actions[key] = configureAction(mixer, clip, key);
    });

    const dispose = () => {
        mixer.stopAllAction();
        mixer.uncacheRoot(model);
        model.traverse((o) => {
            const m = o as THREE.Mesh;
            if (!m.isMesh) return;
            // Skinned-mesh geometry is SHARED across seats by SkeletonUtils.clone — do
            // not dispose it. Accessory (non-skinned) geometry is created per seat.
            if (!(m as THREE.SkinnedMesh).isSkinnedMesh) m.geometry?.dispose?.();
            const mat = m.material as THREE.Material | THREE.Material[] | undefined;
            if (Array.isArray(mat)) mat.forEach((x) => x?.dispose?.());
            else mat?.dispose?.();
        });
    };

    return { model, mixer, actions, bodyMats, dispose };
}

/** Shortest-path angle damp (shared convention with StickFighter). */
function dampAngle(current: number, target: number, t: number): number {
    let d = target - current;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return current + d * t;
}

export default function SkeletalFighter({ seat, framesRef, showNameplate = true }: { seat: number; framesRef: FramesRef; showNameplate?: boolean }) {
    // Shared, cached loads via FBXLoader. useLoader suspends; a missing file
    // throws → the Fighter dispatcher's ErrorBoundary falls back to StickFighter.
    //
    // Only the rig and the two clips needed to look correct standing still are
    // awaited here (~2.8 MB instead of ~7.9 MB). The rest stream in via
    // loadFighterClip below, so the swap off StickFighter no longer waits on,
    // among others, a 1.2 MB dance emote the sim never requests.
    const rig = useLoader(FBXLoader, RIG_URL);                     // skinned Group
    const clipScenes = useLoader(FBXLoader, ESSENTIAL_CLIP_URLS);  // Group[], one per essential clip

    const initial = framesRef.current.find((f) => f.seat === seat);
    const colorHex = initial?.color ?? '#cccccc';
    const accentHex = initial?.accent ?? '#ffffff';
    const plateColor = initial?.isLocal ? '#ffcc00' : accentHex;
    const plateLabel = `P${seat + 1}`;

    const root = useRef<THREE.Group>(null);
    const shadow = useRef<THREE.Mesh>(null);
    /** Empty group the model is attached to imperatively — see the effect below. */
    const modelHost = useRef<THREE.Group>(null);
    const instance = useRef<FighterInstance | null>(null);
    const currentClip = useRef<ClipKey | null>(null);

    // Single owner of the fighter's GPU resources: this effect builds them,
    // attaches the model, streams the deferred clips in, and tears all of it
    // down again. Because setup fully reverses cleanup, a remount rebuilds
    // rather than reusing a mixer whose bindings were already destroyed.
    //
    // useLayoutEffect, not useEffect: the model is attached before paint, so
    // there is no frame where the fighter is missing.
    useLayoutEffect(() => {
        // Captured up front: by cleanup time the ref may already point elsewhere.
        const host = modelHost.current;
        const inst = createFighterInstance(rig, clipScenes, colorHex, accentHex);
        instance.current = inst;
        currentClip.current = null;
        host?.add(inst.model);

        // Non-essential clips arrive behind the swap and register with this
        // instance's mixer. useFrame skips a clip whose action is missing, so an
        // un-arrived move simply holds the current pose.
        let cancelled = false;
        for (const key of DEFERRED_CLIP_KEYS) {
            loadFighterClip(key).then((clip) => {
                if (cancelled || !clip || inst.actions[key]) return;
                inst.actions[key] = configureAction(inst.mixer, clip, key);
            });
        }

        return () => {
            cancelled = true;
            host?.remove(inst.model);
            inst.dispose();
            if (instance.current === inst) instance.current = null;
        };
    }, [rig, clipScenes, colorHex, accentHex]);

    // Local-only dance emote: pressing G toggles dancing. Applied only to the
    // local fighter and only while idle (any real action overrides it). Purely
    // cosmetic / client-side — it is NOT synced to other players.
    const dancing = useRef(false);
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.repeat) return;   // ignore OS key-repeat so holding G doesn't flicker
            if (e.key.toLowerCase() !== 'g') return;
            if (!framesRef.current.find((f) => f.seat === seat)?.isLocal) return;
            dancing.current = !dancing.current;
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [framesRef, seat]);

    useFrame((state, deltaRaw) => {
        const rf = framesRef.current.find((f) => f.seat === seat);
        const r = root.current;
        const inst = instance.current;
        if (!rf || !r || !inst) return;
        const { mixer, actions, bodyMats } = inst;
        const delta = Math.min(0.05, deltaRaw);

        // Position + facing (damped), reusing StickFighter's conventions.
        r.position.x += (rf.x - r.position.x) * 0.5;
        r.position.z += (rf.z - r.position.z) * 0.5;
        const faceY = Math.atan2(Math.cos(rf.yaw), Math.sin(rf.yaw));
        r.rotation.y = dampAngle(r.rotation.y, faceY, 0.4);

        // Clip selection (+ local dance-emote override) and crossfade.
        let clip = resolveClip(rf).clip;
        if (rf.isLocal && dancing.current && clip === 'idle') clip = 'dance';
        const next = actions[clip];
        if (next && currentClip.current !== clip) {
            const prev = currentClip.current ? actions[currentClip.current] : undefined;
            if (!CLIPS[clip].loop) next.reset();
            next.enabled = true;
            next.play();
            if (prev && prev !== next) {
                next.crossFadeFrom(prev, CLIPS[clip].fade, false); // prev→next weight ramp, no gap
            } else {
                next.setEffectiveWeight(1);
            }
            currentClip.current = clip;
        }

        // One-shot clips (punch/hit/ko) are positioned by sim progress so they
        // always play fully across the action window regardless of its length.
        const active = actions[clip];
        if (active && !CLIPS[clip].loop) {
            active.paused = true;                 // we set time manually
            active.time = rf.actionProgress * active.getClip().duration;
        } else if (active) {
            active.paused = false;                // looping clips advance with the mixer
        }
        mixer.update(delta);

        // Hit flash → emissive pulse; dim when down.
        const flash = rf.hitFlash > 0 ? Math.min(1, rf.hitFlash / 8) : 0;
        const dim = rf.alive ? 1 : 0.4;
        for (const mat of bodyMats) {
            mat.emissive.copy(FLASH).multiplyScalar(flash * 0.9);
            mat.color.setStyle(colorHex).multiplyScalar(dim);
        }

        if (shadow.current) shadow.current.scale.setScalar(rf.state === 'knockedOut' ? 1.4 : 1);
    });

    return (
        <group ref={root}>
            <FighterTrappings showNameplate={showNameplate} plateColor={plateColor} plateLabel={plateLabel} shadowRef={shadow} />
            <group ref={modelHost} rotation={[0, MODEL_YAW_OFFSET, 0]} />
        </group>
    );
}
