import { describe, expect, it } from 'vitest';
import { AnimationMixer, Bone, Group, Vector3, type Object3D } from 'three';
import { CLIP_KEYS } from './clips';
import { BONE_NAMES, normalizeBoneName, resolveRig } from './boneMaps';
import { buildSourceClips } from './sourceClips';
import { lateralYaw } from './fighterRig';
import type { BoneFamily } from './models';

const VB = 'ValveBipedBip01_'; // GLTFLoader strips the dot

/** A humanoid in character space (Y up, +X left, +Z forward), `tpose` or arms-down. */
function makeSkeleton(names: Record<string, string>, tpose: boolean, mirror = false) {
    const root = new Group();
    const bone = (key: string, parent: Object3D, x: number, y: number, z: number) => {
        const b = new Bone();
        b.name = names[key] ?? key;
        b.position.set(x, y, z);
        parent.add(b);
        return b;
    };
    const s = mirror ? -1 : 1;
    const pelvis = bone('hips', root, 0, 1, 0);
    const spine = bone('spine', pelvis, 0, 0.1, 0);
    const chest = bone('chest', spine, 0, 0.2, 0);
    const neck = bone('neck', chest, 0, 0.25, 0);
    bone('head', neck, 0, 0.1, 0);
    for (const [side, sx] of [['L', 1], ['R', -1]] as const) {
        const clav = bone(`clav${side}`, chest, sx * s * 0.05, 0.2, 0);
        const up = bone(`upperArm${side}`, clav, sx * s * 0.15, 0, 0);
        const fore = bone(`foreArm${side}`, up, tpose ? sx * s * 0.3 : sx * s * 0.08, tpose ? 0 : -0.28, 0);
        bone(`hand${side}`, fore, tpose ? sx * s * 0.25 : sx * s * 0.05, tpose ? 0 : -0.24, 0);
        const thigh = bone(`thigh${side}`, pelvis, sx * s * 0.1, -0.05, 0);
        const shin = bone(`shin${side}`, thigh, 0, -0.45, 0);
        const foot = bone(`foot${side}`, shin, 0, -0.45, 0);
        // The toes: out in front of the ankle and a little below it, as a standing foot's are.
        bone(`toe${side}`, foot, 0, -0.05, 0.2);
    }
    root.updateMatrixWorld(true);
    return root;
}

const vbNames: Record<string, string> = {
    hips: `${VB}Pelvis`, spine: `${VB}Spine`, chest: `${VB}Spine2`, neck: `${VB}Neck1`, head: `${VB}Head1`,
    clavL: `${VB}L_Clavicle`, upperArmL: `${VB}L_UpperArm`, foreArmL: `${VB}L_Forearm`, handL: `${VB}L_Hand`,
    clavR: `${VB}R_Clavicle`, upperArmR: `${VB}R_UpperArm`, foreArmR: `${VB}R_Forearm`, handR: `${VB}R_Hand`,
    thighL: `${VB}L_Thigh`, shinL: `${VB}L_Calf`, footL: `${VB}L_Foot`,
    thighR: `${VB}R_Thigh`, shinR: `${VB}R_Calf`, footR: `${VB}R_Foot`,
    toeL: `${VB}L_Toe0`, toeR: `${VB}R_Toe0`,
};

function pose(root: Group, clip: ReturnType<typeof buildSourceClips>[keyof ReturnType<typeof buildSourceClips>], at: number) {
    const mixer = new AnimationMixer(root);
    const action = mixer.clipAction(clip!);
    action.play();
    action.time = at;
    mixer.update(0);
    root.updateMatrixWorld(true);
}
const dir = (a: Object3D, b: Object3D) => b.getWorldPosition(new Vector3()).sub(a.getWorldPosition(new Vector3())).normalize();

describe('resolveRig', () => {
    it('matches names regardless of case and punctuation', () => {
        const root = makeSkeleton(vbNames, true);
        const rig = resolveRig(root, 'valvebiped');
        expect(Object.keys(rig)).toHaveLength(15);
        expect(normalizeBoneName('ValveBiped.Bip01_L_UpperArm')).toBe(normalizeBoneName('valvebipedBip01_l_upperarm'));
    });
    it('copes with a skeleton missing bones', () => {
        const root = new Group();
        const b = new Bone(); b.name = 'bip_pelvis'; root.add(b);
        expect(Object.keys(resolveRig(root, 'bip'))).toEqual(['hips']);
    });
    it('every family names every joint', () => {
        for (const fam of Object.keys(BONE_NAMES) as BoneFamily[]) {
            for (const list of Object.values(BONE_NAMES[fam])) expect(list.length).toBeGreaterThan(0);
        }
    });
});

describe('buildSourceClips', () => {
    for (const [label, tpose] of [['T-posed', true], ['arms-down', false]] as const) {
        describe(label + ' skeleton', () => {
            const root = makeSkeleton(vbNames, tpose);
            const rig = resolveRig(root, 'valvebiped');
            const clips = buildSourceClips(rig, { height: 1.8, worldScale: 1 });

            it('builds every clip', () => {
                for (const k of CLIP_KEYS) expect(clips[k], k).toBeDefined();
            });
            it('jab extends the lead (left) forearm straight forward', () => {
                const fresh = makeSkeleton(vbNames, tpose);
                const c = buildSourceClips(resolveRig(fresh, 'valvebiped'), { height: 1.8, worldScale: 1 });
                pose(fresh, c.jab, 0.4);
                const r = resolveRig(fresh, 'valvebiped');
                const d = dir(r.foreArmL!, fresh.getObjectByName(vbNames.handL)!);
                expect(d.z).toBeGreaterThan(0.8);
            });
            it('cross uses the right arm and leaves the left in guard', () => {
                const fresh = makeSkeleton(vbNames, tpose);
                const c = buildSourceClips(resolveRig(fresh, 'valvebiped'), { height: 1.8, worldScale: 1 });
                pose(fresh, c.cross, 0.45);
                const r = resolveRig(fresh, 'valvebiped');
                expect(dir(r.foreArmR!, fresh.getObjectByName(vbNames.handR)!).z).toBeGreaterThan(0.8);
                expect(dir(r.foreArmL!, fresh.getObjectByName(vbNames.handL)!).y).toBeGreaterThan(0.3);
            });
            it('ko lays the head down and drops the hips', () => {
                const fresh = makeSkeleton(vbNames, tpose);
                const c = buildSourceClips(resolveRig(fresh, 'valvebiped'), { height: 1.8, worldScale: 1 });
                pose(fresh, c.ko, 1);
                const head = fresh.getObjectByName(vbNames.head)!.getWorldPosition(new Vector3());
                expect(head.y).toBeLessThan(0.45);
                expect(head.z).toBeLessThan(-0.3);
            });
            it('keeps left on the left (+X) in guard', () => {
                const fresh = makeSkeleton(vbNames, tpose);
                const c = buildSourceClips(resolveRig(fresh, 'valvebiped'), { height: 1.8, worldScale: 1 });
                pose(fresh, c.idle, 0);
                const l = fresh.getObjectByName(vbNames.foreArmL)!.getWorldPosition(new Vector3());
                const r = fresh.getObjectByName(vbNames.foreArmR)!.getWorldPosition(new Vector3());
                expect(l.x).toBeGreaterThan(r.x);
            });
        });
    }

    it('mirrored skeletons get their sides swapped so jab still uses the lead hand on +X', () => {
        const fresh = makeSkeleton(vbNames, true, true);
        const c = buildSourceClips(resolveRig(fresh, 'valvebiped'), { height: 1.8, worldScale: 1 });
        pose(fresh, c.jab, 0.4);
        // the +X-side forearm (named R here) is the one that jabs
        const hand = fresh.getObjectByName(vbNames.handR)!;
        expect(dir(fresh.getObjectByName(vbNames.foreArmR)!, hand).z).toBeGreaterThan(0.8);
    });

    it('returns nothing (not a throw) for a skeleton with no pelvis', () => {
        expect(buildSourceClips({}, { height: 1.8, worldScale: 1 })).toEqual({});
    });

    it('scales hips displacement by the model scale', () => {
        const fresh = makeSkeleton(vbNames, true);
        const c = buildSourceClips(resolveRig(fresh, 'valvebiped'), { height: 1.8, worldScale: 0.5 });
        const track = c.ko!.tracks.find((t) => t.name.endsWith('.position'))!;
        const last = track.values[track.values.length - 2]; // y at the last key
        // rest y = 1; drop 0.455 * 1.8 m at scale 0.5 => local drop of ~1.638
        expect(last).toBeCloseTo(1 - (0.455 * 1.8) / 0.5, 1);
    });
});

describe('lateralYaw', () => {
    const v = (x: number, z: number) => new Vector3(x, 1.4, z);
    it('is 0 when the left shoulder is already on +X', () => {
        expect(lateralYaw(v(0.2, 0), v(-0.2, 0))).toBeCloseTo(0);
    });
    it('turns a model whose arms run along Z (HL2 after the frame) so left lands on +X', () => {
        for (const [l, r] of [[v(0, 0.2), v(0, -0.2)], [v(0, -0.2), v(0, 0.2)], [v(-0.2, 0), v(0.2, 0)], [v(0.1, 0.15), v(-0.1, -0.15)]]) {
            const yaw = lateralYaw(l, r);
            const turned = l.clone().sub(r).applyAxisAngle(new Vector3(0, 1, 0), yaw);
            expect(turned.x).toBeGreaterThan(0.2);
            expect(Math.abs(turned.z)).toBeLessThan(1e-9);
        }
    });
    it('does not blow up when the shoulders are stacked', () => {
        expect(lateralYaw(new Vector3(0, 1, 0), new Vector3(0, 0.5, 0))).toBe(0);
    });
});

describe('idle bounce', () => {
    const lowestFootPoint = (root: Group): number => {
        let lo = Infinity;
        for (const n of ['L_Foot', 'R_Foot', 'L_Toe0', 'R_Toe0']) {
            lo = Math.min(lo, root.getObjectByName(`${VB}${n}`)!.getWorldPosition(new Vector3()).y);
        }
        return lo;
    };
    const at = (t: number) => {
        const fresh = makeSkeleton(vbNames, false);
        const c = buildSourceClips(resolveRig(fresh, 'valvebiped'), { height: 1.65, worldScale: 1 });
        pose(fresh, c.idle, t);
        return fresh;
    };
    const duration = (() => {
        const fresh = makeSkeleton(vbNames, false);
        return buildSourceClips(resolveRig(fresh, 'valvebiped'), { height: 1.65, worldScale: 1 }).idle!.duration;
    })();

    it('loops without a seam: the last key is the first', () => {
        const fresh = makeSkeleton(vbNames, false);
        const idle = buildSourceClips(resolveRig(fresh, 'valvebiped'), { height: 1.65, worldScale: 1 }).idle!;
        for (const track of idle.tracks) {
            const n = track.getValueSize();
            const v = track.values;
            for (let k = 0; k < n; k++) expect(v[v.length - n + k]).toBeCloseTo(v[k], 5);
        }
    });

    it('bounces: the body rises and falls several centimetres every cycle', () => {
        const hipsY = (t: number) => at(t).getObjectByName(`${VB}Pelvis`)!.getWorldPosition(new Vector3()).y;
        const ys = [0, 0.25, 0.5, 0.75].map((f) => hipsY(f * duration));
        expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(0.04);
        expect(ys[2]).toBeGreaterThan(ys[0]); // up on the toes at mid-cycle
        expect(ys[1]).toBeCloseTo(ys[3], 2);   // and symmetric on the way down
    });

    it('stays on the balls of the feet: heels lift at the top while the toes stay on the floor', () => {
        const dirY = (root: Group) => {
            const foot = root.getObjectByName(`${VB}L_Foot`)!.getWorldPosition(new Vector3());
            return root.getObjectByName(`${VB}L_Toe0`)!.getWorldPosition(new Vector3()).sub(foot).normalize().y;
        };
        const bottom = at(0);
        const top = at(duration * 0.5);
        expect(dirY(top)).toBeLessThan(dirY(bottom) - 0.25); // toes pitched well down at the top
        // the lowest point of either foot never sinks through the floor (y = 0) nor floats high
        for (const f of [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875]) {
            const lo = lowestFootPoint(at(duration * f));
            expect(lo).toBeGreaterThan(-0.03);
            expect(lo).toBeLessThan(0.04);
        }
    });

    it('keeps the guard up while bouncing: both fists stay near face height and in front', () => {
        for (const f of [0, 0.5]) {
            const root = at(duration * f);
            for (const side of ['L', 'R']) {
                const hand = root.getObjectByName(`${VB}${side}_Hand`)!.getWorldPosition(new Vector3());
                expect(hand.y).toBeGreaterThan(1.05);
                expect(hand.z).toBeGreaterThan(0.1);
            }
        }
    });

    it('still builds when a skeleton has no foot bones (no foot tracks, no throw)', () => {
        const noFeet = Object.fromEntries(Object.entries(vbNames).filter(([k]) => !/^(foot|toe)/.test(k)));
        const root = makeSkeleton(noFeet, false);
        const rig = resolveRig(root, 'valvebiped');
        expect(rig.footL).toBeUndefined();
        const clips = buildSourceClips(rig, { height: 1.65, worldScale: 1 });
        expect(clips.idle).toBeDefined();
        // (the unnamed foot bones still exist in this fixture, but nothing maps them, so nothing animates them)
        expect(clips.idle!.tracks.some((t) => /^foot[LR]\./.test(t.name))).toBe(false);
    });
});
