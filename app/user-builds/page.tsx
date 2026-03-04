'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Boxes, Plus, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSession } from '@/components/Providers';
import { BuildGrid, BuildFilters, BuildSidebar } from '@/components/user-builds';
import type { BuildCategory, BuildSortOption } from '@/lib/user-builds-types';

export default function UserBuildsPage() {
  const { data: session } = useSession();
  const [categories, setCategories] = useState<BuildCategory[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>();
  const [selectedSort, setSelectedSort] = useState<BuildSortOption>('recent');
  const [searchQuery, setSearchQuery] = useState('');
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

  return (
    <div className="min-h-screen bg-site-bg pt-20 pb-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Back Button */}
        <div className="mb-6">
          <Link href="/">
            <Button
              variant="ghost"
              size="sm"
              className="text-zinc-500 hover:text-white flex items-center gap-1.5 bg-black/50 backdrop-blur-sm border border-zinc-800 text-xs sm:text-sm"
            >
              <ArrowLeft className="w-3 h-3 sm:w-4 sm:h-4" />
              <span className="hidden sm:inline">RMH Studios</span>
            </Button>
          </Link>
        </div>

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-site-text flex items-center gap-3 mb-2">
              <Boxes className="w-8 h-8 text-violet-400" />
              User Builds
            </h1>
            <p className="text-site-text-muted">
              Discover projects built by the community with rmhcode
            </p>
          </div>

          {session && (
            <Link
              href="/user-builds/submit"
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white font-medium transition-colors"
            >
              <Plus className="w-4 h-4" />
              Submit Build
            </Link>
          )}
        </div>

        <div className="flex flex-col lg:flex-row gap-8">
          {/* Main Content */}
          <div className="flex-1 min-w-0">
            <BuildFilters
              categories={categories}
              selectedCategory={selectedCategory}
              selectedSort={selectedSort}
              searchQuery={searchQuery}
              onCategoryChange={handleCategoryChange}
              onSortChange={handleSortChange}
              onSearchChange={handleSearchChange}
            />

            <BuildGrid
              key={key}
              category={selectedCategory}
              search={searchQuery || undefined}
              sort={selectedSort}
            />
          </div>

          {/* Sidebar */}
          <div className="lg:w-80 shrink-0">
            <div className="lg:sticky lg:top-24">
              <BuildSidebar />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
