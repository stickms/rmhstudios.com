// ============================================================
// Authored boxing animation for Source skeletons.
//
// Poses are written in CHARACTER space, not bone space, so the same data drives
// any skeleton (TF2, HL2, Portal, CS:GO) whatever its bind pose or bone axes:
//   +X = the character's left, +Y = up, +Z = forward.
//   Limbs are DIRECTIONS (where the upper arm / forearm / thigh / shin point);
//   trunk joints are ROTATIONS in degrees about those axes. +X tips up toward
//   forward (a forward lean), +Y turns the character left, +Z leans left.
// Arm directions are relative to the chest's rotation, leg directions to the
// hips', so a torso twist carries the arms with it (sourceClips.ts).
// Hips `pos` is a displacement as a fraction of the character's height.
// ============================================================
import type { ClipKey } from './clips';

export type Vec3 = readonly [number, number, number];

/** A limb's segments, each a direction. `foot` (legs only) aims the foot toward its toes: pitch it down to stand on the ball of the foot. */
export interface Limb2 { upper: Vec3; lower: Vec3; foot?: Vec3 }
export interface Pose {
    hips?: { rot?: Vec3; pos?: Vec3 };
    spine?: Vec3; chest?: Vec3; neck?: Vec3; head?: Vec3;
    armL?: Limb2; armR?: Limb2; legL?: Limb2; legR?: Limb2;
}
export interface PoseClip {
    /** Seconds. One-shots are driven by sim progress, so only their length matters for scrubbing. */
    duration: number;
    /** Each keyframe is merged over `base`; `t` runs 0..1. */
    base: Pose;
    frames: { t: number; pose: Pose }[];
}

/** Orthodox boxing guard: left lead, fists by the chin, knees soft, weight forward. */
export const GUARD: Pose = {
    hips: { rot: [0, 12, 0] },
    chest: [8, 8, 0],
    head: [-6, -20, 0],
    armL: { upper: [0.30, -0.80, 0.50], lower: [0.10, 0.60, 0.80] },
    armR: { upper: [-0.30, -0.80, 0.45], lower: [-0.05, 0.65, 0.75] },
    legL: { upper: [0.14, -0.94, 0.30], lower: [0.10, -1.0, -0.10] },
    legR: { upper: [-0.14, -0.97, -0.20], lower: [-0.10, -1.0, -0.05] },
};

const g = (over: Pose): Pose => over;

export const POSE_CLIPS: Record<ClipKey, PoseClip> = {
    // A boxer's bounce on the balls of the feet (~2 bounces a second). The hips offsets are solved so the
    // balls stay planted while the heels lift (sourceClips.test.ts checks it): down with the heels
    // flat and knees soft, up onto the toes with the legs straightening, down again — with the
    // shoulders rolling, the head counter-turning and the guard hands bobbing a beat behind.
    idle: {
        duration: 0.9, base: GUARD,
        frames: [
            { t: 0, pose: g({
                hips: { rot: [0, 12, 0], pos: [0, -0.010, 0] }, chest: [10, 8, 0], head: [-7, -20, 0],
                legL: { upper: [0.14, -0.94, 0.30], lower: [0.10, -1, -0.10], foot: [0.04, -0.24, 0.97] },
                legR: { upper: [-0.14, -0.97, -0.20], lower: [-0.10, -1, -0.05], foot: [-0.04, -0.24, 0.97] },
                armL: { upper: [0.30, -0.80, 0.50], lower: [0.10, 0.54, 0.84] },
                armR: { upper: [-0.30, -0.80, 0.45], lower: [-0.05, 0.60, 0.80] },
            }) },
            { t: 0.25, pose: g({
                hips: { rot: [0, 16, 0], pos: [0, 0.008, 0] }, chest: [8, 12, 3], head: [-6, -24, -3],
                legL: { upper: [0.13, -0.955, 0.27], lower: [0.10, -1, -0.08], foot: [0.04, -0.37, 0.93] },
                legR: { upper: [-0.13, -0.975, -0.18], lower: [-0.10, -1, -0.04], foot: [-0.04, -0.37, 0.93] },
                armL: { upper: [0.30, -0.76, 0.54], lower: [0.10, 0.62, 0.78] },
                armR: { upper: [-0.30, -0.78, 0.48], lower: [-0.05, 0.66, 0.75] },
            }) },
            { t: 0.5, pose: g({
                hips: { rot: [0, 12, 0], pos: [0, 0.029, 0] }, chest: [6, 8, 0], head: [-5, -20, 0],
                legL: { upper: [0.13, -0.97, 0.22], lower: [0.10, -1, -0.06], foot: [0.04, -0.53, 0.85] },
                legR: { upper: [-0.13, -0.985, -0.15], lower: [-0.10, -1, -0.03], foot: [-0.04, -0.53, 0.85] },
                armL: { upper: [0.30, -0.74, 0.58], lower: [0.10, 0.68, 0.73] },
                armR: { upper: [-0.30, -0.76, 0.52], lower: [-0.05, 0.71, 0.70] },
            }) },
            { t: 0.75, pose: g({
                hips: { rot: [0, 8, 0], pos: [0, 0.008, 0] }, chest: [8, 4, -3], head: [-6, -16, 3],
                legL: { upper: [0.13, -0.955, 0.27], lower: [0.10, -1, -0.08], foot: [0.04, -0.37, 0.93] },
                legR: { upper: [-0.13, -0.975, -0.18], lower: [-0.10, -1, -0.04], foot: [-0.04, -0.37, 0.93] },
                armL: { upper: [0.30, -0.78, 0.52], lower: [0.10, 0.58, 0.81] },
                armR: { upper: [-0.30, -0.80, 0.46], lower: [-0.05, 0.63, 0.77] },
            }) },
            { t: 1, pose: g({
                hips: { rot: [0, 12, 0], pos: [0, -0.010, 0] }, chest: [10, 8, 0], head: [-7, -20, 0],
                legL: { upper: [0.14, -0.94, 0.30], lower: [0.10, -1, -0.10], foot: [0.04, -0.24, 0.97] },
                legR: { upper: [-0.14, -0.97, -0.20], lower: [-0.10, -1, -0.05], foot: [-0.04, -0.24, 0.97] },
                armL: { upper: [0.30, -0.80, 0.50], lower: [0.10, 0.54, 0.84] },
                armR: { upper: [-0.30, -0.80, 0.45], lower: [-0.05, 0.60, 0.80] },
            }) },
        ],
    },
    walk: {
        duration: 0.8, base: GUARD,
        frames: [
            { t: 0, pose: g({ hips: { rot: [0, 12, 0], pos: [0, 0, 0] }, legL: { upper: [0.12, -0.8, 0.58], lower: [0.1, -1, -0.1] }, legR: { upper: [-0.12, -0.9, -0.42], lower: [-0.1, -0.7, -0.7] } }) },
            { t: 0.25, pose: g({ hips: { rot: [0, 12, 0], pos: [0, -0.02, 0] }, legL: { upper: [0.12, -1, 0.05], lower: [0.1, -1, -0.25] }, legR: { upper: [-0.12, -0.95, 0.2], lower: [-0.1, -0.85, -0.35] } }) },
            { t: 0.5, pose: g({ hips: { rot: [0, 12, 0], pos: [0, 0, 0] }, legL: { upper: [0.12, -0.9, -0.42], lower: [0.1, -0.7, -0.7] }, legR: { upper: [-0.12, -0.8, 0.58], lower: [-0.1, -1, -0.1] } }) },
            { t: 0.75, pose: g({ hips: { rot: [0, 12, 0], pos: [0, -0.02, 0] }, legL: { upper: [0.12, -0.95, 0.2], lower: [0.1, -0.85, -0.35] }, legR: { upper: [-0.12, -1, 0.05], lower: [-0.1, -1, -0.25] } }) },
            { t: 1, pose: g({ hips: { rot: [0, 12, 0], pos: [0, 0, 0] }, legL: { upper: [0.12, -0.8, 0.58], lower: [0.1, -1, -0.1] }, legR: { upper: [-0.12, -0.9, -0.42], lower: [-0.1, -0.7, -0.7] } }) },
        ],
    },
    jab: {
        duration: 1, base: GUARD,
        frames: [
            { t: 0, pose: {} },
            { t: 0.2, pose: g({ chest: [8, 14, 0], armL: { upper: [0.25, -0.5, 0.7], lower: [0.1, 0.1, 1] } }) },
            { t: 0.4, pose: g({ chest: [8, -8, 0], hips: { rot: [0, 4, 0], pos: [0, 0, 0.02] }, armL: { upper: [0.08, 0.02, 1], lower: [0.05, 0.02, 1] } }) },
            { t: 0.65, pose: g({ chest: [8, -6, 0], armL: { upper: [0.1, 0.0, 1], lower: [0.05, 0.0, 1] } }) },
            { t: 1, pose: {} },
        ],
    },
    cross: {
        duration: 1, base: GUARD,
        frames: [
            { t: 0, pose: {} },
            { t: 0.25, pose: g({ chest: [8, -6, 0], hips: { rot: [0, -4, 0] }, armR: { upper: [-0.3, -0.6, 0.45], lower: [-0.05, 0.1, 0.9] } }) },
            { t: 0.45, pose: g({ chest: [10, 34, 0], hips: { rot: [0, 28, 0], pos: [0, -0.01, 0.03] }, armR: { upper: [-0.1, 0.03, 1], lower: [-0.05, 0.03, 1] } }) },
            { t: 0.7, pose: g({ chest: [10, 30, 0], hips: { rot: [0, 26, 0] }, armR: { upper: [-0.12, 0.0, 1], lower: [-0.06, 0.0, 1] } }) },
            { t: 1, pose: {} },
        ],
    },
    hook: {
        duration: 1, base: GUARD,
        frames: [
            { t: 0, pose: {} },
            { t: 0.25, pose: g({ chest: [8, 26, 0], hips: { rot: [0, 24, 0] }, armL: { upper: [0.95, 0.05, -0.1], lower: [0.3, 0.2, 0.9] } }) },
            { t: 0.45, pose: g({ chest: [8, 4, 0], hips: { rot: [0, 4, 0] }, armL: { upper: [0.9, 0.1, 0.35], lower: [-0.1, 0.05, 1] } }) },
            { t: 0.65, pose: g({ chest: [8, -26, 0], hips: { rot: [0, -12, 0], pos: [0, 0, 0.02] }, armL: { upper: [0.7, 0.1, 0.65], lower: [-0.75, 0.05, 0.65] } }) },
            { t: 1, pose: {} },
        ],
    },
    uppercut: {
        duration: 1, base: GUARD,
        frames: [
            { t: 0, pose: {} },
            { t: 0.3, pose: g({ chest: [14, -8, 0], hips: { rot: [0, -8, 0], pos: [0, -0.07, 0] }, armR: { upper: [-0.25, -0.95, 0.15], lower: [-0.1, -0.7, 0.7] } }) },
            { t: 0.55, pose: g({ chest: [-6, 24, 0], hips: { rot: [0, 22, 0], pos: [0, 0.01, 0.03] }, armR: { upper: [-0.22, -0.3, 0.9], lower: [-0.1, 0.95, 0.3] } }) },
            { t: 0.75, pose: g({ chest: [-4, 20, 0], armR: { upper: [-0.22, -0.25, 0.9], lower: [-0.1, 0.95, 0.25] } }) },
            { t: 1, pose: {} },
        ],
    },
    block: {
        duration: 1, base: GUARD,
        frames: [
            { t: 0, pose: g({ chest: [16, 0, 0], head: [14, 0, 0], armL: { upper: [0.2, -0.45, 0.85], lower: [0.05, 0.9, 0.45] }, armR: { upper: [-0.2, -0.45, 0.85], lower: [-0.05, 0.9, 0.45] } }) },
            { t: 0.5, pose: g({ chest: [18, 0, 0], head: [16, 0, 0], hips: { pos: [0, -0.008, 0] }, armL: { upper: [0.2, -0.45, 0.85], lower: [0.05, 0.9, 0.45] }, armR: { upper: [-0.2, -0.45, 0.85], lower: [-0.05, 0.9, 0.45] } }) },
            { t: 1, pose: g({ chest: [16, 0, 0], head: [14, 0, 0], armL: { upper: [0.2, -0.45, 0.85], lower: [0.05, 0.9, 0.45] }, armR: { upper: [-0.2, -0.45, 0.85], lower: [-0.05, 0.9, 0.45] } }) },
        ],
    },
    hit: {
        duration: 1, base: GUARD,
        frames: [
            { t: 0, pose: {} },
            { t: 0.25, pose: g({ chest: [-26, -10, 6], head: [-24, 10, 0], hips: { pos: [0, 0, -0.04] }, armL: { upper: [0.6, -0.6, 0.1], lower: [0.5, -0.4, 0.6] }, armR: { upper: [-0.6, -0.6, 0.1], lower: [-0.5, -0.4, 0.6] } }) },
            { t: 0.6, pose: g({ chest: [-10, -4, 2], head: [-10, 4, 0], hips: { pos: [0, 0, -0.015] } }) },
            { t: 1, pose: {} },
        ],
    },
    stunned: {
        duration: 1.4, base: GUARD,
        frames: [
            { t: 0, pose: g({ chest: [10, 0, 9], head: [26, 0, -10], armL: { upper: [0.15, -1, 0.1], lower: [0.1, -1, 0.15] }, armR: { upper: [-0.15, -1, 0.1], lower: [-0.1, -1, 0.15] } }) },
            { t: 0.5, pose: g({ chest: [10, 0, -9], head: [26, 0, 10], armL: { upper: [0.15, -1, 0.1], lower: [0.1, -1, 0.15] }, armR: { upper: [-0.15, -1, 0.1], lower: [-0.1, -1, 0.15] } }) },
            { t: 1, pose: g({ chest: [10, 0, 9], head: [26, 0, -10], armL: { upper: [0.15, -1, 0.1], lower: [0.1, -1, 0.15] }, armR: { upper: [-0.15, -1, 0.1], lower: [-0.1, -1, 0.15] } }) },
        ],
    },
    ko: {
        duration: 1, base: {},
        frames: [
            { t: 0, pose: g({ hips: { rot: [0, 0, 0], pos: [0, 0, 0] } }) },
            { t: 0.3, pose: g({ hips: { rot: [-20, 0, 0], pos: [0, -0.06, -0.06] }, chest: [-15, 0, 0], head: [-30, 0, 0] }) },
            { t: 0.75, pose: g({ hips: { rot: [-88, 0, 0], pos: [0, -0.44, -0.12] }, head: [-10, 0, 0], armL: { upper: [0.7, -0.3, 0.1], lower: [0.7, -0.3, 0.2] }, armR: { upper: [-0.7, -0.3, 0.1], lower: [-0.7, -0.3, 0.2] } }) },
            { t: 1, pose: g({ hips: { rot: [-90, 0, 0], pos: [0, -0.455, -0.12] }, head: [-8, 0, 0], armL: { upper: [0.75, -0.2, 0.1], lower: [0.75, -0.2, 0.2] }, armR: { upper: [-0.75, -0.2, 0.1], lower: [-0.75, -0.2, 0.2] } }) },
        ],
    },
    dance: {
        duration: 1.2, base: GUARD,
        frames: [
            { t: 0, pose: g({ hips: { rot: [0, 25, 0], pos: [0, -0.02, 0] }, chest: [0, -20, 8], head: [0, 20, -6], armL: { upper: [0.9, 0.4, 0.1], lower: [0.7, 0.7, 0.2] }, armR: { upper: [-0.4, -0.9, 0.1], lower: [-0.3, -0.9, 0.3] } }) },
            { t: 0.5, pose: g({ hips: { rot: [0, -25, 0], pos: [0, 0.0, 0] }, chest: [0, 20, -8], head: [0, -20, 6], armL: { upper: [0.4, -0.9, 0.1], lower: [0.3, -0.9, 0.3] }, armR: { upper: [-0.9, 0.4, 0.1], lower: [-0.7, 0.7, 0.2] } }) },
            { t: 1, pose: g({ hips: { rot: [0, 25, 0], pos: [0, -0.02, 0] }, chest: [0, -20, 8], head: [0, 20, -6], armL: { upper: [0.9, 0.4, 0.1], lower: [0.7, 0.7, 0.2] }, armR: { upper: [-0.4, -0.9, 0.1], lower: [-0.3, -0.9, 0.3] } }) },
        ],
    },
};
