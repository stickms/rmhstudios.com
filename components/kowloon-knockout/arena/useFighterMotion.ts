'use client';

/**
 * One fighter's per-frame motion, shared by the Y-Bot and Source renderers: smoothed ground position and
 * facing, the clip driver (smooth blends, restarts, hit-stop), and the ImpactBus reaction (knock-back,
 * squash, lean, flash). Everything is time-based — the same at 60 and 144 fps — and runs on the fighter's
 * own time scale, so a hit-stop freezes the pose, the slide and the recoil together.
 */
import { useCallback, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { AnimationAction, AnimationMixer } from 'three';
import type { RenderFighter } from '@/lib/kowloon-knockout/net/session';
import type { ClipKey } from '@/lib/kowloon-knockout/render/fighter/clips';
import { ClipDriver } from '@/lib/kowloon-knockout/render/fighter/clipDriver';
import { damp, dampAngle } from '@/lib/kowloon-knockout/render/fighter/damp';
import { flashStyle, reactionPose, type FlashStyle } from '@/lib/kowloon-knockout/render/fighter/reactionPose';
import { useImpactBus } from './ImpactContext';

/** Response rates (1/s): position settles in ~0.15 s, facing a touch slower. */
const POSITION_LAMBDA = 22;
const YAW_LAMBDA = 16;
/** A jump bigger than this (metres) is a teleport (a respawn, a round reset): snap rather than glide across the ring. */
const SNAP_DISTANCE = 4;

export interface MotionStep {
    rf: RenderFighter;
    root: THREE.Group;
    /** The group the model hangs on: it takes the squash and lean. */
    host: THREE.Group;
    mixer: AnimationMixer;
    actions: Partial<Record<ClipKey, AnimationAction>>;
    want: ClipKey;
    deltaRaw: number;
}

export function useFighterMotion(seat: number) {
    const bus = useImpactBus();
    const driver = useRef(new ClipDriver());
    const base = useRef({ x: 0, z: 0, placed: false });
    const axis = useMemo(() => new THREE.Vector3(), []);

    /** Call when the mixer is rebuilt: forget the clip and place the fighter afresh (no glide in from the origin). */
    const reset = useCallback(() => {
        driver.current.reset();
        base.current.placed = false;
    }, []);

    /** Advance one frame; returns the emissive flash to apply to the body materials. */
    const step = useCallback((s: MotionStep): FlashStyle => {
        const { rf, root, host } = s;
        const now = performance.now();
        const scale = bus ? bus.timeScaleFor(seat, now) : 1;
        const dt = Math.min(0.05, Math.max(0, s.deltaRaw)) * scale;

        const b = base.current;
        const faceY = Math.atan2(Math.cos(rf.yaw), Math.sin(rf.yaw));
        if (!b.placed || Math.hypot(rf.x - b.x, rf.z - b.z) > SNAP_DISTANCE) {
            b.x = rf.x; b.z = rf.z; b.placed = true;
            root.rotation.y = faceY;
        } else {
            b.x = damp(b.x, rf.x, POSITION_LAMBDA, dt);
            b.z = damp(b.z, rf.z, POSITION_LAMBDA, dt);
            root.rotation.y = dampAngle(root.rotation.y, faceY, YAW_LAMBDA, dt);
        }

        driver.current.update(s.mixer, s.actions, {
            want: s.want, actionProgress: rf.actionProgress, punchFrame: rf.punchFrame, state: rf.state,
        }, dt);

        // The impact reaction rides on top of the smoothed pose.
        const rx = bus?.reaction(seat);
        if (rx) {
            const p = reactionPose(rx, root.rotation.y);
            root.position.x = b.x + p.dx;
            root.position.z = b.z + p.dz;
            host.scale.set(p.sx, p.sy, p.sz);
            axis.set(p.axisX, 0, p.axisZ);
            if (axis.lengthSq() > 1e-9) host.quaternion.setFromAxisAngle(axis, p.angle);
            return flashStyle(rx.flash, rx.flashKind, rf.hitFlash);
        }
        root.position.x = b.x;
        root.position.z = b.z;
        return flashStyle(0, 'hit', rf.hitFlash);
    }, [bus, seat, axis]);

    /** The clip currently playing (null before the first frame). */
    const currentClip = useCallback(() => driver.current.current, []);

    // Stable identity: the fighters list it as an effect dependency, and a new object each render would rebuild the model.
    return useMemo(() => ({ step, reset, currentClip }), [step, reset, currentClip]);
}
