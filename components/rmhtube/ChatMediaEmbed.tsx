/**
 * ChatMediaEmbed — inline images and GIFs in chat.
 *
 * Two things here exist because of how chat behaved without them.
 *
 * **The parse is cached.** `stripEmbedUrls` and `extractMediaEmbeds` were
 * called separately for every message on every render — a regex sweep plus a
 * `new URL()` per link, twice, across the whole 200-message transcript, on a
 * panel that re-rendered every two seconds because it subscribed to the entire
 * store. Messages are immutable, so their parse is too.
 *
 * **Every embed reserves its space.** An image with no intrinsic size is zero
 * pixels tall until the network answers, so the transcript grew *after* the
 * scroll that was supposed to show the message, leaving it off-screen. The
 * reserved box means the layout is right from the first frame;
 * `useStickToBottom`'s ResizeObserver covers whatever the reservation gets
 * wrong.
 */
'use client';

import { useState, useEffect, useMemo } from 'react';
import { ImageOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { safeHref } from '@/lib/url-safety';

// ─── URL extraction & classification ─────────────────────────────

const URL_REGEX = /https?:\/\/[^\s<>"']+/gi;
const IMAGE_EXT_REGEX = /\.(gif|png|jpe?g|webp|avif)(\?[^\s]*)?$/i;

type MediaEmbedInfo = {
  originalUrl: string;
  directUrl: string | null; // null = needs async resolution (Tenor share)
  type: 'image' | 'giphy' | 'tenor' | 'tenor-pending';
};

export interface MessageMedia {
  /** The message text with embedded URLs removed. */
  text: string;
  embeds: MediaEmbedInfo[];
}

/**
 * Parsed messages, keyed by content.
 *
 * Bounded because a long watch party's transcript is bounded but its *history*
 * is not: messages scroll out of the store and their entries would otherwise
 * outlive them.
 */
const MESSAGE_CACHE_LIMIT = 500;
const messageCache = new Map<string, MessageMedia>();

/** Text and embeds for a message, parsed once. */
export function parseMessageMedia(content: string): MessageMedia {
  const cached = messageCache.get(content);
  if (cached) return cached;

  const embeds = extractMediaEmbeds(content);
  const embedUrls = new Set(embeds.map((e) => e.originalUrl));
  const text = embeds.length === 0
    ? content
    : content
        .replace(URL_REGEX, (match) => (embedUrls.has(match) ? '' : match))
        .replace(/\s{2,}/g, ' ')
        .trim();

  const parsed: MessageMedia = { text, embeds };
  if (messageCache.size >= MESSAGE_CACHE_LIMIT) {
    const oldest = messageCache.keys().next().value;
    if (oldest !== undefined) messageCache.delete(oldest);
  }
  messageCache.set(content, parsed);
  return parsed;
}

/** Message text with embedded media URLs removed. */
export function stripEmbedUrls(content: string): string {
  return parseMessageMedia(content).text;
}

/** Embeddable media in a message. */
export function extractMediaEmbeds(content: string): MediaEmbedInfo[] {
  const urls = content.match(URL_REGEX);
  if (!urls) return [];

  const embeds: MediaEmbedInfo[] = [];
  const seen = new Set<string>();

  for (const url of urls) {
    if (seen.has(url)) continue;
    seen.add(url);

    try {
      const parsed = new URL(url);
      const host = parsed.hostname.replace(/^www\./, '');

      // Direct image URL (any host)
      if (IMAGE_EXT_REGEX.test(parsed.pathname)) {
        embeds.push({ originalUrl: url, directUrl: url, type: 'image' });
        continue;
      }

      // Giphy share URL: giphy.com/gifs/[optional-slug-]ID
      if (host === 'giphy.com' && parsed.pathname.startsWith('/gifs/')) {
        const pathParts = parsed.pathname.split('/').pop() ?? '';
        const gifId = pathParts.includes('-') ? pathParts.split('-').pop() : pathParts;
        if (gifId) {
          embeds.push({
            originalUrl: url,
            directUrl: `https://media1.giphy.com/media/${gifId}/giphy.gif`,
            type: 'giphy',
          });
        }
        continue;
      }

      // Giphy media URL (already direct)
      if (
        (host.match(/^media\d*\.giphy\.com$/) || host === 'i.giphy.com') &&
        /\.(gif|mp4|webp)(\?|$)/i.test(parsed.pathname)
      ) {
        embeds.push({ originalUrl: url, directUrl: url, type: 'giphy' });
        continue;
      }

      // Tenor media URL (already direct)
      if (
        host.match(/^media\d*\.tenor\.com$/) &&
        /\.(gif|mp4|webp|png)(\?|$)/i.test(parsed.pathname)
      ) {
        embeds.push({ originalUrl: url, directUrl: url, type: 'tenor' });
        continue;
      }

      // Tenor share URL: tenor.com/view/[slug]-gif-[id]
      if (host === 'tenor.com' && parsed.pathname.startsWith('/view/')) {
        embeds.push({ originalUrl: url, directUrl: null, type: 'tenor-pending' });
        continue;
      }
    } catch {
      // Invalid URL — skip
    }
  }

  return embeds;
}

// ─── Tenor resolver hook ─────────────────────────────────────────

// Only cache successful resolutions — failures are retried
const tenorCache = new Map<string, string>();

function useTenorResolve(url: string | null): { src: string | null; loading: boolean } {
  const [resolved, setResolved] = useState<string | null>(() => (url ? tenorCache.get(url) ?? null : null));
  const [loading, setLoading] = useState(() => (url ? !tenorCache.has(url) : false));

  useEffect(() => {
    if (!url) return;

    const cached = tenorCache.get(url);
    if (cached) {
      setResolved(cached);
      setLoading(false);
      return;
    }

    setLoading(true);
    let cancelled = false;

    fetch(`/api/oembed?url=${encodeURIComponent(url)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return;
        const gifUrl = data?.gifUrl ?? null;
        if (gifUrl) tenorCache.set(url, gifUrl);
        setResolved(gifUrl);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setResolved(null);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [url]);

  return { src: resolved, loading };
}

// ─── Single embed renderer ───────────────────────────────────────

/**
 * The slot an embed occupies before its natural size is known. Wide enough to
 * read, short enough that being wrong about it costs a small scroll rather
 * than a page.
 */
const RESERVED_WIDTH = 200;
const MAX_HEIGHT = 192;

/**
 * Both dimensions, in pixels.
 *
 * Deliberately not `aspect-ratio` beside a `max-height`: the clamp wins and the
 * ratio is silently discarded, which the §12.1 viewport gate fails a build for.
 * Scaling down to fit both bounds here says the same thing without the trap —
 * and a box the browser knows the size of before the bytes arrive is the whole
 * point of the reservation.
 */
function reservedBox(natural: { width: number; height: number } | null) {
  if (!natural) return { width: RESERVED_WIDTH, height: Math.round((RESERVED_WIDTH * 3) / 4) };
  // Never scale up: a small emoji-sized GIF keeps its own size.
  const scale = Math.min(RESERVED_WIDTH / natural.width, MAX_HEIGHT / natural.height, 1);
  return {
    width: Math.max(1, Math.round(natural.width * scale)),
    height: Math.max(1, Math.round(natural.height * scale)),
  };
}

function EmbedItem({ embed }: { embed: MediaEmbedInfo }) {
  const { t } = useTranslation('c-rmhtube');
  const [error, setError] = useState(false);
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);
  const tenor = useTenorResolve(embed.type === 'tenor-pending' ? embed.originalUrl : null);

  const src = embed.type === 'tenor-pending' ? tenor.src : embed.directUrl;

  if (error) {
    return (
      <div className="mt-1 inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-(--app-surface) text-(--app-text-dim) text-xs">
        <ImageOff className="h-3.5 w-3.5" aria-hidden />
        {t('failed-to-load-media', { defaultValue: 'Failed to load media' })}
      </div>
    );
  }

  // Same box whether we are resolving a Tenor share, waiting on bytes, or
  // showing the image — so the transcript's height never jumps under the pin.
  const box = reservedBox(natural);

  return (
    <div
      className="mt-1 overflow-hidden rounded-lg border border-(--app-border) bg-(--app-surface)"
      style={box}
    >
      {src ? (
        <a href={safeHref(embed.originalUrl)} target="_blank" rel="noopener noreferrer" className="block h-full w-full">
          <img
            src={src}
            alt=""
            loading="lazy"
            decoding="async"
            width={box.width}
            height={box.height}
            onLoad={(event) => {
              const { naturalWidth, naturalHeight } = event.currentTarget;
              if (naturalWidth > 0 && naturalHeight > 0) {
                setNatural({ width: naturalWidth, height: naturalHeight });
              }
            }}
            onError={() => setError(true)}
            className="h-full w-full object-cover"
          />
        </a>
      ) : (
        <div className="h-full w-full app-skeleton" />
      )}
    </div>
  );
}

// ─── Main export ─────────────────────────────────────────────────

export default function ChatMediaEmbed({ content }: { content: string }) {
  const embeds = useMemo(() => parseMessageMedia(content).embeds, [content]);

  if (embeds.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5 pl-3">
      {embeds.map((embed, i) => (
        <EmbedItem key={`${embed.originalUrl}-${i}`} embed={embed} />
      ))}
    </div>
  );
}
