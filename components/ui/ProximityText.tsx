"use client";

import { motion, useSpring, useTransform, MotionValue } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { useMousePosition } from "@/contexts/MouseContext";
import { useIsMobile } from "@/hooks/useIsMobile";
import { usePerformanceMode } from "@/hooks/usePerformanceMode";

interface ProximityTextProps {
  children: string;
  className?: string;
  maxScale?: number;
  proximity?: number;
}

function ProximityLetter({
  letter,
  mouseX,
  mouseY,
  maxScale,
  proximity,
  isMobile,
  perfMode,
}: {
  letter: string;
  mouseX: MotionValue<number>;
  mouseY: MotionValue<number>;
  maxScale: number;
  proximity: number;
  isMobile: boolean;
  perfMode: "full" | "reduced" | "minimal";
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [elementCenter, setElementCenter] = useState({ x: 0, y: 0 });

  const skip = isMobile || perfMode !== "full";

  const distance = useTransform([mouseX, mouseY], ([x, y]) => {
    if (skip) return 1000;
    const dx = (x as number) - elementCenter.x;
    const dy = (y as number) - elementCenter.y;
    return Math.sqrt(dx * dx + dy * dy);
  });

  const scale = useTransform(distance, [0, proximity], [maxScale, 1]);
  const springScale = useSpring(scale, { damping: 20, stiffness: 300 });

  const y = useTransform(distance, [0, proximity], [-12, 0]);
  const springY = useSpring(y, { damping: 20, stiffness: 300 });

  const trailOpacity = useTransform(distance, [0, proximity * 1.5], [1, 0]);
  const springTrailOpacity = useSpring(trailOpacity, { damping: 15, stiffness: 80 });

  useEffect(() => {
    if (!ref.current || skip) return;

    const updatePosition = () => {
      if (ref.current) {
        const rect = ref.current.getBoundingClientRect();
        setElementCenter({
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        });
      }
    };

    updatePosition();
    window.addEventListener("scroll", updatePosition, { passive: true });
    window.addEventListener("resize", updatePosition, { passive: true });

    return () => {
      window.removeEventListener("scroll", updatePosition);
      window.removeEventListener("resize", updatePosition);
    };
  }, [skip]);

  if (letter === " ") {
    return <span className="inline-block w-[0.3em]">&nbsp;</span>;
  }

  // Minimal + mobile: plain span, zero overhead
  if (skip) {
    return (
      <span ref={ref} className="inline-block relative text-white">
        {letter}
      </span>
    );
  }

  return (
    <motion.span
      ref={ref}
      className="inline-block relative text-white"
      style={{
        scale: springScale,
        y: springY,
      }}
    >
      {/* Base rainbow trail */}
      <motion.span
        className="absolute inset-0 rainbow-text"
        style={{ opacity: springTrailOpacity }}
        aria-hidden="true"
      >
        {letter}
      </motion.span>
      {/* Single soft glow layer instead of 3 heavy blur layers */}
      <motion.span
        className="absolute inset-0 rainbow-text blur-xs"
        style={{
          opacity: springTrailOpacity,
          x: 2,
          y: 2,
        }}
        aria-hidden="true"
      >
        {letter}
      </motion.span>
      {/* Main white letter */}
      <span className="relative z-10">{letter}</span>
    </motion.span>
  );
}

export function ProximityText({
  children,
  className = "",
  maxScale = 1.3,
  proximity = 150,
}: ProximityTextProps) {
  const { mouseX, mouseY } = useMousePosition();
  const isMobile = useIsMobile();
  const perfMode = usePerformanceMode();
  const letters = children.split("");

  // Minimal mode: just render plain text, no per-letter components
  if (perfMode === "minimal") {
    return <span className={`select-none text-white ${className}`}>{children}</span>;
  }

  return (
    <span className={`select-none ${className}`}>
      {letters.map((letter, index) => (
        <ProximityLetter
          key={index}
          letter={letter}
          mouseX={mouseX}
          mouseY={mouseY}
          maxScale={maxScale}
          proximity={proximity}
          isMobile={isMobile}
          perfMode={perfMode}
        />
      ))}
    </span>
  );
}
