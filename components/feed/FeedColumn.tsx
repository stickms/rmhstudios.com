'use client';

import { useState, useRef, useEffect } from 'react';
import { SlidersHorizontal, Search, X, BadgeCheck, ShieldCheck, Menu } from 'lucide-react';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { FeedTabs } from './FeedTabs';
import { ComposeBox } from './ComposeBox';
import { FeedList } from './FeedList';
import { FeedAnnouncements } from './FeedAnnouncements';
import { OnboardingChecklist } from './OnboardingChecklist';
import { useMobileSidebar } from './MobileSidebarShell';
import { useFeedStore } from '@/stores/feedStore';
import { useFeedSSE } from '@/hooks/useFeedSSE';
import { authClient } from '@/lib/auth-client';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation('feed');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [mode, setMode] = useState<'feed' | 'friends'>('feed');
  const { open: openSidebar } = useMobileSidebar();
  const { setFilter, search, setSearch } = useFeedStore();
  const { data: session } = authClient.useSession();
  const navigate = useNavigate();
  // `?q=` is the shareable source of truth; the store search mirrors it.
  const urlQuery = (useSearch({ strict: false }) as { q?: string }).q ?? null;
  const [searchInput, setSearchInput] = useState(urlQuery ?? '');
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
      const q = value.trim();
      // Push the query into the URL; the effect below drives the actual search.
      navigate({ to: '/', search: q ? { q } : {} });
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
    setUserResults([]);
    navigate({ to: '/', search: {} });
    searchRef.current?.focus();
  };

  // The URL `?q=` is authoritative: drive the feed store from it so a shared
  // link (or a hashtag click that navigates here) performs the search, and
  // back/forward navigation stays in sync.
  useEffect(() => {
    if (urlQuery !== search) setSearch(urlQuery);
  }, [urlQuery, search, setSearch]);

  // Keep the local input box mirroring the active query.
  useEffect(() => {
    setSearchInput(urlQuery ?? '');
  }, [urlQuery]);

  const handleModeChange = (newMode: 'feed' | 'friends') => {
    setMode(newMode);
    setFiltersOpen(false);
    setSearchInput('');
    // Switching tabs clears any active search — drop it from the URL too so the
    // q-driven effect doesn't immediately re-apply it.
    if (urlQuery) navigate({ to: '/', search: {} });
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
            onClick={openSidebar}
            className="md:hidden p-2 -ml-2 rounded-site-sm text-site-text-muted hover:text-site-text hover:bg-site-surface transition-colors"
            aria-label={t("open-menu", { defaultValue: "Open menu" })}
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
              {t("for-you", { defaultValue: "For You" })}
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
              {t("following", { defaultValue: "Following" })}
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
            className={`p-2 rounded-site-sm transition-colors ${
              filtersOpen
                ? 'text-site-accent bg-site-accent-dim'
                : 'text-site-text-muted hover:text-site-text hover:bg-site-surface'
            }`}
            title={t("toggle-feed-filters", { defaultValue: "Toggle feed filters" })}
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
              placeholder={t("search-placeholder", { defaultValue: "Search..." })}
              className="w-full bg-site-surface text-site-text placeholder:text-site-text-dim text-sm rounded-site-sm pl-9 pr-9 py-2 border border-site-border outline-none focus:border-site-accent transition-colors"
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
            <p className="text-xs font-semibold text-site-text-dim uppercase tracking-wide mb-1">{t("people", { defaultValue: "People" })}</p>
          </div>
          {userResults.map((user) => (
            <Link
              key={user.id}
              to={`/u/${user.handle || user.id}` as string}
              className="flex items-center gap-3 px-4 py-2.5 hover:bg-site-surface transition-colors"
            >
              <UserAvatar src={user.image ?? undefined} alt={user.name || t("user-alt", { defaultValue: "User" })} size={32} fallbackName={user.name ?? undefined} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1">
                  <span className="font-semibold text-sm text-site-text truncate">{user.name || t("unknown-user", { defaultValue: "Unknown" })}</span>
                  {user.isVerified && <BadgeCheck className="w-3.5 h-3.5 text-site-success shrink-0" />}
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

      {/* Admin announcements, pinned above the composer */}
      {!search && <FeedAnnouncements />}

      {/* First-run onboarding checklist (new accounts only) */}
      {!search && <OnboardingChecklist />}

      {/* Compose */}
      {!search && <ComposeBox />}

      {/* Feed */}
      {mode === 'friends' && !session ? (
        <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
          <p className="text-lg font-medium text-site-text mb-2">{t("sign-in-to-see-following", { defaultValue: "Sign in to see who you follow" })}</p>
          <p className="text-sm text-site-text-muted mb-6">{t("follow-people-hint", { defaultValue: "Follow people and their posts will appear here." })}</p>
          <Link
            to="/login"
            search={{ callbackURL: undefined }}
            className="px-5 py-2 rounded-site-sm bg-site-accent text-site-bg text-sm font-bold hover:bg-site-accent-hover transition-colors"
          >
            {t("sign-in", { defaultValue: "Sign in" })}
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
