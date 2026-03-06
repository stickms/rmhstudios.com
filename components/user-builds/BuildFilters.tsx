'use client';

import { useState, useEffect } from 'react';
import { Link } from '@tanstack/react-router';
import { Search, ChevronDown, X, User, Plus } from 'lucide-react';
import { useSession } from '@/components/Providers';
import type { BuildCategory, BuildSortOption } from '@/lib/user-builds-types';

interface BuildFiltersProps {
  categories: BuildCategory[];
  selectedCategory?: string;
  selectedSort: BuildSortOption;
  searchQuery?: string;
  myBuilds?: boolean;
  onCategoryChange: (category: string | undefined) => void;
  onSortChange: (sort: BuildSortOption) => void;
  onSearchChange: (query: string) => void;
  onMyBuildsChange: (myBuilds: boolean) => void;
}

const SORT_OPTIONS: { value: BuildSortOption; label: string }[] = [
  { value: 'recent', label: 'Most Recent' },
  { value: 'popular', label: 'Most Liked' },
  { value: 'views', label: 'Most Viewed' },
];

export function BuildFilters({
  categories,
  selectedCategory,
  selectedSort,
  searchQuery = '',
  myBuilds = false,
  onCategoryChange,
  onSortChange,
  onSearchChange,
  onMyBuildsChange,
}: BuildFiltersProps) {
  const { data: session } = useSession();
  const [search, setSearch] = useState(searchQuery);
  const [showCategories, setShowCategories] = useState(false);
  const [showSort, setShowSort] = useState(false);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (search !== searchQuery) {
        onSearchChange(search);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [search, searchQuery, onSearchChange]);

  const selectedCategoryData = categories.find((c) => c.id === selectedCategory);
  const selectedSortData = SORT_OPTIONS.find((s) => s.value === selectedSort);

  return (
    <div className="flex flex-col gap-3 mb-6">
      {/* Search + Filter toggle */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-site-text-dim" />
          <input
            type="text"
            placeholder="Search builds..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-9 py-2 rounded-lg bg-site-surface border border-site-border text-site-text text-sm outline-none focus:border-violet-500/50 transition-colors"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-site-text-dim hover:text-site-text"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <Link
          to="/user-builds/submit"
          className="flex items-center gap-1.5 shrink-0 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Submit</span>
        </Link>
      </div>

      {/* Filter controls */}
      <div className="flex flex-wrap gap-3 items-center">
        {/* Category Filter */}
          <div className="relative">
            <button
              onClick={() => setShowCategories(!showCategories)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-site-surface border border-site-border text-sm text-site-text hover:border-violet-500/50 transition-colors min-w-[140px]"
            >
              <span className="truncate">{selectedCategoryData?.name || 'All Categories'}</span>
              <ChevronDown className={`w-4 h-4 ml-auto transition-transform ${showCategories ? 'rotate-180' : ''}`} />
            </button>

            {showCategories && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowCategories(false)} />
                <div className="absolute top-full mt-2 right-0 w-48 bg-site-surface border border-site-border rounded-xl shadow-lg py-1 z-50 max-h-64 overflow-y-auto">
                  <button
                    onClick={() => {
                      onCategoryChange(undefined);
                      setShowCategories(false);
                    }}
                    className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                      !selectedCategory
                        ? 'text-violet-400 bg-violet-500/10'
                        : 'text-site-text-muted hover:text-site-text hover:bg-site-surface-hover'
                    }`}
                  >
                    All Categories
                  </button>
                  {categories.map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => {
                        onCategoryChange(cat.id);
                        setShowCategories(false);
                      }}
                      className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                        selectedCategory === cat.id
                          ? 'text-violet-400 bg-violet-500/10'
                          : 'text-site-text-muted hover:text-site-text hover:bg-site-surface-hover'
                      }`}
                    >
                      {cat.name}
                      {cat.buildCount !== undefined && (
                        <span className="ml-2 text-xs text-site-text-dim">({cat.buildCount})</span>
                      )}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Sort */}
          <div className="relative">
            <button
              onClick={() => setShowSort(!showSort)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-site-surface border border-site-border text-sm text-site-text hover:border-violet-500/50 transition-colors min-w-[140px]"
            >
              <span>{selectedSortData?.label || 'Sort by'}</span>
              <ChevronDown className={`w-4 h-4 ml-auto transition-transform ${showSort ? 'rotate-180' : ''}`} />
            </button>

            {showSort && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowSort(false)} />
                <div className="absolute top-full mt-2 right-0 w-40 bg-site-surface border border-site-border rounded-xl shadow-lg py-1 z-50">
                  {SORT_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => {
                        onSortChange(option.value);
                        setShowSort(false);
                      }}
                      className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                        selectedSort === option.value
                          ? 'text-violet-400 bg-violet-500/10'
                          : 'text-site-text-muted hover:text-site-text hover:bg-site-surface-hover'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* My Builds Toggle */}
          {session?.user && (
            <button
              onClick={() => onMyBuildsChange(!myBuilds)}
              className={`flex items-center gap-2 ml-auto px-4 py-2 rounded-lg border text-sm transition-colors ${
                myBuilds
                  ? 'bg-violet-500/10 border-violet-500/40 text-violet-400'
                  : 'bg-site-surface border-site-border text-site-text hover:border-violet-500/50'
              }`}
            >
              <User className="w-4 h-4" />
              <span>My Builds</span>
            </button>
          )}
        </div>
    </div>
  );
}
