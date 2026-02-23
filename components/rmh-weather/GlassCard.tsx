'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}

export const GlassCard = ({ children, className, delay = 0 }: GlassCardProps) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay }}
      className={cn(
        "relative overflow-hidden rounded-3xl border border-weather bg-weather-glass p-6 backdrop-blur-xl",
        "shadow-[0_8px_32px_0_rgba(0,0,0,0.36)]",
        className
      )}
    >
      {children}
    </motion.div>
  );
};
