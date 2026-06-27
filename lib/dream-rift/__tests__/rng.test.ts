import { Rng, mulberry32, hash2 } from '../rng';

describe('Rng', () => {
    it('is deterministic for a given seed', () => {
        const a = new Rng(12345);
        const b = new Rng(12345);
        const seqA = Array.from({ length: 50 }, () => a.next());
        const seqB = Array.from({ length: 50 }, () => b.next());
        expect(seqA).toEqual(seqB);
    });

    it('produces different streams for different seeds', () => {
        const a = new Rng(1);
        const b = new Rng(2);
        expect(a.next()).not.toEqual(b.next());
    });

    it('next() stays within [0, 1)', () => {
        const r = new Rng(99);
        for (let i = 0; i < 1000; i++) {
            const v = r.next();
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThan(1);
        }
    });

    it('range and int respect bounds', () => {
        const r = new Rng(7);
        for (let i = 0; i < 500; i++) {
            const f = r.range(-3, 8);
            expect(f).toBeGreaterThanOrEqual(-3);
            expect(f).toBeLessThan(8);
            const n = r.int(2, 5);
            expect(n).toBeGreaterThanOrEqual(2);
            expect(n).toBeLessThanOrEqual(5);
        }
    });

    it('reseed resets the stream', () => {
        const r = new Rng(42);
        const first = [r.next(), r.next(), r.next()];
        r.reseed(42);
        expect([r.next(), r.next(), r.next()]).toEqual(first);
    });
});

describe('mulberry32 / hash2', () => {
    it('mulberry32 is deterministic', () => {
        const a = mulberry32(5);
        const b = mulberry32(5);
        expect(a()).toEqual(b());
    });

    it('hash2 returns a stable unsigned int', () => {
        expect(hash2(3, 9)).toEqual(hash2(3, 9));
        expect(hash2(3, 9)).toBeGreaterThanOrEqual(0);
        expect(hash2(3, 9)).not.toEqual(hash2(9, 3));
    });
});
