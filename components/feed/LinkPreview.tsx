import { useState, useEffect } from 'react';
import { Globe } from 'lucide-react';
import { useNearViewport } from '@/hooks/useNearViewport';
import { ArchivedCopyLabel } from '@/components/posts-plus/ArchivedCopyLabel';
import { api } from '@/lib/contract/client';
import { ogOembedApi } from '@/lib/unfurl/oembed.contract';
import { hostOf } from '@/lib/unfurl/parse';
import { useArrival } from '@/components/ui/arrive';
import { cn } from '@/lib/utils';

interface OgData {
  title: string | null;
  description: string | null;
  /** Same-origin image-proxy path. */
  image: string | null;
  /** The site's icon, same-origin: the picture when there is no image. */
  icon?: string | null;
  siteName: string;
  // X11: set when the original is gone and the card points at its Wayback snapshot.
  archivedUrl?: string;
  archivedAt?: string | null;
}

const ogCache = new Map<string, OgData | null>();

interface LinkPreviewProps {
  url: string;
  className?: string;
  /** Called once the card turns out to have nothing to show, so the post can keep its link in the text. */
  onUnavailable?: () => void;
}

/**
 * The card under a post for its first link, the way X draws one. A page with an `og:image` gets the large card: the
 * picture at 1.91:1 (the Open Graph shape) over the host and title. A page without one gets the compact row: the
 * site's icon in a square, beside host, title and description. Both are pictures in the Steel sense, so they carry the
 * 1px border and 8px radius (S4); hover is a fill (M1).
 */
export function LinkPreview({ url, className = '', onUnavailable }: LinkPreviewProps) {
  // Don't fetch the OG data until the card nears the viewport — a first feed
  // page with many links would otherwise fan out N `/api/oembed` requests during
  // hydration (each one a server-side external fetch). Already-cached URLs skip
  // the observer entirely.
  const { ref, visible } = useNearViewport<HTMLDivElement>('400px 0px', ogCache.has(url));
  const [data, setData] = useState<OgData | null>(() => ogCache.get(url) ?? null);
  const [loading, setLoading] = useState(() => !ogCache.has(url));
  const [imgError, setImgError] = useState(false);
  const [iconError, setIconError] = useState(false);
  // Steel M9: the card replaces its placeholder block; a cached URL is there on first paint.
  const arrival = useArrival(!loading);

  useEffect(() => {
    if (!visible) return;
    if (ogCache.has(url)) {
      setData(ogCache.get(url) ?? null);
      setLoading(false);
      return;
    }

    setLoading(true);
    let cancelled = false;

    // No retry: a preview is decoration, and the post hides its link while the card is pending. The default GET retry
    // honours a 5xx's Retry-After (up to 60 s), which left a blank box and no link for a minute whenever the origin
    // site refuses our fetch (axios.com answers 403, which /api/oembed reports as 502).
    api(ogOembedApi, { query: { type: 'og', url }, retries: 0 })
      .then((result) => {
        if (cancelled) return;
        ogCache.set(url, result);
        setData(result);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          ogCache.set(url, null);
          setData(null);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [visible, url]);

  const empty = !data || (!data.title && !data.description);
  useEffect(() => {
    if (!loading && empty) onUnavailable?.();
  }, [loading, empty, onUnavailable]);

  if (loading) {
    // The ref lives on the placeholder so the observer has a target to watch while the preview is still deferred; it
    // is the compact card's height, so most cards land without moving the row.
    return (
      <div
        ref={ref}
        aria-hidden
        className={cn('h-20 rounded-site border border-site-border bg-site-bg-subtle', className)}
      />
    );
  }

  if (!data || empty) return null;

  const host = hostOf(url) || data.siteName;
  const large = !!data.image && !imgError;
  const href = data.archivedUrl ?? url;

  if (large) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'block overflow-hidden rounded-site border border-site-border transition-colors duration-(--m1) hover:bg-site-bg-subtle',
          className,
          arrival,
        )}
      >
        <div className="aspect-[1.91/1] w-full overflow-hidden border-b border-site-border bg-site-bg-subtle">
          <img
            src={data.image ?? undefined}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setImgError(true)}
            className="h-full w-full object-cover"
          />
        </div>
        <div className="px-3 py-2.5">
          {data.archivedUrl && <ArchivedCopyLabel archivedAt={data.archivedAt} />}
          <p className="t-meta truncate">{host}</p>
          {data.title && (
            <p dir="auto" className="t-body mt-0.5 line-clamp-2 font-medium text-site-text">
              {data.title}
            </p>
          )}
          {data.description && (
            <p dir="auto" className="t-body mt-0.5 line-clamp-1 text-site-text-muted">
              {data.description}
            </p>
          )}
        </div>
      </a>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={cn(
        'flex min-h-20 overflow-hidden rounded-site border border-site-border transition-colors duration-(--m1) hover:bg-site-bg-subtle',
        className,
        arrival,
      )}
    >
      <div className="flex w-20 shrink-0 items-center justify-center border-e border-site-border bg-site-bg-subtle">
        {data.icon && !iconError ? (
          <img
            src={data.icon}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setIconError(true)}
            className="size-8 rounded-site-sm object-contain"
          />
        ) : (
          <Globe className="size-6 text-site-text-muted" aria-hidden />
        )}
      </div>
      <div className="min-w-0 flex-1 px-3 py-2.5">
        {data.archivedUrl && <ArchivedCopyLabel archivedAt={data.archivedAt} />}
        <p className="t-meta truncate">{host}</p>
        {data.title && (
          <p dir="auto" className="t-body mt-0.5 line-clamp-1 font-medium text-site-text">
            {data.title}
          </p>
        )}
        {data.description && (
          <p dir="auto" className="t-body mt-0.5 line-clamp-2 text-site-text-muted">
            {data.description}
          </p>
        )}
      </div>
    </a>
  );
}
