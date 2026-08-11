/**
 * RmhTube — Media source parsing (pure; shared by client and server).
 *
 * One place decides what a pasted URL *is*. Before this module the knowledge
 * was split three ways and all three disagreed: `detectMediaType` accepted any
 * `youtube.com/…` path (including `/@handle` and search pages) and any
 * `*.twitch.tv` host (including `clips.twitch.tv`, which the player cannot
 * embed), `extractYouTubeId` only understood `watch?v=` and `youtu.be` — so
 * `/live/`, `/shorts/` and `/embed/` links got no id and no thumbnail — and
 * react-player's own `canPlay` patterns, the only opinion that actually decides
 * whether the video plays, were consulted by nobody. A URL could pass the
 * queue's validation and then load nothing.
 *
 * So this parser is written against react-player v3's matchers (its
 * `dist/patterns.js`): if `parseMedia` returns a source, the player can play it.
 *
 * It also carries the one fact the sync engine needs before a frame is drawn:
 * whether the source has a **fixed timeline**. A VOD has a position you can
 * synchronise; a livestream does not — its "position" is a sliding DVR window
 * that means something different on every viewer's machine. `liveHint` is the
 * static half of that answer (`twitch.tv/<channel>` is live; a `.mp4` is not),
 * and the player confirms or overrides it at runtime, because `/watch?v=…` is
 * also what a YouTube live broadcast looks like.
 */

/** Wire + DB value. `direct` covers progressive files, HLS and DASH. */
export type MediaType = 'youtube' | 'twitch' | 'vimeo' | 'direct';

/** What we can say about liveness from the URL alone. */
export type LiveHint = 'live' | 'vod' | 'unknown';

export interface ParsedMedia {
  mediaType: MediaType;
  /** The URL to hand the player (normalised; never user text). */
  url: string;
  /** Provider id when there is one — YouTube video id, Twitch channel/video. */
  id: string | null;
  liveHint: LiveHint;
  thumbnailUrl: string | null;
  /** A readable name when the URL carries one, else null. */
  label: string | null;
}

// ─── Provider matchers ───────────────────────────────────────────
//
// Deliberately mirrors react-player v3 `dist/patterns.js`. Keep them aligned:
// a URL we accept that its `canPlay` rejects is a queue item that renders an
// empty box.

const YOUTUBE_ID = /^[\w-]{11}$/;
const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtube-nocookie.com',
  'youtu.be',
]);

/** Path prefixes that carry a bare video id as the next segment. */
const YOUTUBE_ID_PATHS = ['/embed/', '/v/', '/shorts/', '/live/', '/watch/'];

const TWITCH_CHANNEL = /^[a-zA-Z0-9_]{3,25}$/;

const FILE_EXTENSIONS =
  /\.(mp4|og[gv]|webm|mov|m4v|m4a|mp3|wav|aac|flac|m3u8|mpd)(#[^?]*)?(\?|$)/i;
const HLS_EXTENSION = /\.m3u8(\?|$)/i;
const DASH_EXTENSION = /\.mpd(\?|$)/i;

/**
 * Parse a media URL. Returns null when nothing we can embed is behind it —
 * which is the *only* signal callers should use to reject a queue add.
 */
export function parseMedia(raw: string): ParsedMedia | null {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    return null;
  }

  // Only ever hand the player an http(s) source: `javascript:` and `data:`
  // URLs reach an iframe/`<video src>` otherwise.
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;

  const host = parsed.hostname.replace(/^www\./, '').toLowerCase();

  if (YOUTUBE_HOSTS.has(host)) return parseYouTube(parsed, host);
  if (host === 'twitch.tv' || host === 'go.twitch.tv' || host === 'player.twitch.tv') {
    return parseTwitch(parsed);
  }
  if (host === 'vimeo.com' || host === 'player.vimeo.com') return parseVimeo(parsed);
  if (FILE_EXTENSIONS.test(parsed.pathname)) return parseFile(parsed);

  return null;
}

function parseYouTube(parsed: URL, host: string): ParsedMedia | null {
  const path = parsed.pathname;

  // youtu.be/<id>
  if (host === 'youtu.be') {
    const id = path.split('/').filter(Boolean)[0] ?? '';
    return YOUTUBE_ID.test(id) ? youtubeMedia(parsed, id, 'vod') : null;
  }

  // /watch?v=<id> — the canonical form, and also how a live broadcast appears.
  if (path === '/watch' || path === '/watch/') {
    const id = parsed.searchParams.get('v') ?? '';
    return YOUTUBE_ID.test(id) ? youtubeMedia(parsed, id, 'vod') : null;
  }

  // /embed/<id>, /v/<id>, /shorts/<id>, /live/<id>
  for (const prefix of YOUTUBE_ID_PATHS) {
    if (!path.startsWith(prefix)) continue;
    const id = path.slice(prefix.length).split('/')[0] ?? '';
    if (!YOUTUBE_ID.test(id)) return null;
    // `/live/<id>` is how YouTube addresses a broadcast — though the same URL
    // keeps working after the stream ends and becomes an ordinary VOD, so this
    // stays a hint the player is free to override.
    return youtubeMedia(parsed, id, prefix === '/live/' ? 'live' : 'vod');
  }

  // /playlist?list=… — react-player plays these, but there is no single video
  // id, so no thumbnail and no per-item metadata.
  if (path === '/playlist' && parsed.searchParams.get('list')) {
    return {
      mediaType: 'youtube',
      url: parsed.toString(),
      id: null,
      liveHint: 'vod',
      thumbnailUrl: null,
      label: 'YouTube playlist',
    };
  }

  // Everything else on the domain — /@handle, /results, /feed/… — is a page,
  // not a video. The old detector accepted all of them.
  return null;
}

function youtubeMedia(parsed: URL, id: string, liveHint: LiveHint): ParsedMedia {
  // Normalise to /watch?v=, preserving only the start-time parameter the
  // player understands. Dropping the rest keeps tracking junk out of the DB
  // and makes two links to the same video compare equal.
  const url = new URL(`https://www.youtube.com/watch?v=${id}`);
  const start = parsed.searchParams.get('t');
  if (start) url.searchParams.set('t', start);

  return {
    mediaType: 'youtube',
    url: url.toString(),
    id,
    liveHint,
    thumbnailUrl: youtubeThumbnail(id),
    label: null,
  };
}

export function youtubeThumbnail(id: string): string {
  return `https://img.youtube.com/vi/${id}/mqdefault.jpg`;
}

function parseTwitch(parsed: URL): ParsedMedia | null {
  // player.twitch.tv/?channel=… | ?video=…
  if (parsed.hostname.replace(/^www\./, '') === 'player.twitch.tv') {
    const channel = parsed.searchParams.get('channel');
    const video = parsed.searchParams.get('video');
    if (channel && TWITCH_CHANNEL.test(channel)) return twitchChannel(channel);
    if (video) return twitchVideo(video.replace(/^v/, ''));
    return null;
  }

  const segments = parsed.pathname.split('/').filter(Boolean);
  if (segments.length === 0) return null;

  // twitch.tv/videos/<id>
  if (segments[0] === 'videos' && segments[1]) return twitchVideo(segments[1]);

  // twitch.tv/<channel>/clip/<slug> — a clip is a different embed the player
  // does not implement, so it is not playable here even though the host is.
  if (segments.length > 1) return null;

  const channel = segments[0];
  return TWITCH_CHANNEL.test(channel) ? twitchChannel(channel) : null;
}

function twitchChannel(channel: string): ParsedMedia {
  return {
    mediaType: 'twitch',
    url: `https://www.twitch.tv/${channel}`,
    id: channel,
    // A channel URL is the live broadcast by definition. If the channel is
    // offline there is nothing to play at all, live or otherwise.
    liveHint: 'live',
    thumbnailUrl: null,
    label: channel,
  };
}

function twitchVideo(id: string): ParsedMedia | null {
  if (!/^\d+$/.test(id)) return null;
  return {
    mediaType: 'twitch',
    url: `https://www.twitch.tv/videos/${id}`,
    id,
    liveHint: 'vod',
    thumbnailUrl: null,
    label: null,
  };
}

function parseVimeo(parsed: URL): ParsedMedia | null {
  const segments = parsed.pathname.split('/').filter(Boolean);
  const id = segments.find((s) => /^\d+$/.test(s));
  if (!id) return null;
  return {
    mediaType: 'vimeo',
    url: `https://vimeo.com/${id}`,
    id,
    liveHint: 'vod',
    thumbnailUrl: null,
    label: null,
  };
}

function parseFile(parsed: URL): ParsedMedia {
  const name = decodeURIComponent(parsed.pathname.split('/').pop() ?? '');
  return {
    mediaType: 'direct',
    url: parsed.toString(),
    id: null,
    // An HLS or DASH manifest is live about as often as it is not, and the
    // manifest itself is what says which. The player finds out; we don't guess.
    liveHint: isAdaptive(parsed.pathname) ? 'unknown' : 'vod',
    thumbnailUrl: null,
    label: name || null,
  };
}

function isAdaptive(pathname: string): boolean {
  return HLS_EXTENSION.test(pathname) || DASH_EXTENSION.test(pathname);
}

// ─── Back-compat helpers ─────────────────────────────────────────

/**
 * Legacy shape: the media type, or null when unplayable.
 * Prefer `parseMedia` — it answers this and everything else in one parse.
 */
export function detectMediaType(url: string): MediaType | null {
  return parseMedia(url)?.mediaType ?? null;
}

/** YouTube video id, or null. */
export function extractYouTubeId(url: string): string | null {
  const media = parseMedia(url);
  return media?.mediaType === 'youtube' ? media.id : null;
}
