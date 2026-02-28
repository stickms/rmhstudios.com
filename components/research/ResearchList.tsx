'use client';

import type { ResearchArticle } from '@/lib/research';
import { ResearchCard } from './ResearchCard';

export function ResearchList({ articles }: { articles: ResearchArticle[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {articles.map((article, i) => (
        <ResearchCard key={article.slug} article={article} index={i} />
      ))}
    </div>
  );
}
