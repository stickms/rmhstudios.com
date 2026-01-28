"use client";

import { motion } from "framer-motion";

interface MarqueeProps {
  children: React.ReactNode;
  speed?: number;
  className?: string;
}

export function Marquee({ children, speed = 20, className = "" }: MarqueeProps) {
  return (
    <div className={`overflow-hidden whitespace-nowrap ${className}`}>
      <motion.div
        className="inline-block"
        animate={{ x: ["100%", "-100%"] }}
        transition={{
          duration: speed,
          repeat: Infinity,
          ease: "linear",
        }}
      >
        {children}
      </motion.div>
    </div>
  );
}

export function MarqueeBanner() {
  const text = "RMH STUDIOS • CRAFTING DIGITAL WORLDS • GAMES IN DEVELOPMENT • ";

  return (
    <div className="bg-gradient-to-r from-[var(--neon-pink)] via-[var(--neon-purple)] to-[var(--neon-cyan)] py-2 overflow-hidden">
      <div className="flex">
        <motion.div
          className="flex shrink-0"
          animate={{ x: ["0%", "-50%"] }}
          transition={{
            duration: 15,
            repeat: Infinity,
            ease: "linear",
          }}
        >
          {[...Array(4)].map((_, i) => (
            <span key={i} className="text-black font-black text-sm tracking-wider px-4">
              {text}
            </span>
          ))}
        </motion.div>
      </div>
    </div>
  );
}
