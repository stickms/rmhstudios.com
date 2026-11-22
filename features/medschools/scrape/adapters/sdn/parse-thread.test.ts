import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { assertNoLeak, NEEDLES, SDN_HOSTILE_NEEDLES } from '../../test-support';
import { SdnPageError } from './guard';
import { parseThreadPage } from './parse-thread';
import { readFixture } from './test-fixtures';

const hash = (id: string) => `h(${id})`;
const hostile = () => parseThreadPage(readFixture('thread-hostile.html'), hash);

describe('parseThreadPage', () => {
  it('thread-small-p1 parses posts with a hash, a UTC postedAt and text', () => {
    const p = parseThreadPage(readFixture('thread-small-p1.html'), hash);
    expect(p.posts.length).toBeGreaterThan(0);
    for (const post of p.posts) {
      expect(post.postHash).toMatch(/^h\(\d+\)$/);
      expect(post.postedAt).toBeInstanceOf(Date);
      expect(Number.isNaN(post.postedAt.getTime())).toBe(false);
    }
    expect(p.lastPage).toBe(1);
  });
  it('hashPostId receives the raw id and the result is what postHash holds', () => {
    const p = hostile();
    expect(p.posts.map((x) => x.postHash)).toEqual(['h(8000001)', 'h(8000002)', 'h(8000003)', 'h(8000004)']);
    expect(p.posts[0]?.postedAt.toISOString()).toBe('2026-11-01T15:00:00.000Z');
  });
  it('eventKey is deterministic and differs per type; the member key ignores the day, the fallback does not', () => {
    const posts = hostile().posts;
    const k = (n: number, type: 'INTERVIEW' | 'ACCEPTANCE', day: string) => posts[n]?.eventKey(type, '9:2027', day);
    // Every post in the hostile fixture carries member id 7771: one member, one key per type and scope.
    expect(k(0, 'INTERVIEW', '2026-11-03')).toBe(k(0, 'INTERVIEW', '2026-11-03'));
    expect(k(0, 'INTERVIEW', '2026-11-03')).toBe(k(1, 'INTERVIEW', '2026-11-20'));
    expect(k(0, 'ACCEPTANCE', '2026-11-03')).not.toBe(k(0, 'INTERVIEW', '2026-11-03'));
    expect(posts[0]?.eventKey('INTERVIEW', '9:2028', 'd')).not.toBe(k(0, 'INTERVIEW', 'd'));
    // No member id and no handle: the per-post key.
    const bare = parseThreadPage(
      '<article class="message--post" data-content="post-5"><time class="u-dt" datetime="2026-11-01T10:00:00+0000"></time><div class="bbWrapper">x</div></article>',
      hash,
    ).posts[0];
    expect(bare?.eventKey('INTERVIEW', 's', '2026-11-03')).toBe('h(5:INTERVIEW:2026-11-03)');
    expect(bare?.eventKey('INTERVIEW', 's', '2026-11-04')).not.toBe(bare?.eventKey('INTERVIEW', 's', '2026-11-03'));
  });
  it('the member is the header link id, else the lower-cased handle; a body mention is never the author', () => {
    const post = (attrs: string, header: string) =>
      parseThreadPage(
        `<article class="message--post" ${attrs} data-content="post-1"><section class="message-user">${header}</section><time class="u-dt" datetime="2026-11-01T10:00:00+0000"></time><div class="bbWrapper"><a class="username" data-user-id="999">@Other</a> hi</div></article>`,
        hash,
      ).posts[0];
    const key = (p: ReturnType<typeof post>) => p?.eventKey('INTERVIEW', 's', 'd');
    const byId = key(post('data-author="Foo"', '<a class="username" data-user-id="42">Foo</a>'));
    expect(byId).toBe('h(author:u42:s:INTERVIEW)');
    expect(key(post('data-author="Bar"', '<a class="username" data-user-id="42">Bar</a>'))).toBe(byId);
    expect(key(post('data-author="FooBar"', ''))).toBe('h(author:hfoobar:s:INTERVIEW)');
  });
  it('the member id and handle never appear in the parse output, its JSON, or a real hash', () => {
    const real = (id: string) => createHash('sha256').update(`secret:${id}`).digest('hex');
    const p = parseThreadPage(readFixture('thread-hostile.html'), real);
    const keys = p.posts.map((x) => x.eventKey('INTERVIEW', '9:2027', '2026-11-03'));
    const dump = JSON.stringify(p) + p.posts.map((x) => x.text + x.postHash).join('|') + keys.join('|');
    for (const a of ['7771', 'u7771', 'hostile_author_zq', 'author-002', 'author:']) expect(dump).not.toContain(a);
    expect(keys.every((k) => /^[0-9a-f]{64}$/.test(k))).toBe(true);
  });
  it('a link-unfurl card (a member page title or snippet) never reaches the text, which keeps the words around it', () => {
    const plain = hostile().posts[3];
    expect(plain?.text).toBe('Accepted on 11/10, so happy.');
    expect(JSON.stringify(hostile())).not.toContain('unfurled_member_zq');
    expect(readFixture('thread-hostile.html')).toContain('bbCodeBlock--unfurl');
  });
  it('blockquote is stripped before anything, nested too', () => {
    const [, quoted, nested, plain] = hostile().posts;
    expect(quoted?.text).toBe('');
    expect(nested?.text).toBe('Congrats!');
    expect(JSON.stringify(hostile())).not.toMatch(/quotedonlywords|outerquotedwords|innerquotedwords/);
    expect(plain?.text).toBe('Accepted on 11/10, so happy.');
  });
  it('post text is redacted and signatures are ignored', () => {
    const text = hostile().posts[0]?.text ?? '';
    expect(text).toContain('[email]');
    expect(text).toContain('[link]');
    expect(text.match(/\[user\]/g)).toHaveLength(2);
    expect(text).toContain('\n');
    expect(text).not.toContain('sigzq');
  });
  it('containsHandle is true for a page handle appearing in any string and false otherwise', () => {
    const p = hostile();
    expect(p.containsHandle('the HOSTILE_author_zq wrote')).toBe(true);
    expect(p.containsHandle('nothing here')).toBe(false);
  });
  it('lastPage is read from the pagination', () => {
    expect(parseThreadPage(readFixture('thread-busy-last.html'), hash).lastPage).toBe(6);
  });
  it('thread-past-end.html is the last page, so lastPage still stops the walk', () => {
    const p = parseThreadPage(readFixture('thread-past-end.html'), hash);
    expect(p.lastPage).toBe(6);
    expect(p.posts.length).toBeGreaterThan(0);
  });
  it('thread-challenge.html throws SdnPageError', () => {
    expect(() => parseThreadPage(readFixture('thread-challenge.html'), hash)).toThrow(SdnPageError);
  });
  it('a page with zero posts throws, never returns []', () => {
    expect(() => parseThreadPage('<html><body><div class="block-body"></div></body></html>', hash)).toThrow(
      SdnPageError,
    );
  });
  it('result exposes no author, handle, avatar or raw id', () => {
    const p = hostile();
    const dump = JSON.stringify(p) + p.posts.map((x) => x.text).join('|');
    for (const a of ['hostile_author_zq', 'author-002', 'author-003', 'author-004', 'user-002'])
      expect(dump).not.toContain(a);
    expect(Object.keys(p).sort()).toEqual(['containsHandle', 'lastPage', 'posts']);
    assertNoLeak([p, p.posts.map((x) => x.text)], NEEDLES);
    assertNoLeak([p.posts.map((x) => x.text)], [...SDN_HOSTILE_NEEDLES]);
    const opaque = parseThreadPage(readFixture('thread-hostile.html'), (id) =>
      createHash('sha256').update(id).digest('hex'),
    );
    expect(JSON.stringify(opaque)).not.toMatch(/800000\d/);
  });
});
