'use client';

import { useState, useRef, useEffect, Suspense, lazy } from 'react';
import { Search, X, BadgeCheck, ShieldCheck } from 'lucide-react';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { FeedTabs } from './FeedTabs';
import { ComposeBoxLazy } from './ComposeBoxLazy';
import { FeedList } from './FeedList';
import { PullToRefresh } from './PullToRefresh';
import { FeedAnnouncements } from './FeedAnnouncements';
import { OnboardingChecklist } from './OnboardingChecklist';
import { JumpBackIn } from './JumpBackIn';
import { MobileMenuButton } from './MobileMenuButton';
import { useFeedStore } from '@/stores/feedStore';
import { useFeedSSE } from '@/hooks/useFeedSSE';
import { useSession } from '@/components/Providers';
import { Link, useNavigate, useSearch, Await } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { PostListSkeleton } from '@/components/ui/skeletons/PostCardSkeleton';
import type { FeedItem as FeedItemType } from '@/lib/feed-types';
import { AsyncReveal, Reveal } from '@/components/motion';
import { useStableListMotion } from '@/hooks/useStableListMotion';

// The authored-thread composer is signed-in-only and rarely the first thing a
// reader reaches for, so it loads as its own chunk instead of riding in the feed
// route's initial bundle.
const ThreadComposer = lazy(() =>
  import('./ThreadComposer').then((m) => ({ default: m.ThreadComposer })),
);

interface SearchUser {
  id: string;
  name: string | null;
  image: string | null;
  username: string | null;
  handle: string | null;
  isVerified: boolean;
  isAdmin: boolean;
}

/** The server-streamed first page (For You / all), resolved via <Await>. */
export interface InitialFeed {
  items: FeedItemType[];
  nextCursor: string | null;
  hasMore: boolean;
  /** Viewer's muted words, so the client primes its live-SSE filter with no
   *  separate /api/preferences/muted-words request. */
  mutedWords?: string[];
}

export function FeedColumn({ initialFeed }: { initialFeed?: Promise<InitialFeed> | null }) {
  const { t } = useTranslation('feed');
  const [mode, setMode] = useState<'feed' | 'friends'>('feed');
  // Select individually (stable action refs; `search` is the only reactive value)
  // so an unrelated store mutation — every SSE like/comment/repost count tick —
  // doesn't re-render the header/search/composer subtree.
  const setFilter = useFeedStore((s) => s.setFilter);
  const search = useFeedStore((s) => s.search);
  const setSearch = useFeedStore((s) => s.setSearch);
  // Stable store action — drives swipe-down-to-refresh on the mobile feed.
  const refreshFeed = useFeedStore((s) => s.refresh);
  // Shared root-level session (one subscription for the whole app).
  const { data: session } = useSession();
  const navigate = useNavigate();
  // `?q=` is the shareable source of truth; the store search mirrors it.
  const urlQuery = (useSearch({ strict: false }) as { q?: string }).q ?? null;
  const [searchInput, setSearchInput] = useState(urlQuery ?? '');
  const [userResults, setUserResults] = useState<SearchUser[]>([]);
  const enteringUsers = useStableListMotion(
    userResults.map((user) => user.id),
    { skipFirstAddition: true },
  );
  const searchRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const userDebounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const userRequestRef = useRef<AbortController | null>(null);

  // Connect to real-time feed SSE stream
  useFeedSSE();

  // The viewer's muted words arrive with the timeline payload (see getTimeline /
  // feedStore) and prime the live-SSE filter — no separate fetch on mount.

  const handleSearchChange = (value: string) => {
    setSearchInput(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const q = value.trim();
      // Push the query into the URL; the effect below drives the actual search.
      navigate({ to: '/', search: q ? { q } : {} });
    }, 300);

    clearTimeout(userDebounceRef.current);
    userRequestRef.current?.abort();
    const trimmed = value.trim();
    if (!trimmed) {
      setUserResults([]);
      return;
    }
    userDebounceRef.current = setTimeout(() => {
      const controller = new AbortController();
      userRequestRef.current = controller;
      fetch(`/api/users/search?q=${encodeURIComponent(trimmed)}`, { signal: controller.signal })
        .then((res) => res.json())
        .then((data) => {
          if (!controller.signal.aborted) setUserResults(data.users ?? []);
        })
        .catch(() => {
          if (!controller.signal.aborted) setUserResults([]);
        });
    }, 300);
  };

  const clearSearch = () => {
    setSearchInput('');
    setUserResults([]);
    userRequestRef.current?.abort();
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

  useEffect(
    () => () => {
      clearTimeout(debounceRef.current);
      clearTimeout(userDebounceRef.current);
      userRequestRef.current?.abort();
    },
    [],
  );

  const handleModeChange = (newMode: 'feed' | 'friends') => {
    setMode(newMode);
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
    <PullToRefresh onRefresh={refreshFeed}>
      <div className="feed-column flex flex-col">
        <section
          className="spatial-feed-intro mx-3 mt-3 overflow-hidden"
          aria-labelledby="feed-title"
        >
          <div aria-hidden className="spatial-feed-intro__field">
            <span className="spatial-feed-intro__orb" />
            <span className="spatial-feed-intro__grid" />
          </div>
          <div className="relative z-1 max-w-xl">
            <p className="mb-5 text-[10px] font-semibold uppercase tracking-[0.24em] text-site-text-dim">
              {t('feed-kicker', { defaultValue: '01 / RMH Studios' })}
            </p>
            <h1
              id="feed-title"
              className="font-(family-name:--site-font-display) text-[clamp(2.35rem,8vw,4.5rem)] font-medium leading-[0.94] tracking-[-0.055em] text-site-text"
            >
              {t('feed-hero-title', { defaultValue: 'Make. Play. Share.' })}
            </h1>
            <p className="mt-5 max-w-md text-sm leading-relaxed text-site-text-muted sm:text-base">
              {t('feed-hero-body', {
                defaultValue:
                  'Original games, useful tools, and the people building what comes next.',
              })}
            </p>
          </div>
        </section>

        {/* Search stays reachable while the editorial introduction scrolls away. */}
        <header data-slot="feed-header" className="site-sticky-chrome spatial-feed-search">
          {/* Mobile chrome row: drawer button + centered RMH branding. Desktop has
              the sidebar, so this row is mobile-only; the spacer balances the 44px
              menu button so the wordmark stays centered. */}
          <div className="flex items-center justify-between px-4 pt-3 md:hidden">
            <MobileMenuButton />
            <span className="font-(family-name:--site-font-display) text-lg font-bold text-site-text">
              RMH
            </span>
            <span className="w-11" aria-hidden />
          </div>

          {/* Search bar (the header's sticky behavior stays here). */}
          <div className="px-3 pb-3 pt-2 md:px-4 md:py-3">
            <label htmlFor="feed-search" className="sr-only">
              {t('search-placeholder', { defaultValue: 'Search posts and people' })}
            </label>
            <div className="relative rounded-[var(--site-control-radius)] border border-site-border bg-site-surface">
              <Search
                className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-site-text-dim"
                aria-hidden
              />
              <input
                id="feed-search"
                ref={searchRef}
                type="text"
                value={searchInput}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder={t('search-placeholder', { defaultValue: 'Search...' })}
                enterKeyHint="search"
                className="w-full rounded-[var(--site-control-radius)] bg-transparent py-3 pl-10 pr-11 text-base text-site-text outline-none placeholder:text-site-text-dim focus:ring-2 focus:ring-site-accent/15 sm:text-sm"
                onKeyDown={(e) => {
                  if (e.key === 'Escape') clearSearch();
                }}
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={clearSearch}
                  aria-label={t('clear-search', { defaultValue: 'Clear search' })}
                  className="absolute right-1 top-1/2 inline-flex min-h-9 min-w-9 -translate-y-1/2 items-center justify-center rounded-full text-site-text-dim transition-colors hover:bg-site-surface-hover hover:text-site-text"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              )}
            </div>
          </div>
        </header>

        {/* Tab strips — standalone glass sheets BELOW the header capsule (§5.45),
            separated by the standard gutter. State wiring (mode + useFeedStore
            filter) is unchanged. */}
        <div className="my-4 px-2 md:px-3">
          <FeedTabs mode={mode} onModeChange={handleModeChange} />
        </div>

        {/* User search results */}
        <AsyncReveal
          show={userResults.length > 0}
          as="section"
          className="glass-fill mx-3 overflow-hidden"
          aria-label={t('people', { defaultValue: 'People' })}
        >
          <div className="px-4 py-2">
            <p className="text-xs font-semibold text-site-text-dim uppercase tracking-wide mb-1">
              {t('people', { defaultValue: 'People' })}
            </p>
          </div>
          {userResults.map((user) => (
            <Link
              key={user.id}
              to={`/u/${user.handle || user.id}` as string}
              className={`flex min-h-12 items-center gap-3 border-t border-site-border px-4 py-2.5 transition-colors first:border-t-0 hover:bg-site-surface-hover ${enteringUsers.has(user.id) ? 'content-item-enter' : ''}`}
            >
              <UserAvatar
                src={user.image ?? undefined}
                alt={user.name || t('user-alt', { defaultValue: 'User' })}
                size={32}
                fallbackName={user.name ?? undefined}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1">
                  <span className="font-semibold text-sm text-site-text truncate">
                    {user.name || t('unknown-user', { defaultValue: 'Unknown' })}
                  </span>
                  {user.isVerified && (
                    <BadgeCheck className="w-3.5 h-3.5 text-site-success shrink-0" aria-hidden />
                  )}
                  {user.isAdmin && (
                    <ShieldCheck className="w-3.5 h-3.5 text-site-accent shrink-0" aria-hidden />
                  )}
                </div>
                {user.handle && <span className="text-xs text-site-text-dim">@{user.handle}</span>}
              </div>
            </Link>
          ))}
        </AsyncReveal>

        {/* Admin announcements, pinned above the composer */}
        {!search && <FeedAnnouncements />}

        {/* First-run onboarding checklist (new accounts only) */}
        {!search && <OnboardingChecklist />}

        {/* Resume rail — recently played games/apps (device-local) */}
        {!search && <JumpBackIn />}

        {/* Compose — deferred out of the feed route's initial chunk (see ComposeBoxLazy) */}
        {!search && <ComposeBoxLazy />}

        {/* Authored-thread composer (chain several of your own posts) */}
        {!search && session && (
          <Suspense fallback={null}>
            <ThreadComposer />
          </Suspense>
        )}

        {/* Feed */}
        {mode === 'friends' && !session ? (
          <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
            <p className="text-lg font-medium text-site-text mb-2">
              {t('sign-in-to-see-following', { defaultValue: 'Sign in to see who you follow' })}
            </p>
            <p className="text-sm text-site-text-muted mb-6">
              {t('follow-people-hint', {
                defaultValue: 'Follow people and their posts will appear here.',
              })}
            </p>
            <Link
              to="/login"
              search={{ callbackURL: undefined }}
              className="px-5 py-2 rounded-site-sm bg-site-accent text-site-accent-fg text-sm font-bold hover:bg-site-accent-hover transition-colors"
            >
              {t('sign-in', { defaultValue: 'Sign in' })}
            </Link>
          </div>
        ) : mode === 'friends' ? (
          <FeedList following onSwitchToForYou={() => handleModeChange('feed')} />
        ) : initialFeed ? (
          // For You initial load: the shell has already streamed to the client;
          // the feed streams into this Suspense slot when the server resolves it.
          <Suspense fallback={<PostListSkeleton count={6} />}>
            <Await promise={initialFeed}>
              {(feed) => (
                <Reveal y={0}>
                  <FeedList
                    onSwitchToForYou={() => handleModeChange('feed')}
                    initialItems={feed.items}
                    initialCursor={feed.nextCursor}
                    initialHasMore={feed.hasMore}
                    initialMutedWords={feed.mutedWords}
                  />
                </Reveal>
              )}
            </Await>
          </Suspense>
        ) : (
          <FeedList onSwitchToForYou={() => handleModeChange('feed')} />
        )}
      </div>
    </PullToRefresh>
  );
}
