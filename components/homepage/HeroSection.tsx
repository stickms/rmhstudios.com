"use client";

import { motion, useTransform, useSpring } from "framer-motion";
import { useEffect, useState } from "react";
import { FloatingElement } from "@/components/ui/FloatingElement";
import { GlitchText } from "@/components/ui/GlitchText";
import { NeonButton } from "@/components/ui/NeonButton";
import { PulsatingOrb } from "@/components/ui/PulsatingOrb";
import { FloatingShapes } from "@/components/effects/FloatingShapes";
import { ProximityText } from "@/components/ui/ProximityText";
import { useMousePosition } from "@/contexts/MouseContext";
import { usePerformanceMode } from "@/hooks/usePerformanceMode";

export function HeroSection() {
  const { mouseX, mouseY } = useMousePosition();
  const perfMode = usePerformanceMode();
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
  const normalizedX = useTransform(mouseX, [0, windowSize.width], [0, 1]);
  const normalizedY = useTransform(mouseY, [0, windowSize.height], [0, 1]);
  const rotateX = useSpring(useTransform(normalizedY, [0, 1], [5, -5]), springConfig);
  const rotateY = useSpring(useTransform(normalizedX, [0, 1], [-5, 5]), springConfig);

  const isFull = perfMode === "full";
  const isMinimal = perfMode === "minimal";

  return (
    <section id="home" className={`relative min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center overflow-hidden ${isMinimal ? "" : "scanlines"} pt-20`}>
      {/* Background grid — skip animation in minimal */}
      {!isMinimal && <div className="absolute inset-0 grid-bg" />}

      {/* Floating shapes — component handles its own perf mode */}
      <FloatingShapes />

      {/* Pulsating orbs — reduced count based on perf mode */}
      {/* PulsatingOrb handles null return in minimal mode internally */}
      <PulsatingOrb className="absolute top-10 left-[5%]" color="pink" size="lg" />
      <PulsatingOrb className="absolute bottom-[20%] left-[15%]" color="purple" size="lg" />
      <PulsatingOrb className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" color="pink" size="lg" />
      {isFull && (
        <>
          <PulsatingOrb className="absolute top-[15%] right-[10%]" color="cyan" size="md" />
          <PulsatingOrb className="absolute bottom-[30%] right-[5%]" color="yellow" size="md" />
          <PulsatingOrb className="absolute top-[30%] left-[30%]" color="cyan" size="sm" />
          <PulsatingOrb className="absolute bottom-[10%] right-[30%]" color="purple" size="sm" />
        </>
      )}

      {/* Main content with perspective — skip 3D transform in minimal */}
      <div className="grow flex flex-col items-center justify-center w-full relative z-10 px-4 pb-32">
        {isMinimal ? (
          <div className="text-center">
            <HeroContent perfMode={perfMode} />
          </div>
        ) : (
          <motion.div
            className="text-center"
            style={{
              rotateX,
              rotateY,
              transformStyle: "preserve-3d",
              transformPerspective: 1000,
            }}
          >
            {/* Decorative line — skip in reduced/minimal */}
            {isFull && (
              <motion.div
                className="absolute -top-20 left-1/2 -translate-x-1/2 w-px h-16 bg-linear-to-b from-transparent via-(--neon-pink) to-transparent"
                animate={{ scaleY: [0, 1, 0], opacity: [0, 1, 0] }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              />
            )}

            <HeroContent perfMode={perfMode} />

            {/* Bouncing decorations — full mode only */}
            {isFull && (
              <>
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
                    className="text-(--neon-cyan)"
                    animate={{ rotate: -360 }}
                    transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                  >
                    ✧
                  </motion.span>
                </div>
              </>
            )}

            {/* Scroll to explore text */}
            {isFull && (
              <motion.div
                className="absolute -bottom-16 left-1/2 -translate-x-1/2 text-xs text-white/30 tracking-[0.3em] uppercase"
                animate={{ opacity: [0.3, 0.6, 0.3] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                Scroll to explore
              </motion.div>
            )}
          </motion.div>
        )}
      </div>

      {/* Corner decorations — full mode only */}
      {isFull && (
        <>
          <motion.div
            className="absolute top-8 left-8 w-20 h-20 border-l-2 border-t-2 border-(--neon-pink)"
            animate={{ opacity: [0.3, 0.8, 0.3] }}
            transition={{ duration: 2, repeat: Infinity }}
          />
          <motion.div
            className="absolute top-8 right-8 w-20 h-20 border-r-2 border-t-2 border-(--neon-cyan)"
            animate={{ opacity: [0.3, 0.8, 0.3] }}
            transition={{ duration: 2, repeat: Infinity, delay: 0.5 }}
          />
          <motion.div
            className="absolute bottom-8 left-8 w-20 h-20 border-l-2 border-b-2 border-(--neon-purple)"
            animate={{ opacity: [0.3, 0.8, 0.3] }}
            transition={{ duration: 2, repeat: Infinity, delay: 1 }}
          />
          <motion.div
            className="absolute bottom-8 right-8 w-20 h-20 border-r-2 border-b-2 border-(--neon-yellow)"
            animate={{ opacity: [0.3, 0.8, 0.3] }}
            transition={{ duration: 2, repeat: Infinity, delay: 1.5 }}
          />
        </>
      )}

      {/* Bottom fade */}
      <div className="absolute bottom-0 left-0 w-full h-32 bg-linear-to-b from-transparent to-black pointer-events-none z-20" />
    </section>
  );
}

/** Extracted hero content to avoid duplication between minimal and full paths */
function HeroContent({ perfMode }: { perfMode: "full" | "reduced" | "minimal" }) {
  const isMinimal = perfMode === "minimal";

  return (
    <>
      {isMinimal ? (
        <motion.h1
          className="text-5xl sm:text-7xl md:text-8xl lg:text-9xl font-black tracking-tighter"
          initial={{ opacity: 0, y: 50, scale: 0.8 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        >
          <span className="block sm:hidden text-5xl font-black text-white">
            RMH<br />STUDIOS
          </span>
          <span className="hidden sm:inline sm:text-7xl md:text-8xl lg:text-9xl font-black text-white">
            RMH STUDIOS
          </span>
        </motion.h1>
      ) : (
        <FloatingElement intensity={40}>
          <motion.h1
            className="text-5xl sm:text-7xl md:text-8xl lg:text-9xl font-black tracking-tighter"
            initial={{ opacity: 0, y: 50, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          >
            <span className="block sm:hidden">
              <ProximityText className="text-5xl font-black" maxScale={1.3} proximity={150}>
                RMH
              </ProximityText>
              <br />
              <ProximityText className="text-5xl font-black" maxScale={1.3} proximity={150}>
                STUDIOS
              </ProximityText>
            </span>
            <span className="hidden sm:inline">
              <ProximityText className="sm:text-7xl md:text-8xl lg:text-9xl font-black" maxScale={1.4} proximity={200}>
                RMH STUDIOS
              </ProximityText>
            </span>
          </motion.h1>
        </FloatingElement>
      )}

      <motion.div
        className="mt-6 md:mt-8"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4, duration: 0.8 }}
      >
        <motion.p
          className="text-xl md:text-2xl lg:text-3xl text-white/90 font-light"
          whileHover={isMinimal ? undefined : { scale: 1.05 }}
        >
          <GlitchText>Crafting Digital Worlds</GlitchText>
        </motion.p>
      </motion.div>

      <motion.div
        className="mt-10 md:mt-12"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.8, duration: 0.6 }}
      >
        <motion.div
          whileHover={isMinimal ? undefined : { scale: 1.1 }}
          whileTap={isMinimal ? undefined : { scale: 0.95 }}
        >
          <NeonButton href="#projects">Explore Our Games</NeonButton>
        </motion.div>
      </motion.div>
    </>
  );
}
