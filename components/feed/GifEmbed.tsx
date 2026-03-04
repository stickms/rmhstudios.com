'use client';

import { useState, useEffect } from 'react';
import { ImageOff } from 'lucide-react';

// ─── URL resolution ──────────────────────────────────────────────

type GifInfo = {
  originalUrl: string;
  directUrl: string | null; // null = needs async Tenor resolution
  needsResolve: boolean;
};

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
  const info = parseGifUrl(url);
  const tenor = useTenorResolve(info?.needsResolve ? info.originalUrl : null);
  const [error, setError] = useState(false);

  if (!info) return null;

  const src = info.needsResolve ? tenor.src : info.directUrl;

  // Loading skeleton for Tenor resolution
  if (info.needsResolve && tenor.loading) {
    return (
      <div className={`rounded-xl overflow-hidden border border-site-border ${className}`}>
        <div className="w-full h-48 bg-site-surface animate-pulse" />
      </div>
    );
  }

  if (!src || error) {
    if (error) {
      return (
        <div className={`rounded-xl overflow-hidden border border-site-border p-4 flex items-center justify-center gap-2 ${className}`}>
          <ImageOff className="h-4 w-4 text-site-text-dim" />
          <span className="text-xs text-site-text-dim">Failed to load GIF</span>
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
      className={`block rounded-xl overflow-hidden border border-site-border ${className}`}
    >
      <img
        src={src}
        alt="GIF"
        loading="lazy"
        onError={() => setError(true)}
        className="w-full max-h-72 object-contain"
      />
    </a>
  );
}
