/**
 * ChatMediaEmbed — Shared inline image/GIF rendering for chat messages.
 *
 * Detects image URLs, Giphy links, and Tenor links in message content
 * and renders them inline below the text. Themed via CSS custom property prefix.
 */

import { useState, useEffect, useMemo } from 'react';
import { ImageOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/contract/client';
import { gifOembedApi } from '@/lib/unfurl/oembed.contract';
import { useArrival } from '@/components/ui/arrive';
import { cn } from '@/lib/utils';

import { extractMediaEmbeds, textWithoutMedia, type MediaEmbedInfo } from '@/lib/unfurl/chat-media';

export { extractMediaEmbeds };

export function stripEmbedUrls(content: string): string {
  return textWithoutMedia(content, extractMediaEmbeds(content));
}

// ─── Tenor resolver hook ─────────────────────────────────────────

const tenorCache = new Map<string, string>();

function useTenorResolve(url: string | null): {
  src: string | null;
  loading: boolean;
} {
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

    api(gifOembedApi, {
      query: {
        url,
      },
    })
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

  return {
    src: resolved,
    loading,
  };
}

// ─── Single embed renderer ───────────────────────────────────────

function EmbedItem({ embed, themePrefix }: { embed: MediaEmbedInfo; themePrefix: string }) {
  const { t } = useTranslation('shared');
  const [error, setError] = useState(false);
  const tenor = useTenorResolve(embed.type === 'tenor-pending' ? embed.originalUrl : null);
  // Steel M9: a resolved Tenor GIF replaces its placeholder block.
  const arrival = useArrival(!(embed.type === 'tenor-pending' && tenor.loading));

  const src = embed.type === 'tenor-pending' ? tenor.src : embed.directUrl;

  if (!src || error) {
    if (embed.type === 'tenor-pending' && tenor.loading) {
      return (
        <div
          className="mt-1 w-48 h-32 rounded-site-sm"
          style={{
            backgroundColor: `var(--${themePrefix}-surface)`,
          }}
        />
      );
    }
    if (error) {
      return (
        <div
          className="mt-1 inline-flex items-center gap-1.5 px-2 py-1 rounded-site-sm text-xs"
          style={{
            backgroundColor: `var(--${themePrefix}-surface)`,
            color: `var(--${themePrefix}-text-dim)`,
          }}
        >
          <ImageOff className="h-3.5 w-3.5" />
          {t('failed-to-load-media', {
            defaultValue: 'Failed to load media',
          })}
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
      className={cn('mt-1 block max-w-xs', arrival)}
    >
      <img
        src={src}
        alt=""
        loading="lazy"
        onError={() => setError(true)}
        className="rounded-site-sm max-h-48 max-w-full object-contain"
        style={{
          borderWidth: 1,
          borderStyle: 'solid',
          borderColor: `var(--${themePrefix}-border)`,
        }}
      />
    </a>
  );
}

// ─── Main export ─────────────────────────────────────────────────

export default function ChatMediaEmbed({ content, themePrefix }: { content: string; themePrefix: string }) {
  const embeds = useMemo(() => extractMediaEmbeds(content), [content]);

  if (embeds.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5 pl-3">
      {embeds.map((embed, i) => (
        <EmbedItem key={`${embed.originalUrl}-${i}`} embed={embed} themePrefix={themePrefix} />
      ))}
    </div>
  );
}
