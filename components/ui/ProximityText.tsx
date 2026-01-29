"use client";

import { motion, useSpring, useTransform, MotionValue } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { useMousePosition } from "@/contexts/MouseContext";

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
}: {
  letter: string;
  mouseX: MotionValue<number>;
  mouseY: MotionValue<number>;
  maxScale: number;
  proximity: number;
  isMobile: boolean;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  // OPTIMIZATION: Only calculate center once or on specific triggers, not constantly
  const [elementCenter, setElementCenter] = useState({ x: 0, y: 0 });

  // IMPORTANT: On mobile, we skip all these heavy transforms
  // Calculate distance from mouse to this letter - skip if mobile
  const distance = useTransform([mouseX, mouseY], ([x, y]) => {
    if (isMobile) return 1000; // Far away effectively
    const dx = (x as number) - elementCenter.x;
    const dy = (y as number) - elementCenter.y;
    return Math.sqrt(dx * dx + dy * dy);
  });

  // Map distance to scale (closer = bigger)
  const scale = useTransform(distance, [0, proximity], [maxScale, 1]);
  const springScale = useSpring(scale, { damping: 20, stiffness: 300 });

  // Map distance to y offset (closer = higher)
  const y = useTransform(distance, [0, proximity], [-12, 0]);
  const springY = useSpring(y, { damping: 20, stiffness: 300 });

  // Rainbow trail opacity based on proximity - SLOWER FADE
  const trailOpacity = useTransform(distance, [0, proximity * 1.5], [1, 0]);
  const springTrailOpacity = useSpring(trailOpacity, { damping: 15, stiffness: 80 });

  // Derived opacities for trail layers
  const trailOpacity2 = useTransform(springTrailOpacity, (v) => v * 0.8);
  const trailOpacity3 = useTransform(springTrailOpacity, (v) => v * 0.5);
  const trailOpacity4 = useTransform(springTrailOpacity, (v) => v * 0.3);

  useEffect(() => {
    // OPTIMIZATION: Use ResizeObserver instead of window listeners + interval
    if (!ref.current) return;

    const updatePosition = () => {
       if (ref.current) {
         const rect = ref.current.getBoundingClientRect();
         // Account for scroll to get absolute position relative to document (approx)
         // Actually sticky elements move so client rect is better if we update on scroll
         setElementCenter({
           x: rect.left + rect.width / 2,
           y: rect.top + rect.height / 2,
         });
       }
    };

    updatePosition();
    
    // Only update on scroll/resize, remove the interval
    window.addEventListener("scroll", updatePosition, { passive: true });
    window.addEventListener("resize", updatePosition, { passive: true });

    return () => {
      window.removeEventListener("scroll", updatePosition);
      window.removeEventListener("resize", updatePosition);
    };
  }, []);

  if (letter === " ") {
    return <span className="inline-block w-[0.3em]">&nbsp;</span>;
  }

  // OPTIMIZATION: On mobile, render a simple span. No motion values, no layers.
  if (isMobile) {
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
      {/* Rainbow trail layers - MORE LAYERS, MORE BLUR */}
      <motion.span
        className="absolute inset-0 rainbow-text"
        style={{ opacity: springTrailOpacity }}
        aria-hidden="true"
      >
        {letter}
      </motion.span>
      <motion.span
        className="absolute inset-0 rainbow-text blur-[3px]"
        style={{
          opacity: springTrailOpacity,
          x: 1,
          y: 1,
        }}
        aria-hidden="true"
      >
        {letter}
      </motion.span>
      <motion.span
        className="absolute inset-0 rainbow-text blur-[8px]"
        style={{
          opacity: trailOpacity2,
          x: 3,
          y: 3,
        }}
        aria-hidden="true"
      >
        {letter}
      </motion.span>
      <motion.span
        className="absolute inset-0 rainbow-text blur-[16px]"
        style={{
          opacity: trailOpacity3,
          x: 6,
          y: 6,
        }}
        aria-hidden="true"
      >
        {letter}
      </motion.span>
      {/* Reduced one layer for performance generally */}
      {/* Main white letter */}
      <span className="relative z-10">{letter}</span>
    </motion.span>
  );
}

import { useIsMobile } from "@/hooks/useIsMobile";

export function ProximityText({
  children,
  className = "",
  maxScale = 1.3,
  proximity = 150,
}: ProximityTextProps) {
  const { mouseX, mouseY } = useMousePosition();
  const isMobile = useIsMobile();
  const letters = children.split("");

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
        />
      ))}
    </span>
  );
}
