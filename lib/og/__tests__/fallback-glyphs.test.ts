/**
 * Cards draw emoji and non-Latin text through satori's loadAdditionalAsset. A miss
 * must never fail the render (an unfurl has no error state), and the Twemoji name
 * rule decides whether a sequence finds its picture at all.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/cached.server', () => ({
  cached: (_k: string, _t: number, loader: () => Promise<unknown>) => loader(),
}));

import { loadFallbackAsset, twemojiFileName } from '@/lib/og/fallback-glyphs.server';
import { truncate } from '@/lib/og/shared.server';

afterEach(() => vi.unstubAllGlobals());

describe('fallback glyphs', () => {
  it('names Twemoji files the way the library does', () => {
    expect(twemojiFileName('😀')).toBe('1f600');
    expect(twemojiFileName('❤️')).toBe('2764'); // FE0F dropped without a ZWJ
    expect(twemojiFileName('👨‍👩‍👧')).toBe('1f468-200d-1f469-200d-1f467');
  });

  it('answers "no asset" instead of throwing when the network is down', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    expect(await loadFallbackAsset('emoji', '😀')).toEqual([]);
    expect(await loadFallbackAsset('symbol', '☆')).toEqual([]);
  });

  it('returns the emoji as a data URI', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<svg/>', { status: 200 })));
    expect(await loadFallbackAsset('emoji', '😀')).toMatch(/^data:image\/svg\+xml;base64,/);
  });

  it('truncates by grapheme, never splitting an emoji', () => {
    expect(truncate('ab👨‍👩‍👧cd', 4)).toBe('ab👨‍👩‍👧…');
  });
});
