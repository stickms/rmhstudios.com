'use client';

import { useState, useRef, useEffect } from 'react';
import { SlidersHorizontal, Search, X } from 'lucide-react';
import { FeedTabs } from './FeedTabs';
import { ComposeBox } from './ComposeBox';
import { FeedList } from './FeedList';
import { useFeedStore } from '@/stores/feedStore';
import { useFeedSSE } from '@/hooks/useFeedSSE';
import { authClient } from '@/lib/auth-client';
import Link from 'next/link';

export function FeedColumn() {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [mode, setMode] = useState<'feed' | 'friends'>('feed');
  const { setFilter, search, setSearch } = useFeedStore();
  const { data: session } = authClient.useSession();
  const [searchInput, setSearchInput] = useState(search ?? '');
  const searchRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Connect to real-time feed SSE stream
  useFeedSSE();

  const handleSearchChange = (value: string) => {
    setSearchInput(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearch(value.trim() || null);
    }, 300);
  };

  const clearSearch = () => {
    setSearchInput('');
    setSearch(null);
    searchRef.current?.focus();
  };

  // Sync local input when store search changes (e.g. hashtag click)
  useEffect(() => {
    setSearchInput(search ?? '');
  }, [search]);

  const handleModeChange = (newMode: 'feed' | 'friends') => {
    setMode(newMode);
    setFiltersOpen(false);
    setSearchInput('');
    if (newMode === 'friends') {
      setFilter('friends');
    } else {
      setFilter('all');
    }
  };

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-site-bg/85 backdrop-blur-md border-b border-site-border">
        <div className="flex items-center justify-between px-4 py-3">
          {/* Feed / Friends tabs */}
          <div className="flex items-center gap-1">
            <span className="md:hidden text-site-accent font-(family-name:--site-font-display) font-bold text-lg mr-2">RMH</span>
            <span className="md:hidden w-px h-5 bg-site-border mr-2" aria-hidden="true" />
            <button
              onClick={() => handleModeChange('feed')}
              className={`relative px-3 py-1.5 text-sm font-bold transition-colors rounded-sm ${
                mode === 'feed'
                  ? 'text-site-text'
                  : 'text-site-text-muted hover:text-site-text'
              }`}
            >
              Feed
              {mode === 'feed' && (
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-site-accent rounded-full" />
              )}
            </button>
            <button
              onClick={() => handleModeChange('friends')}
              className={`relative px-3 py-1.5 text-sm font-bold transition-colors rounded-sm ${
                mode === 'friends'
                  ? 'text-site-text'
                  : 'text-site-text-muted hover:text-site-text'
              }`}
            >
              Friends
              {mode === 'friends' && (
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-site-accent rounded-full" />
              )}
            </button>
          </div>

          <button
            onClick={() => setFiltersOpen(!filtersOpen)}
            className={`p-2 rounded-lg transition-colors ${
              filtersOpen
                ? 'text-site-accent bg-site-accent-dim'
                : 'text-site-text-muted hover:text-site-text hover:bg-site-surface'
            }`}
            title="Toggle feed filters"
          >
            <SlidersHorizontal className="w-5 h-5" />
          </button>
        </div>
        {filtersOpen && <FeedTabs />}

        {/* Search bar */}
        <div className="px-4 py-2 border-t border-site-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-site-text-dim" />
            <input
              ref={searchRef}
              type="text"
              value={searchInput}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search RMHarks..."
              className="w-full bg-site-surface text-site-text placeholder:text-site-text-dim text-sm rounded-full pl-9 pr-9 py-2 border border-site-border outline-none focus:border-site-accent transition-colors"
              onKeyDown={(e) => {
                if (e.key === 'Escape') clearSearch();
              }}
            />
            {searchInput && (
              <button
                onClick={clearSearch}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-site-text-dim hover:text-site-text transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Compose */}
      {!search && <ComposeBox />}

      {/* Feed */}
      {mode === 'friends' && !session ? (
        <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
          <p className="text-lg font-medium text-site-text mb-2">Sign in to see your friends&apos; feed</p>
          <p className="text-sm text-site-text-muted mb-6">Follow people and their posts will appear here.</p>
          <Link
            href="/login"
            className="px-5 py-2 rounded-full bg-site-accent text-white text-sm font-bold hover:bg-site-accent-hover transition-colors"
          >
            Sign in
          </Link>
        </div>
      ) : (
        <FeedList />
      )}
    </div>
  );
}
