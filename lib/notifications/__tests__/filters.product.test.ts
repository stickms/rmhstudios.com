import { describe, expect, it } from 'vitest';
import {
  isNotificationFilter,
  NOTIFICATION_FILTER_IDS,
  NOTIFICATION_FILTERS,
  typesFor,
} from '@/lib/notifications/filters';

describe('notification filters', () => {
  it('lists All, Mentions and replies, Follows, Likes and reposts, System in order', () => {
    expect(NOTIFICATION_FILTER_IDS).toEqual(['all', 'mentions', 'follows', 'likes', 'system']);
  });

  it('maps each filter to its types', () => {
    expect(typesFor('mentions')).toEqual(['MENTION', 'REPLY', 'COMMENT']);
    expect(typesFor('follows')).toEqual(['FOLLOW']);
    expect(typesFor('likes')).toEqual(['LIKE', 'REPOST']);
    expect(typesFor('system')).toEqual(['SYSTEM']);
  });

  it('puts no type constraint on All or on a missing filter', () => {
    expect(typesFor('all')).toBeUndefined();
    expect(typesFor(undefined)).toBeUndefined();
    expect(typesFor(null)).toBeUndefined();
  });

  it('covers every notification type exactly once outside All', () => {
    const types = NOTIFICATION_FILTERS.flatMap((f) => (f.types ? [...f.types] : []));
    expect([...types].sort()).toEqual(['COMMENT', 'FOLLOW', 'LIKE', 'MENTION', 'REPLY', 'REPOST', 'SYSTEM'].sort());
  });

  it('returns a copy, so a caller cannot change the table', () => {
    typesFor('follows')!.push('LIKE');
    expect(typesFor('follows')).toEqual(['FOLLOW']);
  });

  it('recognises only known ids', () => {
    expect(isNotificationFilter('likes')).toBe(true);
    expect(isNotificationFilter('bogus')).toBe(false);
    expect(isNotificationFilter(null)).toBe(false);
  });
});
