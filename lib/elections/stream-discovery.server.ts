/**
 * Finds the election-night streams that are live right now, so nobody has to hunt for a link.
 *
 * Each pool channel's `/live` page is fetched (fixed host, fixed path, validated id — nothing from a
 * request reaches the URL), parsed by `stream-discovery.ts`, and cached for a few minutes. One failed or
 * slow channel never affects the others, and total failure just means "no auto streams": the page still
 * has the configured ones and the paste box.
 */

import { channelPool, parseLivePage, type PoolChannel } from './stream-discovery';
import { parseEmbed, type FeaturedStream } from './streams';

const TTL_MS = 3 * 60_000;
const TIMEOUT_MS = 8_000;
const MAX_BYTES = 3_000_000;

let cache: { at: number; streams: FeaturedStream[] } | null = null;
let inflight: Promise<FeaturedStream[]> | null = null;

async function probe(ch: PoolChannel): Promise<FeaturedStream | null> {
  const res = await fetch(`https://www.youtube.com/channel/${ch.id}/live`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    redirect: 'follow',
    headers: {
      'user-agent': 'Mozilla/5.0 (compatible; rmhstudios-elections/1.0)',
      'accept-language': 'en-US,en;q=0.9',
    },
  });
  if (!res.ok) return null;
  const html = (await res.text()).slice(0, MAX_BYTES);
  const found = parseLivePage(html, ch.id);
  if (!found) return null;
  const url = `https://www.youtube.com/watch?v=${found.videoId}`;
  if (!parseEmbed(url)) return null;
  return { label: found.author ?? ch.label, url, auto: true, title: found.title ?? undefined };
}

async function discover(): Promise<FeaturedStream[]> {
  const pool = channelPool(process.env.ELECTIONS_STREAM_CHANNELS);
  const settled = await Promise.allSettled(pool.map(probe));
  return settled.flatMap((r) => (r.status === 'fulfilled' && r.value ? [r.value] : []));
}

/** Live streams from the channel pool. Never rejects; `ELECTIONS_STREAMS_AUTO=0` turns it off. */
export async function getAutoStreams(now = Date.now()): Promise<FeaturedStream[]> {
  if (process.env.ELECTIONS_STREAMS_AUTO === '0') return [];
  if (cache && now - cache.at < TTL_MS) return cache.streams;
  inflight ??= discover()
    .then((streams) => {
      cache = { at: Date.now(), streams };
      return streams;
    })
    .catch(() => cache?.streams ?? [])
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** Test seam. */
export function __resetStreamDiscovery() {
  cache = null;
  inflight = null;
}
