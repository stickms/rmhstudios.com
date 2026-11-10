/**
 * Fixed-capacity object pool with O(1) acquire/release.
 *
 * Bullets, shots, enemies, items and effects are pre-allocated once so the GC
 * never runs mid-frame. A free-list stack makes acquire/release constant time
 * (the previous linear-scan version was the hot-path bottleneck at high bullet
 * counts), while a dense `activeIndices` set keeps iteration over live objects
 * cheap.
 */

export interface Poolable {
    active: boolean;
}

export class Pool<T extends Poolable> {
    readonly items: T[];
    private free: number[] = [];
    /** Indices currently active (dense, unordered). */
    private activeIdx: number[] = [];
    private slotOf: Int32Array; // item index -> position in activeIdx, or -1

    constructor(
        readonly capacity: number,
        private factory: (i: number) => T,
        private reset: (o: T) => void,
    ) {
        this.items = new Array(capacity);
        this.slotOf = new Int32Array(capacity).fill(-1);
        for (let i = capacity - 1; i >= 0; i--) {
            const o = factory(i);
            o.active = false;
            (o as unknown as { __i: number }).__i = i;
            this.items[i] = o;
            this.free.push(i);
        }
    }

    get activeCount(): number {
        return this.activeIdx.length;
    }

    /** Acquire a fresh (reset) object, or null if the pool is exhausted. */
    acquire(): T | null {
        const i = this.free.pop();
        if (i === undefined) return null;
        const o = this.items[i];
        this.reset(o);
        o.active = true;
        this.slotOf[i] = this.activeIdx.length;
        this.activeIdx.push(i);
        return o;
    }

    /** Iterate active objects; safe to release the current object during it. */
    forEach(fn: (o: T) => void): void {
        const a = this.activeIdx;
        for (let k = a.length - 1; k >= 0; k--) {
            const idx = a[k];
            const o = this.items[idx];
            if (o.active) fn(o);
        }
    }

    /** Release by object reference (must belong to this pool). */
    release(o: T): void {
        if (!o.active) return;
        o.active = false;
        // find this object's index — we store it on the object's pool slot via identity scan-free lookup
        const idx = (o as unknown as { __i: number }).__i;
        this.freeIndex(idx);
    }

    private freeIndex(i: number): void {
        const slot = this.slotOf[i];
        if (slot < 0) return;
        const last = this.activeIdx.length - 1;
        const lastIdx = this.activeIdx[last];
        this.activeIdx[slot] = lastIdx;
        this.slotOf[lastIdx] = slot;
        this.activeIdx.pop();
        this.slotOf[i] = -1;
        this.free.push(i);
    }

    clear(): void {
        for (const i of this.activeIdx) {
            this.items[i].active = false;
            this.slotOf[i] = -1;
            this.free.push(i);
        }
        this.activeIdx.length = 0;
    }
}
