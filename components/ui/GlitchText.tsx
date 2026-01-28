"use client";

import { motion } from "framer-motion";

interface GlitchTextProps {
  children: React.ReactNode;
  className?: string;
}

export function GlitchText({ children, className = "" }: GlitchTextProps) {
  return (
    <motion.span
      className={`glitch-text inline-block ${className}`}
      whileHover={{
        scale: 1.02,
        transition: { type: "spring", stiffness: 400, damping: 10 },
      }}
    >
      {children}
    </motion.span>
  );
}
