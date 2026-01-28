"use client";

import { motion } from "framer-motion";
import { useState } from "react";

interface ScrollButtonProps {
  targetId: string;
  label?: string;
  direction?: "down" | "up";
}

export function ScrollButton({ targetId, label, direction = "down" }: ScrollButtonProps) {
  const [isHovered, setIsHovered] = useState(false);

  const handleClick = () => {
    const element = document.getElementById(targetId);
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <motion.button
      onClick={handleClick}
      className="group flex flex-col items-center gap-2 cursor-pointer"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.95 }}
    >
      {label && (
        <span className="text-xs text-white/50 uppercase tracking-widest group-hover:text-white transition-colors">
          {label}
        </span>
      )}
      <motion.div
        className={`w-12 h-12 rounded-full border-2 border-white/30 flex items-center justify-center transition-all duration-300 ${isHovered ? "rainbow-glow" : ""}`}
        animate={{ y: direction === "down" ? [0, 8, 0] : [0, -8, 0] }}
        transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
      >
        <motion.svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`text-white/60 group-hover:text-white transition-colors ${direction === "up" ? "rotate-180" : ""}`}
        >
          <path d="M12 5v14M5 12l7 7 7-7" />
        </motion.svg>
      </motion.div>
    </motion.button>
  );
}
