"use client";

import { motion } from "framer-motion";

interface PulsatingOrbProps {
  className?: string;
  color?: "pink" | "cyan" | "purple" | "yellow";
  size?: "sm" | "md" | "lg";
}

const colorMap = {
  pink: "var(--neon-pink)",
  cyan: "var(--neon-cyan)",
  purple: "var(--neon-purple)",
  yellow: "var(--neon-yellow)",
};

const sizeMap = {
  sm: "w-32 h-32",
  md: "w-48 h-48",
  lg: "w-64 h-64",
};

export function PulsatingOrb({
  className = "",
  color = "pink",
  size = "md",
}: PulsatingOrbProps) {
  const orbColor = colorMap[color];
  const orbSize = sizeMap[size];

  return (
    <motion.div
      className={`${orbSize} rounded-full blur-3xl pointer-events-none ${className}`}
      style={{
        background: `radial-gradient(circle, ${orbColor} 0%, transparent 70%)`,
      }}
      animate={{
        scale: [1, 1.2, 1],
        opacity: [0.3, 0.6, 0.3],
      }}
      transition={{
        duration: 4,
        repeat: Infinity,
        ease: "easeInOut",
      }}
    />
  );
}
