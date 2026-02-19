"use client";

import { motion } from "framer-motion";
import { useState } from "react";

interface NeonButtonProps {
  children: React.ReactNode;
  href?: string;
  onClick?: () => void;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'primary' | 'secondary';
}

export function NeonButton({
  children,
  href,
  onClick,
  className = "",
  size = 'md',
  variant = 'primary',
}: NeonButtonProps) {
  const [isHovered, setIsHovered] = useState(false);

  const sizeClasses = {
    sm: "px-4 py-2 text-sm",
    md: "px-8 py-4 text-lg",
    lg: "px-10 py-5 text-xl",
  };

  const variantClasses = {
    primary: "border-white/50 text-white",
    secondary: "border-cyan-500/50 text-cyan-400 hover:text-white hover:border-cyan-400",
  };

  const buttonContent = (
    <motion.span
      className={`inline-block rounded-full bg-transparent border-2 font-bold cursor-pointer relative overflow-hidden group ${isHovered ? "rainbow-glow" : ""} ${sizeClasses[size]} ${variantClasses[variant]} ${className}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
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
    return <a href={href} onClick={onClick}>{buttonContent}</a>;
  }

  // If onClick is provided, use a div or button that triggers it. 
  // Since we have motion.span as the visual, we can wrap it or just use onClick on the span if it acts as a button.
  // But strictly, semantic button is better.
  return <button onClick={onClick} className="focus:outline-none">{buttonContent}</button>;
}
