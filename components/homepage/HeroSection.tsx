"use client";

import { motion, useTransform, useSpring } from "framer-motion";
import { useEffect, useState } from "react";
import { FloatingElement } from "@/components/ui/FloatingElement";
import { GlitchText } from "@/components/ui/GlitchText";
import { NeonButton } from "@/components/ui/NeonButton";
import { PulsatingOrb } from "@/components/ui/PulsatingOrb";
import { FloatingShapes } from "@/components/effects/FloatingShapes";
import { ProximityText } from "@/components/ui/ProximityText";
import { ScrollButton } from "@/components/ui/ScrollButton";
import { useMousePosition } from "@/contexts/MouseContext";

export function HeroSection() {
  const { mouseX, mouseY } = useMousePosition();
  const [windowSize, setWindowSize] = useState({ width: 1, height: 1 });

  useEffect(() => {
    setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    const handleResize = () => {
      setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const springConfig = { damping: 25, stiffness: 100 };
  // Transform absolute mouse position to normalized 0-1 range for rotation
  const normalizedX = useTransform(mouseX, [0, windowSize.width], [0, 1]);
  const normalizedY = useTransform(mouseY, [0, windowSize.height], [0, 1]);
  const rotateX = useSpring(useTransform(normalizedY, [0, 1], [5, -5]), springConfig);
  const rotateY = useSpring(useTransform(normalizedX, [0, 1], [-5, 5]), springConfig);

  return (
    <section id="home" className="relative h-screen flex items-center justify-center overflow-hidden scanlines">
      {/* Background grid - animated */}
      <div className="absolute inset-0 grid-bg" />

      {/* Floating shapes */}
      <FloatingShapes />

      {/* MANY Pulsating orbs */}
      <PulsatingOrb className="absolute top-10 left-[5%]" color="pink" size="lg" />
      <PulsatingOrb className="absolute top-[15%] right-[10%]" color="cyan" size="md" />
      <PulsatingOrb className="absolute bottom-[20%] left-[15%]" color="purple" size="lg" />
      <PulsatingOrb className="absolute bottom-[30%] right-[5%]" color="yellow" size="md" />
      <PulsatingOrb className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" color="pink" size="lg" />
      <PulsatingOrb className="absolute top-[30%] left-[30%]" color="cyan" size="sm" />
      <PulsatingOrb className="absolute bottom-[10%] right-[30%]" color="purple" size="sm" />

      {/* Main content with perspective */}
      <motion.div
        className="relative z-10 text-center px-4"
        style={{
          rotateX,
          rotateY,
          transformStyle: "preserve-3d",
          transformPerspective: 1000,
        }}
      >
        {/* Decorative lines */}
        <motion.div
          className="absolute -top-20 left-1/2 -translate-x-1/2 w-px h-16 bg-gradient-to-b from-transparent via-[var(--neon-pink)] to-transparent"
          animate={{ scaleY: [0, 1, 0], opacity: [0, 1, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        />

        <FloatingElement intensity={40}>
          <motion.h1
            className="text-5xl sm:text-7xl md:text-8xl lg:text-9xl font-black tracking-tighter"
            initial={{ opacity: 0, y: 50, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          >
            <span className="block sm:hidden">
              <ProximityText
                className="text-5xl font-black"
                maxScale={1.3}
                proximity={150}
              >
                RMH
              </ProximityText>
              <br />
              <ProximityText
                className="text-5xl font-black"
                maxScale={1.3}
                proximity={150}
              >
                STUDIOS
              </ProximityText>
            </span>
            <span className="hidden sm:inline">
              <ProximityText
                className="sm:text-7xl md:text-8xl lg:text-9xl font-black"
                maxScale={1.4}
                proximity={200}
              >
                RMH STUDIOS
              </ProximityText>
            </span>
          </motion.h1>
        </FloatingElement>

        <motion.div
          className="mt-6 md:mt-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4, duration: 0.8 }}
        >
          <motion.p
            className="text-xl md:text-2xl lg:text-3xl text-white/90 font-light"
            whileHover={{ scale: 1.05 }}
          >
            <GlitchText>Crafting Digital Worlds</GlitchText>
          </motion.p>
        </motion.div>

        {/* Bouncing emoji decorations */}
        <div className="absolute -left-20 top-0 text-4xl bounce-crazy" style={{ animationDelay: "0s" }}>
          <motion.span
            animate={{ rotate: 360 }}
            transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
          >
            ✦
          </motion.span>
        </div>
        <div className="absolute -right-20 top-0 text-4xl bounce-crazy" style={{ animationDelay: "0.3s" }}>
          <motion.span
            className="text-[var(--neon-cyan)]"
            animate={{ rotate: -360 }}
            transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
          >
            ✧
          </motion.span>
        </div>

        <motion.div
          className="mt-10 md:mt-12"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8, duration: 0.6 }}
        >
          <motion.div
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
          >
            <NeonButton href="#projects">Explore Our Games</NeonButton>
          </motion.div>
        </motion.div>

        {/* Extra floating text */}
        <motion.div
          className="absolute -bottom-16 left-1/2 -translate-x-1/2 text-xs text-white/30 tracking-[0.3em] uppercase"
          animate={{ opacity: [0.3, 0.6, 0.3] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          Scroll to explore
        </motion.div>
      </motion.div>

      {/* Animated corner decorations */}
      <motion.div
        className="absolute top-8 left-8 w-20 h-20 border-l-2 border-t-2 border-[var(--neon-pink)]"
        animate={{ opacity: [0.3, 0.8, 0.3] }}
        transition={{ duration: 2, repeat: Infinity }}
      />
      <motion.div
        className="absolute top-8 right-8 w-20 h-20 border-r-2 border-t-2 border-[var(--neon-cyan)]"
        animate={{ opacity: [0.3, 0.8, 0.3] }}
        transition={{ duration: 2, repeat: Infinity, delay: 0.5 }}
      />
      <motion.div
        className="absolute bottom-8 left-8 w-20 h-20 border-l-2 border-b-2 border-[var(--neon-purple)]"
        animate={{ opacity: [0.3, 0.8, 0.3] }}
        transition={{ duration: 2, repeat: Infinity, delay: 1 }}
      />
      <motion.div
        className="absolute bottom-8 right-8 w-20 h-20 border-r-2 border-b-2 border-[var(--neon-yellow)]"
        animate={{ opacity: [0.3, 0.8, 0.3] }}
        transition={{ duration: 2, repeat: Infinity, delay: 1.5 }}
      />

      {/* Scroll to next section */}
      <div className="absolute bottom-6 md:bottom-12 left-1/2 -translate-x-1/2">
        <ScrollButton targetId="projects" label="Our Games" />
      </div>
    </section>
  );
}
