import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SDN_HOSTILE_NEEDLES } from '../../test-support';

const DIR = join(__dirname, '__fixtures__');
const read = (f: string) => readFileSync(join(DIR, f), 'utf8');

const HOSTILE = [
  'thread-hostile.html',
  'rss-hostile.xml',
  'listing-hostile.html',
  'summary-hostile.html',
  'essays-hostile.html',
];
const REQUIRED = [
  'forum-1198.rss',
  'forum-1199.rss',
  'forum-1198-p1.html',
  'forum-1198-p2.html',
  'forum-962-p1.html',
  'forum-603-p1.html',
  'thread-small-p1.html',
  'thread-busy-last.html',
  'thread-questions.html',
  'thread-past-end.html',
  'summary-columbia.html',
  'summary-small.html',
  'school-index.html',
  'thread-hostile.html',
  'thread-challenge.html',
  'rss-hostile.xml',
  'listing-hostile.html',
  'summary-hostile.html',
  'essays-columbia.html',
  'essays-columbia-visible.html',
  'essays-empty.html',
  'essays-changed.html',
  'essays-hostile.html',
  'thread-secondary-prompts.html',
];
const TRIMMED_THREADS = [
  'thread-small-p1.html',
  'thread-busy-last.html',
  'thread-questions.html',
  'thread-past-end.html',
];
const REAL = REQUIRED.filter((f) => !HOSTILE.includes(f));

describe('SDN fixtures', () => {
  it('required fixtures exist', () => {
    for (const f of REQUIRED) expect(() => read(f), f).not.toThrow();
  });

  it('every fixture is non-empty', () => {
    for (const f of REQUIRED) expect(read(f).length, f).toBeGreaterThan(200);
  });

  it('non-hostile fixtures contain no data-author value, no member link with a real name, no avatar URL', () => {
    for (const f of REAL) {
      const body = read(f);
      expect(body, `${f} data-author`).not.toMatch(/data-author="(?!author-\d{3}")/);
      expect(body, `${f} /members/`).not.toMatch(/\/members\/(?!user-\d{3}\.)/);
      for (const m of body.matchAll(/<img[^>]+>/g)) {
        const tag = m[0];
        if (!/avatar/i.test(tag)) continue;
        expect(tag, `${f} avatar`).toMatch(/placeholder/);
      }
      expect(body, `${f} avatar url`).not.toMatch(/\/data\/avatars\//);
    }
  });

  it('trimmed thread fixtures have at most 12 posts', () => {
    for (const f of TRIMMED_THREADS) {
      const posts = read(f).match(/<article[^>]*class="[^"]*message--post/g) ?? [];
      expect(posts.length, f).toBeGreaterThan(0);
      expect(posts.length, f).toBeLessThanOrEqual(12);
    }
  });

  it('only the hostile fixtures contain the SDN needles', () => {
    for (const f of REQUIRED) {
      const body = read(f);
      const found = SDN_HOSTILE_NEEDLES.filter((n) => body.includes(n));
      if (f === 'thread-hostile.html')
        expect(found, `${f} carries every needle`).toHaveLength(SDN_HOSTILE_NEEDLES.length);
      else if (HOSTILE.includes(f)) expect(found.length, `${f} carries a needle`).toBeGreaterThan(0);
      else expect(found, `${f} must not carry a needle`).toEqual([]);
    }
  });

  it('the challenge fixture is a Cloudflare interstitial with no posts', () => {
    const body = read('thread-challenge.html');
    expect(body).toMatch(/Just a moment/);
    expect(body).not.toMatch(/message--post/);
  });

  it('real fixtures carry the post and listing markup the parsers rely on', () => {
    expect(read('thread-small-p1.html')).toMatch(/data-content="post-9\d{6}"/);
    expect(read('forum-1198-p1.html')).toMatch(/structItem--thread/);
    expect(read('forum-1198.rss')).toMatch(/<slash:comments>/);
    expect(read('summary-columbia.html')).toMatch(/id="interview-feedback-data"/);
    expect(read('school-index.html')).toMatch(/id="schools-database-data"/);
  });
});
