'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { Link } from '@tanstack/react-router';
import { ArrowRight, Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getCategoryColor } from '@/lib/news-categories';
import { NewsSourceBadge } from '@/components/news/NewsSourceBadge';
import useEmblaCarousel from 'embla-carousel-react';
import type { NewsArticle } from '@/lib/news';

const EMBLA_OPTIONS = {
    loop: true,
    align: 'center' as const,
    slidesToScroll: 1,
};

interface NewsSectionProps {
    articles: Partial<NewsArticle>[];
}

export function NewsSection({ articles }: NewsSectionProps) {
    const [emblaRef, emblaApi] = useEmblaCarousel(EMBLA_OPTIONS);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [scrollSnaps, setScrollSnaps] = useState<number[]>([]);
    const [isPaused, setIsPaused] = useState(false);
    const containerRef = useRef(null);
    const isInView = useInView(containerRef, { once: true, amount: 0.4 });
    const [progress, setProgress] = useState(0);

    // Auto-advance
    useEffect(() => {
        if (!emblaApi || !isInView || isPaused) return;
        const duration = 5000;
        const intervalTime = 20;
        const step = (intervalTime / duration) * 100;

        const timer = setInterval(() => {
            setProgress((prev) => {
                if (prev >= 100) {
                    emblaApi.scrollNext();
                    return 0;
                }
                return prev + step;
            });
        }, intervalTime);

        return () => clearInterval(timer);
    }, [emblaApi, isInView, isPaused]);

    const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
    const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);
    const scrollTo = useCallback((index: number) => emblaApi?.scrollTo(index), [emblaApi]);

    useEffect(() => {
        if (!emblaApi) return;
        setScrollSnaps(emblaApi.scrollSnapList());
        const onSelect = () => {
            setSelectedIndex(emblaApi.selectedScrollSnap());
            setProgress(0);
        };
        onSelect();
        emblaApi.on('select', onSelect);
        emblaApi.on('reInit', () => {
            setScrollSnaps(emblaApi.scrollSnapList());
            onSelect();
        });
    }, [emblaApi]);

    if (articles.length === 0) return null;

    return (
        <section
            id="news"
            ref={containerRef}
            className="relative py-20 overflow-hidden bg-(--site-bg) min-h-screen flex flex-col justify-center"
        >
            <div className="absolute top-0 left-0 w-full h-px bg-linear-to-r from-transparent via-(--site-border) to-transparent" />

            <div className="container mx-auto max-w-7xl relative z-10 px-4">
                <SectionHeading
                    title="News"
                    subtitle="Curated coverage and commentary on AI, gaming, neuroscience, and the world."
                    className="mb-12"
                />
            </div>

            {/* Carousel */}
            <div
                className="relative w-full group"
                onMouseEnter={() => setIsPaused(true)}
                onMouseLeave={() => setIsPaused(false)}
            >
                <div className="overflow-visible" ref={emblaRef}>
                    <div className="flex touch-pan-y">
                        {articles.map((article, index) => {
                            const categoryColor = getCategoryColor(article.category ?? '');
                            return (
                                <div
                                    key={article.slug}
                                    className="flex-[0_0_80%] md:flex-[0_0_45%] lg:flex-[0_0_30%] min-w-0 px-4 transition-opacity duration-300"
                                >
                                    <div
                                        className={`h-full transition-all duration-500 ease-out ${index === selectedIndex
                                                ? 'scale-100 opacity-100 z-10'
                                                : 'scale-[0.88] opacity-30 grayscale-50'
                                            }`}
                                    >
                                        <Link to={`/news/${article.slug}`} className="block group/card h-full">
                                            <div
                                                className="bg-(--site-surface) border border-(--site-border) rounded-2xl overflow-hidden hover:border-(--site-accent)/50 transition-all duration-300 h-full flex flex-col hover:shadow-(--site-shadow) relative backdrop-blur-sm"
                                            >
                                                {/* Gradient accent bar */}
                                                <div className="h-1.5 w-full bg-gradient-to-r from-(--site-accent) via-(--site-accent-hover) to-(--site-accent)" />

                                                <div className="p-6 flex flex-col flex-1">
                                                    <div className="flex items-center justify-between mb-3">
                                                        <span
                                                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${categoryColor.bg} ${categoryColor.text}`}
                                                        >
                                                            {article.category}
                                                        </span>
                                                        <div className="flex items-center gap-1.5 text-(--site-text-dim) text-xs">
                                                            <Calendar className="w-3 h-3" />
                                                            {article.date}
                                                        </div>
                                                    </div>

                                                    <h3 className="text-xl md:text-2xl font-bold text-(--site-text) mb-3 group-hover/card:text-(--site-accent) transition-colors line-clamp-2 leading-snug">
                                                        {article.title}
                                                    </h3>

                                                    <p className="text-(--site-text-muted) mb-4 flex-1 line-clamp-3 text-sm">
                                                        {article.description}
                                                    </p>

                                                    {article.sourcePublisher && (
                                                        <p className="text-xs text-(--site-text-dim) mb-3">
                                                            via {article.sourcePublisher}
                                                        </p>
                                                    )}

                                                    <div className="flex items-center gap-2 text-sm font-bold text-(--site-text-muted) group-hover/card:gap-3 transition-all mt-auto">
                                                        Read Our Take <ArrowRight className="w-4 h-4" />
                                                    </div>
                                                </div>
                                            </div>
                                        </Link>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Navigation Arrows */}
                <button
                    onClick={scrollPrev}
                    className="absolute left-2 sm:left-4 md:left-[10%] lg:left-[30%] top-1/2 -translate-y-1/2 z-30 p-2 sm:p-3 rounded-full bg-(--site-surface) border border-(--site-border) text-(--site-text) hover:bg-(--site-accent) hover:border-(--site-accent) hover:text-white transition-all flex backdrop-blur-md"
                    aria-label="Previous Slide"
                >
                    <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6" />
                </button>
                <button
                    onClick={scrollNext}
                    className="absolute right-2 sm:right-4 md:right-[10%] lg:right-[30%] top-1/2 -translate-y-1/2 z-30 p-2 sm:p-3 rounded-full bg-(--site-surface) border border-(--site-border) text-(--site-text) hover:bg-(--site-accent) hover:border-(--site-accent) hover:text-white transition-all flex backdrop-blur-md"
                    aria-label="Next Slide"
                >
                    <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6" />
                </button>
            </div>

            <div className="container mx-auto max-w-7xl relative z-10 px-4">
                <div className="mt-6 flex flex-col items-center gap-4">
                    <div className="flex gap-2 items-center bg-(--site-surface)/40 p-2 rounded-full border border-(--site-border)/50 backdrop-blur-sm">
                        {scrollSnaps.map((_, index) => (
                            <button
                                key={index}
                                onClick={() => scrollTo(index)}
                                className={`relative h-1.5 rounded-full overflow-hidden bg-(--site-border) transition-all duration-500 ease-out ${index === selectedIndex ? 'w-12' : 'w-1.5'
                                    }`}
                                aria-label={`Go to slide ${index + 1}`}
                            >
                                {index === selectedIndex && (
                                    <div
                                        className="absolute inset-0 bg-(--site-accent)"
                                        style={{ width: `${progress}%` }}
                                    />
                                )}
                            </button>
                        ))}
                    </div>

                    <Link to="/news">
                        <Button variant="accent-outline">See All News</Button>
                    </Link>
                </div>
            </div>
        </section>
    );
}
