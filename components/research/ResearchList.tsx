'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ResearchArticle } from '@/lib/research';
import { ResearchCard } from './ResearchCard';

const ARTICLES_PER_PAGE = 6;

export function ResearchList({ articles }: { articles: ResearchArticle[] }) {
  const [page, setPage] = useState(1);

  const totalPages = Math.ceil(articles.length / ARTICLES_PER_PAGE);
  const start = (page - 1) * ARTICLES_PER_PAGE;
  const pageArticles = articles.slice(start, start + ARTICLES_PER_PAGE);

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {pageArticles.map((article, i) => (
          <ResearchCard key={article.slug} article={article} index={i} />
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-8 pb-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="p-2 rounded-lg border border-(--site-border) text-(--site-text-muted) hover:text-(--site-text) hover:border-(--site-accent)/50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="Previous page"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              onClick={() => setPage(n)}
              className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${
                n === page
                  ? 'bg-(--site-accent) text-white'
                  : 'text-(--site-text-muted) hover:text-(--site-text) hover:bg-(--site-surface)'
              }`}
            >
              {n}
            </button>
          ))}

          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="p-2 rounded-lg border border-(--site-border) text-(--site-text-muted) hover:text-(--site-text) hover:border-(--site-accent)/50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="Next page"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
