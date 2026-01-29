"use client";

import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { useRef, useState, MouseEvent } from "react";

interface BouncyCardProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}

export function BouncyCard({ children, className = "", delay = 0 }: BouncyCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);

  const x = useMotionValue(0);
  const y = useMotionValue(0);

  // SUPER BOUNCY config
  const springConfig = { stiffness: 400, damping: 15, mass: 0.5 };

  // More extreme rotation
  const rotateX = useSpring(
    useTransform(y, [-0.5, 0.5], [25, -25]),
    springConfig
  );
  const rotateY = useSpring(
    useTransform(x, [-0.5, 0.5], [-25, 25]),
    springConfig
  );

  // Add scale and z translation for pop effect
  const scale = useSpring(
    useTransform(x, [-0.5, 0, 0.5], [1.05, 1, 1.05]),
    springConfig
  );
  const z = useSpring(
    useTransform(x, [-0.5, 0, 0.5], [20, 0, 20]),
    springConfig
  );

  // Glow intensity based on distance from center
  const glowOpacity = useSpring(
    useTransform(x, [-0.5, 0, 0.5], [1, 0.5, 1]),
    springConfig
  );

  const handleMouseEnter = () => {
    setIsHovered(true);
  };

  const handleMouse = (e: MouseEvent<HTMLDivElement>) => {
    if (!ref.current) return;
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

  return (
    // Outer wrapper stays stationary - handles mouse events with stable bounds
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
      {/* Inner card transforms based on mouse position */}
      <motion.div
        className={`relative rounded-2xl bg-white/5 p-6 backdrop-blur-sm border-2 border-white/10 h-full ${isHovered ? "rainbow-glow-inner" : ""}`}
        style={{
          rotateX,
          rotateY,
          scale,
          z,
          transformStyle: "preserve-3d",
          transformPerspective: 800,
        }}
      >
        {/* Inner glow effect */}
        <motion.div
          className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/5 to-white/10 pointer-events-none"
          style={{ opacity: glowOpacity }}
        />
        <div className="relative z-10 h-full flex flex-col">{children}</div>
      </motion.div>
    </motion.div>
  );
}
