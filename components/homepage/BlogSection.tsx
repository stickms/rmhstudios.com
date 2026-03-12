"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { motion, useInView } from "framer-motion";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { Post } from "@/lib/blog";
import { Button } from "@/components/ui/button";
import useEmblaCarousel from "embla-carousel-react";

const EMBLA_OPTIONS = {
  loop: true,
  align: "center" as const,
  slidesToScroll: 1,
  breakpoints: {
    "(min-width: 768px)": { slidesToScroll: 1 },
    "(min-width: 1024px)": { slidesToScroll: 1 },
  },
};

interface BlogSectionProps {
  posts: Partial<Post>[];
}

export function BlogSection({ posts }: BlogSectionProps) {
  const [emblaRef, emblaApi] = useEmblaCarousel(EMBLA_OPTIONS);

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [scrollSnaps, setScrollSnaps] = useState<number[]>([]);
  const [isPaused, setIsPaused] = useState(false);
  const containerRef = useRef(null);
  const isInView = useInView(containerRef, { once: true, amount: 0.4 });

  const [progress, setProgress] = useState(0);

  // Custom Autoplay Logic
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

  useEffect(() => {
    if (!emblaApi) return;
    onInit(emblaApi);
    onSelect(emblaApi);
    emblaApi.on("reInit", onInit);
    emblaApi.on("reInit", onSelect);
    emblaApi.on("select", onSelect);
  }, [emblaApi, onInit, onSelect]);

  return (
    <section
      id="blog"
      ref={containerRef}
      className="relative py-20 overflow-hidden bg-site-bg min-h-screen flex flex-col justify-center"
    >
      {/* Subtle top divider */}
      <div className="absolute top-0 left-0 w-full h-px bg-linear-to-r from-transparent via-site-border to-transparent" />

      <div className="container mx-auto max-w-7xl relative z-10 px-4">
        <SectionHeading
          title="Devlog"
          subtitle="Updates, deep dives, and behind-the-scenes looks at what we're building."
          className="mb-12"
        />
      </div>

      {/* Full Width Carousel Container */}
      <div
        className="relative w-full group"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
      >
        <div className="overflow-visible" ref={emblaRef}>
          <div className="flex touch-pan-y">
            {posts.map((post, index) => (
              <div
                key={post.slug}
                className="flex-[0_0_80%] md:flex-[0_0_45%] lg:flex-[0_0_25%] min-w-0 px-4 transition-opacity duration-300"
              >
                <div
                  className={`h-full transition-all duration-500 ease-out ${
                    index === selectedIndex
                      ? "scale-100 opacity-100 z-10"
                      : "scale-[0.85] opacity-30 grayscale-50"
                  }`}
                >
                  <Link to={`/blog/${post.slug}` as string} className="block group/card h-full">
                    <div className="bg-site-surface border border-site-border rounded-2xl overflow-hidden hover:border-site-accent transition-all duration-300 h-full flex flex-col hover:shadow-(--site-shadow) relative backdrop-blur-sm">
                      {/* Image Placeholder */}
                      <div className="h-48 md:h-64 bg-site-surface-hover relative overflow-hidden group-hover/card:scale-105 transition-transform duration-700">
                        <div className="absolute inset-0 flex items-center justify-center text-site-text-dim text-sm px-4 text-center">
                          [Image: {post.title}]
                        </div>
                        <div className="absolute inset-0 bg-linear-to-t from-site-surface to-transparent" />
                      </div>

                      <div className="p-6 flex flex-col flex-1 relative z-10">
                        <div className="flex items-center gap-2 text-site-accent text-xs md:text-sm font-medium mb-3">
                          <Calendar className="w-3 h-3 md:w-4 md:h-4" />
                          {post.date}
                        </div>

                        <h3 className="text-xl md:text-2xl font-bold text-site-text mb-3 group-hover/card:text-site-accent transition-colors line-clamp-2">
                          {post.title}
                        </h3>

                        <p className="text-site-text-muted mb-6 flex-1 line-clamp-3 text-sm md:text-base">
                          {post.description}
                        </p>

                        <div className="flex items-center gap-2 text-sm font-bold text-site-text-muted group-hover/card:gap-3 transition-all mt-auto">
                          Read Update <ArrowRight className="w-4 h-4" />
                        </div>
                      </div>
                    </div>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Custom Navigation Controls */}
        <button
          onClick={scrollPrev}
          className="absolute left-2 sm:left-4 md:left-[10%] lg:left-[30%] top-1/2 -translate-y-1/2 z-30 p-2 sm:p-3 rounded-full bg-site-surface border border-site-border text-site-text hover:bg-site-accent hover:border-site-accent hover:text-white transition-all flex backdrop-blur-md"
          aria-label="Previous Slide"
        >
          <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6" />
        </button>
        <button
          onClick={scrollNext}
          className="absolute right-2 sm:right-4 md:right-[10%] lg:right-[30%] top-1/2 -translate-y-1/2 z-30 p-2 sm:p-3 rounded-full bg-site-surface border border-site-border text-site-text hover:bg-site-accent hover:border-site-accent hover:text-white transition-all flex backdrop-blur-md"
          aria-label="Next Slide"
        >
          <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6" />
        </button>
      </div>

      <div className="container mx-auto max-w-7xl relative z-10 px-4">
        {/* Pagination Dots & See All */}
        <div className="mt-6 flex flex-col items-center gap-4">
          <div className="flex gap-2 items-center bg-site-surface/40 p-2 rounded-full border border-site-border/50 backdrop-blur-sm">
            {scrollSnaps.map((_, index) => (
              <button
                key={index}
                onClick={() => scrollTo(index)}
                className={`relative h-1.5 rounded-full overflow-hidden bg-site-border transition-all duration-500 ease-out ${
                  index === selectedIndex ? "w-12" : "w-1.5"
                }`}
                aria-label={`Go to slide ${index + 1}`}
              >
                {index === selectedIndex && (
                  <div
                    className="absolute inset-0 bg-site-accent"
                    style={{ width: `${progress}%` }}
                  />
                )}
              </button>
            ))}
          </div>

          <Link to="/blog">
            <Button variant="accent-outline">See All Logs</Button>
          </Link>
        </div>
      </div>
    </section>
  );
}
