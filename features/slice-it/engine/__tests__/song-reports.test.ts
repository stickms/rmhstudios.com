import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MEMBER_ITEM_REPORT_TYPES,
  REMOVABLE_REPORT_ENTITY_TYPES,
  REPORT_ENTITY_TYPES,
} from '@/lib/moderation/report-constants';

/**
 * s14-07: a Slice It song (`song`) and a comment on one (`song-comment`) go through the report flow. Each is refused
 * for its own uploader or author and for a missing, private or taken-down song with one answer, and each is removable
 * from the queue. The module runs against a small in-memory database whose row shapes follow `slice-it.prisma`.
 */

interface SongRow {
  id: string;
  title: string;
  artist: string;
  uploadedBy: string;
  isPublic: boolean;
  takenDownAt: Date | null;
}
interface CommentRow {
  id: string;
  songId: string;
  userId: string;
  content: string;
}
const h = vi.hoisted(() => ({
  songs: [] as SongRow[],
  comments: [] as CommentRow[],
  users: new Map<string, { id: string; name: string }>(),
}));

const userOf = (id: string) => ({ id, name: h.users.get(id)?.name ?? null, profile: null, inventory: [] });
vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    song: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => h.songs.find((s) => s.id === where.id) ?? null),
      findMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
        h.songs.filter((s) => where.id.in.includes(s.id)).map((s) => ({ ...s, uploader: userOf(s.uploadedBy) })),
      ),
    },
    songComment: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const c = h.comments.find((x) => x.id === where.id);
        const song = c && h.songs.find((s) => s.id === c.songId);
        return c && song ? { ...c, song } : null;
      }),
      findMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
        h.comments
          .filter((c) => where.id.in.includes(c.id))
          .map((c) => ({ ...c, song: h.songs.find((s) => s.id === c.songId) })),
      ),
      deleteMany: vi.fn(async ({ where }: { where: { id: string } }) => {
        const before = h.comments.length;
        h.comments = h.comments.filter((c) => c.id !== where.id);
        return { count: before - h.comments.length };
      }),
    },
  },
}));

import {
  COMMENT_PREVIEW_CHARS,
  songCommentAuthor,
  songCommentPreviews,
  songCommentReportable,
  songReportable,
  songReportPreviews,
  songReportTarget,
  takeDownSongComment,
} from '@features/slice-it/engine/song-reports.server';

const root = join(__dirname, '..', '..', '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

const song = (over: Partial<SongRow> & { id: string }): SongRow => ({
  title: 'Night Drive',
  artist: 'Kestrel',
  uploadedBy: 'uploader',
  isPublic: true,
  takenDownAt: null,
  ...over,
});

beforeEach(() => {
  h.users = new Map([
    ['uploader', { id: 'uploader', name: 'Una' }],
    ['author', { id: 'author', name: 'Ari' }],
  ]);
  h.songs = [
    song({ id: 's-public' }),
    song({ id: 's-private', isPublic: false }),
    song({ id: 's-down', takenDownAt: new Date('2026-11-01T00:00:00Z') }),
  ];
  h.comments = [
    { id: 'c-public', songId: 's-public', userId: 'author', content: 'great drop at 1:42' },
    { id: 'c-private', songId: 's-private', userId: 'author', content: 'hidden' },
    { id: 'c-down', songId: 's-down', userId: 'author', content: 'gone' },
  ];
});

describe('the registries', () => {
  it('song and song-comment are reportable, removable and held to the member-item rule', () => {
    for (const type of ['song', 'song-comment']) {
      expect(REPORT_ENTITY_TYPES).toContain(type);
      expect(REMOVABLE_REPORT_ENTITY_TYPES).toContain(type);
      expect(MEMBER_ITEM_REPORT_TYPES.has(type)).toBe(true);
    }
  });

  it('both types have a takedown branch, a preview block, an owner lookup and report labels', () => {
    const triage = read('lib/moderation/triage.server.ts');
    const body = triage.slice(triage.indexOf('async function takedownReportedContent'));
    expect(body).toContain("entityType === 'song'");
    expect(body).toContain("entityType === 'song-comment'");
    expect(body).toContain('takeDownSong(entityId');
    expect(triage).toContain("idsOf('song-comment')");
    expect(read('lib/moderation/api/moderation.report.server.ts')).toContain("case 'song-comment':");
    expect(read('components/feed/report-kind-label.ts')).toContain("'kind-song-comment'");
    expect(read('components/moderation/MyReportsPanel.tsx')).toContain("'gone-song-comment'");
    expect(read('components/moderation/MyReportsPanel.tsx')).toContain("'gone-song'");
  });
});

describe('who may be reported', () => {
  it('a public song resolves to its uploader', async () => {
    expect(await songReportable('s-public')).toBe('uploader');
  });

  it('a missing, private or taken-down song is the same answer', async () => {
    expect(await songReportable('nope')).toBeNull();
    expect(await songReportable('s-private')).toBeNull();
    expect(await songReportable('s-down')).toBeNull();
    const answers = await Promise.all(['nope', 's-private', 's-down'].map((id) => songReportTarget(id, 'someone')));
    expect(new Set(answers.map((a) => JSON.stringify(a)))).toEqual(
      new Set([JSON.stringify({ ok: false, reason: 'not-found' })]),
    );
  });

  it('the uploader may not report their own song', async () => {
    expect(await songReportTarget('s-public', 'uploader')).toEqual({ ok: false, reason: 'own' });
    expect(await songReportTarget('s-public', 'someone')).toEqual({ ok: true, authorId: 'uploader' });
  });

  it('a comment resolves to its author while its song is public and up', async () => {
    expect(await songCommentAuthor('c-public')).toBe('author');
    expect(await songCommentReportable('c-public', 'someone')).toEqual({ ok: true, authorId: 'author' });
    // The song's uploader may report a comment on their song: it is not their own.
    expect(await songCommentReportable('c-public', 'uploader')).toEqual({ ok: true, authorId: 'author' });
  });

  it('refuses the author, a missing comment and one on a private or taken-down song alike', async () => {
    expect(await songCommentReportable('c-public', 'author')).toEqual({ ok: false, reason: 'own' });
    for (const id of ['nope', 'c-private', 'c-down']) {
      expect(await songCommentAuthor(id)).toBeNull();
      expect(await songCommentReportable(id, 'someone')).toEqual({ ok: false, reason: 'not-found' });
    }
  });
});

describe('takedowns', () => {
  it('deletes the comment and a repeated decision is harmless', async () => {
    expect(await takeDownSongComment('c-public')).toEqual({ deleted: true });
    expect(h.comments.map((c) => c.id)).not.toContain('c-public');
    expect(await takeDownSongComment('c-public')).toEqual({ deleted: false });
    expect(h.comments).toHaveLength(2);
  });
});

describe('previews', () => {
  it("shows a song's title, artist and uploader and its id, never the audio", async () => {
    const previews = await songReportPreviews(['s-public', 'nope']);
    expect([...previews.keys()]).toEqual(['s-public']);
    const text = previews.get('s-public') ?? '';
    expect(text).toContain('Night Drive');
    expect(text).toContain('Kestrel');
    expect(text).toContain('Una');
    expect(text).toContain('s-public');
    expect(text.toLowerCase()).not.toContain('audio');
  });

  it("shows a comment's text cut to 280 characters with the song's title", async () => {
    h.comments.push({ id: 'c-long', songId: 's-public', userId: 'author', content: 'x'.repeat(500) });
    const previews = await songCommentPreviews(['c-public', 'c-long']);
    expect(previews.get('c-public')).toBe('great drop at 1:42 (on Night Drive)');
    const long = previews.get('c-long') ?? '';
    expect(long.startsWith('x'.repeat(COMMENT_PREVIEW_CHARS - 1) + '…')).toBe(true);
    expect(long).toContain('(on Night Drive)');
    expect(long.length).toBeLessThan(COMMENT_PREVIEW_CHARS + 30);
  });

  it('answers empty for no ids without a query', async () => {
    expect((await songReportPreviews([])).size).toBe(0);
    expect((await songCommentPreviews([])).size).toBe(0);
  });
});
