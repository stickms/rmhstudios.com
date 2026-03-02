"use client";

import { motion } from "framer-motion";

interface SectionHeadingProps {
  title: string;
  subtitle?: string;
  className?: string;
}

export function SectionHeading({ title, subtitle, className }: SectionHeadingProps) {
  return (
    <motion.div
      data-slot="section-heading"
      className={`text-center ${className ?? ""}`}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5 }}
    >
      <h2
        className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black text-site-text"
        style={{
          fontFamily: "var(--site-font-display)",
          textShadow: "var(--site-text-shadow)",
          letterSpacing: "var(--site-letter-spacing)",
        }}
      >
        {title}
      </h2>
      {subtitle && (
        <p className="mt-4 text-site-text-muted text-lg md:text-xl max-w-2xl mx-auto">
          {subtitle}
        </p>
      )}
    </motion.div>
  );
}
