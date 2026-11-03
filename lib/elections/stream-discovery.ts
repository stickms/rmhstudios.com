/**
 * Auto-discovery of live election-night streams. Pure — the page parser and the channel pool; the
 * fetching lives in `stream-discovery.server.ts`.
 *
 * No API key exists for "is this channel live?", but every YouTube channel has a `/live` URL that
 * resolves to its current broadcast, and the page it serves says (a) which channel it belongs to,
 * (b) whether the video is live right now, and (c) the video id. We trust that page only when all
 * three agree, so a wrong channel id in the pool or a redirect to an old VOD can never surface a
 * stream that is not live or not that channel's.
 */

export interface PoolChannel {
  /** YouTube channel id (UC + 22 characters). */
  id: string;
  /** Shown if the page does not carry a usable name. */
  label: string;
}

/** Newsrooms that run election-night specials. Extend with `ELECTIONS_STREAM_CHANNELS` (comma-separated ids). */
export const CHANNEL_POOL: PoolChannel[] = [
  { id: 'UC6ZFN9Tx6xh-skXCuRHCDpQ', label: 'PBS NewsHour' },
  { id: 'UCBi2mrWuNuyYy4gbM6fU18Q', label: 'ABC News' },
  { id: 'UCeY0bbntWzzVIaj2z3QigXg', label: 'NBC News' },
  { id: 'UC8p1vwvWtl6T73JiExfWs1g', label: 'CBS News' },
  { id: 'UC52X5wxOL_s5yw0dQk7NtgA', label: 'Associated Press' },
  { id: 'UCb--64Gl51jIEVE-GLDAVTg', label: 'C-SPAN' },
  { id: 'UChqUTb7kYRX8-EiaN3XFrSQ', label: 'Reuters' },
  { id: 'UCoMdktPbSTixAyNGwb-UYkQ', label: 'Sky News' },
  { id: 'UCIALMKvObZNtJ6AmdCLP7Lg', label: 'Bloomberg' },
];

const CHANNEL_ID = /^UC[A-Za-z0-9_-]{22}$/;
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

export function isChannelId(v: string): boolean {
  return CHANNEL_ID.test(v);
}

/** The pool plus any ids from the environment, validated and de-duplicated. */
export function channelPool(extra: string | undefined): PoolChannel[] {
  const out = [...CHANNEL_POOL];
  const seen = new Set(out.map((c) => c.id));
  for (const raw of (extra ?? '').split(',')) {
    const id = raw.trim();
    if (isChannelId(id) && !seen.has(id)) {
      seen.add(id);
      out.push({ id, label: 'Live news' });
    }
  }
  return out;
}

export interface LiveFound {
  videoId: string;
  /** The channel's own display name, cleaned. */
  author: string | null;
  title: string | null;
}

function clean(s: string | null | undefined, max: number): string | null {
  if (!s) return null;
  const t = [...s]
    .filter((c) => c.charCodeAt(0) > 31)
    .join('')
    .trim()
    .slice(0, max);
  return t || null;
}

/** Decode the JSON string escapes that appear in the page's inline data (quotes, unicode). */
function unjson(raw: string): string | null {
  try {
    return JSON.parse(`"${raw}"`) as string;
  } catch {
    return null;
  }
}

/**
 * Read a `/channel/<id>/live` page. Returns the broadcast only when the page is for `channelId`, is live
 * now, and names the same video in its canonical link and its player data.
 */
export function parseLivePage(html: string, channelId: string): LiveFound | null {
  if (typeof html !== 'string' || !html) return null;
  const canonical =
    /<link rel="canonical" href="https:\/\/www\.youtube\.com\/watch\?v=([A-Za-z0-9_-]{11})"/.exec(
      html,
    )?.[1];
  if (!canonical || !VIDEO_ID.test(canonical)) return null;
  if (!html.includes('"isLive":true')) return null;
  if (!html.includes(`"externalChannelId":"${channelId}"`)) return null;
  if (!html.includes(`"videoId":"${canonical}"`)) return null;
  const author = /"author":"((?:[^"\\]|\\.)*)"/.exec(html)?.[1];
  const title = /"title":"((?:[^"\\]|\\.)*)"/.exec(html)?.[1];
  return {
    videoId: canonical,
    author: clean(author ? unjson(author) : null, 40),
    title: clean(title ? unjson(title) : null, 120),
  };
}
