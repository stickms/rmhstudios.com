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
import { leanFor, locomotion, standingness } from '@/lib/kowloon-knockout/render/fighter/locomotion';
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
    /** The model has the sideways-shuffle clip (Source fighters); otherwise a strafe just walks. */
    strafe?: boolean;
    /** Add a procedural stance bounce while standing (for a model whose own idle has none, the Y-Bot). */
    bounce?: boolean;
}

export function useFighterMotion(seat: number) {
    const bus = useImpactBus();
    const driver = useRef(new ClipDriver());
    const base = useRef({ x: 0, z: 0, placed: false });
    const axis = useMemo(() => new THREE.Vector3(), []);
    const qMove = useMemo(() => new THREE.Quaternion(), []);
    const eMove = useMemo(() => new THREE.Euler(), []);
    const qSway = useMemo(() => new THREE.Quaternion(), []);
    // Smoothed ground velocity (m/s), lean and the stance-bounce weight; per-fighter state, not React state.
    const dyn = useRef({ vx: 0, vz: 0, pitch: 0, roll: 0, bounce: 0, clock: 0 });

    /** Call when the mixer is rebuilt: forget the clip and place the fighter afresh (no glide in from the origin). */
    const reset = useCallback(() => {
        driver.current.reset();
        base.current.placed = false;
        dyn.current.vx = 0; dyn.current.vz = 0; dyn.current.pitch = 0; dyn.current.roll = 0;
    }, []);

    /** Advance one frame; returns the emissive flash to apply to the body materials. */
    const step = useCallback((s: MotionStep): FlashStyle => {
        const { rf, root, host } = s;
        const now = performance.now();
        const scale = bus ? bus.timeScaleFor(seat, now) : 1;
        const dt = Math.min(0.05, Math.max(0, s.deltaRaw)) * scale;

        const b = base.current;
        const d = dyn.current;
        const faceY = Math.atan2(Math.cos(rf.yaw), Math.sin(rf.yaw));
        const px = b.x, pz = b.z;
        if (!b.placed || Math.hypot(rf.x - b.x, rf.z - b.z) > SNAP_DISTANCE) {
            b.x = rf.x; b.z = rf.z; b.placed = true;
            root.rotation.y = faceY;
            d.vx = 0; d.vz = 0;
        } else {
            b.x = damp(b.x, rf.x, POSITION_LAMBDA, dt);
            b.z = damp(b.z, rf.z, POSITION_LAMBDA, dt);
            root.rotation.y = dampAngle(root.rotation.y, faceY, YAW_LAMBDA, dt);
            if (dt > 1e-4) {
                // ground velocity, low-passed so a stray step doesn't flip the walk direction
                d.vx = damp(d.vx, (b.x - px) / dt, 12, dt);
                d.vz = damp(d.vz, (b.z - pz) / dt, 12, dt);
            }
        }
        d.clock += dt;

        // Velocity relative to where the fighter faces: + fwd = forward, + lat = toward its left.
        const sinY = Math.sin(root.rotation.y), cosY = Math.cos(root.rotation.y);
        const fwd = d.vx * sinY + d.vz * cosY;
        const lat = d.vx * cosY - d.vz * sinY;
        const speed = Math.hypot(d.vx, d.vz);
        const moving = rf.state === 'walking';

        // Walking: the right clip (forward / backward / sideways shuffle) at a cadence that matches the speed.
        let want = s.want;
        let locoScale: number | undefined;
        if (want === 'walk') {
            const loco = locomotion(fwd, lat, s.strafe === true);
            want = loco.clip;
            locoScale = loco.timeScale;
        }

        driver.current.update(s.mixer, s.actions, {
            want, actionProgress: rf.actionProgress, punchFrame: rf.punchFrame, state: rf.state, locoScale,
        }, dt);

        // Lean into the movement (only on its own legs: not mid-punch, not being hit).
        const lean = moving ? leanFor(fwd, lat) : { pitch: 0, roll: 0 };
        d.pitch = damp(d.pitch, lean.pitch, 10, dt);
        d.roll = damp(d.roll, lean.roll, 10, dt);
        eMove.set(d.pitch, 0, d.roll);
        qMove.setFromEuler(eMove);

        // A procedural stance bounce for a model whose own idle has none (the Y-Bot): up on the toes twice a second
        // and a slow weight rock, faded out as soon as it moves or fights.
        const idle = rf.state === 'idle' && rf.alive;
        d.bounce = damp(d.bounce, s.bounce && idle ? standingness(speed) : 0, 8, dt);
        if (s.bounce) {
            const t = d.clock + seat * 0.37;
            host.position.y = d.bounce * 0.034 * (0.5 - 0.5 * Math.cos(t * Math.PI * 2 * 2.1));
            host.position.x = d.bounce * 0.018 * Math.sin(t * Math.PI * 2 * 1.05);
            qMove.multiply(qSway.setFromEuler(eMove.set(0, 0, d.bounce * 0.03 * Math.sin(t * Math.PI * 2 * 1.05))));
        }

        // The impact reaction rides on top of the smoothed pose.
        const rx = bus?.reaction(seat);
        if (rx) {
            const p = reactionPose(rx, root.rotation.y);
            root.position.x = b.x + p.dx;
            root.position.z = b.z + p.dz;
            host.scale.set(p.sx, p.sy, p.sz);
            axis.set(p.axisX, 0, p.axisZ);
            if (axis.lengthSq() > 1e-9) host.quaternion.setFromAxisAngle(axis, p.angle);
            else host.quaternion.identity();
            host.quaternion.multiply(qMove);
            return flashStyle(rx.flash, rx.flashKind, rf.hitFlash);
        }
        root.position.x = b.x;
        root.position.z = b.z;
        host.quaternion.copy(qMove);
        return flashStyle(0, 'hit', rf.hitFlash);
    }, [bus, seat, axis, eMove, qMove, qSway]);

    /** The clip currently playing (null before the first frame). */
    const currentClip = useCallback(() => driver.current.current, []);

    // Stable identity: the fighters list it as an effect dependency, and a new object each render would rebuild the model.
    return useMemo(() => ({ step, reset, currentClip }), [step, reset, currentClip]);
}
