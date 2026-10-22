/**
 * RmhTube — identify a raw media link the URL alone can't (server-only).
 *
 * `parseMedia` recognises providers and file extensions. Plenty of real video
 * links have neither: signed CDN URLs (`…/download?token=…`), object-store
 * links, `/video/12345`, HLS behind `/live/playlist`. Those used to be refused
 * with "unsupported link" even though the browser plays them fine.
 *
 * For those, the server asks the host what is there — a HEAD, falling back to a
 * one-byte ranged GET (many CDNs refuse HEAD), and a 32-byte sniff when the host
 * only says `application/octet-stream`. Every request goes through `safeFetch`,
 * so a link can't be used to probe the internal network.
 *
 * HLS / DASH with no extension get a `#.m3u8` / `#.mpd` fragment: react-player
 * chooses its engine by URL pattern, and the fragment is the one part of a URL
 * that never reaches the server, so the stream itself is untouched.
 */

import { safeFetch } from '../ssrf-guard.server';
import { playableUrl, startOffset, withStart, type ParsedMedia } from './media';

export type ProbedKind = 'progressive' | 'hls' | 'dash';

const HLS_TYPES = new Set([
  'application/vnd.apple.mpegurl',
  'application/x-mpegurl',
  'audio/mpegurl',
  'audio/x-mpegurl',
]);
const DASH_TYPES = new Set(['application/dash+xml']);

/** What a Content-Type says the resource is, or null when it says "not media". */
export function classifyContentType(raw: string | null | undefined): ProbedKind | 'unknown' | null {
  if (!raw) return 'unknown';
  const type = raw.split(';')[0]!.trim().toLowerCase();
  if (HLS_TYPES.has(type)) return 'hls';
  if (DASH_TYPES.has(type)) return 'dash';
  if (type.startsWith('video/') || type.startsWith('audio/')) return 'progressive';
  if (type === 'application/octet-stream' || type === 'binary/octet-stream') return 'unknown';
  if (type === 'application/mp4' || type === 'application/ogg') return 'progressive';
  return null;
}

/** Recognise a container from its first bytes. */
export function sniffMedia(bytes: Uint8Array): ProbedKind | null {
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
  if (bytes.length >= 8 && ascii(4, 8) === 'ftyp') return 'progressive'; // MP4 / MOV / M4A
  if (bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
    return 'progressive'; // WebM / Matroska
  }
  if (bytes.length >= 4 && ascii(0, 4) === 'OggS') return 'progressive';
  if (bytes.length >= 3 && ascii(0, 3) === 'ID3') return 'progressive'; // MP3
  if (bytes.length >= 7 && ascii(0, 7) === '#EXTM3U') return 'hls';
  if (bytes.length >= 5 && /<\?xml|<MPD/.test(ascii(0, Math.min(bytes.length, 32)))) return 'dash';
  return null;
}

/** The media item for a probed link. */
export function probedMedia(rawUrl: string, kind: ProbedKind, disposition?: string | null): ParsedMedia {
  // The engine hint replaces the fragment, so a start offset is put back after.
  const start = startOffset(rawUrl);
  const url = new URL(playableUrl(rawUrl));
  if (kind === 'hls' && !/\.m3u8$/i.test(url.pathname)) url.hash = '.m3u8';
  if (kind === 'dash' && !/\.mpd$/i.test(url.pathname)) url.hash = '.mpd';
  const fromDisposition = disposition?.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i)?.[1];
  const fromPath = decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() ?? '');
  return {
    mediaType: 'direct',
    url: withStart(url.toString(), start),
    id: null,
    liveHint: kind === 'progressive' ? 'vod' : 'unknown',
    thumbnailUrl: null,
    label: (fromDisposition || fromPath || url.hostname).slice(0, 120),
  };
}

type Fetcher = (url: string, init: RequestInit & { allowedProtocols?: string[]; timeoutMs?: number }) => Promise<Response>;

/**
 * Ask the host what a link is. Resolves to a playable `direct` item, or null
 * when it is not media (an HTML page, a 404, a private address).
 */
export async function probeMediaUrl(rawUrl: string, fetcher: Fetcher = safeFetch): Promise<ParsedMedia | null> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  const opts = { allowedProtocols: ['http:', 'https:'], timeoutMs: 5_000 };

  const attempt = async (init: RequestInit): Promise<Response | null> => {
    try {
      return await fetcher(parsed.toString(), { ...opts, ...init });
    } catch {
      return null; // SSRF refusal, DNS failure, timeout
    }
  };

  // 1. HEAD — cheapest, and enough for most hosts.
  let res = await attempt({ method: 'HEAD' });
  let kind = res?.ok ? classifyContentType(res.headers.get('content-type')) : 'unknown';
  if (kind === null) return null;

  // 2. A ranged GET when HEAD was refused or inconclusive — and a sniff of
  //    the first bytes when the type still says nothing.
  if (!res?.ok || kind === 'unknown') {
    res = await attempt({ method: 'GET', headers: { Range: 'bytes=0-31' } });
    if (!res || !(res.ok || res.status === 206)) return null;
    kind = classifyContentType(res.headers.get('content-type'));
    if (kind === null) {
      await res.body?.cancel().catch(() => {});
      return null;
    }
    if (kind === 'unknown') {
      const reader = res.body?.getReader();
      const chunk = reader ? await reader.read().catch(() => null) : null;
      await reader?.cancel().catch(() => {});
      kind = chunk?.value ? sniffMedia(chunk.value.subarray(0, 32)) : null;
      if (!kind) return null;
    } else {
      await res.body?.cancel().catch(() => {});
    }
  }

  return probedMedia(parsed.toString(), kind, res?.headers.get('content-disposition'));
}
