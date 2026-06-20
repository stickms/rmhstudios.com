'use client';

import { useState, useRef, useEffect } from 'react';
import { SlidersHorizontal, Search, X, BadgeCheck, ShieldCheck, Menu } from 'lucide-react';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { FeedTabs } from './FeedTabs';
import { ComposeBox } from './ComposeBox';
import { FeedList } from './FeedList';
import { useFeedStore } from '@/stores/feedStore';
import { useSidebarStore } from '@/stores/sidebarStore';
import { useFeedSSE } from '@/hooks/useFeedSSE';
import { authClient } from '@/lib/auth-client';
import { Link } from '@tanstack/react-router';

interface SearchUser {
  id: string;
  name: string | null;
  image: string | null;
  username: string | null;
  handle: string | null;
  isVerified: boolean;
  isAdmin: boolean;
}

export function FeedColumn() {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [mode, setMode] = useState<'feed' | 'friends'>('feed');
  const openSidebar = useSidebarStore((s) => s.setOpen);
  const { setFilter, search, setSearch } = useFeedStore();
  const { data: session } = authClient.useSession();
  const [searchInput, setSearchInput] = useState(search ?? '');
  const [userResults, setUserResults] = useState<SearchUser[]>([]);
  const searchRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const userDebounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Connect to real-time feed SSE stream
  useFeedSSE();

  const handleSearchChange = (value: string) => {
    setSearchInput(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearch(value.trim() || null);
    }, 300);

    clearTimeout(userDebounceRef.current);
    const trimmed = value.trim();
    if (!trimmed) {
      setUserResults([]);
      return;
    }
    userDebounceRef.current = setTimeout(() => {
      fetch(`/api/users/search?q=${encodeURIComponent(trimmed)}`)
        .then((res) => res.json())
        .then((data) => setUserResults(data.users ?? []))
        .catch(() => setUserResults([]));
    }, 300);
  };

  const clearSearch = () => {
    setSearchInput('');
    setSearch(null);
    setUserResults([]);
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
          {/* Mobile: sandwich menu left, RMH center, filters right */}
          <button
            onClick={() => openSidebar(true)}
            className="md:hidden p-2 -ml-2 rounded-lg text-site-text-muted hover:text-site-text hover:bg-site-surface transition-colors"
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Desktop: For You / Following tabs inline */}
          <div className="hidden md:flex items-center gap-1">
            <button
              onClick={() => handleModeChange('feed')}
              className={`relative px-3 py-1.5 text-sm font-bold transition-colors rounded-sm ${
                mode === 'feed'
                  ? 'text-site-text'
                  : 'text-site-text-muted hover:text-site-text'
              }`}
            >
              For You
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
              Following
              {mode === 'friends' && (
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-site-accent rounded-full" />
              )}
            </button>
          </div>

          {/* Mobile: centered RMH branding */}
          <span className="md:hidden text-site-accent font-(family-name:--site-font-display) font-bold text-lg">
            RMH
          </span>

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
        {/* Animated open/close — grid-rows fr transition collapses height
            smoothly without needing to measure the content. */}
        <div
          className={`grid transition-[grid-template-rows] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none ${
            filtersOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
          }`}
        >
          <div className="overflow-hidden">
            <FeedTabs mode={mode} onModeChange={handleModeChange} />
          </div>
        </div>

        {/* Search bar */}
        <div className="px-4 py-2 border-t border-site-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-site-text-dim" />
            <input
              ref={searchRef}
              type="text"
              value={searchInput}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search..."
              className="w-full bg-site-surface text-site-text placeholder:text-site-text-dim text-sm rounded-lg pl-9 pr-9 py-2 border border-site-border outline-none focus:border-site-accent transition-colors"
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

      {/* User search results */}
      {userResults.length > 0 && (
        <div className="border-b border-site-border">
          <div className="px-4 py-2">
            <p className="text-xs font-semibold text-site-text-dim uppercase tracking-wide mb-1">People</p>
          </div>
          {userResults.map((user) => (
            <Link
              key={user.id}
              to={`/u/${user.handle || user.id}` as string}
              className="flex items-center gap-3 px-4 py-2.5 hover:bg-site-surface transition-colors"
            >
              <UserAvatar src={user.image ?? undefined} alt={user.name || 'User'} size={32} fallbackName={user.name ?? undefined} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1">
                  <span className="font-semibold text-sm text-site-text truncate">{user.name || 'Unknown'}</span>
                  {user.isVerified && <BadgeCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />}
                  {user.isAdmin && <ShieldCheck className="w-3.5 h-3.5 text-site-accent shrink-0" />}
                </div>
                {user.handle && (
                  <span className="text-xs text-site-text-dim">@{user.handle}</span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Compose */}
      {!search && <ComposeBox />}

      {/* Feed */}
      {mode === 'friends' && !session ? (
        <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
          <p className="text-lg font-medium text-site-text mb-2">Sign in to see who you follow</p>
          <p className="text-sm text-site-text-muted mb-6">Follow people and their posts will appear here.</p>
          <Link
            to="/login"
            search={{ callbackURL: undefined }}
            className="px-5 py-2 rounded-lg bg-site-accent text-site-bg text-sm font-bold hover:bg-site-accent-hover transition-colors"
          >
            Sign in
          </Link>
        </div>
      ) : (
        <FeedList
          following={mode === 'friends'}
          onSwitchToForYou={() => handleModeChange('feed')}
        />
      )}
    </div>
  );
}
