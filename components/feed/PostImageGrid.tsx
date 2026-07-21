'use client';

import { useState, useEffect, useCallback, useId } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { BlurImage } from '@/components/ui/BlurImage';
import { knownSize, rememberSize } from '@/lib/image-aspect';
import { runLiquidOpen, liquidVTName } from '@/lib/view-transition';

interface PostImageGridProps {
  urls: string[];
  /** Per-image alt text, aligned by index with `urls` (may be shorter/empty). */
  alts?: string[];
  className?: string;
  /** When set, tags the first image with this `view-transition-name` so it can
   *  morph between the feed card and the post detail (see lib/view-transition). */
  heroName?: string;
}

// A lone image is capped at this share of the viewport height, matching the
// pre-reservation layout. Baked into the reserved box so tall images don't
// dominate the column.
const SINGLE_MAX_VH = 80;

export function PostImageGrid({ urls, alts, className = '', heroName }: PostImageGridProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  // §5.48: liquidly expand the clicked thumbnail into the lightbox (same-document
  // VT). Names are unique per (grid instance, index) and set only at open time.
  const vtBase = useId();
  const imgVTName = (i: number) => liquidVTName('img', `${vtBase}-${i}`);

  if (!urls || urls.length === 0) return null;

  const single = urls.length === 1;

  return (
    <>
      <div className={`grid gap-1 ${single ? 'grid-cols-1' : 'grid-cols-2'} ${className}`}>
        {urls.map((url, i) => (
          <GridImage
            key={url}
            url={url}
            alt={alts?.[i]?.trim() || undefined}
            single={single}
            heroName={i === 0 ? heroName : undefined}
            onOpen={(el) => runLiquidOpen(el, imgVTName(i), () => setLightboxIndex(i))}
          />
        ))}
      </div>

      {lightboxIndex !== null && (
        <Lightbox
          urls={urls}
          alts={alts}
          index={lightboxIndex}
          vtName={imgVTName(lightboxIndex)}
          onIndexChange={setLightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </>
  );
}

function GridImage({
  url,
  alt,
  single,
  heroName,
  onOpen,
}: {
  url: string;
  alt?: string;
  single: boolean;
  heroName?: string;
  onOpen: (el: HTMLElement) => void;
}) {
  const { t } = useTranslation('feed');
  // When the author described the image, use that as both the image alt and the
  // button's accessible name; otherwise fall back to a generic "Open image".
  const openLabel = alt
    ? t('open-image-described', { alt, defaultValue: 'Open image: {{alt}}' })
    : t('open-image', { defaultValue: 'Open image' });
  // Start from any size we already know (URL-tagged or measured earlier), and
  // learn it on load for legacy images so later renders reserve space too.
  const [size, setSize] = useState(() => knownSize(url));
  const onNaturalSize = useCallback(
    (w: number, h: number) => {
      rememberSize(url, w, h);
      setSize((prev) => prev ?? { width: w, height: h });
    },
    [url],
  );

  const vt = heroName ? { viewTransitionName: heroName } : undefined;

  // Multi-image cells are always square, so they already reserve their space.
  if (!single) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onOpen(e.currentTarget);
        }}
        style={vt}
        className="group relative block aspect-square overflow-hidden rounded-site-sm"
        aria-label={openLabel}
      >
        <BlurImage
          src={url}
          alt={alt ?? ''}
          fit="cover"
          width={640}
          aspectRatio={1}
          sizes="(max-width: 640px) 50vw, 300px"
          className="h-full w-full"
          imgClassName="transition-transform duration-200 group-hover:scale-[1.02]"
        />
      </button>
    );
  }

  // Single image, size known: reserve an exact box (capped at 80vh and the
  // image's own width so small images aren't upscaled) → zero layout shift.
  if (size) {
    const ratio = size.width / size.height;
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onOpen(e.currentTarget);
        }}
        style={{ ...vt, maxWidth: `min(100%, ${size.width}px, calc(${SINGLE_MAX_VH}vh * ${ratio}))` }}
        className="group relative mx-auto block w-full overflow-hidden rounded-site-sm"
        aria-label={openLabel}
      >
        <BlurImage
          src={url}
          alt={alt ?? ''}
          fit="cover"
          width={1024}
          aspectRatio={ratio}
          sizes="(max-width: 640px) 100vw, 600px"
          className="w-full"
        />
      </button>
    );
  }

  // Single image, size unknown (legacy): render at natural size as before, but
  // learn the size on load so subsequent renders take the reserved path above.
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onOpen(e.currentTarget);
      }}
      style={vt}
      className="group relative block overflow-hidden rounded-site-sm"
      aria-label={t('open-image', { defaultValue: 'Open image' })}
    >
      <BlurImage
        src={url}
        alt={alt ?? ''}
        fit="contain"
        width={1024}
        sizes="(max-width: 640px) 100vw, 600px"
        className="mx-auto block w-fit max-w-full rounded-site-sm"
        imgClassName="max-h-[80vh] max-w-full"
        onNaturalSize={onNaturalSize}
      />
    </button>
  );
}

interface LightboxProps {
  urls: string[];
  alts?: string[];
  index: number;
  /** Shared-element name for the currently-shown image (the open-morph target). */
  vtName?: string;
  onIndexChange: (i: number) => void;
  onClose: () => void;
}

function Lightbox({ urls, alts, index, vtName, onIndexChange, onClose }: LightboxProps) {
  const { t } = useTranslation('feed');
  const hasMultiple = urls.length > 1;

  const prev = useCallback(() => {
    onIndexChange((index - 1 + urls.length) % urls.length);
  }, [index, urls.length, onIndexChange]);

  const next = useCallback(() => {
    onIndexChange((index + 1) % urls.length);
  }, [index, urls.length, onIndexChange]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft' && hasMultiple) prev();
      else if (e.key === 'ArrowRight' && hasMultiple) next();
    };
    window.addEventListener('keydown', onKey);
    // Prevent background scroll while open
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose, prev, next, hasMultiple]);

  return createPortal(
    <div
      className="fixed inset-0 z-100 flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 rounded-full bg-black/50 p-2 text-white/90 transition-colors hover:bg-black/70 hover:text-white"
        aria-label={t('close', { defaultValue: 'Close' })}
      >
        <X className="h-6 w-6" />
      </button>

      {hasMultiple && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              prev();
            }}
            className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white/90 transition-colors hover:bg-black/70 hover:text-white"
            aria-label={t('previous-image', { defaultValue: 'Previous image' })}
          >
            <ChevronLeft className="h-7 w-7" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              next();
            }}
            className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white/90 transition-colors hover:bg-black/70 hover:text-white"
            aria-label={t('next-image', { defaultValue: 'Next image' })}
          >
            <ChevronRight className="h-7 w-7" />
          </button>
        </>
      )}

      <BlurImage
        key={urls[index]}
        src={urls[index]}
        alt={alts?.[index]?.trim() || ''}
        fit="contain"
        width={1600}
        quality={85}
        sizes="100vw"
        loading="eager"
        className="max-h-full max-w-full rounded-site-sm"
        imgClassName="max-h-[90vh] max-w-full"
        style={vtName ? { viewTransitionName: vtName } : undefined}
        onClick={(e) => e.stopPropagation()}
      />

      {hasMultiple && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 text-sm text-white/90">
          {index + 1} / {urls.length}
        </div>
      )}
    </div>,
    document.body
  );
}
