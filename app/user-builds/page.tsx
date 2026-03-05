'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Terminal, ArrowRight } from 'lucide-react';
import { useSession } from '@/components/Providers';
import { PageLayout } from '@/components/feed/PageLayout';
import { BuildGrid, BuildFilters } from '@/components/user-builds';
import type { BuildCategory, BuildSortOption } from '@/lib/user-builds-types';

export default function UserBuildsPage() {
  const { data: session } = useSession();
  const [categories, setCategories] = useState<BuildCategory[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>();
  const [selectedSort, setSelectedSort] = useState<BuildSortOption>('recent');
  const [searchQuery, setSearchQuery] = useState('');
  const [myBuilds, setMyBuilds] = useState(false);
  const [key, setKey] = useState(0);

  // Fetch categories
  useEffect(() => {
    fetch('/api/user-builds/categories')
      .then((res) => res.json())
      .then((data) => setCategories(data.categories || []))
      .catch(console.error);
  }, []);

  // Reset grid when filters change
  const handleCategoryChange = useCallback((category: string | undefined) => {
    setSelectedCategory(category);
    setKey((k) => k + 1);
  }, []);

  const handleSortChange = useCallback((sort: BuildSortOption) => {
    setSelectedSort(sort);
    setKey((k) => k + 1);
  }, []);

  const handleSearchChange = useCallback((query: string) => {
    setSearchQuery(query);
    setKey((k) => k + 1);
  }, []);

  const handleMyBuildsChange = useCallback((isMyBuilds: boolean) => {
    setMyBuilds(isMyBuilds);
    setKey((k) => k + 1);
  }, []);

  return (
    <PageLayout
      title="User Builds"
      wide
    >
      <div className="px-4 pt-4 pb-12">
        <Link
          href="/rmhcode"
          className="mb-5 flex items-center justify-between rounded-xl border border-violet-500/30 bg-gradient-to-r from-violet-500/10 to-site-surface px-5 py-4 transition-colors hover:border-violet-500/50 hover:from-violet-500/15"
        >
          <div className="flex items-center gap-3">
            <Terminal className="h-6 w-6 text-violet-400" />
            <span className="text-base text-site-text-secondary">
              Build and publish projects with AI using <span className="font-semibold text-site-text">rmhcode</span>
            </span>
          </div>
          <span className="flex items-center gap-1.5 text-sm font-medium text-violet-400">
            Get Started <ArrowRight className="h-4 w-4" />
          </span>
        </Link>

        <BuildFilters
          categories={categories}
          selectedCategory={selectedCategory}
          selectedSort={selectedSort}
          searchQuery={searchQuery}
          myBuilds={myBuilds}
          onCategoryChange={handleCategoryChange}
          onSortChange={handleSortChange}
          onSearchChange={handleSearchChange}
          onMyBuildsChange={handleMyBuildsChange}
        />

        <BuildGrid
          key={key}
          category={selectedCategory}
          search={searchQuery || undefined}
          sort={selectedSort}
          userId={myBuilds ? session?.user?.id : undefined}
        />
      </div>
    </PageLayout>
  );
}
