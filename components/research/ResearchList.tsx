'use client';

import type { ResearchArticle } from '@/lib/research';
import { ResearchCard } from './ResearchCard';

export function ResearchList({ articles }: { articles: ResearchArticle[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
      {articles.map((article, i) => (
        <ResearchCard key={article.slug} article={article} index={i} />
      ))}
    </div>
  );
}
