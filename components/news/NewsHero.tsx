'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { Link } from '@tanstack/react-router';
import useEmblaCarousel from 'embla-carousel-react';
import { useInView } from 'framer-motion';
import { ArrowRight, Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { getCategoryColor } from '@/lib/news-categories';
import { NewsSourceBadge } from './NewsSourceBadge';
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

    // Single rAF loop drives both progress bar and auto-advance
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
        <div ref={containerRef} className="relative mb-12" onMouseEnter={() => setIsPaused(true)} onMouseLeave={() => setIsPaused(false)}>
            <div className="overflow-hidden rounded-2xl -mx-3" ref={emblaRef}>
                <div className="flex">
                    {articles.map((article, index) => {
                        const categoryColor = getCategoryColor(article.category ?? '');
                        return (
                            <div key={article.slug} className="flex-[0_0_100%] min-w-0 px-3">
                                <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-(--site-surface) via-(--site-bg-subtle) to-(--site-surface) border border-(--site-border) p-8 md:p-12 min-h-[320px] flex flex-col justify-end">
                                    {/* Decorative gradient overlay */}
                                    <div className="absolute inset-0 bg-gradient-to-t from-(--site-bg)/80 via-transparent to-transparent" />
                                    <div className="absolute top-0 right-0 w-1/2 h-full opacity-10">
                                        <div className="absolute inset-0 bg-gradient-to-l from-(--site-accent) to-transparent" />
                                    </div>

                                    <div className="relative z-10">
                                        <div className="flex items-center gap-3 mb-4">
                                            <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider ${categoryColor.bg} ${categoryColor.text} ${categoryColor.border} border`}>
                                                {article.category}
                                            </span>
                                            <span className="text-xs text-(--site-text-dim) font-mono flex items-center gap-1.5">
                                                <Calendar className="w-3 h-3" />
                                                {article.date}
                                            </span>
                                            {article.sourcePublisher && article.sourceUrl && (
                                                <NewsSourceBadge publisher={article.sourcePublisher} url={article.sourceUrl} />
                                            )}
                                        </div>

                                        <h2 className="text-2xl md:text-4xl font-black text-(--site-text) mb-4 leading-tight max-w-3xl" style={{ fontFamily: 'var(--site-font-display)' }}>
                                            {article.title}
                                        </h2>

                                        <p className="text-(--site-text-muted) text-base md:text-lg mb-6 max-w-2xl line-clamp-2">
                                            {article.description}
                                        </p>

                                        <Link
                                            to={`/news/${article.slug}` as string}
                                            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-(--site-accent) text-site-accent-fg text-sm font-bold hover:opacity-90 transition-opacity"
                                        >
                                            Read Our Take <ArrowRight className="w-4 h-4" />
                                        </Link>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Navigation */}
            {articles.length > 1 && (
                <>
                    {/* Arrows + Dots */}
                    <div className="flex justify-center items-center gap-3 mt-4">
                        <button
                            onClick={scrollPrev}
                            className="p-1.5 rounded-full bg-(--site-surface)/80 border border-(--site-border) text-(--site-text) hover:bg-(--site-accent) hover:border-(--site-accent) hover:text-site-accent-fg transition-all backdrop-blur-md"
                            aria-label="Previous featured article"
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </button>

                        <div className="flex items-center gap-2">
                            {scrollSnaps.map((_, index) => (
                                <button
                                    key={index}
                                    onClick={() => scrollTo(index)}
                                    className={`relative h-1.5 rounded-full overflow-hidden transition-all duration-300 ${index === selectedIndex
                                            ? 'w-8 bg-(--site-accent)/30'
                                            : 'w-1.5 bg-(--site-border) hover:bg-(--site-text-dim)'
                                        }`}
                                    aria-label={`Go to featured article ${index + 1}`}
                                >
                                    {index === selectedIndex && (
                                        <span
                                            className="absolute inset-0 rounded-full bg-(--site-accent)"
                                            style={{
                                                transform: `scaleX(${progress})`,
                                                transformOrigin: 'left',
                                            }}
                                        />
                                    )}
                                </button>
                            ))}
                        </div>

                        <button
                            onClick={scrollNext}
                            className="p-1.5 rounded-full bg-(--site-surface)/80 border border-(--site-border) text-(--site-text) hover:bg-(--site-accent) hover:border-(--site-accent) hover:text-site-accent-fg transition-all backdrop-blur-md"
                            aria-label="Next featured article"
                        >
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                </>
            )}
        </div>
    );
}
