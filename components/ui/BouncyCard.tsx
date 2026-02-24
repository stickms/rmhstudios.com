"use client";

import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { useRef, useState, MouseEvent } from "react";
import { usePerformanceMode } from "@/hooks/usePerformanceMode";

interface BouncyCardProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}

export function BouncyCard({ children, className = "", delay = 0 }: BouncyCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);
  const perfMode = usePerformanceMode();

  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const springConfig = { stiffness: 400, damping: 15, mass: 0.5 };

  const rotateX = useSpring(
    useTransform(y, [-0.5, 0.5], [25, -25]),
    springConfig
  );
  const rotateY = useSpring(
    useTransform(x, [-0.5, 0.5], [-25, 25]),
    springConfig
  );
  const scale = useSpring(
    useTransform(x, [-0.5, 0, 0.5], [1.05, 1, 1.05]),
    springConfig
  );

  const isMinimal = perfMode === "minimal";
  const isFull = perfMode === "full";

  const handleMouseEnter = () => {
    if (!isMinimal) setIsHovered(true);
  };

  const handleMouse = (e: MouseEvent<HTMLDivElement>) => {
    if (isMinimal || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    x.set((e.clientX - centerX) / rect.width);
    y.set((e.clientY - centerY) / rect.height);
  };

  const handleMouseLeave = () => {
    x.set(0);
    y.set(0);
    setIsHovered(false);
  };

  // Minimal mode: static card, no 3D transforms, no blur
  if (isMinimal) {
    return (
      <motion.div
        ref={ref}
        className={`relative ${className}`}
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ delay, duration: 0.5 }}
      >
        <div className="relative rounded-2xl bg-white/5 p-6 border-2 border-white/10 h-full">
          <div className="relative z-10 h-full flex flex-col">{children}</div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      ref={ref}
      className={`relative ${className}`}
      onMouseEnter={handleMouseEnter}
      onMouseMove={handleMouse}
      onMouseLeave={handleMouseLeave}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay, duration: 0.5 }}
    >
      <motion.div
        className={`relative rounded-2xl bg-white/5 p-6 border-2 border-white/10 h-full ${isHovered && isFull ? "rainbow-glow-inner" : ""}`}
        style={{
          rotateX,
          rotateY,
          scale,
          transformStyle: "preserve-3d",
          transformPerspective: 800,
        }}
      >
        {/* Skip inner glow overlay in reduced mode */}
        {isFull && (
          <div
            className="absolute inset-0 rounded-2xl bg-linear-to-br from-white/5 to-white/10 pointer-events-none"
            style={{ opacity: isHovered ? 0.8 : 0.5 }}
          />
        )}
        <div className="relative z-10 h-full flex flex-col">{children}</div>
      </motion.div>
    </motion.div>
  );
}
