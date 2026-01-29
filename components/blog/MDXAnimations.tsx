"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

const animationProps = {
  initial: { opacity: 0, y: 20 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-20px" },
  transition: { duration: 0.5 }
};

export const AnimatedH1 = ({ className, ...props }: any) => (
  <motion.h1 
    {...animationProps}
    className={cn("text-4xl font-black text-white mt-12 mb-6", className)} 
    {...props} 
  />
);

export const AnimatedH2 = ({ className, ...props }: any) => (
  <motion.h2 
    {...animationProps}
    className={cn("text-3xl font-bold text-white mt-10 mb-5", className)} 
    {...props} 
  />
);

export const AnimatedH3 = ({ className, ...props }: any) => (
  <motion.h3 
    {...animationProps}
    className={cn("text-2xl font-bold text-white mt-8 mb-4", className)} 
    {...props} 
  />
);

export const AnimatedP = ({ className, ...props }: any) => (
  <motion.p 
    {...animationProps}
    className={cn("text-lg text-white/80 leading-relaxed mb-6", className)} 
    {...props} 
  />
);

export const AnimatedUl = ({ className, ...props }: any) => (
  <motion.ul 
    {...animationProps}
    className={cn("list-disc list-outside ml-6 mb-6 text-white/80 space-y-2", className)} 
    {...props} 
  />
);

export const AnimatedOl = ({ className, ...props }: any) => (
  <motion.ol 
    {...animationProps}
    className={cn("list-decimal list-outside ml-6 mb-6 text-white/80 space-y-2", className)} 
    {...props} 
  />
);

export const AnimatedLi = ({ className, ...props }: any) => (
  <motion.li 
    {...animationProps}
    className={cn("pl-2", className)} 
    {...props} 
  />
);

export const AnimatedBlockquote = ({ className, ...props }: any) => (
  <motion.blockquote 
    {...animationProps}
    className={cn("border-l-4 border-[var(--neon-pink)] pl-6 py-2 my-8 text-xl font-light italic text-white/90 bg-white/5 rounded-r-lg", className)} 
    {...props} 
  />
);

export const AnimatedImg = ({ className, alt, ...props }: any) => (
  <motion.div 
    {...animationProps}
    className="my-8 rounded-xl overflow-hidden border border-white/10 shadow-2xl bg-black/50"
  >
    <img 
      className={cn("w-full h-auto transform hover:scale-[1.02] transition-transform duration-500", className)} 
      alt={alt}
      {...props} 
    />
    {alt && <div className="p-2 text-center text-xs text-white/40 font-mono bg-black/80">{alt}</div>}
  </motion.div>
);

export const AnimatedHr = ({ className, ...props }: any) => (
  <motion.hr 
    {...animationProps}
    className={cn("my-12 border-white/10", className)} 
    {...props} 
  />
);

export const AnimatedPre = ({ className, ...props }: any) => (
  <motion.pre 
    {...animationProps}
    className={cn("bg-black/50 border border-white/10 rounded-lg p-4 overflow-x-auto mb-6 custom-scrollbar", className)} 
    {...props} 
  />
);
