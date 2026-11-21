/**
 * An in-memory stand-in for the slice of Prisma the event RSVP paths use. Test-support only (no `.test.ts`
 * suffix, so it is not collected as a suite).
 *
 * It models the one thing the seat properties depend on: the advisory lock. `$executeRaw` (the
 * `pg_advisory_xact_lock` call) takes a per-key mutex that the surrounding `$transaction` releases when it
 * ends, and every query yields to the event loop, so two transactions that do NOT lock first interleave
 * their count and write exactly as two Postgres sessions would.
 */
import { WHOLE_EVENT } from '@/lib/calendar/event-model';

export interface FakeRsvp {
  eventId: string;
  userId: string;
  occurrenceAt: Date;
  status: string;
  waitlistedAt: Date | null;
  createdAt: Date;
}

export interface FakeEvent {
  id: string;
  hostId: string;
  title: string;
  startsAt: Date;
  capacity: number | null;
  canceledAt: Date | null;
  recurrence: string | null;
}

type Where = Record<string, unknown>;

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function matches(row: FakeRsvp, where: Where): boolean {
  for (const [key, cond] of Object.entries(where)) {
    if (key === 'event') continue; // joined filters are applied by the caller's data
    const value = (row as unknown as Record<string, unknown>)[key];
    if (cond instanceof Date) {
      if (!(value instanceof Date) || value.getTime() !== cond.getTime()) return false;
    } else if (cond && typeof cond === 'object') {
      const c = cond as { not?: unknown; in?: unknown[] };
      if ('in' in c && !c.in!.includes(value)) return false;
      if ('not' in c && (c.not === null ? value === null : value === c.not)) return false;
    } else if (value !== cond) return false;
  }
  return true;
}

export function createFakeDb(seed: { events: FakeEvent[]; rsvps?: Partial<FakeRsvp>[] }) {
  const events = new Map(seed.events.map((e) => [e.id, { ...e }]));
  const rows: FakeRsvp[] = (seed.rsvps ?? []).map((r, i) => ({
    eventId: 'e1',
    occurrenceAt: WHOLE_EVENT,
    status: 'going',
    waitlistedAt: null,
    createdAt: new Date(1_000 + i),
    userId: `u${i}`,
    ...r,
  }));
  const log: string[] = [];
  const locks = new Map<string, Promise<void>>();
  const notifications: { userId: string; entityType: string; entityId: string }[] = [];

  const find = (where: Where) => rows.filter((r) => matches(r, where));
  const keyOf = (w: { eventId: string; userId: string; occurrenceAt: Date }) => ({
    eventId: w.eventId,
    userId: w.userId,
    occurrenceAt: w.occurrenceAt,
  });

  const rsvp = {
    async findUnique({ where }: { where: { eventId_userId_occurrenceAt: FakeRsvp } }) {
      await tick();
      const row = find(keyOf(where.eventId_userId_occurrenceAt))[0];
      return row ? { ...row } : null; // a copy, as a driver returns: a later write must not change it
    },
    async count({ where }: { where: Where }) {
      log.push('count');
      await tick();
      return find(where).length;
    },
    async findMany({ where, orderBy, take }: { where: Where; orderBy?: unknown; take?: number }) {
      await tick();
      let found = find(where);
      if (orderBy) {
        found = [...found].sort(
          (a, b) =>
            (a.waitlistedAt?.getTime() ?? 0) - (b.waitlistedAt?.getTime() ?? 0) ||
            a.userId.localeCompare(b.userId) ||
            a.createdAt.getTime() - b.createdAt.getTime(),
        );
      }
      return found.slice(0, take ?? found.length).map((r) => ({ ...r, user: { id: r.userId, name: r.userId } }));
    },
    async groupBy() {
      await tick();
      const counts = new Map<string, number>();
      for (const r of rows) counts.set(`${r.eventId}|${r.status}`, (counts.get(`${r.eventId}|${r.status}`) ?? 0) + 1);
      return [...counts].map(([k, n]) => ({ eventId: k.split('|')[0], status: k.split('|')[1], _count: { _all: n } }));
    },
    async updateMany({ where, data }: { where: Where; data: Partial<FakeRsvp> }) {
      await tick();
      const hit = find(where);
      for (const r of hit) Object.assign(r, data);
      return { count: hit.length };
    },
    async deleteMany({ where }: { where: Where }) {
      await tick();
      const hit = find(where);
      for (const r of hit) rows.splice(rows.indexOf(r), 1);
      return { count: hit.length };
    },
    async upsert({
      where,
      create,
      update,
    }: {
      where: { eventId_userId_occurrenceAt: FakeRsvp };
      create: Partial<FakeRsvp>;
      update: Partial<FakeRsvp>;
    }) {
      log.push('write');
      await tick();
      const existing = find(keyOf(where.eventId_userId_occurrenceAt))[0];
      if (existing) Object.assign(existing, update);
      else rows.push({ waitlistedAt: null, createdAt: new Date(), ...create } as FakeRsvp);
    },
  };

  const event = {
    async findUnique({ where }: { where: { id: string } }) {
      await tick();
      return events.get(where.id) ?? null;
    },
    async update({ where, data }: { where: { id: string }; data: Partial<FakeEvent> }) {
      await tick();
      const e = events.get(where.id)!;
      Object.assign(e, data);
      return e;
    },
  };

  const db = {
    rsvp,
    event,
    async $transaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
      const held: (() => void)[] = [];
      const tx = {
        rsvp,
        event,
        async $executeRaw(strings: TemplateStringsArray, ...values: unknown[]) {
          if (!strings.join('?').includes('pg_advisory_xact_lock')) return 0;
          const key = String(values[0]);
          log.push(`lock:${key}`);
          while (locks.has(key)) await locks.get(key);
          let release!: () => void;
          locks.set(key, new Promise<void>((resolve) => (release = resolve)));
          held.push(() => {
            locks.delete(key);
            release();
          });
          return 1;
        },
      };
      try {
        return await fn(tx);
      } finally {
        for (const release of held) release();
      }
    },
  };

  return { db, rows, events, log, notifications };
}
