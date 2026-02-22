"use client";

import { motion } from "framer-motion";
import { useState } from "react";

interface FlipCardProps {
  front: React.ReactNode;
  back: React.ReactNode;
  className?: string;
}

export function FlipCard({ front, back, className = "" }: FlipCardProps) {
  const [isFlipped, setIsFlipped] = useState(false);

  const handleFlip = () => {
    setIsFlipped(!isFlipped);
  };

  return (
    <div 
      className={`relative h-full perspective-1000 ${className}`} 
      onClick={handleFlip}
      style={{ zIndex: isFlipped ? 50 : 0 }}
    >
      <motion.div
        className="w-full h-full relative preserve-3d cursor-pointer"
        initial={false}
        animate={{ rotateY: isFlipped ? 180 : 0 }}
        transition={{ duration: 0.6, type: "spring", stiffness: 260, damping: 20 }}
        style={{ transformStyle: "preserve-3d" }}
      >
        {/* Front - Relative to dictate height */}
        <div 
            className="relative backface-hidden h-full"
            style={{ backfaceVisibility: "hidden" }}
        >
          {/* Prevent backface visibility issues by adding a solid background if transparent */}
          {front}
        </div>

        {/* Back - Absolute to overlap */}
        <div
          className="absolute inset-0 backface-hidden"
          style={{ 
            backfaceVisibility: "hidden", 
            transform: "rotateY(180deg)" 
          }}
        >
          {back}
        </div>
      </motion.div>
    </div>
  );
}
