import { describe, expect, it } from 'vitest';
import {
  acquireWorkerLease,
  heartbeatWorkerLease,
  releaseWorkerLease,
  type WorkerLeasePrisma,
} from './worker-lease';

function makeLeasePrisma() {
  const leases = new Map<string, { ownerId: string; expiresAt: Date; heartbeatAt: Date }>();
  const prisma: WorkerLeasePrisma = {
    async $queryRawUnsafe<T>(_query: string, ...values: unknown[]): Promise<T> {
      const [name, ownerId, expiresAt, now] = values as [string, string, Date, Date];
      const existing = leases.get(name);
      if (!existing || existing.expiresAt <= now || existing.ownerId === ownerId) {
        leases.set(name, { ownerId, expiresAt, heartbeatAt: now });
        return [{ ownerId }] as T;
      }
      return [] as T;
    },
    async $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number> {
      const [name, ownerId] = values as [string, string];
      const existing = leases.get(name);
      if (!existing || existing.ownerId !== ownerId) return 0;
      if (query.startsWith('UPDATE')) {
        const expiresAt = values[2] as Date;
        const now = values[3] as Date;
        leases.set(name, { ownerId, expiresAt, heartbeatAt: now });
      } else {
        leases.delete(name);
      }
      return 1;
    },
  };
  return { prisma, leases };
}

const lease = { name: 'pipeline', ownerId: 'worker-a', ttlMs: 30 * 60_000 };
const now = new Date('2026-07-12T12:00:00.000Z');

describe('worker lease', () => {
  it('allows one owner and rejects a second owner before expiry', async () => {
    const { prisma } = makeLeasePrisma();
    await expect(acquireWorkerLease(prisma, lease, now)).resolves.toBe(true);
    await expect(acquireWorkerLease(prisma, { ...lease, ownerId: 'worker-b' }, now)).resolves.toBe(false);
  });

  it('allows takeover after expiry', async () => {
    const { prisma } = makeLeasePrisma();
    await acquireWorkerLease(prisma, lease, now);
    await expect(acquireWorkerLease(
      prisma,
      { ...lease, ownerId: 'worker-b' },
      new Date(now.getTime() + lease.ttlMs + 1),
    )).resolves.toBe(true);
  });

  it('heartbeats and releases only for the current owner', async () => {
    const { prisma, leases } = makeLeasePrisma();
    await acquireWorkerLease(prisma, lease, now);
    const heartbeatAt = new Date(now.getTime() + 5 * 60_000);
    await expect(heartbeatWorkerLease(prisma, lease, heartbeatAt)).resolves.toBe(true);
    expect(leases.get(lease.name)?.expiresAt).toEqual(new Date(heartbeatAt.getTime() + lease.ttlMs));
    await expect(releaseWorkerLease(prisma, { ...lease, ownerId: 'worker-b' })).resolves.toBe(false);
    await expect(releaseWorkerLease(prisma, lease)).resolves.toBe(true);
    expect(leases.has(lease.name)).toBe(false);
  });
});
