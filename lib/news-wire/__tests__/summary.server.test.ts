/**
 * RMH News summaries spend money (DeepSeek tokens) on a public, signed-out endpoint. What is pinned here is when the
 * model is NOT called: a cached summary, a page remembered as unreadable, no key, today's cap spent, and a second
 * concurrent click on the same article.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  findUnique: vi.fn(),
  count: vi.fn(),
  updateMany: vi.fn(),
}));
const ai = vi.hoisted(() => ({ configured: true, runTaskJson: vi.fn() }));
const page = vi.hoisted(() => ({ fetchArticlePage: vi.fn() }));

vi.mock('@/lib/prisma.server', () => ({
  prisma: { newsArticle: { findUnique: db.findUnique, count: db.count, updateMany: db.updateMany } },
}));
vi.mock('@/lib/ai/provider.server', () => ({
  isAiConfigured: () => ai.configured,
  runTaskJson: ai.runTaskJson,
}));
vi.mock('../fetch.server', () => ({ fetchArticlePage: page.fetchArticlePage }));

import { getOrCreateSummary } from '../summary.server';
import { DEEPSEEK_FLASH } from '@/lib/ai/deepseek-models';

const NOW = new Date('2026-11-23T12:00:00Z');
const STORY = `<html><head><meta property="og:image" content="https://img.example.com/a.jpg"></head><body><article>${'<p>The council voted on Monday to approve the new transit plan after a long public debate over costs.</p>'.repeat(8)}</article></body></html>`;

function row(over: Record<string, unknown> = {}) {
  return {
    id: 'n1',
    slug: 'transit-plan-abc1234',
    title: 'Council approves transit plan',
    status: 'PUBLISHED',
    origin: 'WIRE',
    content: 'excerpt',
    image: null,
    sourceUrl: 'https://news.example.com/transit',
    sourcePublisher: 'Example News',
    summary: null,
    summarizedAt: null,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  ai.configured = true;
  db.count.mockResolvedValue(0);
  db.updateMany.mockResolvedValue({ count: 1 });
  page.fetchArticlePage.mockResolvedValue(STORY);
  ai.runTaskJson.mockResolvedValue({ tldr: 'The council approved the plan.', points: ['It passed on Monday.'] });
});

describe('getOrCreateSummary', () => {
  it('serves a stored summary without reading the page or calling the model', async () => {
    db.findUnique.mockResolvedValue(row({ summary: JSON.stringify({ tldr: 'Done.', points: ['A fact.'] }) }));
    await expect(getOrCreateSummary('s', NOW)).resolves.toEqual({
      status: 'ready',
      summary: { tldr: 'Done.', points: ['A fact.'] },
    });
    expect(page.fetchArticlePage).not.toHaveBeenCalled();
    expect(ai.runTaskJson).not.toHaveBeenCalled();
  });

  it('remembers an unreadable page for a day', async () => {
    db.findUnique.mockResolvedValue(row({ summary: '', summarizedAt: new Date(NOW.getTime() - 3_600_000) }));
    await expect(getOrCreateSummary('s', NOW)).resolves.toEqual({ status: 'unavailable', reason: 'no-text' });
    expect(page.fetchArticlePage).not.toHaveBeenCalled();
    expect(ai.runTaskJson).not.toHaveBeenCalled();
  });

  it('calls nothing without a key, or once the daily cap is spent', async () => {
    db.findUnique.mockResolvedValue(row());
    ai.configured = false;
    await expect(getOrCreateSummary('s', NOW)).resolves.toEqual({ status: 'unavailable', reason: 'ai-off' });
    ai.configured = true;
    db.count.mockResolvedValue(400);
    await expect(getOrCreateSummary('s', NOW)).resolves.toEqual({ status: 'unavailable', reason: 'busy' });
    expect(ai.runTaskJson).not.toHaveBeenCalled();
  });

  it('writes once for two concurrent clicks, from the article text, and stores it conditionally', async () => {
    db.findUnique.mockResolvedValue(row());
    const [a, b] = await Promise.all([getOrCreateSummary('s', NOW), getOrCreateSummary('s', NOW)]);
    expect(a).toEqual(b);
    expect(a?.status).toBe('ready');
    expect(ai.runTaskJson).toHaveBeenCalledTimes(1);
    expect(ai.runTaskJson.mock.calls[0]?.[2]).toContain('<user-content>');
    expect(ai.runTaskJson.mock.calls[0]?.[2]).toContain('approve the new transit plan');
    // Pinned to DeepSeek Flash with thinking off, never whatever the shared route says.
    expect(ai.runTaskJson.mock.calls[0]?.[4]).toMatchObject({ profile: DEEPSEEK_FLASH });
    expect(DEEPSEEK_FLASH.thinking.type).toBe('disabled');
    expect(db.updateMany).toHaveBeenCalledWith({
      where: { id: 'n1', OR: [{ summary: null }, { summary: '' }] },
      data: expect.objectContaining({ image: 'https://img.example.com/a.jpg', summarizedAt: NOW }),
    });
  });

  it('does not call the model on a page with no article, and remembers that', async () => {
    db.findUnique.mockResolvedValue(row());
    page.fetchArticlePage.mockResolvedValue('<html><body><p>Subscribe to continue.</p></body></html>');
    await expect(getOrCreateSummary('s', NOW)).resolves.toEqual({ status: 'unavailable', reason: 'no-text' });
    expect(ai.runTaskJson).not.toHaveBeenCalled();
    expect(db.updateMany.mock.calls[0]?.[0].data.summary).toBe('');
  });

  it('is null for an unknown or unpublished article', async () => {
    db.findUnique.mockResolvedValue(null);
    await expect(getOrCreateSummary('s', NOW)).resolves.toBeNull();
    db.findUnique.mockResolvedValue(row({ status: 'STAGING' }));
    await expect(getOrCreateSummary('s', NOW)).resolves.toBeNull();
  });
});
