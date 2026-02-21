"use client";

import React, { useCallback, useEffect, useState, useRef } from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import { useInView } from 'framer-motion';
import { GameInfo } from '@/lib/games';
import { GameCard } from '@/components/game/GameCard';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface GameCarouselProps {
    games: GameInfo[];
}

export function GameCarousel({ games }: GameCarouselProps) {
    const [emblaRef, emblaApi] = useEmblaCarousel({ 
        loop: true, 
        align: 'center',
        slidesToScroll: 1,
        breakpoints: {
            '(min-width: 768px)': { slidesToScroll: 2 },
            '(min-width: 1024px)': { slidesToScroll: 3 },
            '(min-width: 1280px)': { slidesToScroll: 4 }
        }
    });

    const [selectedIndex, setSelectedIndex] = useState(0);
    const [scrollSnaps, setScrollSnaps] = useState<number[]>([]);
    const [progress, setProgress] = useState(0);
    const [isPaused, setIsPaused] = useState(false);
    const containerRef = useRef(null);
    const isInView = useInView(containerRef, { once: false, amount: 0.3 });

    const scrollPrev = useCallback(() => emblaApi && emblaApi.scrollPrev(), [emblaApi]);
    const scrollNext = useCallback(() => emblaApi && emblaApi.scrollNext(), [emblaApi]);
    const scrollTo = useCallback((index: number) => emblaApi && emblaApi.scrollTo(index), [emblaApi]);

    const onInit = useCallback((emblaApi: any) => {
        setScrollSnaps(emblaApi.scrollSnapList());
    }, []);

    const onSelect = useCallback((emblaApi: any) => {
        setSelectedIndex(emblaApi.selectedScrollSnap());
        setProgress(0);
    }, []);

    // Custom Autoplay Logic - Perfectly Synced with Progress
    useEffect(() => {
        if (!emblaApi || !isInView || isPaused) return;

        const duration = 5000; // 5 seconds
        const intervalTime = 20; // Update every 20ms
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

    useEffect(() => {
        if (!emblaApi) return;
        onInit(emblaApi);
        onSelect(emblaApi);
        emblaApi.on('reInit', onInit);
        emblaApi.on('reInit', onSelect);
        emblaApi.on('select', onSelect);
    }, [emblaApi, onInit, onSelect]);

    return (
        <div 
            ref={containerRef}
            className="relative w-screen left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] group/carousel"
            onMouseEnter={() => setIsPaused(true)}
            onMouseLeave={() => setIsPaused(false)}
        >
            <div className="overflow-visible px-4 md:px-12 lg:px-24" ref={emblaRef}>
                <div className="flex -ml-4">
                    {games.map((game) => (
                        <div key={game.id} className="flex-[0_0_80%] sm:flex-[0_0_45%] lg:flex-[0_0_30%] xl:flex-[0_0_22%] pl-4 py-8">
                            <GameCard game={game} />
                        </div>
                    ))}
                </div>
            </div>

            {/* Navigation Buttons */}
            <button
                className="absolute left-4 md:left-12 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-slate-900/80 border border-slate-700 text-white flex items-center justify-center transition-all hover:bg-slate-800 hover:border-cyan-500/50 hover:shadow-[0_0_20px_rgba(34,211,238,0.2)] z-10 backdrop-blur-sm"
                onClick={scrollPrev}
                aria-label="Previous slide"
            >
                <ChevronLeft className="w-6 h-6" />
            </button>

            <button
                className="absolute right-4 md:right-12 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-slate-900/80 border border-slate-700 text-white flex items-center justify-center transition-all hover:bg-slate-800 hover:border-cyan-500/50 hover:shadow-[0_0_20px_rgba(34,211,238,0.2)] z-10 backdrop-blur-sm"
                onClick={scrollNext}
                aria-label="Next slide"
            >
                <ChevronRight className="w-6 h-6" />
            </button>

            {/* Pagination Dots */}
            <div className="mt-8 flex justify-center gap-2 items-center bg-slate-900/40 p-2 rounded-full border border-white/5 backdrop-blur-sm w-fit mx-auto">
                {scrollSnaps.map((_, index) => (
                    <button
                        key={index}
                        onClick={() => scrollTo(index)}
                        className={`relative h-1.5 rounded-full overflow-hidden bg-white/10 transition-all duration-500 ease-out ${index === selectedIndex ? "w-12" : "w-1.5"}`}
                        aria-label={`Go to slide ${index + 1}`}
                    >
                        {index === selectedIndex && (
                          <div 
                              className="absolute inset-0 bg-cyan-500"
                              style={{ width: `${progress}%` }}
                          />
                        )}
                    </button>
                ))}
            </div>
        </div>
    );
}
