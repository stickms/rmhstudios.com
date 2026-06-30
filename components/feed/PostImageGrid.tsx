'use client';

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { BlurImage } from '@/components/ui/BlurImage';

interface PostImageGridProps {
  urls: string[];
  className?: string;
}

export function PostImageGrid({ urls, className = '' }: PostImageGridProps) {
  const { t } = useTranslation('feed');
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  if (!urls || urls.length === 0) return null;

  const single = urls.length === 1;

  return (
    <>
      <div className={`grid gap-1 ${single ? 'grid-cols-1' : 'grid-cols-2'} ${className}`}>
        {urls.map((url, i) => (
          <button
            key={url}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setLightboxIndex(i);
            }}
            className={`group relative block overflow-hidden rounded-site-sm ${single ? '' : 'aspect-square'}`}
            aria-label={t('open-image', { defaultValue: 'Open image' })}
          >
            {single ? (
              <BlurImage
                src={url}
                alt=""
                fit="contain"
                width={1024}
                sizes="(max-width: 640px) 100vw, 600px"
                className="mx-auto block w-fit max-w-full rounded-site-sm"
                imgClassName="max-h-[80vh] max-w-full"
              />
            ) : (
              <BlurImage
                src={url}
                alt=""
                fit="cover"
                width={640}
                sizes="(max-width: 640px) 50vw, 300px"
                className="h-full w-full"
                imgClassName="h-full w-full transition-transform duration-200 group-hover:scale-[1.02]"
              />
            )}
          </button>
        ))}
      </div>

      {lightboxIndex !== null && (
        <Lightbox
          urls={urls}
          index={lightboxIndex}
          onIndexChange={setLightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </>
  );
}

interface LightboxProps {
  urls: string[];
  index: number;
  onIndexChange: (i: number) => void;
  onClose: () => void;
}

function Lightbox({ urls, index, onIndexChange, onClose }: LightboxProps) {
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
        alt=""
        fit="contain"
        width={1600}
        quality={85}
        sizes="100vw"
        loading="eager"
        className="max-h-full max-w-full rounded-site-sm"
        imgClassName="max-h-[90vh] max-w-full"
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
