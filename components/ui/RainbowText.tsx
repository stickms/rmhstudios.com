"use client";

import { motion } from "framer-motion";

interface RainbowTextProps {
  children: React.ReactNode;
  className?: string;
  as?: "span" | "h1" | "h2" | "h3" | "p";
}

export function RainbowText({
  children,
  className = "",
  as: Component = "span",
}: RainbowTextProps) {
  return (
    <motion.span
      className={`rainbow-text inline-block font-bold select-none ${className}`}
      whileHover={{ scale: 1.05 }}
      transition={{ type: "spring", stiffness: 400, damping: 10 }}
    >
      {children}
    </motion.span>
  );
}
