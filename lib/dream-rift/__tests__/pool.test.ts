import { Pool } from '../pool';

interface Dummy {
    active: boolean;
    v: number;
}

function makePool(cap = 8) {
    return new Pool<Dummy>(
        cap,
        () => ({ active: false, v: 0 }),
        (o) => {
            o.v = 0;
        },
    );
}

describe('Pool', () => {
    it('acquires up to capacity then returns null', () => {
        const p = makePool(3);
        expect(p.acquire()).not.toBeNull();
        expect(p.acquire()).not.toBeNull();
        expect(p.acquire()).not.toBeNull();
        expect(p.acquire()).toBeNull();
        expect(p.activeCount).toBe(3);
    });

    it('resets objects on acquire', () => {
        const p = makePool(2);
        const a = p.acquire()!;
        a.v = 99;
        p.release(a);
        const b = p.acquire()!;
        expect(b.v).toBe(0);
    });

    it('release frees a slot for reuse', () => {
        const p = makePool(1);
        const a = p.acquire()!;
        expect(p.acquire()).toBeNull();
        p.release(a);
        expect(p.acquire()).not.toBeNull();
        expect(p.activeCount).toBe(1);
    });

    it('forEach visits all active and tolerates release during iteration', () => {
        const p = makePool(10);
        for (let i = 0; i < 10; i++) p.acquire()!.v = i;
        let count = 0;
        p.forEach((o) => {
            count++;
            if (o.v % 2 === 0) p.release(o);
        });
        expect(count).toBe(10);
        expect(p.activeCount).toBe(5); // odds remain
    });

    it('clear releases everything', () => {
        const p = makePool(5);
        p.acquire();
        p.acquire();
        p.clear();
        expect(p.activeCount).toBe(0);
        // full capacity available again
        for (let i = 0; i < 5; i++) expect(p.acquire()).not.toBeNull();
    });

    it('handles interleaved acquire/release without leaking slots', () => {
        const p = makePool(4);
        const a = p.acquire()!;
        const b = p.acquire()!;
        p.release(a);
        const c = p.acquire()!;
        p.release(b);
        p.release(c);
        expect(p.activeCount).toBe(0);
        for (let i = 0; i < 4; i++) expect(p.acquire()).not.toBeNull();
    });
});
