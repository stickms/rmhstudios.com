import { describe, expect, it } from 'vitest';
import { AnimationMixer, Bone, Group, Vector3, type Object3D } from 'three';
import { CLIP_KEYS } from './clips';
import { BONE_NAMES, normalizeBoneName, resolveRig } from './boneMaps';
import { buildSourceClips } from './sourceClips';
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
        bone(`foot${side}`, shin, 0, -0.45, 0);
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
        expect(Object.keys(rig)).toHaveLength(13);
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
