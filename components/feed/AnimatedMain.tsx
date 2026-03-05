'use client';

import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { DEFAULT_WIDTH, getLastCenterWidth, setLastCenterWidth } from '@/lib/layout-width';

interface AnimatedMainProps {
  children: React.ReactNode;
  className?: string;
  targetWidth?: number;
}

export function AnimatedMain({ children, className, targetWidth = DEFAULT_WIDTH }: AnimatedMainProps) {
  useEffect(() => {
    setLastCenterWidth(targetWidth);
  }, [targetWidth]);

  return (
    <main
      className={className}
      style={{ maxWidth: targetWidth }}
    >
      {children}
    </main>
  );
}

