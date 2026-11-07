import { describe, expect, it } from 'vitest';
import {
    ImpactBus, SHAKE_MAX_OFFSET, TRAUMA_DECAY, impactProfile, powerWeight, shakeSample, type ImpactEvent,
} from './impact';

const hit = (over: Partial<ImpactEvent> = {}): ImpactEvent => ({
    kind: 'hit', victim: 1, attacker: 0, power: 14, x: 1, y: 1.1, z: 0, dirX: 1, dirZ: 0, ...over,
});

describe('impact profiles', () => {
    it('grow with damage, and stay finite and in range for any damage', () => {
        const light = impactProfile('hit', 4);
        const heavy = impactProfile('hit', 40);
        for (const k of ['trauma', 'hitStopMs', 'recoil', 'squash', 'flash', 'ringSize', 'sparks', 'fovKick'] as const) {
            expect(heavy[k]).toBeGreaterThan(light[k]);
        }
        for (const power of [-5, 0, 1e6]) {
            const p = impactProfile('hit', power);
            expect(p.trauma).toBeGreaterThan(0);
            expect(p.trauma).toBeLessThanOrEqual(1);
            expect(p.hitStopMs).toBeLessThan(200);
        }
        expect(powerWeight(-10)).toBe(0);
        expect(powerWeight(1e6)).toBe(1);
    });
    it('a block is a hard short stop: sparks and a freeze, little knock-back, less shake than a heavy hit', () => {
        const block = impactProfile('block', 14);
        const heavy = impactProfile('hit', 30);
        expect(block.hitStopMs).toBeGreaterThanOrEqual(50);
        expect(block.sparks).toBeGreaterThanOrEqual(18);
        expect(block.recoil).toBeLessThan(heavy.recoil);
        expect(block.trauma).toBeLessThan(heavy.trauma);
        expect(block.trauma).toBeGreaterThan(0.15); // still felt
    });
    it('a knockout is the biggest thing: max trauma, longest freeze, slow motion', () => {
        const ko = impactProfile('ko', 30);
        const heavy = impactProfile('hit', 45);
        expect(ko.trauma).toBe(1);
        expect(ko.hitStopMs).toBeGreaterThan(heavy.hitStopMs);
        expect(ko.slowMo).toBeLessThan(0.5);
        expect(ko.slowMoMs).toBeGreaterThan(400);
        expect(ko.ringSize).toBeGreaterThan(heavy.ringSize);
    });
});

describe('camera shake', () => {
    it('is zero at zero trauma and bounded at full trauma', () => {
        expect(shakeSample(0, 3)).toEqual({ x: 0, y: 0, roll: 0 });
        for (let t = 0; t < 3; t += 0.01) {
            const s = shakeSample(1, t);
            expect(Math.abs(s.x)).toBeLessThanOrEqual(SHAKE_MAX_OFFSET);
            expect(Math.abs(s.y)).toBeLessThanOrEqual(SHAKE_MAX_OFFSET);
        }
    });
    it('is smooth: no frame-to-frame jump bigger than a small fraction of the range, at 144 Hz', () => {
        let prev = shakeSample(1, 0);
        let worst = 0;
        for (let t = 1 / 144; t < 2; t += 1 / 144) {
            const s = shakeSample(1, t);
            worst = Math.max(worst, Math.abs(s.x - prev.x));
            prev = s;
        }
        expect(worst).toBeLessThan(SHAKE_MAX_OFFSET * 0.4);
    });
    it('small trauma is much gentler than big trauma (amplitude goes with trauma squared)', () => {
        let small = 0, big = 0;
        for (let t = 0; t < 2; t += 0.01) { small = Math.max(small, Math.abs(shakeSample(0.3, t).x)); big = Math.max(big, Math.abs(shakeSample(0.9, t).x)); }
        expect(big / small).toBeGreaterThan(5);
    });
});

describe('ImpactBus', () => {
    it('adds trauma, decays it with time (not with frame count), and never goes below zero', () => {
        const a = new ImpactBus();
        const b = new ImpactBus();
        a.emit(hit(), 0); b.emit(hit(), 0);
        const t0 = a.trauma;
        for (let i = 0; i < 30; i++) a.step(1 / 60);   // 0.5 s at 60 Hz
        for (let i = 0; i < 72; i++) b.step(1 / 144);  // 0.5 s at 144 Hz
        expect(a.trauma).toBeCloseTo(b.trauma, 1);
        expect(a.trauma).toBeLessThan(t0);
        expect(a.trauma).toBeCloseTo(Math.max(0, t0 - TRAUMA_DECAY * 0.5), 1);
        for (let i = 0; i < 300; i++) a.step(0.05);
        expect(a.trauma).toBe(0);
    });
    it('stacked hits build trauma but cap at 1', () => {
        const bus = new ImpactBus();
        for (let i = 0; i < 12; i++) bus.emit(hit({ power: 30 }), i * 10);
        expect(bus.trauma).toBeLessThanOrEqual(1);
        expect(bus.trauma).toBeGreaterThan(0.8);
    });
    it('freezes both fighters on contact, then releases smoothly, and leaves others alone', () => {
        const bus = new ImpactBus();
        const prof = bus.emit(hit({ victim: 1, attacker: 0 }), 1000);
        expect(bus.timeScaleFor(1, 1000)).toBeLessThan(0.1);
        expect(bus.timeScaleFor(0, 1010)).toBeLessThan(0.1);
        expect(bus.timeScaleFor(2, 1010)).toBe(1);
        const end = 1000 + prof.hitStopMs;
        const release = [end - 25, end - 15, end - 5, end + 1].map((t) => bus.timeScaleFor(1, t));
        for (let i = 1; i < release.length; i++) expect(release[i]).toBeGreaterThan(release[i - 1]); // eases up, no pop
        expect(release.at(-1)).toBe(1);
    });
    it('a block names only the defender, and still freezes them', () => {
        const bus = new ImpactBus();
        bus.emit({ kind: 'block', victim: 2, attacker: null, power: 8, x: 0, y: 1, z: 0, dirX: 0, dirZ: 1 }, 0);
        expect(bus.timeScaleFor(2, 10)).toBeLessThan(0.1);
        expect(bus.timeScaleFor(0, 10)).toBe(1);
    });
    it('a knockout drops everything into slow motion after the freeze, then back to normal', () => {
        const bus = new ImpactBus();
        const prof = bus.emit(hit({ kind: 'ko', power: 40 }), 0);
        const mid = prof.hitStopMs + prof.slowMoMs / 2;
        expect(bus.slowScaleAt(mid)).toBeLessThan(0.4);
        expect(bus.timeScaleFor(5, mid)).toBeLessThan(0.4); // any seat, not only the two involved
        expect(bus.slowScaleAt(prof.hitStopMs + prof.slowMoMs + 10)).toBe(1);
        expect(bus.slowScaleAt(0)).toBe(1);
    });
    it('knocks the victim back along the blow, overshoots a little, and settles to rest', () => {
        const bus = new ImpactBus();
        bus.emit(hit({ dirX: 1, dirZ: 0, power: 30 }), 0);
        let peak = 0, minAfter = 0;
        for (let i = 0; i < 12; i++) { bus.step(1 / 60); peak = Math.max(peak, bus.reaction(1).ox); }
        expect(peak).toBeGreaterThan(0.15);       // visibly pushed in +x
        expect(Math.abs(bus.reaction(1).oz)).toBeLessThan(1e-6); // and only along the blow
        for (let i = 0; i < 20; i++) { bus.step(1 / 60); minAfter = Math.min(minAfter, bus.reaction(1).ox); }
        expect(minAfter).toBeLessThan(0);          // a small overshoot back past rest
        expect(minAfter).toBeGreaterThan(-peak);   // ...smaller than the push
        for (let i = 0; i < 120; i++) bus.step(1 / 60);
        const r = bus.reaction(1);
        expect(Math.abs(r.ox) + Math.abs(r.squash) + Math.abs(r.lean)).toBeLessThan(1e-3);
        expect(r.flash).toBe(0);
    });
    it('with a clock, a hit-stop freezes the victim mid-recoil, then the recoil plays out', () => {
        const bus = new ImpactBus();
        const prof = bus.emit(hit({ power: 30 }), 1000);
        // 60 ms inside the freeze: the knock-back has barely started to move
        for (let i = 0; i < 4; i++) bus.step(1 / 60, 1000 + i * 16);
        const frozen = Math.abs(bus.reaction(1).ox);
        expect(frozen).toBeLessThan(0.02);
        expect(bus.reaction(1).flash).toBeGreaterThan(0.9); // the flash holds too: a frozen white-hot frame
        // after it releases the same recoil is visible
        let peak = 0;
        for (let i = 0; i < 30; i++) { bus.step(1 / 60, 1000 + prof.hitStopMs + 40 + i * 16); peak = Math.max(peak, bus.reaction(1).ox); }
        expect(peak).toBeGreaterThan(0.15);
    });
    it('a stalled frame cannot blow a spring up', () => {
        const bus = new ImpactBus();
        bus.emit(hit({ power: 45 }), 0);
        for (let i = 0; i < 5; i++) bus.step(5); // dt clamped
        expect(Math.abs(bus.reaction(1).ox)).toBeLessThan(2);
        expect(Number.isFinite(bus.reaction(1).ox)).toBe(true);
    });
    it('untouched seats read as zero, and a zero-length direction does not produce NaN', () => {
        const bus = new ImpactBus();
        expect(bus.reaction(9)).toMatchObject({ ox: 0, oz: 0, squash: 0, flash: 0 });
        bus.emit(hit({ dirX: 0, dirZ: 0 }), 0);
        bus.step(0.016);
        expect(Number.isFinite(bus.reaction(1).ox)).toBe(true);
    });
    it('tells subscribers about every impact, and stops when they unsubscribe', () => {
        const bus = new ImpactBus();
        const seen: string[] = [];
        const off = bus.subscribe((e) => seen.push(e.kind));
        bus.emit(hit(), 0);
        off();
        bus.emit(hit({ kind: 'block', attacker: null }), 0);
        expect(seen).toEqual(['hit']);
    });
});
