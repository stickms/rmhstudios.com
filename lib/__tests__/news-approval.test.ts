import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createNewsApprovalToken, verifyNewsApprovalToken } from '@/lib/news-approval.server';

describe('news approval tokens', () => {
  const previous = process.env.NEWS_APPROVAL_SECRET;

  beforeEach(() => {
    process.env.NEWS_APPROVAL_SECRET = 'test-secret-with-sufficient-entropy';
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-12T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    if (previous === undefined) delete process.env.NEWS_APPROVAL_SECRET;
    else process.env.NEWS_APPROVAL_SECRET = previous;
  });

  it('binds a token to its action and slug', () => {
    const token = createNewsApprovalToken('approve', 'article-slug');
    expect(verifyNewsApprovalToken('approve', 'article-slug', token)).toBe(true);
    expect(verifyNewsApprovalToken('reject', 'article-slug', token)).toBe(false);
    expect(verifyNewsApprovalToken('approve', 'different-slug', token)).toBe(false);
  });

  it('expires after 24 hours', () => {
    const token = createNewsApprovalToken('approve', 'article-slug');
    vi.advanceTimersByTime(24 * 60 * 60 * 1000 + 1000);
    expect(verifyNewsApprovalToken('approve', 'article-slug', token)).toBe(false);
  });

  it('fails closed without a configured secret', () => {
    const token = createNewsApprovalToken('approve', 'article-slug');
    delete process.env.NEWS_APPROVAL_SECRET;
    expect(verifyNewsApprovalToken('approve', 'article-slug', token)).toBe(false);
  });
});
