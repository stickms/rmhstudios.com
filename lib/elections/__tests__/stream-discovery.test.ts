import { afterEach, describe, expect, it, vi } from 'vitest';
import { channelPool, CHANNEL_POOL, parseLivePage } from '../stream-discovery';
import { __resetStreamDiscovery, getAutoStreams } from '../stream-discovery.server';
import { mergeStreams } from '../streams';

const PBS = 'UC6ZFN9Tx6xh-skXCuRHCDpQ';

// Fragments of a real `/channel/<id>/live` page for a live broadcast.
const page = (
  o: { live?: boolean; channel?: string; canonical?: string; video?: string; author?: string } = {},
) => {
  const video = o.video ?? '3ABLwTR8Iqg';
  return (
    `<html><head><link rel="canonical" href="https://www.youtube.com/watch?v=${o.canonical ?? video}">` +
    `</head><body><script>var d={"videoDetails":{"videoId":"${video}","title":"WATCH LIVE: Election 2026 special coverage",` +
    `"author":"${o.author ?? 'PBS NewsHour'}","isLive":${o.live ?? true}},"externalChannelId":"${o.channel ?? PBS}"}</script></body></html>`
  );
};

describe('parseLivePage', () => {
  it('reads a live broadcast on the expected channel', () => {
    expect(parseLivePage(page(), PBS)).toEqual({
      videoId: '3ABLwTR8Iqg',
      author: 'PBS NewsHour',
      title: 'WATCH LIVE: Election 2026 special coverage',
    });
  });
  it('rejects a page that is not live', () => {
    expect(parseLivePage(page({ live: false }), PBS)).toBeNull();
  });
  it('rejects a page that belongs to another channel', () => {
    expect(parseLivePage(page({ channel: 'UCxxxxxxxxxxxxxxxxxxxxxx' }), PBS)).toBeNull();
  });
  it('rejects a canonical video that the player data does not name', () => {
    expect(parseLivePage(page({ canonical: 'AAAAAAAAAAA' }), PBS)).toBeNull();
  });
  it('rejects the not-live shell and junk', () => {
    expect(parseLivePage('<title> - YouTube</title>', PBS)).toBeNull();
    expect(parseLivePage('', PBS)).toBeNull();
  });
});

describe('channelPool', () => {
  it('keeps the built-in pool, adds valid extra ids once, drops junk', () => {
    const extra = channelPool(`UCaaaaaaaaaaaaaaaaaaaaaa, ${PBS}, nope, UCaaaaaaaaaaaaaaaaaaaaaa`);
    expect(extra.length).toBe(CHANNEL_POOL.length + 1);
  });
  it('only holds well-formed ids', () => {
    for (const c of CHANNEL_POOL) expect(c.id).toMatch(/^UC[A-Za-z0-9_-]{22}$/);
  });
});

describe('mergeStreams', () => {
  it('puts configured first and drops the same video twice', () => {
    const out = mergeStreams(
      [{ label: 'Ours', url: 'https://www.youtube.com/watch?v=3ABLwTR8Iqg' }],
      [
        { label: 'PBS', url: 'https://www.youtube.com/watch?v=3ABLwTR8Iqg', auto: true },
        { label: 'AP', url: 'https://www.youtube.com/watch?v=BBBBBBBBBBB', auto: true },
      ],
    );
    expect(out.map((s) => s.label)).toEqual(['Ours', 'AP']);
  });
});

describe('getAutoStreams', () => {
  afterEach(() => {
    __resetStreamDiscovery();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('returns only channels that are live, and survives failing ones', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes(PBS)) return new Response(page(), { status: 200 });
        if (url.includes('UCBi2mrWuNuyYy4gbM6fU18Q')) throw new Error('boom');
        return new Response('<title> - YouTube</title>', { status: 200 });
      }),
    );
    const streams = await getAutoStreams();
    expect(streams).toEqual([
      {
        label: 'PBS NewsHour',
        url: 'https://www.youtube.com/watch?v=3ABLwTR8Iqg',
        auto: true,
        title: 'WATCH LIVE: Election 2026 special coverage',
      },
    ]);
  });

  it('caches, and can be switched off', async () => {
    const f = vi.fn(async () => new Response('', { status: 200 }));
    vi.stubGlobal('fetch', f);
    await getAutoStreams();
    const n = f.mock.calls.length;
    await getAutoStreams();
    expect(f.mock.calls.length).toBe(n);
    __resetStreamDiscovery();
    vi.stubEnv('ELECTIONS_STREAMS_AUTO', '0');
    expect(await getAutoStreams()).toEqual([]);
    expect(f.mock.calls.length).toBe(n);
  });
});
