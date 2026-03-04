'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { DEFAULT_WIDTH, getLastCenterWidth, setLastCenterWidth } from '@/lib/layout-width';

interface AnimatedMainProps {
  children: React.ReactNode;
  className?: string;
  targetWidth?: number;
}

export function AnimatedMain({ children, className, targetWidth = DEFAULT_WIDTH }: AnimatedMainProps) {
  const pathname = usePathname();
  const initialWidth = getLastCenterWidth();

  useEffect(() => {
    setLastCenterWidth(targetWidth);
  }, [targetWidth]);

  return (
    <motion.main
      key={pathname}
      className={className}
      initial={{ maxWidth: initialWidth }}
      animate={{ maxWidth: targetWidth }}
      transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
    >
      {children}
    </motion.main>
  );
}
