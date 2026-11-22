import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ERASURE_REGISTRY } from '@/lib/account/erasure-registry';

/**
 * Account deletion anonymises the user row in place, so `SyncTombstone` (which only cascades from the user) must be
 * deleted explicitly. The rows hold ids, kinds and times only, and are registered as erased.
 */

interface Op {
  model: string;
  method: string;
  args: unknown;
}

const prismaMock = vi.hoisted(() => {
  const model = (name: string) =>
    new Proxy({}, { get: (_t, method: string) => (args: unknown) => ({ model: name, method, args }) });
  return new Proxy({ $transaction: vi.fn(async (ops: unknown[]) => ops) } as Record<string, unknown>, {
    get: (t, key: string) => (key in t ? t[key] : model(key)),
  });
});
vi.mock('@/lib/prisma.server', () => ({ prisma: prismaMock }));

import { anonymizeAccount } from '@/lib/account/deletion.server';

describe('anonymizeAccount (sync tombstones)', () => {
  it('deletes every tombstone the account has', async () => {
    await anonymizeAccount('user-1');
    const tx = (prismaMock.$transaction as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Op[];
    const op = tx.find((o) => o.model === 'syncTombstone' && o.method === 'deleteMany');
    expect(op).toBeDefined();
    expect(op!.args).toEqual({ where: { userId: 'user-1' } });
  });

  it('is classified as erased, not left as a todo', () => {
    expect(ERASURE_REGISTRY.SyncTombstone?.decision).toBe('erase');
  });

  it('the table holds ids, kind and time and no content', () => {
    const schema = readFileSync(join(__dirname, '..', '..', '..', 'prisma', 'schema', 'sync.prisma'), 'utf8');
    const body = schema.slice(schema.indexOf('model SyncTombstone'));
    const fields = [...body.matchAll(/^ {2}(\w+)\s+[A-Z]\w*/gm)].map((m) => m[1]);
    expect(fields).toEqual(['id', 'userId', 'kind', 'entityId', 'deletedAt', 'user']);
  });
});
