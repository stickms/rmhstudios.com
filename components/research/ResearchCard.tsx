'use client';

import { Link } from '@tanstack/react-router';
import {
  Brain,
  Cpu,
  Activity,
  Sigma,
  Hexagon,
  Atom,
  Sparkles,
  Zap,
  BookOpen,
  Dna,
  Binary,
  Orbit,
} from 'lucide-react';
import { motion } from 'framer-motion';
import type { ResearchArticle } from '@/lib/research';

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Brain,
  Cpu,
  Activity,
  Sigma,
  Hexagon,
  Atom,
  Sparkles,
  Zap,
  BookOpen,
  Dna,
  Binary,
  Orbit,
};

export function ResearchCard({
  article,
  index,
}: {
  article: ResearchArticle;
  index: number;
}) {
  const Icon = iconMap[article.iconName] ?? Activity;

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: index * 0.15 }}
    >
      <Link to={`/research/${article.slug}` as string} className="group block h-full">
        <div
          className="h-full rounded-xl border overflow-hidden transition-all duration-300 bg-(--site-surface) border-(--site-border) hover:border-(--site-accent)/50 hover:shadow-lg"
        >
          {/* Gradient hero */}
          <div
            className={`relative h-40 bg-linear-to-br ${article.heroColor} flex items-center justify-center overflow-hidden`}
          >
            <Icon className="w-16 h-16 text-white/80 group-hover:scale-110 transition-transform duration-300" />
            <div className="absolute inset-0 bg-black/10" />
          </div>

          {/* Content */}
          <div className="p-5 space-y-3">
            {/* Category badge */}
            <span className="inline-block text-xs font-semibold px-2.5 py-1 rounded-full bg-(--site-accent)/15 text-(--site-accent)">
              {article.category}
            </span>

            {/* Title */}
            <h3 className="text-lg font-bold leading-snug text-(--site-text) group-hover:text-(--site-accent) transition-colors line-clamp-2">
              {article.title}
            </h3>

            {/* Authors */}
            <p className="text-xs text-(--site-text-dim)">
              {article.authors.join(', ')}
            </p>

            {/* Abstract */}
            <p className="text-sm text-(--site-text-muted) line-clamp-3 leading-relaxed">
              {article.abstract}
            </p>

            {/* Footer */}
            <div className="flex items-center justify-between pt-2 border-t border-(--site-border)">
              <span className="text-xs text-(--site-text-dim)">
                {article.journal} &middot; Vol.&nbsp;{article.volume}
              </span>
              <span className="text-xs font-medium text-(--site-accent) opacity-0 group-hover:opacity-100 transition-opacity">
                Read Paper &rarr;
              </span>
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
