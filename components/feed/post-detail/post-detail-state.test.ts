import { describe, expect, it } from 'vitest';
import type { FeedItem } from '@/lib/feed-types';
import type { Comment } from '../CommentItem';
import {
  addReplyDeep,
  canSubmitReply,
  formatFullDate,
  postBodyUsers,
  postLinkPreviewUrl,
  remainingReplyChars,
  removeCommentDeep,
  setCommentHiddenDeep,
  withCommentDelta,
  withResolvedIdentity,
} from './post-detail-state';

const c = (id: string, replies?: Comment[]): Comment =>
  ({ id, content: id, createdAt: '2024-01-01', userId: 'u', user: {}, replies }) as Comment;
const post = (extra: Partial<FeedItem> = {}): FeedItem =>
  ({ id: 'p', content: 'see https://example.com/a b', ...extra }) as FeedItem;

describe('reply budget', () => {
  it('counts down from the comment limit', () => {
    expect(remainingReplyChars('')).toBe(500);
    expect(remainingReplyChars('x'.repeat(520))).toBe(-20);
  });
  it('canSubmitReply needs text, room and no send in flight', () => {
    expect(canSubmitReply('hi', false)).toBe(true);
    expect(canSubmitReply('   ', false)).toBe(false);
    expect(canSubmitReply('hi', true)).toBe(false);
    expect(canSubmitReply('x'.repeat(501), false)).toBe(false);
    expect(canSubmitReply('x'.repeat(500), false)).toBe(true);
  });
});

describe('postLinkPreviewUrl', () => {
  it('unfurls the first link of a text-only post', () => {
    expect(postLinkPreviewUrl(post())).toBe('https://example.com/a');
  });
  it('is null for a poll, GIF, image, empty or missing post', () => {
    expect(postLinkPreviewUrl(post({ poll: {} as FeedItem['poll'] }))).toBeNull();
    expect(postLinkPreviewUrl(post({ gifUrl: 'g' }))).toBeNull();
    expect(postLinkPreviewUrl(post({ imageUrls: ['i'] }))).toBeNull();
    expect(postLinkPreviewUrl(post({ imageUrls: [] }))).toBe('https://example.com/a');
    expect(postLinkPreviewUrl(post({ content: '' }))).toBeNull();
    expect(postLinkPreviewUrl(null)).toBeNull();
  });
});

describe('postBodyUsers', () => {
  it('collects author, reposter and quoted author', () => {
    const users = postBodyUsers(
      post({
        user: { id: 'a' },
        repostedBy: { id: 'b' },
        original: { id: 'o', user: { id: 'c' } } as FeedItem,
      }),
    );
    expect(users.map((u) => u.id)).toEqual(['a', 'b', 'c']);
    expect(postBodyUsers(post())).toEqual([]);
  });
});

describe('withCommentDelta', () => {
  it('moves the count and clamps at zero', () => {
    expect(withCommentDelta(post({ commentCount: 2 }), 1)?.commentCount).toBe(3);
    expect(withCommentDelta(post(), 1)?.commentCount).toBe(1);
    expect(withCommentDelta(post({ commentCount: 0 }), -1)?.commentCount).toBe(0);
    expect(withCommentDelta(null, 1)).toBeNull();
  });
});

describe('nested reply edits', () => {
  const tree = [c('a', [c('a1', [c('a1x')])]), c('b')];

  it('addReplyDeep appends at any depth', () => {
    const next = addReplyDeep(tree, 'a1', c('new'));
    expect(next[0].replies?.[0].replies?.map((r) => r.id)).toEqual(['a1x', 'new']);
    expect(addReplyDeep(tree, 'b', c('n'))[1].replies?.map((r) => r.id)).toEqual(['n']);
    expect(tree[1].replies).toBeUndefined();
  });
  it('removeCommentDeep drops the subtree at any depth', () => {
    expect(removeCommentDeep(tree, 'a1')[0].replies).toEqual([]);
    expect(removeCommentDeep(tree, 'b').map((x) => x.id)).toEqual(['a']);
  });
  it('setCommentHiddenDeep flips one flag in place', () => {
    const next = setCommentHiddenDeep(tree, 'a1x', true);
    expect(next[0].replies?.[0].replies?.[0].hidden).toBe(true);
    expect(next[1].hidden).toBeUndefined();
  });
});

describe('withResolvedIdentity', () => {
  it('prefers the resolved name and image, falling back to the session', () => {
    const user = { id: 'u', name: 'S', image: '/s.png' };
    expect(withResolvedIdentity(user, { name: 'R', image: '/r.png' })).toEqual({
      id: 'u',
      name: 'R',
      image: '/r.png',
    });
    expect(withResolvedIdentity(user, { name: '', image: null })).toEqual(user);
    expect(withResolvedIdentity(user, null)).toEqual(user);
  });
});

describe('formatFullDate', () => {
  it('spells out the month with the time', () => {
    expect(formatFullDate('2024-03-05T11:00:00')).toMatch(/^March 5, 2024 at 11:00 AM$/);
  });
});
