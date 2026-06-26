'use client';

import { useMemo, useRef, useEffect, type MutableRefObject } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { RenderFighter } from '@/lib/kowloon-knockout/net/session';
import { CLIPS, CLIP_KEYS, FIGHTER_ASSET_DIR, RIG_FILE, type ClipKey } from '@/lib/kowloon-knockout/render/fighter/clips';
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
const CLIP_URLS = CLIP_KEYS.map((k) => `${FIGHTER_ASSET_DIR}/${CLIPS[k].file}`);

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
    const rig = useLoader(FBXLoader, RIG_URL);           // skinned Group
    const clipScenes = useLoader(FBXLoader, CLIP_URLS);  // Group[], one per CLIP_URLS entry

    const initial = framesRef.current.find((f) => f.seat === seat);
    const colorHex = initial?.color ?? '#cccccc';
    const accentHex = initial?.accent ?? '#ffffff';
    const plateColor = initial?.isLocal ? '#ffcc00' : accentHex;
    const plateLabel = `P${seat + 1}`;

    const root = useRef<THREE.Group>(null);
    const shadow = useRef<THREE.Mesh>(null);

    // Per-seat clone of the rig + its own mixer + actions, built once.
    const { model, mixer, actions, bodyMats } = useMemo(() => {
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

        // Mixer + one action per clip, with root motion stripped.
        const mixer = new THREE.AnimationMixer(model);
        const actions = {} as Record<ClipKey, THREE.AnimationAction>;
        CLIP_KEYS.forEach((key, i) => {
            const clip = clipScenes[i].animations[0];
            if (!clip) return;
            stripRootMotionXZ(clip);
            const action = mixer.clipAction(clip);
            if (!CLIPS[key].loop) {
                action.setLoop(THREE.LoopOnce, 1);
                action.clampWhenFinished = true;
            }
            actions[key] = action;
        });
        return { model, mixer, actions, bodyMats };
    }, [rig, clipScenes, colorHex, accentHex]);

    const currentClip = useRef<ClipKey | null>(null);

    // Dispose GPU resources when mixer/model rebuild or on unmount.
    // Also resets currentClip so the rebuilt mixer's actions restart correctly
    // instead of being skipped because currentClip still equals the old key.
    useEffect(() => {
        currentClip.current = null;
        return () => {
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
    }, [mixer, model]);

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
        if (!rf || !r) return;
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
            next.fadeIn(CLIPS[clip].fade).play();
            if (prev) prev.fadeOut(CLIPS[clip].fade);
            currentClip.current = clip;
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
            <group rotation={[0, MODEL_YAW_OFFSET, 0]}>
                <primitive object={model} />
            </group>
        </group>
    );
}
