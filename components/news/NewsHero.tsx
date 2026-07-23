'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { Link } from '@tanstack/react-router';
import useEmblaCarousel from 'embla-carousel-react';
import { useInView } from 'framer-motion';
import { ArrowRight, Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { NewsArticle } from '@/lib/news';

const EMBLA_OPTIONS = {
  loop: true,
  align: 'center' as const,
  slidesToScroll: 1,
};

const AUTO_ADVANCE_MS = 6000;

interface NewsHeroProps {
  articles: Partial<NewsArticle>[];
}

export function NewsHero({ articles }: NewsHeroProps) {
  const { t } = useTranslation('c-news');
  const [emblaRef, emblaApi] = useEmblaCarousel(EMBLA_OPTIONS);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [scrollSnaps, setScrollSnaps] = useState<number[]>([]);
  const containerRef = useRef(null);
  const isInView = useInView(containerRef, { once: true, amount: 0.3 });
  const [isPaused, setIsPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const progressRef = useRef({ elapsed: 0, lastTick: 0 });

  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
  const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);
  const scrollTo = useCallback((index: number) => emblaApi?.scrollTo(index), [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    setScrollSnaps(emblaApi.scrollSnapList());
    const onSelect = () => {
      setSelectedIndex(emblaApi.selectedScrollSnap());
      progressRef.current.elapsed = 0;
      setProgress(0);
    };
    onSelect();
    emblaApi.on('select', onSelect);
    emblaApi.on('reInit', () => {
      setScrollSnaps(emblaApi.scrollSnapList());
      onSelect();
    });
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi || !isInView || isPaused) return;
    const p = progressRef.current;
    p.lastTick = performance.now();
    let rafId: number;
    const tick = (now: number) => {
      p.elapsed += now - p.lastTick;
      p.lastTick = now;
      if (p.elapsed >= AUTO_ADVANCE_MS) {
        emblaApi.scrollNext();
      } else {
        setProgress(p.elapsed / AUTO_ADVANCE_MS);
        rafId = requestAnimationFrame(tick);
      }
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [emblaApi, isInView, isPaused, selectedIndex]);

  if (articles.length === 0) return null;

  return (
    <div
      ref={containerRef}
      role="region"
      aria-label={t('news-title', { defaultValue: 'News' })}
      className="relative mb-12"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onPointerDown={() => setIsPaused(true)}
      onFocusCapture={() => setIsPaused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setIsPaused(false);
      }}
    >
      <div className="-mx-3 overflow-hidden rounded-site" ref={emblaRef}>
        <div className="flex">
          {articles.map((article) => (
            <div key={article.slug} className="min-w-0 flex-[0_0_100%] px-3">
              <article className="site-inverse relative flex min-h-[260px] flex-col justify-end overflow-hidden rounded-site border border-site-border bg-site-surface p-5 sm:min-h-[320px] sm:p-8 md:p-12">
                <div
                  aria-hidden
                  className="absolute -right-20 -top-36 size-96 rounded-[44%_56%_62%_38%] bg-site-text opacity-8"
                />
                <div className="relative z-10 max-w-3xl">
                  <span className="mb-5 flex items-center gap-2 text-xs text-site-text-muted">
                    <Calendar className="size-3.5" aria-hidden />
                    {article.date}
                  </span>
                  <h2
                    className="mb-7 text-2xl font-medium leading-tight text-site-text md:text-4xl"
                    style={{ fontFamily: 'var(--site-font-display)' }}
                  >
                    {article.title}
                  </h2>
                  <Link
                    to={`/news/${article.slug}` as string}
                    aria-label={t('read-our-take', { defaultValue: 'Read article' })}
                    className="inline-flex size-11 items-center justify-center rounded-[var(--site-control-radius)] border border-site-border text-site-text transition-colors hover:bg-site-text hover:text-site-surface"
                  >
                    <ArrowRight className="size-4" aria-hidden />
                  </Link>
                  {article.category && <span className="sr-only">{article.category}</span>}
                </div>
              </article>
            </div>
          ))}
        </div>
      </div>

      {articles.length > 1 && (
        <div className="mt-4 flex items-center justify-center gap-3">
          <button
            onClick={scrollPrev}
            data-slot="news-hero-control"
            className="inline-flex size-11 shrink-0 touch-manipulation items-center justify-center rounded-site border border-site-border bg-site-surface text-site-text transition-colors hover:bg-site-accent hover:text-site-accent-fg active:bg-site-surface-active"
            aria-label={t('prev-featured-article', {
              defaultValue: 'Previous featured article',
            })}
          >
            <ChevronLeft className="size-4" aria-hidden />
          </button>

          <div className="flex max-w-full items-center overflow-x-auto">
            {scrollSnaps.map((_, index) => (
              <button
                key={index}
                onClick={() => scrollTo(index)}
                data-slot="news-hero-dot"
                aria-current={index === selectedIndex ? 'true' : undefined}
                className={`flex h-11 shrink-0 touch-manipulation items-center justify-center transition-[width] duration-300 ${
                  index === selectedIndex ? 'w-11' : 'w-8'
                }`}
                aria-label={t('go-to-featured-article', {
                  defaultValue: 'Go to featured article {{n}}',
                  n: index + 1,
                })}
              >
                <span
                  aria-hidden
                  className={`relative h-1.5 overflow-hidden rounded-site transition-[width,background-color] duration-300 ${
                    index === selectedIndex ? 'w-8 bg-site-accent/30' : 'w-1.5 bg-site-border'
                  }`}
                >
                  {index === selectedIndex && (
                    <span
                      className="absolute inset-0 rounded-site bg-site-accent"
                      style={{
                        transform: `scaleX(${progress})`,
                        transformOrigin: 'left',
                      }}
                    />
                  )}
                </span>
              </button>
            ))}
          </div>

          <button
            onClick={scrollNext}
            data-slot="news-hero-control"
            className="inline-flex size-11 shrink-0 touch-manipulation items-center justify-center rounded-site border border-site-border bg-site-surface text-site-text transition-colors hover:bg-site-accent hover:text-site-accent-fg active:bg-site-surface-active"
            aria-label={t('next-featured-article', { defaultValue: 'Next featured article' })}
          >
            <ChevronRight className="size-4" aria-hidden />
          </button>
        </div>
      )}
    </div>
  );
}
