"use client";

import { motion } from "framer-motion";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ChevronDown } from "lucide-react";

export function HeroSection() {
  return (
    <section
      id="home"
      data-slot="hero"
      className="relative min-h-[calc(100vh-5rem)] flex flex-col items-center justify-center overflow-hidden pt-24 pb-8"
    >
      {/* Subtle accent gradient blob */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-150 h-100 bg-site-accent/8 rounded-full blur-[120px] pointer-events-none" />

      {/* Main content */}
      <div className="grow flex flex-col items-center justify-center w-full relative z-10 px-4 pb-24">
        <div className="text-center">
          {/* Heading */}
          <motion.h1
            className="text-5xl sm:text-7xl md:text-8xl lg:text-9xl font-black"
            style={{
              fontFamily: "var(--site-font-display)",
              letterSpacing: "var(--site-letter-spacing)",
              textShadow: "var(--site-text-shadow)",
            }}
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: "easeOut" }}
          >
            <span className="text-site-text">RMH </span>
            <span className="bg-linear-to-r from-site-accent to-site-accent-hover bg-clip-text text-transparent">
              STUDIOS
            </span>
          </motion.h1>

          {/* Tagline */}
          <motion.p
            className="mt-6 md:mt-8 text-xl md:text-2xl lg:text-3xl text-site-text-muted font-light"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.7 }}
          >
            Crafting Digital Worlds
          </motion.p>

          {/* CTA */}
          <motion.div
            className="mt-10 md:mt-12"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.5 }}
          >
            <Link to={"#projects" as string}>
              <Button variant="accent" size="lg" className="rounded-xl text-base px-8">
                Explore Our Games
              </Button>
            </Link>
          </motion.div>
        </div>
      </div>

      {/* Scroll indicator */}
      <motion.div
        className="absolute bottom-8 left-1/2 -translate-x-1/2 text-site-text-dim"
        animate={{ opacity: [0.3, 0.6, 0.3], y: [0, 4, 0] }}
        transition={{ duration: 2, repeat: Infinity }}
      >
        <ChevronDown className="w-5 h-5" />
      </motion.div>

      {/* Bottom fade */}
      <div className="absolute bottom-0 left-0 w-full h-24 bg-linear-to-b from-transparent to-site-bg pointer-events-none z-20" />
    </section>
  );
}
