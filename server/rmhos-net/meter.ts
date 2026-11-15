// Per-user bandwidth meter: a token bucket (at most one second of allowance)
// intersected with a UTC-day byte budget.
import type { RelayPolicy } from './policy';

const DAY_MS = 86_400_000;

interface Entry {
  tokens: number;
  last: number;
  day: number;
  usedToday: number;
}

export class UsageMeter {
  private readonly users = new Map<string, Entry>();
  /** The shared bucket and UTC-day budget every user also draws on. */
  private global: Entry;

  constructor(
    private readonly p: RelayPolicy,
    private readonly now: () => number = Date.now,
  ) {
    const t = this.now();
    this.global = {
      tokens: this.p.globalBytesPerSecond,
      last: t,
      day: Math.floor(t / DAY_MS),
      usedToday: 0,
    };
  }

  private globalEntry(): Entry {
    const t = this.now();
    const g = this.global;
    g.tokens = Math.min(
      this.p.globalBytesPerSecond,
      g.tokens + (Math.max(0, t - g.last) * this.p.globalBytesPerSecond) / 1000,
    );
    g.last = t;
    const day = Math.floor(t / DAY_MS);
    if (day !== g.day) {
      g.day = day;
      g.usedToday = 0;
    }
    return g;
  }

  /** True once the hub-wide daily budget is spent (until UTC midnight). */
  globalDayExhausted(): boolean {
    return this.globalEntry().usedToday >= this.p.globalBytesPerDay;
  }

  private entry(userId: string): Entry {
    const t = this.now();
    let e = this.users.get(userId);
    if (!e) {
      e = {
        tokens: this.p.bytesPerSecond,
        last: t,
        day: Math.floor(t / DAY_MS),
        usedToday: 0,
      };
      this.users.set(userId, e);
      return e;
    }
    const elapsed = Math.max(0, t - e.last);
    e.tokens = Math.min(this.p.bytesPerSecond, e.tokens + (elapsed * this.p.bytesPerSecond) / 1000);
    e.last = t;
    const day = Math.floor(t / DAY_MS);
    if (day !== e.day) {
      e.day = day;
      e.usedToday = 0;
    }
    return e;
  }

  /** Bytes the user may move right now (bucket ∩ daily remainder); 0 = wait or capped. */
  allowance(userId: string): number {
    const e = this.entry(userId);
    const g = this.globalEntry();
    return Math.max(
      0,
      Math.floor(
        Math.min(
          e.tokens,
          this.p.bytesPerDay - e.usedToday,
          g.tokens,
          this.p.globalBytesPerDay - g.usedToday,
        ),
      ),
    );
  }

  consume(userId: string, bytes: number): void {
    const e = this.entry(userId);
    e.tokens = Math.max(0, e.tokens - bytes);
    e.usedToday += bytes;
    const g = this.globalEntry();
    g.tokens = Math.max(0, g.tokens - bytes);
    g.usedToday += bytes;
  }

  dayExhausted(userId: string): boolean {
    return this.entry(userId).usedToday >= this.p.bytesPerDay || this.globalDayExhausted();
  }

  /** Number of tracked users. */
  get size(): number {
    return this.users.size;
  }

  /** Drop users whose day has rolled over and whose bucket has refilled: nothing left to remember. */
  prune(): void {
    const t = this.now();
    const day = Math.floor(t / DAY_MS);
    for (const [id, e] of this.users) {
      const full =
        e.tokens + (Math.max(0, t - e.last) * this.p.bytesPerSecond) / 1000 >=
        this.p.bytesPerSecond;
      if (e.day !== day && full) this.users.delete(id);
    }
  }
}
