import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/ssrf-guard.server', () => ({ safeFetch: vi.fn() }));

import { classifyContentType, probeMediaUrl, sniffMedia } from '@/lib/rmhtube/probe.server';
import { isNativeVideo, maybeRawMediaUrl, parseMedia, playableUrl } from '@/lib/rmhtube/media';

/**
 * Raw media links (RMHTube): links with no provider and no file extension are
 * identified by asking the host, through the SSRF-guarded fetch. The fetcher
 * is injected here; production passes `safeFetch`.
 */

type Init = RequestInit & { allowedProtocols?: string[] };

function host(routes: {
  head?: { status?: number; type?: string | null; disposition?: string };
  get?: { status?: number; type?: string | null; body?: Uint8Array };
}) {
  const calls: Array<{ method: string; range?: string; protocols?: string[] }> = [];
  const fetcher = async (_url: string, init: Init) => {
    const method = init.method ?? 'GET';
    calls.push({
      method,
      range: (init.headers as Record<string, string> | undefined)?.Range,
      protocols: init.allowedProtocols,
    });
    const r = method === 'HEAD' ? routes.head : routes.get;
    if (!r) throw new Error('refused');
    const headers = new Headers();
    if (r.type) headers.set('content-type', r.type);
    if ('disposition' in r && r.disposition) headers.set('content-disposition', r.disposition);
    const body = 'body' in r && r.body ? r.body : null;
    return new Response(method === "HEAD" || !body ? null : new Blob([body as BlobPart]), { status: r.status ?? 200, headers });
  };
  return { fetcher, calls };
}

const bytes = (s: string, prefix: number[] = []) => new Uint8Array([...prefix, ...[...s].map((c) => c.charCodeAt(0))]);

describe('classifyContentType / sniffMedia', () => {
  it('recognises media types and refuses pages', () => {
    expect(classifyContentType('video/mp4')).toBe('progressive');
    expect(classifyContentType('audio/mpeg; charset=binary')).toBe('progressive');
    expect(classifyContentType('application/vnd.apple.mpegurl')).toBe('hls');
    expect(classifyContentType('application/dash+xml')).toBe('dash');
    expect(classifyContentType('application/octet-stream')).toBe('unknown');
    expect(classifyContentType('text/html; charset=utf-8')).toBeNull();
    expect(classifyContentType('application/json')).toBeNull();
  });

  it('identifies containers from their first bytes', () => {
    expect(sniffMedia(bytes('ftypisom', [0, 0, 0, 0x20]))).toBe('progressive');
    expect(sniffMedia(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0]))).toBe('progressive');
    expect(sniffMedia(bytes('#EXTM3U\n#EXT-X-VERSION:3'))).toBe('hls');
    expect(sniffMedia(bytes('<!doctype html><html>'))).toBeNull();
  });
});

describe('probeMediaUrl', () => {
  it('accepts an extension-less video by its Content-Type, named from Content-Disposition', async () => {
    const { fetcher, calls } = host({
      head: { type: 'video/mp4', disposition: 'attachment; filename="Holiday Cut.mp4"' },
    });
    const media = await probeMediaUrl('https://files.example.com/download?id=9f2', fetcher);
    expect(media).toMatchObject({ mediaType: 'direct', liveHint: 'vod', label: 'Holiday Cut.mp4' });
    expect(media!.url).toBe('https://files.example.com/download?id=9f2');
    expect(calls).toHaveLength(1);
    // Plain http links are allowed through the guard, not just https.
    expect(calls[0].protocols).toEqual(['http:', 'https:']);
  });

  it('falls back to a ranged GET when HEAD is refused, and sniffs octet-streams', async () => {
    const { fetcher, calls } = host({
      head: { status: 405 },
      get: { status: 206, type: 'application/octet-stream', body: bytes('ftypmp42', [0, 0, 0, 0x18]) },
    });
    const media = await probeMediaUrl('https://cdn.example.com/v/12345', fetcher);
    expect(media?.mediaType).toBe('direct');
    expect(calls.map((c) => c.method)).toEqual(['HEAD', 'GET']);
    expect(calls[1].range).toBe('bytes=0-31');
  });

  it('marks extension-less HLS so the player picks its HLS engine', async () => {
    const { fetcher } = host({ head: { type: 'application/x-mpegURL' } });
    const media = await probeMediaUrl('https://live.example.com/stream/abc', fetcher);
    expect(media?.url).toBe('https://live.example.com/stream/abc#.m3u8');
    expect(media?.liveHint).toBe('unknown');
    // …and the pop-out treats it as a stream, not a native <video>.
    expect(isNativeVideo('direct', media!.url)).toBe(false);
  });

  it('keeps a start offset on a probed link alongside the engine hint', async () => {
    const { fetcher } = host({ head: { type: 'application/vnd.apple.mpegurl' } });
    const media = await probeMediaUrl('https://live.example.com/stream/abc#t=1:00', fetcher);
    expect(media?.url).toBe('https://live.example.com/stream/abc#t=60&.m3u8');
    expect(playableUrl(media!.url)).toBe('https://live.example.com/stream/abc#.m3u8');
  });

  it('refuses web pages, errors and blocked hosts', async () => {
    expect(await probeMediaUrl('https://example.com/watch', host({ head: { type: 'text/html' } }).fetcher)).toBeNull();
    expect(
      await probeMediaUrl('https://example.com/x', host({ head: { status: 404 }, get: { status: 404 } }).fetcher),
    ).toBeNull();
    // The SSRF guard throws for private addresses; that is a refusal, not a crash.
    expect(await probeMediaUrl('http://169.254.169.254/latest', host({}).fetcher)).toBeNull();
    expect(await probeMediaUrl('ftp://example.com/a.mp4', host({}).fetcher)).toBeNull();
  });
});

describe('raw links in the add dialog', () => {
  it('lets unknown http(s) links through to the server probe, but not known providers’ pages', () => {
    expect(parseMedia('https://cdn.example.com/v/12345')).toBeNull();
    expect(maybeRawMediaUrl('https://cdn.example.com/v/12345')).toBe(true);
    expect(maybeRawMediaUrl('https://www.youtube.com/@somechannel')).toBe(false);
    expect(maybeRawMediaUrl('https://clips.twitch.tv/SomeClip')).toBe(false);
    expect(maybeRawMediaUrl('javascript:alert(1)')).toBe(false);
  });

  it('still recognises ordinary direct files without a probe', () => {
    expect(parseMedia('https://cdn.example.com/movie.mp4?sig=abc')).toMatchObject({ mediaType: 'direct' });
    expect(parseMedia('https://cdn.example.com/master.m3u8')).toMatchObject({ mediaType: 'direct' });
  });
});
