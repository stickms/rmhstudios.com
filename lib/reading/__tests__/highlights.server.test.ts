/* eslint-disable @typescript-eslint/no-explicit-any -- an in-memory stand-in for Prisma's loose where/data shapes */
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * L8 counter integrity and L1 privacy, against an in-memory stand-in for the
 * four tables involved. What matters: `readers` counts DISTINCT members, goes
 * back down exactly when a member's last public highlight on a passage goes
 * away, and a private highlight is never part of what other members receive.
 */

type Row = Record<string, any>;
const db = vi.hoisted(() => ({
  highlights: [] as Row[],
  stats: [] as Row[],
  links: [] as Row[],
  seq: 0,
}));

vi.mock('@/lib/prisma.server', () => {
  const id = () => `id${++db.seq}`;
  const match = (row: Row, where: Row = {}): boolean =>
    Object.entries(where).every(([k, v]) => {
      if (v && typeof v === 'object' && 'gte' in v) return row[k] >= v.gte;
      if (v && typeof v === 'object' && 'gt' in v) return row[k] > v.gt;
      if (v && typeof v === 'object' && 'not' in v) return row[k] !== v.not;
      if (v && typeof v === 'object' && 'notIn' in v) return !v.notIn.includes(row[k]);
      return row[k] === v;
    });
  const prisma: any = {
    $transaction: (fn: (tx: any) => unknown) => fn(prisma),
    blogPost: { findUnique: async () => ({ id: 'b' }) },
    readingHighlight: {
      count: async ({ where }: Row) => db.highlights.filter((r) => match(r, where)).length,
      create: async ({ data }: Row) => {
        const row = { id: id(), createdAt: new Date(), note: null, ...data };
        db.highlights.push(row);
        return row;
      },
      findFirst: async ({ where }: Row) => {
        const row = db.highlights.find((r) => match(r, where));
        return row ? { ...row } : null;
      },
      update: async ({ where, data }: Row) => ({
        ...Object.assign(
          db.highlights.find((r) => r.id === where.id)!,
          data,
        ),
      }),
      delete: async ({ where }: Row) => {
        db.highlights = db.highlights.filter((r) => r.id !== where.id);
        db.links = db.links.filter((l) => l.highlightId !== where.id);
      },
      findMany: async ({ where }: Row) =>
        db.highlights
          .filter((r) => match(r, where))
          .map((r) => ({
            ...r,
            user: {
              id: r.userId,
              name: 'N',
              image: null,
              username: null,
              handle: null,
              profile: null,
              inventory: [],
            },
          })),
    },
    readingPassageStat: {
      upsert: async ({ where, create, update }: Row) => {
        const w = where.docKind_docKey_unit_passage;
        let s = db.stats.find(
          (x) =>
            x.docKind === w.docKind &&
            x.docKey === w.docKey &&
            x.unit === w.unit &&
            x.passage === w.passage,
        );
        if (s) Object.assign(s, update);
        else db.stats.push((s = { id: id(), readers: 0, ...create }));
        return s;
      },
      update: async ({ where, data }: Row) => {
        const s = db.stats.find((x) => x.id === where.id)!;
        if (data.readers?.increment) s.readers += data.readers.increment;
        return s;
      },
      updateMany: async ({ where, data }: Row) => {
        const s = db.stats.find((x) => x.id === where.id && x.readers > where.readers.gt);
        if (s) s.readers -= data.readers.decrement;
        return { count: s ? 1 : 0 };
      },
      findMany: async ({ where }: Row) => db.stats.filter((s) => match(s, where)),
    },
    readingHighlightPassage: {
      count: async ({ where }: Row) => db.links.filter((l) => match(l, where)).length,
      create: async ({ data }: Row) => db.links.push({ ...data }),
      findMany: async ({ where }: Row) => db.links.filter((l) => match(l, where)),
      deleteMany: async ({ where }: Row) => {
        db.links = db.links.filter((l) => !match(l, where));
      },
    },
  };
  return { prisma };
});
vi.mock('@/lib/moderation.server', () => ({ getHiddenAuthorIds: async () => [] }));
vi.mock('@/lib/library/library.server', () => ({ getBook: async () => undefined }));
vi.mock('../glossary.server', () => ({ listGlossary: async () => [] }));

import {
  createHighlight,
  deleteHighlight,
  getDocBundle,
  updateHighlight,
} from '../highlights.server';

const passage = { passage: 'aaaaaaaaaaaa', sample: 'The gate opened at dawn.', start: 10 };
const base = {
  kind: 'blog' as const,
  key: 'post',
  unit: '',
  exact: 'gate opened',
  prefix: '',
  suffix: '',
  start: 14,
  end: 25,
  version: 'v',
  isPublic: true,
  passages: [passage],
};

beforeEach(() => {
  db.highlights = [];
  db.stats = [];
  db.links = [];
});

describe('popular-passage counters', () => {
  it('counts distinct members, not highlights, and only surfaces at 3 readers', async () => {
    await createHighlight('u1', base);
    await createHighlight('u1', { ...base, start: 12 }); // same member again
    await createHighlight('u2', base);
    expect(db.stats[0]!.readers).toBe(2);
    expect((await getDocBundle('blog', 'post', null)).popular).toHaveLength(0);

    await createHighlight('u3', base);
    expect(db.stats[0]!.readers).toBe(3);
    expect((await getDocBundle('blog', 'post', null)).popular).toHaveLength(1);
  });

  it('decrements only when a member’s last public highlight on the passage goes', async () => {
    const a = await createHighlight('u1', base);
    const b = await createHighlight('u1', { ...base, start: 12 });
    if (!a.ok || !b.ok) throw new Error('create failed');
    await deleteHighlight('u1', a.highlight.id);
    expect(db.stats[0]!.readers).toBe(1);
    await deleteHighlight('u1', b.highlight.id);
    expect(db.stats[0]!.readers).toBe(0);
  });

  it('keeps private highlights out of the counters, and follows public/private flips', async () => {
    const priv = await createHighlight('u1', { ...base, isPublic: false, passages: [] });
    if (!priv.ok) throw new Error('create failed');
    expect(db.stats).toHaveLength(0);

    await updateHighlight('u1', priv.highlight.id, { isPublic: true, passages: [passage] });
    expect(db.stats[0]!.readers).toBe(1);
    await updateHighlight('u1', priv.highlight.id, { isPublic: false });
    expect(db.stats[0]!.readers).toBe(0);
  });
});

describe('privacy', () => {
  it('only the owner can see or change a private highlight and its note', async () => {
    const r = await createHighlight('owner', {
      ...base,
      isPublic: false,
      passages: [],
      note: 'secret',
    });
    const pub = await createHighlight('owner', {
      ...base,
      start: 1,
      end: 4,
      exact: 'pub',
      note: 'shared',
    });
    if (!r.ok || !pub.ok) throw new Error('create failed');

    const other = await getDocBundle('blog', 'post', 'someone-else');
    expect(other.mine).toEqual([]);
    expect(other.publicNotes.map((n) => n.note)).toEqual(['shared']);
    expect(JSON.stringify(other)).not.toContain('secret');

    const anon = await getDocBundle('blog', 'post', null);
    expect(JSON.stringify(anon)).not.toContain('secret');

    expect(await updateHighlight('someone-else', r.highlight.id, { note: 'hijack' })).toBeNull();
    expect(await deleteHighlight('someone-else', r.highlight.id)).toBe(false);
    expect((await getDocBundle('blog', 'post', 'owner')).mine).toHaveLength(2);
  });
});
