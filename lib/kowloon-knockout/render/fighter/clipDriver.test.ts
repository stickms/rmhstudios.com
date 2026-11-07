import { describe, expect, it } from 'vitest';
import { AnimationClip, AnimationMixer, Object3D, VectorKeyframeTrack, type AnimationAction } from 'three';
import type { ClipKey } from './clips';
import { ClipDriver, blendTime, type DriveInput } from './clipDriver';
import { damp, dampAngle } from './damp';
import { flashStyle, reactionPose } from './reactionPose';

function rig() {
    const root = new Object3D();
    const mixer = new AnimationMixer(root);
    const actions: Partial<Record<ClipKey, AnimationAction>> = {};
    const keys: ClipKey[] = ['idle', 'walk', 'jab', 'cross', 'hit'];
    keys.forEach((k, i) => {
        const clip = new AnimationClip(k, 1, [new VectorKeyframeTrack('.position', [0, 1], [i, 0, 0, i + 10, 0, 0])]);
        actions[k] = mixer.clipAction(clip);
    });
    return { root, mixer, actions, driver: new ClipDriver() };
}
const input = (want: ClipKey, p = 0, over: Partial<DriveInput> = {}): DriveInput => ({
    want, actionProgress: p, punchFrame: Math.round(p * 10), state: want === 'jab' || want === 'cross' ? 'punching' : 'idle', ...over,
});

describe('blendTime', () => {
    it('is long out of a one-shot, short into one, and never zero', () => {
        expect(blendTime('jab', 'idle')).toBeGreaterThanOrEqual(0.22);
        expect(blendTime('hit', 'walk')).toBeGreaterThanOrEqual(0.22);
        expect(blendTime('idle', 'jab')).toBeLessThanOrEqual(0.1);
        expect(blendTime('jab', 'cross')).toBeLessThanOrEqual(0.1);
        expect(blendTime('idle', 'ko')).toBeCloseTo(0.12);
        expect(blendTime('idle', 'walk')).toBeGreaterThanOrEqual(0.15);
        expect(blendTime(null, 'idle')).toBeGreaterThan(0);
    });
});

describe('ClipDriver', () => {
    it('starts the first clip and crossfades into a punch instead of cutting to it', () => {
        const { mixer, actions, driver } = rig();
        driver.update(mixer, actions, input('idle'), 1 / 60);
        expect(driver.current).toBe('idle');
        driver.update(mixer, actions, input('jab', 0), 1 / 60);
        driver.update(mixer, actions, input('jab', 0.05), 0.03);
        const idleW = actions.idle!.getEffectiveWeight();
        const jabW = actions.jab!.getEffectiveWeight();
        expect(jabW).toBeGreaterThan(0);
        expect(jabW).toBeLessThan(1);
        expect(idleW).toBeGreaterThan(0);          // still blending out, not cut
        expect(idleW + jabW).toBeCloseTo(1, 1);
    });

    it('leaves a punch with a long blend: a tenth of a second after, the punch is still contributing', () => {
        const { mixer, actions, driver } = rig();
        driver.update(mixer, actions, input('jab', 0), 1 / 60);
        driver.update(mixer, actions, input('jab', 1), 1 / 60);
        driver.update(mixer, actions, input('idle'), 1 / 60);
        for (let i = 0; i < 6; i++) driver.update(mixer, actions, input('idle'), 1 / 60); // +0.1 s
        expect(actions.jab!.getEffectiveWeight()).toBeGreaterThan(0.2);
        expect(actions.idle!.getEffectiveWeight()).toBeLessThan(0.8);
    });

    it('follows the sim\'s stair-stepped progress smoothly: monotonic, never ahead of it, close behind', () => {
        const { mixer, actions, driver } = rig();
        driver.update(mixer, actions, input('jab', 0), 1 / 144);
        let prev = 0;
        let worstLag = 0;
        for (let f = 0; f <= 60; f++) {
            const goal = Math.min(1, Math.floor(f / 9) / 6); // the sim ticks at 60 Hz, the display at 144: steps
            driver.update(mixer, actions, input('jab', goal), 1 / 144);
            const t = actions.jab!.time;
            expect(t).toBeGreaterThanOrEqual(prev - 1e-9);
            expect(t).toBeLessThanOrEqual(goal + 1e-9);
            worstLag = Math.max(worstLag, goal - t);
            prev = t;
        }
        expect(worstLag).toBeLessThan(0.2);
    });

    it('restarts the same punch thrown twice in a row (progress drops back to the start)', () => {
        const { mixer, actions, driver } = rig();
        driver.update(mixer, actions, input('jab', 0), 1 / 60);
        for (let i = 1; i <= 20; i++) driver.update(mixer, actions, input('jab', Math.min(1, i / 12)), 1 / 60);
        expect(actions.jab!.time).toBeGreaterThan(0.8);
        driver.update(mixer, actions, input('jab', 0.04), 1 / 60); // the second jab: state never left 'punching'
        expect(driver.current).toBe('jab');
        expect(actions.jab!.time).toBeLessThan(0.1);
    });

    it('does not restart on the ordinary rise of progress', () => {
        const { mixer, actions, driver } = rig();
        driver.update(mixer, actions, input('jab', 0), 1 / 60);
        let last = 0;
        for (let i = 1; i <= 12; i++) {
            driver.update(mixer, actions, input('jab', i / 12), 1 / 60);
            expect(actions.jab!.time).toBeGreaterThanOrEqual(last - 1e-9);
            last = actions.jab!.time;
        }
    });

    it('debounces a one-frame idle↔walk flicker, but follows a sustained change', () => {
        const { mixer, actions, driver } = rig();
        driver.update(mixer, actions, input('idle'), 1 / 60);
        driver.update(mixer, actions, input('walk'), 1 / 60);   // stray frame
        driver.update(mixer, actions, input('idle'), 1 / 60);
        expect(driver.current).toBe('idle');
        for (let i = 0; i < 8; i++) driver.update(mixer, actions, input('walk'), 1 / 60);
        expect(driver.current).toBe('walk');
    });

    it('freezes on a hit-stop (dt 0): neither the one-shot nor the mixer advances', () => {
        const { mixer, actions, driver } = rig();
        driver.update(mixer, actions, input('jab', 0), 1 / 60);
        driver.update(mixer, actions, input('jab', 0.4), 1 / 60);
        const t = actions.jab!.time;
        for (let i = 0; i < 10; i++) driver.update(mixer, actions, input('jab', 0.9), 0);
        expect(actions.jab!.time).toBeCloseTo(t, 6);
    });

    it('holds the current clip, without throwing, when the wanted one has not loaded yet', () => {
        const { mixer, actions, driver } = rig();
        delete actions.cross;
        driver.update(mixer, actions, input('idle'), 1 / 60);
        expect(() => driver.update(mixer, actions, input('cross', 0.2), 1 / 60)).not.toThrow();
        expect(driver.current).toBe('idle');
        // when it arrives, it is taken up
        actions.cross = mixer.clipAction(new AnimationClip('cross', 1, [new VectorKeyframeTrack('.position', [0, 1], [0, 0, 0, 1, 0, 0])]));
        driver.update(mixer, actions, input('cross', 0.2), 1 / 60);
        expect(driver.current).toBe('cross');
    });

    it('reset() forgets the clip so a rebuilt mixer starts clean', () => {
        const { mixer, actions, driver } = rig();
        driver.update(mixer, actions, input('walk'), 1 / 60);
        driver.reset();
        expect(driver.current).toBeNull();
    });
});

describe('damp', () => {
    it('is frame-rate independent: one second lands in the same place at 30, 60 and 144 fps', () => {
        const run = (fps: number) => { let v = 0; for (let i = 0; i < fps; i++) v = damp(v, 10, 8, 1 / fps); return v; };
        expect(run(30)).toBeCloseTo(run(144), 3);
        expect(run(60)).toBeCloseTo(run(144), 3);
        expect(run(60)).toBeGreaterThan(9.9);
    });
    it('does not move on dt <= 0 or NaN dt, and never overshoots', () => {
        expect(damp(1, 5, 10, 0)).toBe(1);
        expect(damp(1, 5, 10, -1)).toBe(1);
        expect(damp(1, 5, 10, NaN)).toBe(1);
        expect(damp(1, 5, 1000, 10)).toBeLessThanOrEqual(5);
    });
    it('dampAngle takes the short way round', () => {
        const a = dampAngle(3.0, -3.0, 100, 1); // 3.0 and -3.0 are 0.28 rad apart across ±π
        expect(Math.abs(Math.abs(a) - Math.PI)).toBeLessThan(0.3);
    });
});

describe('reactionPose / flashStyle', () => {
    const r = { ox: 0.2, oz: -0.1, squash: 0.1, lean: 0.3, dirX: 1, dirZ: 0 };
    it('passes the offset through and squashes about the feet, keeping some volume', () => {
        const p = reactionPose(r, 0);
        expect([p.dx, p.dz]).toEqual([0.2, -0.1]);
        expect(p.sy).toBeCloseTo(0.9);
        expect(p.sx).toBeGreaterThan(1);
        expect(p.sx).toBe(p.sz);
    });
    it('leans along the blow: the axis is horizontal, unit, perpendicular to it, and follows the root\'s yaw', () => {
        for (const yaw of [0, 0.7, -2.2, Math.PI]) {
            const p = reactionPose(r, yaw);
            expect(Math.hypot(p.axisX, p.axisZ)).toBeCloseTo(1, 6);
            // back in the world: rotate by +yaw → must be Y × dir = (dirZ, 0, -dirX) = (0, 0, -1)
            const wx = p.axisX * Math.cos(yaw) + p.axisZ * Math.sin(yaw);
            const wz = -p.axisX * Math.sin(yaw) + p.axisZ * Math.cos(yaw);
            expect(wx).toBeCloseTo(0, 6);
            expect(wz).toBeCloseTo(-1, 6);
        }
    });
    it('flash: a heavy fresh hit is white-hot then settles to the old red; a block stays cool; the sim\'s own flash still works', () => {
        const hot = flashStyle(1, 'hit', 0);
        const cool = flashStyle(0.6, 'hit', 0);
        expect(hot.color[1]).toBeGreaterThan(0.9);       // white-ish
        expect(cool.color[1]).toBeLessThan(0.3);         // red
        expect(hot.amount).toBeGreaterThan(cool.amount);
        expect(hot.amount).toBeLessThanOrEqual(0.65); // never a flat white cut-out
        const block = flashStyle(0.5, 'block', 0);
        expect(block.color[2]).toBeGreaterThan(block.color[0]); // blue-white, not red
        const legacy = flashStyle(0, 'hit', 8);
        expect(legacy.amount).toBeGreaterThan(0.7);
        expect(flashStyle(0, 'hit', 0).amount).toBe(0);
        expect(flashStyle(NaN, 'hit', 0).amount).toBeGreaterThanOrEqual(0);
    });
});

describe('ClipDriver locomotion speed', () => {
    it('plays a walk at the cadence it is given, forward or backward, and everything else at 1', () => {
        const { mixer, actions, driver } = rig();
        driver.update(mixer, actions, { ...input('walk'), locoScale: 1.7 }, 1 / 60);
        expect(actions.walk!.timeScale).toBeCloseTo(1.7);
        driver.update(mixer, actions, { ...input('walk'), locoScale: -1.2 }, 1 / 60);
        expect(actions.walk!.timeScale).toBeCloseTo(-1.2);
        // a reversed loop keeps looping (time never runs off the end) and moves backward through the clip
        const t0 = actions.walk!.time;
        driver.update(mixer, actions, { ...input('walk'), locoScale: -1 }, 0.05);
        expect(actions.walk!.time).not.toBeCloseTo(t0, 3);
        driver.update(mixer, actions, input('jab', 0), 1 / 60);
        expect(actions.jab!.timeScale).toBe(1);
    });
});
