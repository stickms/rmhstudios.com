/**
 * Quiet counts (sprint 04 #14): what a viewer sees for every combination of the two switches.
 *
 * The author's switch ("hide counts on my posts") is applied by the server (`redactCounts`, which hands the
 * client `null`); the viewer's switch ("hide counts while browsing") is applied on the client (`displayCount`).
 * Together they give the table below, where "n" is a real number.
 */
import { describe, expect, it } from 'vitest';
import { bumpCount, displayCount, redactCounts } from '@/lib/feed/quiet-counts';

interface Item {
  likeCount: number;
  commentCount: number;
  repostCount: number;
  viewCount: number;
  user: { id: string; hideCounts?: boolean };
}

const item = (authorHides: boolean): Item => ({
  likeCount: 7,
  commentCount: 3,
  repostCount: 2,
  viewCount: 120,
  user: { id: 'author', hideCounts: authorHides },
});

/** What the viewer's screen draws beside the like button, end to end. */
const seen = (authorHides: boolean, viewerIsAuthor: boolean, viewerHidesInFeed: boolean) =>
  displayCount(redactCounts(item(authorHides), viewerIsAuthor ? 'author' : 'reader').likeCount, viewerHidesInFeed);

describe('what the viewer sees, for every combination of the two switches', () => {
  // [author hides on mine, viewer is the author, viewer hides while browsing] -> number or nothing
  const table: [boolean, boolean, boolean, number | null][] = [
    // Nobody hides anything.
    [false, false, false, 7],
    [false, true, false, 7],
    // Only the viewer hides while browsing: nothing for anyone's posts, their own included.
    [false, false, true, null],
    [false, true, true, null],
    // The author hides on their posts: others see nothing, the author still sees their own.
    [true, false, false, null],
    [true, true, false, 7],
    // Both: the viewer's switch wins over the author's exemption; a stranger still sees nothing.
    [true, false, true, null],
    [true, true, true, null],
  ];

  it.each(table)('author hides=%s, viewer is the author=%s, viewer hides while browsing=%s -> %s', (a, own, v, want) => {
    expect(seen(a, own, v)).toBe(want);
  });

  it('turning either switch off restores the numbers at once (the rule is a pure function of both)', () => {
    expect(seen(true, false, true)).toBeNull();
    expect(seen(false, false, true)).toBeNull();
    expect(seen(false, false, false)).toBe(7);
  });
});

describe('redactCounts', () => {
  it('nulls all four counts and nothing else', () => {
    const out = redactCounts(item(true), 'reader');
    expect([out.likeCount, out.commentCount, out.repostCount, out.viewCount]).toEqual([null, null, null, null]);
    expect(out.user).toEqual({ id: 'author', hideCounts: true });
  });

  it('keeps an item without an author switch, a signed-out reader included', () => {
    expect(redactCounts(item(false), null)).toEqual(item(false));
    expect(redactCounts({ likeCount: 1 }, null)).toEqual({ likeCount: 1 });
  });

  it('is idempotent', () => {
    const once = redactCounts(item(true), 'reader');
    expect(redactCounts(once, 'reader')).toEqual(once);
  });

  it('does not change the object it was given', () => {
    const original = item(true);
    redactCounts(original, 'reader');
    expect(original.likeCount).toBe(7);
  });
});

describe('displayCount', () => {
  it('shows a real number, including zero, when the viewer has not hidden counts', () => {
    expect(displayCount(0, false)).toBe(0);
    expect(displayCount(12, false)).toBe(12);
  });

  it('shows nothing for a withheld or missing number', () => {
    expect(displayCount(null, false)).toBeNull();
    expect(displayCount(undefined, false)).toBeNull();
  });
});

describe('bumpCount (optimistic like, repost and reply)', () => {
  it('moves a real number and never goes below zero', () => {
    expect(bumpCount(4, 1)).toBe(5);
    expect(bumpCount(4, -1)).toBe(3);
    expect(bumpCount(0, -1)).toBe(0);
  });

  it('keeps a withheld number withheld, so liking a hidden post does not reveal a "1"', () => {
    expect(bumpCount(null, 1)).toBeNull();
    expect(bumpCount(null, -1)).toBeNull();
  });

  it('starts from zero for an item that has no count yet', () => {
    expect(bumpCount(undefined, 1)).toBe(1);
  });
});
