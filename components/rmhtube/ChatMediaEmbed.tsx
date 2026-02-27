/**
 * ChatMediaEmbed — Inline image/GIF rendering for chat messages.
 *
 * Detects image URLs, Giphy links, and Tenor links in message content
 * and renders them inline below the text.
 */
'use client';

import { useState, useEffect, useMemo } from 'react';
import { ImageOff } from 'lucide-react';

// ─── URL extraction & classification ─────────────────────────────

const URL_REGEX = /https?:\/\/[^\s<>"']+/gi;

const IMAGE_EXT_REGEX = /\.(gif|png|jpe?g|webp|avif)(\?[^\s]*)?$/i;

type MediaEmbedInfo = {
  originalUrl: string;
  directUrl: string | null; // null = needs async resolution (Tenor share)
  type: 'image' | 'giphy' | 'tenor' | 'tenor-pending';
};

/**
 * Strip embedded media URLs from message text.
 * Returns the content with those URLs removed (and trimmed).
 */
export function stripEmbedUrls(content: string): string {
  const embeds = extractMediaEmbeds(content);
  if (embeds.length === 0) return content;
  const embedUrls = new Set(embeds.map((e) => e.originalUrl));
  return content
    .replace(URL_REGEX, (match) => (embedUrls.has(match) ? '' : match))
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Extract embeddable media from message content.
 * Returns an array of media info objects.
 */
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
        // The ID is after the last hyphen, or the whole slug if no hyphens
        const gifId = pathParts.includes('-')
          ? pathParts.split('-').pop()
          : pathParts;
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
  const [resolved, setResolved] = useState<string | null>(() => {
    if (!url) return null;
    return tenorCache.get(url) ?? null;
  });
  const [loading, setLoading] = useState(() => {
    if (!url) return false;
    return !tenorCache.has(url);
  });

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

function EmbedItem({ embed }: { embed: MediaEmbedInfo }) {
  const [error, setError] = useState(false);
  const tenor = useTenorResolve(
    embed.type === 'tenor-pending' ? embed.originalUrl : null,
  );

  const src = embed.type === 'tenor-pending' ? tenor.src : embed.directUrl;

  if (!src || error) {
    if (embed.type === 'tenor-pending' && tenor.loading) {
      return (
        <div className="mt-1 w-48 h-32 rounded-lg bg-(--rmhtube-surface) animate-pulse" />
      );
    }
    if (error) {
      return (
        <div className="mt-1 inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-(--rmhtube-surface) text-(--rmhtube-text-dim) text-xs">
          <ImageOff className="h-3.5 w-3.5" />
          Failed to load media
        </div>
      );
    }
    return null;
  }

  return (
    <a
      href={embed.originalUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-1 block max-w-xs"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        loading="lazy"
        onError={() => setError(true)}
        className="rounded-lg max-h-48 max-w-full object-contain border border-(--rmhtube-border)"
      />
    </a>
  );
}

// ─── Main export ─────────────────────────────────────────────────

export default function ChatMediaEmbed({ content }: { content: string }) {
  const embeds = useMemo(() => extractMediaEmbeds(content), [content]);

  if (embeds.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5 pl-3">
      {embeds.map((embed, i) => (
        <EmbedItem key={`${embed.originalUrl}-${i}`} embed={embed} />
      ))}
    </div>
  );
}
