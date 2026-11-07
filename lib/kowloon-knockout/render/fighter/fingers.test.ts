import { describe, expect, it } from 'vitest';
import { AnimationClip, AnimationMixer, Bone, Group, Object3D, Quaternion, QuaternionKeyframeTrack, Vector3 } from 'three';
import type { ClipKey } from './clips';
import { CLIPS } from './clips';
import { applyFists, handFrame, tightness } from './fingers';
import type { BoneFamily } from './models';

type Side = 'l' | 'r';
const NAMES = ['thumb', 'index', 'middle', 'ring', 'pinky'] as const;
type FingerName = (typeof NAMES)[number];

/** The bone name of one finger segment for each family, as GLTFLoader leaves it (dots stripped for ValveBiped). */
function boneName(family: BoneFamily, side: Side, finger: FingerName, seg: number): string {
    if (family === 'bip') return `bip_${finger}_${seg}_${side}`;
    if (family === 'csgo') return `finger_${finger}_${seg}_${side}`;
    const n = NAMES.indexOf(finger);
    return `ValveBipedBip01_${side.toUpperCase()}_Finger${n}${seg === 0 ? '' : seg}`;
}

/**
 * A palms-down T-pose fragment: the left hand at +X pointing +X with the thumb forward (+Z), the right hand
 * mirrored at -X pointing -X, thumb forward too. Each finger is 3 bones of 4 cm along the hand. `rot` turns
 * every finger bone's local frame by an arbitrary rotation (as converters do), so the tests also prove the curl
 * axis does not depend on how the bones are oriented.
 */
function makeHands(family: BoneFamily, opts: { skip?: string[]; rot?: boolean } = {}): Group {
    const root = new Group();
    for (const side of ['l', 'r'] as const) {
        const dir = side === 'l' ? 1 : -1;
        const hand = new Bone();
        hand.name = `hand_${side}`;
        hand.position.set(dir * 0.6, 1.4, 0);
        root.add(hand);
        const lateral: Record<FingerName, number> = { thumb: 0.045, index: 0.03, middle: 0.01, ring: -0.01, pinky: -0.03 };
        for (const finger of NAMES) {
            let parent: Object3D = hand;
            for (let seg = 0; seg < 3; seg++) {
                const name = boneName(family, side, finger, seg);
                if (opts.skip?.includes(name)) continue;
                const b = new Bone();
                b.name = name;
                b.position.set(seg === 0 ? dir * 0.06 : dir * 0.04, 0, seg === 0 ? lateral[finger] : 0);
                if (opts.rot) b.quaternion.setFromAxisAngle(new Vector3(0.3, 0.8, 0.5).normalize(), 0.9 * (seg + 1));
                parent.add(b);
                parent = b;
            }
        }
    }
    root.updateMatrixWorld(true);
    return root;
}

function clips(keys: ClipKey[]) {
    return Object.fromEntries(keys.map((k) => [k, new AnimationClip(`kk_${k}`, k === 'idle' ? 0.9 : 1, [])])) as Partial<Record<ClipKey, AnimationClip>>;
}

/** Pose the model with `clip` at `t` and return a bone's world position. */
function at(model: Group, clip: AnimationClip, t: number, bone: string): Vector3 {
    const m = new AnimationMixer(model);
    const a = m.clipAction(clip);
    a.play();
    a.time = t;
    m.update(0);
    model.updateMatrixWorld(true);
    return model.getObjectByName(bone)!.getWorldPosition(new Vector3());
}

const FAMILIES: BoneFamily[] = ['bip', 'valvebiped', 'csgo'];

describe('applyFists', () => {
    for (const family of FAMILIES) {
        describe(family, () => {
            it('adds a quaternion track per finger bone it finds, named like the bone', () => {
                const model = makeHands(family);
                const c = clips(['idle']);
                applyFists(c, model, family);
                const names = c.idle!.tracks.map((t) => t.name);
                expect(names.length).toBe(30); // 2 hands × 5 fingers × 3 bones
                expect(names).toContain(`${boneName(family, 'l', 'index', 1)}.quaternion`);
                expect(names).toContain(`${boneName(family, 'r', 'thumb', 2)}.quaternion`);
                for (const t of c.idle!.tracks) expect(t.name.endsWith('.quaternion')).toBe(true);
            });

            it('curls INTO the palm for both hands: fingertips drop below a palms-down hand and pull back toward the wrist', () => {
                for (const side of ['l', 'r'] as const) {
                    // a fresh model per hand: posing one hand's clip curls BOTH hands, so "open" must be read first
                    const model = makeHands(family);
                    const c = clips(['idle']);
                    applyFists(c, model, family);
                    const tip = boneName(family, side, 'middle', 2);
                    const open = model.getObjectByName(tip)!.getWorldPosition(new Vector3());
                    const closed = at(model, c.idle!, 0.2, tip);
                    const dir = side === 'l' ? 1 : -1;
                    expect(closed.y).toBeLessThan(open.y - 0.02);
                    expect(closed.x * dir).toBeLessThan(open.x * dir - 0.01);
                }
            });

            it('wraps the thumb across the palm toward the fingers, not away from them', () => {
                for (const side of ['l', 'r'] as const) {
                    const model = makeHands(family);
                    const c = clips(['idle']);
                    applyFists(c, model, family);
                    const tip = boneName(family, side, 'thumb', 2);
                    const open = model.getObjectByName(tip)!.getWorldPosition(new Vector3());
                    const closed = at(model, c.idle!, 0.2, tip);
                    expect(closed.y).toBeLessThan(open.y); // into the palm
                    expect(closed.z).toBeLessThan(open.z); // toward the pinky side (the thumb side is +z)
                }
            });

            it('does not depend on how the bones happen to be oriented', () => {
                const plain = makeHands(family);
                const odd = makeHands(family, { rot: true });
                const cp = clips(['idle']);
                const co = clips(['idle']);
                applyFists(cp, plain, family);
                applyFists(co, odd, family);
                const tip = boneName(family, 'l', 'index', 2);
                const drop = (m: Group, c: Partial<Record<ClipKey, AnimationClip>>) =>
                    m.getObjectByName(tip)!.getWorldPosition(new Vector3()).y - at(m, c.idle!, 0.2, tip).y;
                // The rotated skeleton sits in a different bind pose, so compare the curl direction (down), not the size.
                expect(drop(plain, cp)).toBeGreaterThan(0.02);
                expect(drop(odd, co)).toBeGreaterThan(0.0);
            });
        });
    }

    it('matches dot-stripped ValveBiped names and the original dotted ones alike', () => {
        const model = makeHands('valvebiped');
        const c = clips(['idle']);
        applyFists(c, model, 'valvebiped');
        expect(c.idle!.tracks.length).toBeGreaterThan(0);
        model.traverse((o) => {
            if (o.name.startsWith('ValveBipedBip01_L_Finger1')) o.name = o.name.replace('ValveBipedBip01', 'ValveBiped.Bip01');
        });
        const c2 = clips(['idle']);
        applyFists(c2, model, 'valvebiped');
        expect(c2.idle!.tracks.length).toBe(c.idle!.tracks.length);
    });

    it('only adds tracks for bones that exist, and skips a finger whose chain is incomplete', () => {
        const skip = [boneName('bip', 'l', 'ring', 2), boneName('bip', 'r', 'thumb', 0)];
        const model = makeHands('bip', { skip });
        const c = clips(['idle', 'jab']);
        applyFists(c, model, 'bip');
        const names = new Set(c.idle!.tracks.map((t) => t.name));
        for (const s of skip) expect(names.has(`${s}.quaternion`)).toBe(false);
        // a ring finger with a missing tip is skipped whole; the rest of that hand still curls
        expect(names.has(`${boneName('bip', 'l', 'ring', 0)}.quaternion`)).toBe(false);
        expect(names.has(`${boneName('bip', 'l', 'index', 0)}.quaternion`)).toBe(true);
        const real = new Set<string>();
        model.traverse((o) => real.add(o.name));
        for (const t of c.idle!.tracks) expect(real.has(t.name.replace('.quaternion', ''))).toBe(true);
    });

    it('does nothing, without throwing, on a skeleton with no fingers or with no hands at all', () => {
        const c = clips(['idle', 'ko']);
        expect(() => applyFists(c, new Group(), 'bip')).not.toThrow();
        expect(c.idle!.tracks).toHaveLength(0);
        const skip = NAMES.flatMap((f) => [0, 1, 2].flatMap((s) => (['l', 'r'] as const).map((sd) => boneName('csgo', sd, f, s))));
        expect(() => applyFists(c, makeHands('csgo', { skip }), 'csgo')).not.toThrow();
        expect(c.ko!.tracks).toHaveLength(0);
        expect(() => applyFists({}, makeHands('bip'), 'bip')).not.toThrow();
    });

    it('writes unit quaternions, and loops end exactly where they start', () => {
        const model = makeHands('bip');
        const keys: ClipKey[] = ['idle', 'walk', 'block', 'stunned', 'dance', 'jab', 'hit', 'ko'];
        const c = clips(keys);
        applyFists(c, model, 'bip');
        for (const k of keys) {
            for (const t of c[k]!.tracks) {
                const v = t.values;
                for (let i = 0; i < v.length; i += 4) expect(Math.hypot(v[i], v[i + 1], v[i + 2], v[i + 3])).toBeCloseTo(1, 5);
                expect(t.times[0]).toBe(0);
                expect(t.times[t.times.length - 1]).toBeCloseTo(c[k]!.duration, 6);
                if (CLIPS[k].loop) for (let q = 0; q < 4; q++) expect(v[v.length - 4 + q]).toBeCloseTo(v[q], 5);
            }
        }
    });

    it('never overwrites a track the clip already has for that bone', () => {
        const model = makeHands('bip');
        const c = clips(['idle']);
        const bone = boneName('bip', 'l', 'index', 0);
        const authored = new QuaternionKeyframeTrack(`${bone}.quaternion`, [0, 0.9], [0, 0, 0, 1, 0, 0, 0, 1]);
        c.idle!.tracks.push(authored);
        applyFists(c, model, 'bip');
        const mine = c.idle!.tracks.filter((t) => t.name === `${bone}.quaternion`);
        expect(mine).toHaveLength(1);
        expect(mine[0]).toBe(authored);
        const before = c.idle!.tracks.length;
        applyFists(c, model, 'bip'); // a second call must not stack another set of tracks
        expect(c.idle!.tracks.length).toBe(before);
    });

    it('a mirrored sign for the two hands: the same clip curls both toward their own palms', () => {
        for (const side of ['l', 'r'] as const) {
            const model = makeHands('csgo');
            const c = clips(['jab']);
            applyFists(c, model, 'csgo');
            const tip = boneName('csgo', side, 'index', 2);
            const open = model.getObjectByName(tip)!.getWorldPosition(new Vector3());
            expect(at(model, c.jab!, 0.45, tip).y).toBeLessThan(open.y - 0.02);
        }
    });
});

describe('tightness by clip', () => {
    const avg = (key: ClipKey) => {
        let sum = 0;
        for (let i = 0; i <= 20; i++) sum += tightness(key, 'l', i / 20);
        return sum / 21;
    };
    it('orders the hand from a clenched guard to limp: guard > walk > stunned and ko', () => {
        expect(avg('block')).toBeGreaterThan(avg('idle'));
        expect(avg('idle')).toBeGreaterThan(avg('walk'));
        expect(avg('walk')).toBeGreaterThan(avg('stunned'));
        expect(avg('walk')).toBeGreaterThan(avg('ko'));
        expect(avg('idle')).toBeGreaterThan(0.85);
    });
    it('closes the striking fist tighter at the peak than at the start, and leaves the guard hand shut', () => {
        for (const [clip, hand, other] of [['jab', 'l', 'r'], ['cross', 'r', 'l'], ['hook', 'l', 'r'], ['uppercut', 'r', 'l']] as const) {
            expect(tightness(clip, hand, 0.55)).toBeGreaterThan(tightness(clip, hand, 0.02) + 0.08);
            expect(tightness(clip, hand, 0.55)).toBeGreaterThan(0.95);
            expect(tightness(clip, other, 0.5)).toBeGreaterThan(0.85);
        }
    });
    it('opens when hit and goes limp when knocked out', () => {
        expect(tightness('hit', 'l', 0.25)).toBeLessThan(tightness('hit', 'l', 0) - 0.15);
        expect(tightness('ko', 'l', 1)).toBeLessThan(0.15);
    });
    it('stays within 0..1 for every clip, side and time, and loops are seamless', () => {
        const all: ClipKey[] = ['idle', 'walk', 'jab', 'cross', 'hook', 'uppercut', 'block', 'hit', 'stunned', 'ko', 'dance'];
        for (const k of all) {
            for (const side of ['l', 'r'] as const) {
                for (let i = 0; i <= 50; i++) {
                    const t = tightness(k, side, i / 50);
                    expect(t).toBeGreaterThanOrEqual(0);
                    expect(t).toBeLessThanOrEqual(1);
                }
                if (CLIPS[k].loop) expect(tightness(k, side, 1)).toBeCloseTo(tightness(k, side, 0), 5);
            }
        }
    });
    it('fingers are not one constant: the loops flutter', () => {
        const vals = Array.from({ length: 30 }, (_, i) => tightness('idle', 'l', i / 30));
        expect(Math.max(...vals) - Math.min(...vals)).toBeGreaterThan(0.03);
    });
});

describe('handFrame', () => {
    it('finds the palm normal by chirality: palms-down for both hands (n = -Y), hinge perpendicular to the hand', () => {
        for (const family of FAMILIES) {
            const model = makeHands(family);
            const get = (side: Side, finger: FingerName) => [0, 1, 2].map((s) => model.getObjectByName(boneName(family, side, finger, s))!);
            for (const side of ['l', 'r'] as const) {
                const frame = handFrame({
                    side,
                    fingers: { index: get(side, 'index'), middle: get(side, 'middle'), ring: get(side, 'ring'), pinky: get(side, 'pinky') },
                    metas: {},
                    thumb: get(side, 'thumb'),
                })!;
                expect(frame.n.y).toBeLessThan(-0.99);
                expect(Math.abs(frame.k.dot(frame.f))).toBeLessThan(1e-6);
                expect(Math.abs(frame.k.dot(frame.n))).toBeLessThan(1e-6);
            }
        }
    });
    it('is null for a degenerate hand rather than NaN axes', () => {
        const flat = [new Bone(), new Bone(), new Bone()];
        new Group().add(...flat);
        expect(handFrame({ side: 'l', fingers: { index: flat, middle: flat, ring: flat, pinky: flat }, metas: {}, thumb: [] })).toBeNull();
    });
});

describe('quaternion sanity', () => {
    it('uses the same three classes (guards a duplicate-three install)', () => {
        expect(new Quaternion().isQuaternion).toBe(true);
    });
});
