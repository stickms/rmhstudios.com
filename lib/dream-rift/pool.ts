/**
 * Generic object pool for Dream Rift bullet hell.
 *
 * Pre-allocates a fixed number of objects to avoid garbage collection
 * stalls during gameplay. Used for bullets, enemies, items, and any
 * other frequently spawned/despawned entities.
 */
export class ObjectPool<T extends { active: boolean }> {
  private objects: T[];
  private _activeCount = 0;

  constructor(
    public readonly capacity: number,
    factory: (index: number) => T,
  ) {
    this.objects = new Array(capacity);
    for (let i = 0; i < capacity; i++) {
      this.objects[i] = factory(i);
    }
  }

  get activeCount(): number {
    return this._activeCount;
  }

  /**
   * Find the first inactive object, mark it active, and return it.
   * Returns null if the pool is exhausted.
   */
  acquire(): T | null {
    for (let i = 0; i < this.capacity; i++) {
      const obj = this.objects[i];
      if (!obj.active) {
        obj.active = true;
        this._activeCount++;
        return obj;
      }
    }
    return null;
  }

  /**
   * Mark an object as inactive and return it to the pool.
   */
  release(obj: T): void {
    if (obj.active) {
      obj.active = false;
      this._activeCount--;
    }
  }

  /**
   * Mark all objects as inactive.
   */
  releaseAll(): void {
    for (let i = 0; i < this.capacity; i++) {
      this.objects[i].active = false;
    }
    this._activeCount = 0;
  }

  /**
   * Iterate over only the active objects in the pool.
   */
  forEachActive(fn: (obj: T) => void): void {
    for (let i = 0; i < this.capacity; i++) {
      if (this.objects[i].active) {
        fn(this.objects[i]);
      }
    }
  }
}
