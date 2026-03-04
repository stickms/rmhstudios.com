'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from '@/components/Providers';
import { PageLayout } from '@/components/feed/PageLayout';
import { BuildGrid, BuildFilters, BuildSidebar } from '@/components/user-builds';
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
      rightSidebar={<BuildSidebar className="p-4" />}
    >
      <div className="px-4 pt-4 pb-12">
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
