'use client';

/**
 * The desktop live rail — the right flank of the shell frame.
 *
 * Wide screens get the ambient, glanceable half of the site: who is online, the
 * daily loop, friends you can join, what is trending, who to follow. It is the
 * counterweight to the nav rail: navigation on the left, situation on the right,
 * content in the middle.
 *
 * Cost discipline, because this mounts on *every* page:
 *  - every fetch is gated on `useIsDesktop()` **and** `useIdleReady()`, so phones
 *    (where the rail is `display: none`) never pay for it and it never competes
 *    with hydration;
 *  - the `/api/explore` payload is memoised at module scope, so moving between
 *    pages re-renders the rail without re-fetching it;
 *  - the only repeating timer is the online-count poll, once a minute.
 *
 * It owns its own scroll (`rad-rail__scroll`) so a tall rail can never stretch
 * the frame or spill over the content column.
 */

import { useEffect, useState, type ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { Hash, Sparkles, UserPlus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useIdleReady } from '@/hooks/useIdleReady';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { TodayWidget } from '@/components/feed/TodayWidget';
import { FriendsOnlineWidget } from '@/components/feed/FriendsOnlineWidget';

interface ExplorePeek {
  trendingTags: { tag: string; count: number }[];
  suggestedUsers: Array<{
    id: string;
    name: string | null;
    handle: string | null;
    image: string | null;
  }>;
}

/** Shared across mounts so a client navigation re-uses the last payload. */
let explorePeek: ExplorePeek | null = null;
let explorePeekAt = 0;
const EXPLORE_TTL = 5 * 60_000;

function useExplorePeek(active: boolean) {
  const [data, setData] = useState<ExplorePeek | null>(explorePeek);

  useEffect(() => {
    if (!active) return;
    if (explorePeek && Date.now() - explorePeekAt < EXPLORE_TTL) {
      setData(explorePeek);
      return;
    }
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch('/api/explore', {
          credentials: 'include',
          signal: controller.signal,
        });
        if (!res.ok) return;
        const body = (await res.json()) as ExplorePeek;
        explorePeek = {
          trendingTags: body.trendingTags ?? [],
          suggestedUsers: body.suggestedUsers ?? [],
        };
        explorePeekAt = Date.now();
        setData(explorePeek);
      } catch {
        // Ambient content — a failure just leaves the section out.
      }
    })();
    return () => controller.abort();
  }, [active]);

  return data;
}

/** "N people online" — the rail's one repeating timer. */
function LivePulse({ active }: { active: boolean }) {
  const { t } = useTranslation('feed');
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch('/api/presence/online-count');
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setCount(data.count ?? null);
      } catch {
        // decorative — ignore
      }
    };
    void load();
    const timer = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [active]);

  if (!count) return null;

  return (
    <section className="rad-live__pulse">
      <span className="rad-live__dot" aria-hidden />
      <span>
        {t('online-now-count', {
          count,
          // Both forms are spelled out: `i18next-parser` writes `defaultValue`
          // into BOTH `_one` and `_other` when it only sees one, which is how
          // this read "1 people online now" — the plural keys existed and were
          // identical. Locales with more than two forms fill the rest from `en`.
          defaultValue_one: '{{count}} person online now',
          defaultValue_other: '{{count}} people online now',
        })}
      </span>
    </section>
  );
}

/** The width at which radial.css actually reveals the rail (`min-width: 1440px`). */
const RAIL_QUERY = '(min-width: 1440px)';

export function RadialLiveRail({ children }: { children?: ReactNode }) {
  const { t } = useTranslation('feed');
  // Deliberately the rail's OWN breakpoint, not the shared `xl` one: gating the
  // fetches on a wider query than the CSS reveal would starve the rail, and on a
  // narrower one would pay for a column the viewer cannot see.
  const visible = useMediaQuery(RAIL_QUERY);
  const idle = useIdleReady();
  const active = visible && idle;
  const explore = useExplorePeek(active);

  const tags = explore?.trendingTags?.slice(0, 6) ?? [];
  const people = explore?.suggestedUsers?.slice(0, 3) ?? [];

  return (
    <aside
      className="rad-rail rad-rail--live"
      aria-label={t('discover', { defaultValue: 'Discover' })}
    >
      <div className="rad-rail__scroll">
        {/* Page-contributed content (PageLayout's `rightSidebar`) lands here. It
            stays mounted at every width so the portal target exists as soon as
            the rail does; the ambient widgets below only mount once the rail is
            actually on screen. */}
        {children}

        <LivePulse active={active} />
        {visible && (
          <>
            <TodayWidget />
            <FriendsOnlineWidget />
          </>
        )}

        {tags.length > 0 && (
          <section className="rad-live__card">
            <h2>
              <Hash aria-hidden />
              {t('trending', { defaultValue: 'Trending' })}
            </h2>
            <ul>
              {tags.map((entry) => (
                <li key={entry.tag}>
                  <Link to={`/tag/${entry.tag}` as string} className="rad-live__row">
                    <span className="rad-live__row-main">#{entry.tag}</span>
                    <small>{entry.count}</small>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {people.length > 0 && (
          <section className="rad-live__card">
            <h2>
              <UserPlus aria-hidden />
              {t('who-to-follow', { defaultValue: 'Who to follow' })}
            </h2>
            <ul>
              {people.map((person) => (
                <li key={person.id}>
                  <Link to={`/u/${person.handle || person.id}` as string} className="rad-live__row">
                    <UserAvatar
                      src={person.image ?? undefined}
                      alt={person.name || 'User'}
                      size={30}
                      fallbackName={person.name ?? undefined}
                    />
                    <span className="rad-live__row-main">
                      <strong>{person.name || person.handle}</strong>
                      {person.handle && <small>@{person.handle}</small>}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <Link to="/explore" search={{ q: '', tab: 'top' }} className="rad-live__explore">
          <Sparkles aria-hidden />
          {t('explore-more', { defaultValue: 'Explore everything' })}
        </Link>
      </div>
    </aside>
  );
}
