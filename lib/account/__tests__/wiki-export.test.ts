/**
 * s09-04: the data export lists the member's own wiki edits (where, when, their summary) and never a body: a revision
 * row holds the text before the member's change, usually another member's words.
 */
import { describe, expect, it, vi } from 'vitest';

const findMany = vi.hoisted(() =>
  vi.fn(async (_args: unknown) => [
    {
      summary: 'Fixed a link',
      createdAt: new Date('2026-11-02T10:00:00Z'),
      page: { slug: 'faq', title: 'FAQ', community: { slug: 'retro' } },
    },
    {
      summary: null,
      createdAt: new Date('2026-11-01T09:00:00Z'),
      page: { slug: 'reading-list', title: 'Reading list', community: { slug: 'retro' } },
    },
  ]),
);

// Every other sprint09 section reads its own model; those answer with nothing.
const emptyModel = vi.hoisted(() => ({
  findMany: async () => [],
  findUnique: async () => null,
  findFirst: async () => null,
}));
vi.mock('@/lib/prisma.server', () => ({
  prisma: new Proxy({ communityPageRevision: { findMany } } as Record<string, unknown>, {
    get: (target, key: string) => target[key] ?? emptyModel,
  }),
}));
vi.mock('@/lib/rmhtype/keystats.server', () => ({ exportRmhTypeKeyStats: vi.fn(async () => []) }));

const { exportCommunityPageRevisions } = await import('@/lib/communities/pages-export.server');
const { exportSprint09 } = await import('@/lib/account/export-sprint-09.server');

describe('wiki export', () => {
  it('lists the member’s own edits, with no body field', async () => {
    const rows = await exportCommunityPageRevisions('u1');
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { editorId: 'u1' } }));
    expect(rows).toEqual([
      {
        communitySlug: 'retro',
        pageSlug: 'faq',
        pageTitle: 'FAQ',
        summary: 'Fixed a link',
        createdAt: '2026-11-02T10:00:00.000Z',
      },
      {
        communitySlug: 'retro',
        pageSlug: 'reading-list',
        pageTitle: 'Reading list',
        summary: null,
        createdAt: '2026-11-01T09:00:00.000Z',
      },
    ]);
    for (const row of rows) expect(Object.keys(row)).not.toContain('body');
  });

  it('never asks the database for a body', async () => {
    await exportCommunityPageRevisions('u1');
    const args = findMany.mock.calls.at(-1)?.[0] as { select?: Record<string, unknown>; include?: unknown };
    expect(args.include).toBeUndefined();
    expect(args.select).toBeDefined();
    expect(Object.keys(args.select ?? {})).not.toContain('body');
    expect(JSON.stringify(args.select)).not.toContain('body');
  });

  it('is exported under the sprint09 key', async () => {
    const out = await exportSprint09('u1');
    expect(out).toHaveProperty('communityPageEdits');
    expect(out.communityPageEdits as unknown[]).toHaveLength(2);
  });
});
