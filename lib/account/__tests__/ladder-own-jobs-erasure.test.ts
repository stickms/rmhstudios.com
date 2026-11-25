import { describe, expect, it, vi } from 'vitest';

/**
 * Account deletion anonymises the user row in place, so the database cascade from `User` to a member's own jobs
 * (feature 08) never fires. `anonymizeAccount` deletes them explicitly: the jobs first (their application, events and
 * offer cascade from the job), then the own companies a job referenced. Both are scoped to `ownerId`, so the shared
 * catalogue (no owner) is never touched.
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

async function transactionOps(userId: string): Promise<Op[]> {
  (prismaMock.$transaction as ReturnType<typeof vi.fn>).mockClear();
  await anonymizeAccount(userId);
  return (prismaMock.$transaction as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Op[];
}

describe('anonymizeAccount (own jobs)', () => {
  it('deletes the member’s own jobs and then their own companies, scoped to ownerId', async () => {
    const ops = await transactionOps('user-1');
    const jobs = ops.findIndex((o) => o.model === 'ladderJob' && o.method === 'deleteMany');
    const companies = ops.findIndex((o) => o.model === 'ladderCompany' && o.method === 'deleteMany');
    expect(jobs).toBeGreaterThanOrEqual(0);
    expect(companies).toBeGreaterThan(jobs); // a job references its company: the job goes first
    expect(ops[jobs]!.args).toEqual({ where: { ownerId: 'user-1' } });
    expect(ops[companies]!.args).toEqual({ where: { ownerId: 'user-1' } });
  });

  it('never deletes a catalogue row: no ladder job or company operation lacks an ownerId filter', async () => {
    const ops = await transactionOps('user-2');
    const touching = ops.filter((o) => o.model === 'ladderJob' || o.model === 'ladderCompany');
    expect(touching.length).toBe(2);
    for (const op of touching) {
      expect(JSON.stringify(op.args)).toContain('"ownerId":"user-2"');
    }
  });

  it('still deletes the member’s applications (their own-job applications included) as before', async () => {
    const ops = await transactionOps('user-1');
    const applications = ops.find((o) => o.model === 'ladderApplication' && o.method === 'deleteMany');
    expect(applications?.args).toEqual({ where: { userId: 'user-1' } });
  });
});

describe('exportLadderOwnJobs', () => {
  it('returns the member’s own jobs with where each application stands', async () => {
    const findMany = vi.fn(async () => [
      {
        id: 'j1',
        title: 'Data intern',
        locationRaw: 'Remote',
        remoteStatus: 'remote_us',
        employmentType: 'internship',
        applicationDeadline: new Date('2027-03-01T12:00:00Z'),
        originalPostingUrl: 'https://example.com/j1',
        compensationMin: 20,
        compensationMax: 25,
        payPeriod: 'hour',
        payCurrency: 'USD',
        discoveredAt: new Date('2026-12-20T00:00:00Z'),
        company: { name: 'Tiny Labs', ownerId: 'user-1' },
        applications: [{ status: 'interviewing', appliedDate: new Date('2026-12-22T00:00:00Z') }],
      },
    ]);
    (prismaMock as Record<string, unknown>).ladderJob = { findMany };
    const { exportLadderOwnJobs } = await import('@/lib/rmhladder/own-jobs.server');
    const rows = await exportLadderOwnJobs('user-1');
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { ownerId: 'user-1' } }));
    expect(rows).toEqual([
      expect.objectContaining({
        id: 'j1',
        title: 'Data intern',
        company: 'Tiny Labs',
        link: 'https://example.com/j1',
        deadline: '2027-03-01',
        applicationStatus: 'interviewing',
        appliedDate: '2026-12-22T00:00:00.000Z',
      }),
    ]);
    // the application filter in the export is the member's too: no other member's application rides along
    const [args] = findMany.mock.calls[0] as unknown as [{ include: { applications: { where: unknown } } }];
    expect(args.include.applications.where).toEqual({ userId: 'user-1' });
  });
});
