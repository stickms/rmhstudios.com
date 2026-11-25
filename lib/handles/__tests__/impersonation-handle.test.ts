import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handlersOfModule } from '@/lib/__tests__/api-handlers-of';
import { assertJsonSafe } from '@/lib/db/query-shape';
import { ERROR_CODES } from '@/lib/errors/codes';
import {
  encodeImpersonationDetails,
  impersonationPreviewLine,
  impersonationReportSchema,
  MAX_IMPERSONATION_NOTE,
} from '@/lib/handles/impersonation';
import { REMOVABLE_REPORT_ENTITY_TYPES, REPORT_ENTITY_TYPES } from '@/lib/moderation/report-constants';

/**
 * s14-09: an impersonation report names who is being copied, by id or by handle. The handle is resolved on the server;
 * an unknown handle and a report of oneself are refused with codes, the one-open-report-per-pair dedupe holds, and the
 * generic report route refuses the type, so this endpoint is the only way to file one.
 */

type Row = Record<string, unknown>;
const h = vi.hoisted(() => ({ users: [] as Row[], reports: [] as Row[], locks: [] as string[], notified: 0 }));

vi.mock('@/lib/prisma.server', async () => {
  const { shapeChecked } = await import('@/lib/db/query-shape');
  const client = {
    // The dedupe check and the insert run under an advisory lock on the (reporter, accused) pair.
    $executeRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      h.locks.push(`${strings.join('?')}|${values.join(',')}`);
      return 1;
    },
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => fn(client),
    user: {
      findUnique: async ({ where }: { where: { id?: string; handle?: string } }) =>
        h.users.find((u) => (where.id !== undefined ? u.id === where.id : u.handle === where.handle)) ?? null,
    },
    contentReport: {
      findFirst: async ({ where }: { where: Row }) =>
        h.reports.find(
          (r) =>
            r.reporterId === where.reporterId &&
            r.entityType === where.entityType &&
            r.entityId === where.entityId &&
            r.status === 'PENDING',
        ) ?? null,
      create: async ({ data }: { data: Row }) => {
        const row = { id: `r${h.reports.length + 1}`, status: 'PENDING', ...data };
        h.reports.push(row);
        return { id: row.id };
      },
    },
  };
  return { prisma: shapeChecked(client) };
});
vi.mock('@/lib/api/handler.server', () => ({
  defineHandler: (_o: unknown, fn: unknown) => fn,
  notFound: (message: string) => Response.json({ error: message }, { status: 404 }),
}));
vi.mock('@/lib/admin-review.server', () => ({
  notifyAdminsOfReview: vi.fn(async () => {
    h.notified += 1;
  }),
}));
vi.mock('@/lib/rmhmusic/learn/moderation.server', () => ({ musicReportOwner: vi.fn(), hideMusicContent: vi.fn() }));

type Handler = (a: { userId?: string; session?: unknown; body: Row }) => Promise<Response>;

async function file(reporter: string, body: Row) {
  const mod = await import('@/lib/api/routes/handles.impersonation.server');
  const post = handlersOfModule<Handler>(mod).POST!;
  return post({ userId: reporter, body: impersonationReportSchema.parse(body) });
}

beforeEach(() => {
  h.users = [
    { id: 'reporter', handle: 'rita' },
    { id: 'accused', handle: 'fake_alice' },
    { id: 'alice-id', handle: 'alice' },
  ];
  h.reports = [];
  h.locks = [];
  h.notified = 0;
});

describe('the schema', () => {
  it('takes exactly one of an id and a handle, and cleans the handle', () => {
    expect(impersonationReportSchema.parse({ accusedUserId: 'a', impersonatedHandle: '  @Alice ' })).toEqual({
      accusedUserId: 'a',
      impersonatedHandle: 'alice',
    });
    expect(impersonationReportSchema.safeParse({ accusedUserId: 'a', impersonatedUserId: 'b' }).success).toBe(true);
    expect(impersonationReportSchema.safeParse({ accusedUserId: 'a' }).success).toBe(false);
    expect(
      impersonationReportSchema.safeParse({ accusedUserId: 'a', impersonatedUserId: 'b', impersonatedHandle: 'alice' })
        .success,
    ).toBe(false);
  });

  it('holds the note to 700 characters', () => {
    const note = 'x'.repeat(MAX_IMPERSONATION_NOTE + 1);
    expect(impersonationReportSchema.safeParse({ accusedUserId: 'a', impersonatedUserId: 'b', note }).success).toBe(
      false,
    );
  });
});

describe('POST /api/handles/impersonation', () => {
  it('resolves a handle to the account and files one report with the structured header', async () => {
    const res = await file('reporter', {
      accusedUserId: 'accused',
      impersonatedHandle: '@Alice',
      note: 'Copied my bio',
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean; reportId: string; alreadyReported: boolean };
    assertJsonSafe(body);
    expect(body).toMatchObject({ success: true, alreadyReported: false });
    expect(h.reports).toEqual([
      expect.objectContaining({
        reporterId: 'reporter',
        entityType: 'impersonation',
        entityId: 'accused',
        targetUserId: 'accused',
        reason: 'OTHER',
        details: encodeImpersonationDetails({
          impersonatedUserId: 'alice-id',
          impersonatedHandle: 'alice',
          note: 'Copied my bio',
        }),
      }),
    ]);
    expect(h.notified).toBe(1);
  });

  it('"Me" sends the reporter\'s own id', async () => {
    const res = await file('reporter', { accusedUserId: 'accused', impersonatedUserId: 'reporter' });
    expect(res.status).toBe(200);
    expect(h.reports[0]?.details).toContain('(id: reporter)');
  });

  it('an unknown handle is refused with IMPERSONATION_UNKNOWN and writes nothing', async () => {
    const res = await file('reporter', { accusedUserId: 'accused', impersonatedHandle: 'nobody_here' });
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({
      code: 'IMPERSONATION_UNKNOWN',
      error: ERROR_CODES.IMPERSONATION_UNKNOWN.text,
    });
    expect(h.reports).toHaveLength(0);
  });

  it('an unknown reported account is the same refusal', async () => {
    const res = await file('reporter', { accusedUserId: 'ghost', impersonatedHandle: 'alice' });
    expect(res.status).toBe(404);
    expect((await res.json()) as Row).toMatchObject({ code: 'IMPERSONATION_UNKNOWN' });
  });

  it('reporting oneself is refused with IMPERSONATION_SELF', async () => {
    const res = await file('reporter', { accusedUserId: 'reporter', impersonatedHandle: 'alice' });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: 'IMPERSONATION_SELF' });
    expect(h.reports).toHaveLength(0);
  });

  it('an account "pretending to be" itself is refused with IMPERSONATION_SELF, by handle or by id', async () => {
    for (const target of [{ impersonatedHandle: 'fake_alice' }, { impersonatedUserId: 'accused' }]) {
      const res = await file('reporter', { accusedUserId: 'accused', ...target });
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ code: 'IMPERSONATION_SELF' });
    }
    expect(h.reports).toHaveLength(0);
  });

  it('keeps one open report per reporter and accused account', async () => {
    const first = (await (
      await file('reporter', { accusedUserId: 'accused', impersonatedHandle: 'alice' })
    ).json()) as Row;
    const second = (await (
      await file('reporter', { accusedUserId: 'accused', impersonatedHandle: 'alice' })
    ).json()) as Row;
    expect(first.alreadyReported).toBe(false);
    expect(second).toMatchObject({ alreadyReported: true, reportId: first.reportId });
    expect(h.reports).toHaveLength(1);
    expect(h.notified).toBe(1);
    // Each check-then-insert took the pair's advisory lock first, so two requests sent together cannot both insert.
    expect(h.locks).toEqual([
      expect.stringMatching(/pg_advisory_xact_lock.*\|impersonation-report:reporter:accused$/),
      expect.stringMatching(/pg_advisory_xact_lock.*\|impersonation-report:reporter:accused$/),
    ]);
  });
});

describe('POST /api/moderation/report', () => {
  type ReportHandler = (a: { session: { user: { id: string } }; body: Row }) => Promise<Response>;

  it('is in the vocabulary but refuses the impersonation type before writing anything', async () => {
    expect(REPORT_ENTITY_TYPES).toContain('impersonation');
    // Not removable: there is nothing to take down; the decision acts through the account tools.
    expect(REMOVABLE_REPORT_ENTITY_TYPES).not.toContain('impersonation');
    const mod = await import('@/lib/moderation/api/moderation.report.server');
    const post = handlersOfModule<ReportHandler>(mod).POST!;
    const res = await post({
      session: { user: { id: 'reporter' } },
      body: {
        entityType: 'impersonation',
        entityId: 'accused',
        reason: 'OTHER',
        details: '[impersonating] @alice (id: alice-id)',
      },
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: 'INVALID_INPUT' });
    expect(h.reports).toHaveLength(0);
  });
});

describe('the queue preview', () => {
  it('names who the account is said to be copying, once each, and never the note', () => {
    const line = impersonationPreviewLine([
      encodeImpersonationDetails({ impersonatedUserId: 'a', impersonatedHandle: 'alice', note: 'They copied me' }),
      encodeImpersonationDetails({ impersonatedUserId: 'a', impersonatedHandle: 'alice' }),
      encodeImpersonationDetails({ impersonatedUserId: 'b', impersonatedHandle: 'bob' }),
      'free text that is not a header',
      null,
    ]);
    expect(line).toBe('Pretending to be @alice, @bob');
    expect(line).not.toContain('copied');
  });

  it('says so when there is no usable header', () => {
    expect(impersonationPreviewLine([])).toBe('Pretending to be someone');
    expect(impersonationPreviewLine([encodeImpersonationDetails({ impersonatedUserId: 'x' })])).toBe(
      'Pretending to be an account with no handle',
    );
  });
});
