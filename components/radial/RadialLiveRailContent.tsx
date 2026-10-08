'use client';

/**
 * The live rail's ambient content — everything inside the rail except its own
 * frame and the page's portal slot.
 *
 * ## Why this is a separate module
 *
 * `radial.css` gives `.rad-rail` `display: none` and only reveals
 * `.rad-rail--live` at `min-width: 1440px`, and `RadialLiveRail` has always
 * gated the *fetches* on that same query — so phones never made these requests.
 * But the rail was statically imported by `RadialShell`, which every `_site`
 * page renders, so the **code** shipped everywhere regardless: two feed widgets,
 * the explore-peek client, the presence poller, `UserAvatar`, three lucide
 * icons. Downloaded, parsed and hydrated on every phone, to render a column
 * that device cannot see at any width it will ever have.
 *
 * Gating the network and leaving the bundle alone is the trap here — on this
 * site the binding cost is main-thread parse/hydrate time, not the request. So
 * the frame stays eager (it is a few elements, and it must hold the portal slot
 * the moment the shell mounts) and everything below moves behind the same 1440px
 * query that reveals it. Same fix, and the same reasoning, as the nav globe in
 * `RadialHub`.
 */

import { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Hash, Sparkles, UserPlus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
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

/**
 * Only ever rendered when the rail is actually on screen, so unlike the old
 * inline version there is no `visible` prop to thread — reaching this component
 * at all IS the visibility signal. `useIdleReady` still holds the fetches back
 * so they never compete with hydration.
 */
export function RadialLiveRailContent() {
  const { t } = useTranslation('feed');
  const active = useIdleReady();
  const explore = useExplorePeek(active);

  const tags = explore?.trendingTags?.slice(0, 6) ?? [];
  const people = explore?.suggestedUsers?.slice(0, 3) ?? [];

  return (
    <>
      <LivePulse active={active} />
      <TodayWidget />
      <FriendsOnlineWidget />

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
    </>
  );
}
