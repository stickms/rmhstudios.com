import { describe, expect, it, vi } from 'vitest';

/**
 * S14-18: a security report sent while signed out carries the reporter's name and address with `userId` null, so the
 * erasure that clears reports by `userId` never found it. Erasing a member now also clears `reporterName`,
 * `reporterEmail` and `ipHash` on user-less reports whose address is the account's (case-insensitively), read before
 * the profile scrub removes it. The report's title, text and status stay; other people's reports are untouched.
 */

interface Op {
  model: string;
  method: string;
  args: { where?: Record<string, unknown>; data?: Record<string, unknown> };
}

const h = vi.hoisted(() => ({ email: 'Reporter@Example.test' as string | null, accountRow: true }));

const prismaMock = vi.hoisted(() => {
  const model = (name: string) =>
    new Proxy(
      {},
      {
        get: (_t, method: string) => (args: unknown) => {
          // The pre-step read of the account's address answers with a row; every other call is recorded.
          if (name === 'user' && method === 'findUnique')
            return Promise.resolve(h.accountRow ? { email: h.email } : null);
          return { model: name, method, args };
        },
      },
    );
  return new Proxy({ $transaction: vi.fn(async (ops: unknown[]) => ops) } as Record<string, unknown>, {
    get: (t, key: string) => (key in t ? t[key] : model(key)),
  });
});
vi.mock('@/lib/prisma.server', () => ({ prisma: prismaMock }));
vi.mock('@features/medschools/api/share-sync.server', () => ({
  eraseSharedMedEvents: vi.fn(async () => ({ events: 0 })),
}));

import { anonymizeAccount } from '@/lib/account/deletion.server';
import { securityReportEmailErasureOps } from '@/lib/account/erasure-plain.server';
import { queryShapeProblems } from '@/lib/db/query-shape';

async function recordAnonymize(userId: string): Promise<Op[]> {
  const fn = prismaMock.$transaction as ReturnType<typeof vi.fn>;
  fn.mockClear();
  await anonymizeAccount(userId);
  return fn.mock.calls[0]![0] as Op[];
}

const emailOps = (ops: Op[]) =>
  ops.filter((o) => o.model === 'securityReport' && o.args.where && 'reporterEmail' in o.args.where);

/** What `updateMany` would do to these rows: the where of the operation, applied by hand. */
interface Report {
  id: string;
  userId: string | null;
  reporterName: string | null;
  reporterEmail: string | null;
  ipHash: string | null;
  title: string;
}
function apply(op: Op, rows: Report[]): Report[] {
  const where = op.args.where as { userId: null; reporterEmail: { equals: string; mode: 'insensitive' } };
  return rows.map((r) =>
    r.userId === where.userId && r.reporterEmail?.toLowerCase() === where.reporterEmail.equals.toLowerCase()
      ? { ...r, ...(op.args.data as Partial<Report>) }
      : r,
  );
}

describe('security reports sent signed out with the member’s address', () => {
  it('clears name, address and IP hash on user-less reports with that address, case-insensitively', async () => {
    h.email = 'Reporter@Example.test';
    h.accountRow = true;
    const tx = await recordAnonymize('user-1');
    const [op] = emailOps(tx);
    expect(op).toEqual({
      model: 'securityReport',
      method: 'updateMany',
      args: {
        where: { userId: null, reporterEmail: { equals: 'Reporter@Example.test', mode: 'insensitive' } },
        data: { reporterName: null, reporterEmail: null, ipHash: null },
      },
    });

    const rows: Report[] = [
      { id: 'a', userId: null, reporterName: 'R', reporterEmail: 'reporter@example.TEST', ipHash: 'h', title: 'XSS' },
      {
        id: 'b',
        userId: null,
        reporterName: 'S',
        reporterEmail: 'someone.else@example.test',
        ipHash: 'h',
        title: 'CSRF',
      },
      { id: 'c', userId: null, reporterName: null, reporterEmail: null, ipHash: 'h2', title: 'No address' },
      {
        id: 'd',
        userId: 'user-2',
        reporterName: 'T',
        reporterEmail: 'reporter@example.test',
        ipHash: 'h3',
        title: 'Other',
      },
    ];
    const after = apply(op!, rows);
    expect(after[0]).toEqual({
      id: 'a',
      userId: null,
      reporterName: null,
      reporterEmail: null,
      ipHash: null,
      title: 'XSS',
    });
    // other people's reports, reports with no address and signed-in rows (the by-id operation's) are untouched
    expect(after.slice(1)).toEqual(rows.slice(1));
  });

  it('keeps the report itself: nothing but the reporter’s identifiers is written', () => {
    const [op] = securityReportEmailErasureOps('a@b.test') as unknown as Op[];
    expect(Object.keys(op!.args.data!).sort()).toEqual(['ipHash', 'reporterEmail', 'reporterName']);
    for (const kept of ['title', 'description', 'status', 'adminNotes', 'severity', 'category'])
      expect(op!.args.data).not.toHaveProperty(kept);
  });

  it('runs inside the one transaction, and the address was read before it', async () => {
    h.email = 'a@b.test';
    h.accountRow = true;
    const tx = await recordAnonymize('user-1');
    const at = tx.indexOf(emailOps(tx)[0]!);
    const scrub = tx.findIndex((o) => o.model === 'user' && o.method === 'update');
    expect(at).toBeGreaterThan(-1);
    // the profile scrub and the user row's anonymisation come after, so the address would be gone by then
    expect(scrub).toBeGreaterThan(at);
  });

  it('does nothing without an address: none on the account, no account row, or already scrubbed', async () => {
    for (const [email, row] of [
      [null, true],
      ['', true],
      ['   ', true],
      ['x@y.test', false],
    ] as const) {
      h.email = email;
      h.accountRow = row;
      expect(emailOps(await recordAnonymize('user-1')), `${email}/${row}`).toHaveLength(0);
    }
    expect(securityReportEmailErasureOps(null)).toHaveLength(0);
  });

  it('is a query Postgres would accept: SecurityReport.reporterEmail is optional, userId is optional', () => {
    const [op] = securityReportEmailErasureOps('a@b.test') as unknown as Op[];
    expect(queryShapeProblems('securityReport', 'updateMany', op!.args)).toEqual([]);
  });
});
