import { describe, expect, it } from 'vitest';
import { createFakeHost, gqlKey } from '../../test-support';
import { ADMIT_GRAPHQL_PATH } from '../../sources';
import { createAdmitClient } from './client';
import { AdmitResponseError } from './client';
import { FORUM_THREAD, FORUM_THREADS } from './queries';
import { createAdmitForumClient, forumHtmlToText, isSdnMirror } from './forum';
import { admitForumCursorHash, admitForumPostKey, admitMemberKey } from './member-key';

const SECRET = 'test-secret-0123456789abcdef';
/** Person-shaped strings only the hostile fixtures contain. */
const NEEDLES = [
  'ForumHostileNameZQ',
  'forum-user-id-zq-0001',
  'QuotedPersonZQ',
  'zq.forum@example.com',
  '@handle_forum_zq',
];

const threadVars = (slug: string, offset: number) => ({ slug, year: 2026, limit: 100, offset });
const threadKey = (slug: string, offset: number) =>
  gqlKey(ADMIT_GRAPHQL_PATH, FORUM_THREAD.operationName, threadVars(slug, offset));

interface RawPost {
  id: string;
  content: string | null;
  created_at: string;
  user: { id: string | null; public_display_name: string | null; roles: string[] } | null;
}
const raw = (id: string, content: string, over: Partial<RawPost> = {}): RawPost => ({
  id,
  content,
  created_at: '2026-11-20T10:00:00.000Z',
  user: { id: 'forum-user-id-zq-0001', public_display_name: 'ForumHostileNameZQ', roles: ['USER'] },
  ...over,
});
const body = (posts: unknown[], count = posts.length) =>
  JSON.stringify({ data: { getSchoolThread: { comment_count: count, posts } } });

function client(routes: Record<string, string | null>) {
  const fh = createFakeHost(routes);
  const session = fh.host.session();
  return { fc: createAdmitForumClient(session, { secret: SECRET }), session, fh };
}

describe('isSdnMirror', () => {
  const base = { id: 'aB3dE5g', html: '<p>got an II today</p>', roles: ['USER'] };
  it('keeps an ordinary native post', () => expect(isSdnMirror(base)).toBe(false));
  it('flags an SDN-style numeric post id', () => expect(isSdnMirror({ ...base, id: '48211937' })).toBe(true));
  it('flags a link to an SDN thread or post (the words are someone else)', () => {
    expect(
      isSdnMirror({ ...base, html: '<a href="https://forums.studentdoctor.net/threads/x.1/post-9">here</a>' }),
    ).toBe(true);
    expect(isSdnMirror({ ...base, html: '<p>see studentdoctor.net/goto/post?id=12</p>' })).toBe(true);
  });
  it('flags an attribution banner and an import-ish role', () => {
    expect(isSdnMirror({ ...base, html: '<p>Originally posted on SDN by someone</p>' })).toBe(true);
    expect(isSdnMirror({ ...base, html: '<p>crossposted from Student Doctor Network</p>' })).toBe(true);
    expect(isSdnMirror({ ...base, roles: ['SDN_IMPORT'] })).toBe(true);
  });
  it('does not flag a native post that merely mentions SDN', () => {
    expect(isSdnMirror({ ...base, html: '<p>someone on the SDN md/phd thread has 20 ii</p>' })).toBe(false);
  });
});

describe('forumHtmlToText', () => {
  it('drops quotes and unfurl cards before anything else and keeps paragraph breaks', () => {
    const t = forumHtmlToText(
      '<blockquote><p>QuotedPersonZQ got an interview</p></blockquote><p>congrats</p><div class="bbCodeBlock--unfurl">QuotedPersonZQ card</div><p>me too<br>soon</p>',
    );
    expect(t).toBe('congrats\nme too\nsoon');
    expect(t).not.toContain('QuotedPersonZQ');
  });
});

describe('createAdmitForumClient', () => {
  it('lists every school thread, pages until a short page, and drops malformed rows', async () => {
    const page = (n: number, start: number) =>
      Array.from({ length: n }, (_, i) => ({
        comment_count: 5,
        latest_post_date: '2026-11-22T00:00:00.000Z',
        school: { slug: `s-${start + i}` },
      }));
    const key = (offset: number) =>
      gqlKey(ADMIT_GRAPHQL_PATH, FORUM_THREADS.operationName, {
        filterOwnSchools: false,
        year: 2026,
        limit: 100,
        offset,
      });
    const { fc, fh } = client({
      [key(0)]: JSON.stringify({ data: { getAllSchoolThreads: page(100, 0) } }),
      [key(100)]: JSON.stringify({
        data: { getAllSchoolThreads: [...page(20, 100), { comment_count: 'x' }, { school: null }] },
      }),
    });
    const out = await fc.listThreads(2026);
    expect(out.threads).toHaveLength(120);
    expect(out.malformed).toBe(2);
    expect(fh.requestedPosts.map((r) => r.op)).toEqual(['getAllSchoolThreads', 'getAllSchoolThreads']);
  });

  it('keys a post on the member with the SAME key the tracker feed writes, and an anonymous one per post', async () => {
    const { fc } = client({
      [threadKey('harvard', 0)]: body([
        raw('p000001', '<p>II today</p>'),
        raw('p000002', '<p>II today</p>', { user: { id: null, public_display_name: 'anonymous', roles: [] } }),
      ]),
    });
    const page = await fc.fetchPosts('harvard', 2026, 0);
    const [member, anon] = page.posts;
    expect(member!.eventKey('INTERVIEW', 's1', 2027, '2026-11-20')).toBe(
      admitMemberKey(SECRET, 'forum-user-id-zq-0001', 's1', 2027, 'INTERVIEW'),
    );
    // the feed's key for the same member, school, cycle and type is the identical string (one report, counted once)
    const feed = createAdmitClient(
      createFakeHost({
        [gqlKey(ADMIT_GRAPHQL_PATH, 'getRecentSchoolCycleUpdates', { filterOwnSchools: false, slug: 'allSchools' })]:
          JSON.stringify({
            data: {
              getRecentSchoolCycleUpdates: [
                {
                  cycle_update_id: 'u1',
                  school: { slug: 'harvard' },
                  user_id: 'forum-user-id-zq-0001',
                  current_status: 'INTERVIEW',
                  current_status_date: '2026-11-20T10:00:00.000Z',
                },
              ],
            },
          }),
      }).host.session(),
      { secret: SECRET },
    );
    const items = (await feed.fetchFeed()).items;
    expect(items[0]!.keyFor('s1')).toBe(member!.eventKey('INTERVIEW', 's1', 2027, '2026-11-20'));
    // an anonymous post has no member: a per-post key, different per type and day, never a member key
    const k = anon!.eventKey('INTERVIEW', 's1', 2027, '2026-11-20');
    expect(k).toBe(admitForumPostKey(SECRET, 'p000002', 'INTERVIEW', '2026-11-20'));
    expect(k).not.toBe(member!.eventKey('INTERVIEW', 's1', 2027, '2026-11-20'));
    expect(anon!.eventKey('ACCEPTANCE', 's1', 2027, '2026-11-20')).not.toBe(k);
  });

  it('returns hashes and redacted text only: no id, name, email or handle survives', async () => {
    const { fc } = client({
      [threadKey('harvard', 0)]: body([
        raw(
          'p000003',
          '<blockquote>QuotedPersonZQ: II yesterday</blockquote><p>ForumHostileNameZQ here, mail zq.forum@example.com or ping @handle_forum_zq, got an II at https://x.example/me</p>',
        ),
      ]),
    });
    const page = await fc.fetchPosts('harvard', 2026, 0);
    const dump = JSON.stringify(page.posts) + page.posts.map((p) => p.text).join('|');
    for (const n of NEEDLES) expect(dump).not.toContain(n);
    expect(dump).not.toContain('p000003');
    expect(page.posts[0]!.text).toContain('[email]');
    expect(page.posts[0]!.text).toContain('[user]');
    expect(page.posts[0]!.text).toContain('[link]');
    expect(page.posts[0]!.postHash).toBe(admitForumCursorHash(SECRET, 'p000003'));
    expect(page.containsHandle('ForumHostileNameZQ')).toBe(true);
  });

  it('turns a mirrored post into a text-less, key-less item that still moves the cursor', async () => {
    const { fc } = client({
      [threadKey('harvard', 0)]: body([
        raw('48211937', '<p>II today</p>'),
        raw('p000004', '<p>see <a href="https://forums.studentdoctor.net/threads/a.1/">this</a></p>'),
        raw('p000005', '<p>II today</p>'),
      ]),
    });
    const page = await fc.fetchPosts('harvard', 2026, 0);
    expect(page.posts.map((p) => p.mirrored)).toEqual([true, true, false]);
    expect(page.posts[0]!.text).toBe('');
    expect(() => page.posts[0]!.eventKey('INTERVIEW', 's1', 2027, '2026-11-20')).toThrow();
    expect(page.posts[0]!.postHash).toBe(admitForumCursorHash(SECRET, '48211937'));
  });

  it('counts a malformed post and an unparseable date instead of failing the page', async () => {
    const { fc } = client({
      [threadKey('harvard', 0)]: body(
        [raw('p000006', '<p>x</p>', { created_at: 'nonsense' }), { id: 5 }, raw('p000007', '<p>y</p>')],
        3,
      ),
    });
    const page = await fc.fetchPosts('harvard', 2026, 0);
    expect(page.posts).toHaveLength(1);
    expect(page.malformed).toBe(2);
  });

  it('a GraphQL errors reply and a non-JSON reply are counted failures, never an empty page', async () => {
    const { fc, session } = client({
      [threadKey('a', 0)]: JSON.stringify({ errors: [{ message: 'x' }], data: null }),
      [threadKey('b', 0)]: 'not json',
    });
    await expect(fc.fetchPosts('a', 2026, 0)).rejects.toBeInstanceOf(AdmitResponseError);
    await expect(fc.fetchPosts('b', 2026, 0)).rejects.toBeInstanceOf(AdmitResponseError);
    expect(session.lastFailure).toContain('getSchoolThread');
  });

  it('selects no avatar, message count, join date or latest user', () => {
    for (const q of [FORUM_THREAD.query, FORUM_THREADS.query]) {
      expect(q).not.toMatch(/avatar|latest_user|joined|message|profile_image/i);
    }
    expect(FORUM_THREAD.query).toContain('limit: $limit');
  });
});
