"use client";

import { motion } from "framer-motion";
import { useState } from "react";

interface NeonButtonProps {
  children: React.ReactNode;
  href?: string;
  onClick?: () => void;
  className?: string;
}

export function NeonButton({
  children,
  href,
  onClick,
  className = "",
}: NeonButtonProps) {
  const [isHovered, setIsHovered] = useState(false);

  const buttonContent = (
    <motion.span
      className={`inline-block px-8 py-4 rounded-full bg-transparent border-2 border-white/50 text-white font-bold text-lg cursor-pointer relative overflow-hidden group ${isHovered ? "rainbow-glow" : ""} ${className}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.9 }}
      transition={{ type: "spring", stiffness: 500, damping: 12 }}
    >
      {/* Text with chromatic effect on hover */}
      <span className="relative z-10 group-hover:chromatic-text">
        {children}
      </span>

      {/* Background gradient that appears on hover - rainbow with white */}
      <motion.span
        className="absolute inset-0 bg-gradient-to-r from-white/20 via-white/10 to-white/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-full"
        initial={{ opacity: 0 }}
      />

      {/* Shine effect */}
      <motion.span
        className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent -skew-x-12"
        initial={{ x: "-100%" }}
        whileHover={{ x: "100%" }}
        transition={{ duration: 0.6, ease: "easeInOut" }}
      />
    </motion.span>
  );

  if (href) {
    return <a href={href}>{buttonContent}</a>;
  }

  return <button onClick={onClick}>{buttonContent}</button>;
}
