'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ImageOff } from 'lucide-react';
import { useNearViewport } from '@/hooks/useNearViewport';

// ─── URL resolution ──────────────────────────────────────────────

type GifInfo = {
  originalUrl: string;
  directUrl: string | null; // null = needs async Tenor resolution
  needsResolve: boolean;
};

const IMAGE_EXT_REGEX = /\.(gif|png|jpe?g|webp|avif)(\?[^\s]*)?$/i;

function parseGifUrl(url: string): GifInfo | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '');

    // Direct media URLs → use as-is
    if (host.match(/^media\d*\.tenor\.com$/)) {
      return { originalUrl: url, directUrl: url, needsResolve: false };
    }
    if (host === 'i.giphy.com' || host.match(/^media\d*\.giphy\.com$/)) {
      return { originalUrl: url, directUrl: url, needsResolve: false };
    }

    // Giphy share URL → construct direct media URL
    if (host === 'giphy.com' && parsed.pathname.startsWith('/gifs/')) {
      const lastSegment = parsed.pathname.split('/').pop() ?? '';
      const gifId = lastSegment.includes('-')
        ? lastSegment.split('-').pop()
        : lastSegment;
      if (gifId) {
        return {
          originalUrl: url,
          directUrl: `https://media1.giphy.com/media/${gifId}/giphy.gif`,
          needsResolve: false,
        };
      }
    }

    // Tenor share URL → needs oEmbed resolution
    if (host === 'tenor.com' && parsed.pathname.startsWith('/view/')) {
      return { originalUrl: url, directUrl: null, needsResolve: true };
    }

    // Direct image URL from any domain
    if (IMAGE_EXT_REGEX.test(parsed.pathname)) {
      return { originalUrl: url, directUrl: url, needsResolve: false };
    }

    return null;
  } catch {
    return null;
  }
}

// ─── Tenor resolver ──────────────────────────────────────────────

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

// ─── Component ───────────────────────────────────────────────────

interface GifEmbedProps {
  url: string;
  className?: string;
}

export function GifEmbed({ url, className = '' }: GifEmbedProps) {
  const { t } = useTranslation("feed");
  const info = parseGifUrl(url);
  const needsResolve = !!info?.needsResolve;
  // Only Tenor share URLs need an `/api/oembed` resolution; defer that fetch
  // until the card nears the viewport so a first feed page doesn't resolve every
  // off-screen GIF at hydration. Direct/cached URLs never observe.
  const skipObserve = !needsResolve || (!!info && tenorCache.has(info.originalUrl));
  const { ref, visible } = useNearViewport<HTMLDivElement>('400px 0px', skipObserve);
  const tenor = useTenorResolve(needsResolve && visible && info ? info.originalUrl : null);
  const [error, setError] = useState(false);

  if (!info) return null;

  const src = info.needsResolve ? tenor.src : info.directUrl;

  // Skeleton while a Tenor URL is still deferred (not yet near the viewport) or
  // its resolution is in flight. The ref lives here so the observer has a target.
  if (info.needsResolve && !src && !error) {
    return (
      <div ref={ref} className={`rounded-site overflow-hidden border border-site-border ${className}`}>
        <div className="w-full h-48 bg-site-surface animate-pulse" />
      </div>
    );
  }

  if (!src || error) {
    if (error) {
      return (
        <div className={`rounded-site overflow-hidden border border-site-border p-4 flex items-center justify-center gap-2 ${className}`}>
          <ImageOff className="h-4 w-4 text-site-text-dim" />
          <span className="text-xs text-site-text-dim">{t("failed-to-load-image", { defaultValue: "Failed to load image" })}</span>
        </div>
      );
    }
    return null;
  }

  return (
    <a
      href={info.originalUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={`block rounded-site overflow-hidden border border-site-border ${className}`}
    >
      <img
        src={src}
        alt={t("embedded-image-alt", { defaultValue: "Embedded image" })}
        loading="lazy"
        onError={() => setError(true)}
        className="w-full max-h-72 object-contain"
      />
    </a>
  );
}
