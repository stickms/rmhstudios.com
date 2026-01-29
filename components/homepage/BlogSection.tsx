"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { motion, useInView } from "framer-motion";
import { ProximityText } from "@/components/ui/ProximityText";
import Link from "next/link";
import { ArrowRight, Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { Post } from "@/lib/blog";
import { NeonButton } from "@/components/ui/NeonButton";
import useEmblaCarousel from "embla-carousel-react";


const EMBLA_OPTIONS = { 
  loop: true, 
  align: "center" as const, 
  slidesToScroll: 1,
  breakpoints: {
    "(min-width: 768px)": { slidesToScroll: 1 },
    "(min-width: 1024px)": { slidesToScroll: 1 }
  }
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
    <section id="blog" ref={containerRef} className="relative py-20 overflow-hidden bg-gradient-to-b from-[var(--neon-pink)]/20 to-[var(--neon-purple)]/20 min-h-screen flex flex-col justify-center">
      {/* Subtle Divider */}
      <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-[var(--neon-pink)]/50 to-transparent opacity-50" />
      
      <div className="container mx-auto max-w-7xl relative z-10 px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <h2 className="text-4xl md:text-6xl font-black mb-4 tracking-tighter">
            <ProximityText>Devlog</ProximityText>
          </h2>
          <p className="text-white/60 text-lg md:text-xl max-w-2xl mx-auto">
            Behind the scenes of Satan's Library and more.
          </p>
        </motion.div>
      </div>

      {/* Full Width Carousel Container */}
      <div 
        className="relative w-full group"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
      >
          {/* Left Grid Overlay */}
          <div className="absolute inset-y-0 left-0 w-24 md:w-48 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:24px_24px] [mask-image:linear-gradient(to_right,black,transparent)] z-20 pointer-events-none" />
          {/* Right Grid Overlay */}
          <div className="absolute inset-y-0 right-0 w-24 md:w-48 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:24px_24px] [mask-image:linear-gradient(to_left,black,transparent)] z-20 pointer-events-none" />

          <div className="overflow-visible" ref={emblaRef}>
              <div className="flex touch-pan-y">
                  {posts.map((post, index) => (
                      <div 
                          key={post.slug} 
                          className="flex-[0_0_80%] md:flex-[0_0_45%] lg:flex-[0_0_25%] min-w-0 px-4 transition-opacity duration-300"
                      >
                          <div
                              className={`h-full transition-all duration-500 ease-out ${index === selectedIndex ? "scale-100 opacity-100 z-10" : "scale-[0.85] opacity-30 grayscale-[50%]"}`}
                          >
                              <Link href={`/blog/${post.slug}`} className="block group/card h-full">
                                  <div className="bg-black/60 border border-white/10 rounded-2xl overflow-hidden hover:border-[var(--neon-pink)] transition-all duration-300 h-full flex flex-col hover:shadow-[0_0_40px_rgba(255,0,255,0.2)] relative backdrop-blur-sm">
                                  
                                  {/* Image Placeholder */}
                                  <div className="h-48 md:h-64 bg-white/5 relative overflow-hidden group-hover/card:scale-105 transition-transform duration-700">
                                      <div className="absolute inset-0 flex items-center justify-center text-white/20 font-mono text-sm px-4 text-center">
                                          [Image: {post.title}]
                                      </div>
                                      <div className="absolute inset-0 bg-gradient-to-t from-black/90 to-transparent" />
                                  </div>

                                  <div className="p-6 flex flex-col flex-1 relative z-10">
                                      <div className="flex items-center gap-2 text-[var(--neon-cyan)] text-xs md:text-sm font-mono mb-3">
                                          <Calendar className="w-3 h-3 md:w-4 md:h-4" />
                                          {post.date}
                                      </div>
                                      
                                      <h3 className="text-xl md:text-2xl font-bold text-white mb-3 group-hover/card:text-[var(--neon-pink)] transition-colors line-clamp-2">
                                          {post.title}
                                      </h3>
                                      
                                      <p className="text-white/60 mb-6 flex-1 line-clamp-3 text-sm md:text-base">
                                          {post.description}
                                      </p>

                                      <div className="flex items-center gap-2 text-sm font-bold text-white/80 group-hover/card:gap-3 transition-all mt-auto">
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
              className="absolute left-8 md:left-[15%] lg:left-[32%] top-1/2 -translate-y-1/2 z-30 p-3 rounded-full bg-black/50 border border-white/10 text-white hover:bg-[var(--neon-pink)] hover:border-[var(--neon-pink)] transition-all hidden md:flex backdrop-blur-md"
              aria-label="Previous Slide"
          >
              <ChevronLeft className="w-6 h-6" />
          </button>
          <button 
              onClick={scrollNext} 
              className="absolute right-8 md:right-[15%] lg:right-[32%] top-1/2 -translate-y-1/2 z-30 p-3 rounded-full bg-black/50 border border-white/10 text-white hover:bg-[var(--neon-pink)] hover:border-[var(--neon-pink)] transition-all hidden md:flex backdrop-blur-md"
              aria-label="Next Slide"
          >
              <ChevronRight className="w-6 h-6" />
          </button>
      </div>

      <div className="container mx-auto max-w-7xl relative z-10 px-4">
        {/* Pagination Dots & See All */}
        <div className="mt-6 flex flex-col items-center gap-4">
            <div className="flex gap-2 items-center bg-black/40 p-2 rounded-full border border-white/5 backdrop-blur-sm">
                {scrollSnaps.map((_, index) => (
                    <button
                        key={index}
                        onClick={() => scrollTo(index)}
                        className={`relative h-1.5 rounded-full overflow-hidden bg-white/10 transition-all duration-500 ease-out ${index === selectedIndex ? "w-12" : "w-1.5"}`}
                        aria-label={`Go to slide ${index + 1}`}
                    >
                        {index === selectedIndex && (
                          <div 
                              className="absolute inset-0 bg-[var(--neon-pink)]"
                              style={{ width: `${progress}%` }}
                          />
                        )}
                    </button>
                ))}
            </div>

            <NeonButton href="/blog">See All Logs</NeonButton>
        </div>
      </div>
    </section>
  );
}
