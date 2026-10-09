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

import { useEffect, useMemo, useState } from 'react';
import { Link, useRouterState } from '@tanstack/react-router';
import { ArrowRight, Hash, UserPlus } from 'lucide-react';
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

function useExplorePeek(active: boolean, onSettled: () => void) {
  const [data, setData] = useState<ExplorePeek | null>(explorePeek);

  useEffect(() => {
    if (!active) return;
    if (explorePeek && Date.now() - explorePeekAt < EXPLORE_TTL) {
      setData(explorePeek);
      onSettled();
      return;
    }
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch('/api/explore', {
          credentials: 'include',
          signal: controller.signal,
        });
        if (!res.ok) {
          onSettled();
          return;
        }
        const body = (await res.json()) as ExplorePeek;
        explorePeek = {
          trendingTags: body.trendingTags ?? [],
          suggestedUsers: body.suggestedUsers ?? [],
        };
        explorePeekAt = Date.now();
        setData(explorePeek);
        onSettled();
      } catch {
        // Ambient content — a failure just leaves the section out.
        if (!controller.signal.aborted) onSettled();
      }
    })();
    return () => controller.abort();
  }, [active, onSettled]);

  return data;
}

/** "N people online" — the rail's one repeating timer. */
function LivePulse({ active, onSettled }: { active: boolean; onSettled: () => void }) {
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
        if (!cancelled) setCount(data.count ?? 0);
      } catch {
        // decorative — ignore
      } finally {
        if (!cancelled) onSettled();
      }
    };
    void load();
    const timer = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [active, onSettled]);

  // Hold the pill's slot while the count is in flight. It used to render
  // nothing until the fetch resolved and then appear at the TOP of the rail,
  // pushing every card under it down ~47px on every page load (the largest
  // layout shift left on desktop, 2026-10-09). An empty pill of the right size
  // costs nothing and moves nothing; it only collapses if the count comes back
  // as zero, which a signed-in viewer — who is online themselves — never sees.
  if (count === 0) return null;
  if (count === null) {
    return <section className="rad-live__pulse rad-live__pulse--pending" aria-hidden />;
  }

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
/** The ambient widgets that must settle before the column is shown. */
type RailPart = 'pulse' | 'today' | 'friends' | 'explore';
const RAIL_PARTS: readonly RailPart[] = ['pulse', 'today', 'friends', 'explore'];
/**
 * Backstop: reveal anyway after this long, so one slow endpoint can delay the
 * rail but never blank it. Counted from the moment the fetches are allowed to
 * start (idle), not from mount.
 */
const REVEAL_TIMEOUT_MS = 3_000;

/**
 * Track which ambient widgets have settled, and say when all of them have.
 *
 * Each widget fetches on its own clock, and they used to render the moment
 * their own data landed — so whichever arrived later inserted itself ABOVE the
 * ones already showing and shoved them down: Today landing after Trending,
 * Friends online popping in between them, the online pill arriving last at the
 * very top. On a wide screen that was the largest layout shift left on the site
 * (2026-10-09). The column is now laid out invisibly while it fills and revealed
 * once, in one piece.
 */
function useRailReveal(active: boolean) {
  const [settled, setSettled] = useState<ReadonlySet<RailPart>>(() => new Set());
  const [timedOut, setTimedOut] = useState(false);

  const settle = useMemo(() => {
    const make = (part: RailPart) => () =>
      setSettled((prev) => (prev.has(part) ? prev : new Set(prev).add(part)));
    return {
      pulse: make('pulse'),
      today: make('today'),
      friends: make('friends'),
      explore: make('explore'),
    };
  }, []);

  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(() => setTimedOut(true), REVEAL_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [active]);

  const ready = timedOut || RAIL_PARTS.every((part) => settled.has(part));
  return { settle, ready };
}

/**
 * Only ever rendered when the rail is actually on screen, so unlike the old
 * inline version there is no `visible` prop to thread — reaching this component
 * at all IS the visibility signal. `useIdleReady` still holds the fetches back
 * so they never compete with hydration.
 */
export function RadialLiveRailContent({
  onReady,
}: {
  /** Told once the column has been revealed, so the rail can show the page slot. */
  onReady?: (ready: true) => void;
} = {}) {
  const { t } = useTranslation('feed');
  const active = useIdleReady();
  const { settle, ready } = useRailReveal(active);
  useEffect(() => {
    if (ready) onReady?.(true);
  }, [ready, onReady]);
  const explore = useExplorePeek(active, settle.explore);

  const tags = explore?.trendingTags?.slice(0, 6) ?? [];
  const people = explore?.suggestedUsers?.slice(0, 3) ?? [];
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // The "more" link is the footer of the two Explore previews above it, so it
  // exists only when one of them does — and never on /explore itself, where it
  // linked to the page you were already on. It used to be a full-width outlined
  // pill, "Explore everything" with a Sparkles glyph (the site's AI icon), on
  // every page and on an empty rail, so it read as a separate AI feature rather
  // than as the nav's Explore page, which is all it opens.
  const showExploreLink = (tags.length > 0 || people.length > 0) && pathname !== '/explore';

  // Order matters as much as the reveal. The rail keeps changing after it is
  // shown: the online count polls, and Friends online appears, grows and empties
  // as people come and go. So the steady cards lead and Friends online comes
  // after them, where its live changes can only move the footer link.
  return (
    <div className="rad-live__ambient" data-ready={ready ? 'true' : 'false'}>
      <LivePulse active={active} onSettled={settle.pulse} />
      <TodayWidget onSettled={settle.today} />

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

      <FriendsOnlineWidget onSettled={settle.friends} />

      {showExploreLink && (
        <Link to="/explore" search={{ q: '', tab: 'top' }} className="rad-live__explore">
          {t('explore-more-link', { defaultValue: 'More on Explore' })}
          <ArrowRight aria-hidden />
        </Link>
      )}
    </div>
  );
}
