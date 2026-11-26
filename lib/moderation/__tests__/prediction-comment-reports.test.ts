import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MEMBER_ITEM_REPORT_TYPES,
  REMOVABLE_REPORT_ENTITY_TYPES,
  REPORT_ENTITY_TYPES,
} from '@/lib/moderation/report-constants';
import { assertJsonSafe } from '@/lib/db/query-shape';

/**
 * s15-05: a member may report a comment on a prediction market. The reporter must be able to see the market, must not
 * be the author and must not have blocked them (or been blocked); a missing comment, a hidden market and a blocked
 * author all answer `missing`, so comment ids cannot be probed. "Resolve and remove" deletes the row; the queue shows
 * the market, the side held and the words.
 */

type Comment = { id: string; userId: string; predictionId: string; body: string; side: string | null; shares: number };

const h = vi.hoisted(() => ({
  comments: [] as unknown[],
  markets: {} as Record<
    string,
    { id: string; title: string; description: null; status: string; creatorId: string | null }
  >,
  blocked: [] as string[],
}));

vi.mock('@/lib/moderation.server', () => ({
  getHiddenAuthorIds: vi.fn(async () => h.blocked),
  getBlockedAuthorIds: vi.fn(async () => h.blocked),
}));

vi.mock('@/lib/prisma.server', async () => {
  const { shapeChecked } = await import('@/lib/db/query-shape');
  const all = () => h.comments as Comment[];
  const client = {
    prediction: { findUnique: vi.fn(async (a: { where: { id: string } }) => h.markets[a.where.id] ?? null) },
    predictionComment: {
      findUnique: vi.fn(async (a: { where: { id: string } }) => all().find((c) => c.id === a.where.id) ?? null),
      findMany: vi.fn(
        async (a: {
          where: {
            id: { in: string[] };
            userId?: { notIn: string[] };
            prediction?: { OR: Array<{ status?: { notIn: string[] }; creatorId?: string }> };
          };
        }) =>
          all()
            .filter((c) => a.where.id.in.includes(c.id))
            .filter((c) => !a.where.userId?.notIn.includes(c.userId))
            // The market's visibility, as Postgres would apply the relation filter: any one branch of the OR.
            .filter((c) => {
              const m = h.markets[c.predictionId];
              const or = a.where.prediction?.OR;
              if (!or) return true;
              return (
                !!m &&
                or.some(
                  (b) =>
                    (b.status !== undefined && !b.status.notIn.includes(m.status)) ||
                    (b.creatorId !== undefined && b.creatorId === m.creatorId),
                )
              );
            })
            .map((c) => ({ ...c, prediction: { title: h.markets[c.predictionId]?.title ?? '' } })),
      ),
      deleteMany: vi.fn(async (a: { where: { id: string } }) => {
        const before = h.comments.length;
        h.comments = all().filter((c) => c.id !== a.where.id);
        return { count: before - h.comments.length };
      }),
    },
  };
  return { prisma: shapeChecked(client) };
});

import {
  predictionCommentAuthor,
  predictionCommentPreviews,
  predictionCommentReportable,
  predictionCommentTargets,
  takeDownPredictionComment,
} from '@/lib/forecasting/comment-reports.server';

const root = join(__dirname, '..', '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

beforeEach(() => {
  h.markets = {
    open: { id: 'open', title: 'Rain on Friday', description: null, status: 'OPEN', creatorId: 'maker' },
    pending: { id: 'pending', title: 'Draft market', description: null, status: 'PENDING', creatorId: 'maker' },
  };
  h.comments = [
    { id: 'c1', userId: 'author', predictionId: 'open', body: 'Clouds are coming', side: 'YES', shares: 12 },
    { id: 'c2', userId: 'author', predictionId: 'pending', body: 'On a draft', side: null, shares: 0 },
  ];
  h.blocked = [];
});

describe('the type is wired into the report path', () => {
  it('is reportable, removable and a member item', () => {
    expect(REPORT_ENTITY_TYPES).toContain('prediction-comment');
    expect(REMOVABLE_REPORT_ENTITY_TYPES).toContain('prediction-comment');
    expect(MEMBER_ITEM_REPORT_TYPES.has('prediction-comment')).toBe(true);
  });

  it('has a takedown branch, a queue preview, an owner lookup and an eligibility check', () => {
    const triage = read('lib/moderation/triage.server.ts');
    expect(triage.slice(triage.indexOf('async function takedownReportedContent'))).toContain("'prediction-comment'");
    expect(triage).toContain('takeDownPredictionComment');
    expect(triage).toContain('predictionCommentPreviews');
    const route = read('lib/moderation/api/moderation.report.server.ts');
    expect(route).toContain('predictionCommentAuthor');
    expect(route).toContain('predictionCommentReportable');
    expect(read('lib/moderation/my-reports.server.ts')).toContain('predictionCommentTargets');
  });

  it('is labelled in Your reports and the report kind label', () => {
    expect(read('components/moderation/MyReportsPanel.tsx')).toContain("'prediction-comment':");
    expect(read('components/feed/report-kind-label.ts')).toContain("'prediction-comment':");
  });
});

describe('who may report a comment', () => {
  it('lets a member who can see the market report someone else', async () => {
    expect(await predictionCommentReportable('c1', 'reporter')).toEqual({ ok: true, authorId: 'author' });
  });

  it('refuses the author reporting their own comment', async () => {
    expect(await predictionCommentReportable('c1', 'author')).toEqual({ ok: false, reason: 'own' });
  });

  it('answers missing for an unknown comment', async () => {
    expect(await predictionCommentReportable('nope', 'reporter')).toEqual({ ok: false, reason: 'missing' });
  });

  it('answers missing for a comment on a market the reporter cannot see, but not for its creator', async () => {
    expect(await predictionCommentReportable('c2', 'reporter')).toEqual({ ok: false, reason: 'missing' });
    expect(await predictionCommentReportable('c2', 'maker')).toEqual({ ok: true, authorId: 'author' });
  });

  it('answers missing for an author the reporter blocked or was blocked by', async () => {
    h.blocked = ['author'];
    expect(await predictionCommentReportable('c1', 'reporter')).toEqual({ ok: false, reason: 'missing' });
  });

  it('gives the author for the report row, with no visibility check', async () => {
    expect(await predictionCommentAuthor('c2')).toBe('author');
    expect(await predictionCommentAuthor('nope')).toBeNull();
  });
});

describe('removing a reported comment', () => {
  it('deletes the row, and a second decision is harmless', async () => {
    await takeDownPredictionComment('c1');
    expect((h.comments as Comment[]).map((c) => c.id)).toEqual(['c2']);
    await expect(takeDownPredictionComment('c1')).resolves.toBeUndefined();
    expect(h.comments).toHaveLength(1);
  });
});

describe('what the queue and Your reports show', () => {
  it('previews the market, the side held and the words', async () => {
    const lines = await predictionCommentPreviews(['c1', 'c2']);
    assertJsonSafe([...lines]);
    expect(lines.get('c1')).toBe('On "Rain on Friday" (held 12 YES): Clouds are coming');
    expect(lines.get('c2')).toBe('On "Draft market" (no position): On a draft');
    expect((await predictionCommentPreviews([])).size).toBe(0);
  });

  it("shows the reporter a comment's words unless its author is blocked, and a deleted one not at all", async () => {
    expect(await predictionCommentTargets('reporter', ['c1'])).toEqual([expect.objectContaining({ id: 'c1' })]);
    h.blocked = ['author'];
    expect(await predictionCommentTargets('reporter', ['c1'])).toEqual([]);
    h.blocked = [];
    await takeDownPredictionComment('c1');
    expect(await predictionCommentTargets('reporter', ['c1'])).toEqual([]);
  });

  it('leaves out a comment on a market the reporter can no longer see, but not for its creator', async () => {
    const { prisma } = await import('@/lib/prisma.server');
    expect(await predictionCommentTargets('reporter', ['c1', 'c2'])).toEqual([expect.objectContaining({ id: 'c1' })]);
    // The filter is in the query itself (one read, no per-comment market lookup), and names the viewer as creator.
    expect(vi.mocked(prisma.predictionComment.findMany).mock.lastCall?.[0]?.where).toMatchObject({
      prediction: { OR: [{ status: { notIn: ['PENDING', 'DENIED'] } }, { creatorId: 'reporter' }] },
    });
    const ids = (await predictionCommentTargets('maker', ['c1', 'c2'])).map((c) => c.id);
    expect(ids.sort()).toEqual(['c1', 'c2']);
    h.markets.open = { ...h.markets.open!, status: 'DENIED' };
    expect(await predictionCommentTargets('reporter', ['c1', 'c2'])).toEqual([]);
  });
});
