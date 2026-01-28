"use client";

import { motion, useMotionValue, useSpring, useTransform, MotionValue } from "framer-motion";
import { useEffect, useRef, useState } from "react";

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
}: {
  letter: string;
  mouseX: MotionValue<number>;
  mouseY: MotionValue<number>;
  maxScale: number;
  proximity: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [elementCenter, setElementCenter] = useState({ x: 0, y: 0 });

  // Calculate distance from mouse to this letter
  const distance = useTransform([mouseX, mouseY], ([x, y]) => {
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

  // Rainbow trail opacity based on proximity - SLOWER FADE (lower stiffness/damping)
  const trailOpacity = useTransform(distance, [0, proximity * 1.5], [1, 0]);
  const springTrailOpacity = useSpring(trailOpacity, { damping: 15, stiffness: 80 });

  // Derived opacities for trail layers - MORE VISIBLE
  const trailOpacity2 = useTransform(springTrailOpacity, (v) => v * 0.8);
  const trailOpacity3 = useTransform(springTrailOpacity, (v) => v * 0.5);
  const trailOpacity4 = useTransform(springTrailOpacity, (v) => v * 0.3);

  useEffect(() => {
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
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition);

    const interval = setInterval(updatePosition, 100);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition);
      clearInterval(interval);
    };
  }, []);

  if (letter === " ") {
    return <span className="inline-block w-[0.3em]">&nbsp;</span>;
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
      {/* Rainbow trail layers - MORE LAYERS, MORE BLUR, MORE OBVIOUS */}
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
      <motion.span
        className="absolute inset-0 rainbow-text blur-[24px]"
        style={{
          opacity: trailOpacity4,
          x: 10,
          y: 10,
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
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      mouseX.set(e.clientX);
      mouseY.set(e.clientY);
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [mouseX, mouseY]);

  const letters = children.split("");

  return (
    <span className={className}>
      {letters.map((letter, index) => (
        <ProximityLetter
          key={index}
          letter={letter}
          mouseX={mouseX}
          mouseY={mouseY}
          maxScale={maxScale}
          proximity={proximity}
        />
      ))}
    </span>
  );
}
