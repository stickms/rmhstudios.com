"use client";

import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { ReactNode } from "react";

interface SurfaceCardProps {
  children: ReactNode;
  className?: string;
  delay?: number;
}

export function SurfaceCard({ children, className, delay = 0 }: SurfaceCardProps) {
  return (
    <motion.div
      data-slot="card"
      className={cn(
        "border border-site-border bg-site-surface p-6 transition-all hover:border-site-border-bright",
        className
      )}
      style={{
        borderRadius: "var(--site-radius)",
        borderWidth: "var(--site-border-width)",
        transitionDuration: "var(--site-transition-speed)",
      }}
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4, delay }}
    >
      {children}
    </motion.div>
  );
}
