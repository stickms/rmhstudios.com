'use client';

/**
 * The resume rail (B2) — "pick up where you left off".
 *
 * `JumpBackIn` next door answers "what did I open on this device"; this answers
 * "what did I leave unfinished on this ACCOUNT" — the save on day 34, the book
 * at 40%, the draft with 180 words, the deck with 12 cards due — and every card
 * deep-links into that state rather than at the section it lives in. The data
 * comes from `lib/history/resume.server.ts` via `/api/history/resume`.
 *
 * Three things about this component are load-bearing:
 *
 * 1. **It renders `null` when there is nothing to resume**, including while it
 *    is still loading. A labelled empty box on a brand-new account tells a first
 *    time user the product is broken before they have used it, and a skeleton
 *    that resolves to nothing is that plus a layout shift.
 * 2. **The subtitle is state, not a date.** The server hands over structured
 *    {@link ResumeState} values rather than a sentence precisely so the 16
 *    locales can render "Level 7" and "12 cards due" themselves; a subtitle
 *    formatted on the server would be English everywhere.
 * 3. **Progress is a `scaleX` fill, not an animated `width`.** Animating width
 *    relayouts the bar and its row every frame (see `FirstWeekCard`, and the
 *    `transition-all` rule in `lib/__tests__/design-consistency.test.ts`).
 *
 * `components/ui/radial-loader.tsx` is deliberately NOT used for the progress
 * ring: it is the site's loading MARK — orbiting blobs around a pulsing core —
 * and takes no value, so it can say "busy" but not "40%". A ring that animates
 * forever next to a book you are 40% through would read as the card still
 * loading.
 */

import { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { BookOpen, FileText, Gamepad2, History, Layers, PlayCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSession } from '@/components/Providers';
import { HorizontalScroller } from '@/components/ui/horizontal-scroller';
import { AsyncReveal } from '@/components/motion';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { cn } from '@/lib/utils';
import type { ResumeCard, ResumeKind, ResumeState } from '@/lib/history/resume.server';

const KIND_ICONS: Record<ResumeKind, LucideIcon> = {
  game: Gamepad2,
  read: BookOpen,
  watch: PlayCircle,
  draft: FileText,
  deck: Layers,
};

interface ResumeRailProps {
  /**
   * Server-seeded cards. Pass them from a route loader to skip the fetch — the
   * rail sits at the top of the feed, so a client round trip here is a visible
   * pop-in on the first screen.
   */
  initial?: ResumeCard[] | null;
}

export function ResumeRail({ initial }: ResumeRailProps) {
  const { t, i18n } = useTranslation('feed');
  const { data: session } = useSession();
  const reduced = useReducedMotion();
  const [cards, setCards] = useState<ResumeCard[] | null>(initial ?? null);

  useEffect(() => {
    if (initial || !session?.user) return;
    const controller = new AbortController();
    fetch('/api/history/resume', { signal: controller.signal, credentials: 'same-origin' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { cards?: ResumeCard[] } | null) => setCards(data?.cards ?? []))
      .catch(() => {
        // Aborted, offline, or signed out between render and fetch. The rail is
        // an accelerator, never the only path to any of this content.
      });
    return () => controller.abort();
  }, [initial, session?.user]);

  const list = cards ?? [];
  // Rule 1 above: nothing to resume, nothing to render — not an empty state.
  if (list.length === 0) return null;

  return (
    <AsyncReveal
      show
      as="section"
      aria-label={t('resume-title', { defaultValue: 'Pick up where you left off' })}
      className="glass-fill mx-3 mt-3 p-3"
    >
      <div className="mb-2 flex items-center gap-2">
        <History className="size-4 text-site-accent" aria-hidden />
        <h2 className="text-sm font-bold text-site-text">
          {t('resume-title', { defaultValue: 'Pick up where you left off' })}
        </h2>
      </div>

      <HorizontalScroller
        aria-label={t('resume-rail-label', { defaultValue: 'Unfinished games, books and drafts' })}
        surface="none"
      >
        {list.map((card) => {
          const Icon = KIND_ICONS[card.kind] ?? History;
          const detail = card.state
            .map((state) => describeState(state, t, i18n.language))
            .filter(Boolean)
            .join(' · ');

          const link = resumeLink(card.href);

          return (
            <Link
              key={`${card.kind}:${card.href}`}
              to={link.to}
              search={link.search}
              hash={link.hash}
              title={card.title}
              className="glass-fill glass-interactive flex w-48 shrink-0 flex-col gap-1.5 p-3 sm:w-56"
            >
              <span className="flex min-w-0 items-center gap-1.5">
                <Icon className="size-3.5 shrink-0 text-site-accent" aria-hidden />
                <span className="truncate text-sm font-semibold text-site-text">{card.title}</span>
              </span>

              {detail ? (
                <span className="truncate text-xs text-site-text-muted">{detail}</span>
              ) : null}

              {typeof card.progress === 'number' ? (
                <span
                  className="mt-0.5 block h-1 w-full overflow-hidden rounded-full bg-site-surface"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(card.progress * 100)}
                  aria-label={t('resume-progress', { defaultValue: 'Progress' })}
                >
                  {/* The track is the sized element, so the fill is always full
                      width and scales from its left edge — a composited
                      transform instead of a per-frame relayout. */}
                  <span
                    aria-hidden
                    className={cn(
                      'block h-full w-full origin-left bg-site-accent',
                      !reduced && 'transition-transform duration-site-slow',
                    )}
                    style={{ transform: `scaleX(${clamp01(card.progress)})` }}
                  />
                </span>
              ) : null}
            </Link>
          );
        })}
      </HorizontalScroller>
    </AsyncReveal>
  );
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

interface ResumeLink {
  to: string;
  search?: Record<string, string>;
  hash?: string;
}

/**
 * Split a card's href into the parts `<Link>` wants.
 *
 * The server hands over one canonical URL string (`/study/abc`,
 * `/isleworks?resume=1`, `/library/x#ch-4`) because that is what a card IS — a
 * destination. TanStack's `Link` models the pieces separately, and a query
 * string left inside `to` is treated as part of the pathname, so the deep link
 * quietly degrades into a 404 or a landing page. Splitting here keeps the
 * server contract a URL and the router happy.
 */
function resumeLink(href: string): ResumeLink {
  const [beforeHash, hash] = href.split('#');
  const [pathname, query] = beforeHash.split('?');
  const search = query ? Object.fromEntries(new URLSearchParams(query)) : undefined;
  return { to: pathname, ...(search ? { search } : {}), ...(hash ? { hash } : {}) };
}

type Translate = ReturnType<typeof useTranslation>['t'];

/**
 * Render one piece of state in the viewer's language.
 *
 * The plural-bearing ones (`{{count}}`) go through i18next's plural machinery,
 * which is why they take `count` rather than a differently-named number: the
 * extractor emits `_one`/`_other` keys for those and a locale with more plural
 * forms gets all of them.
 */
function describeState(state: ResumeState, t: Translate, locale: string): string {
  switch (state.at) {
    case 'level':
      return t('resume-level', { defaultValue: 'Level {{value}}', value: state.value });
    case 'day':
      return t('resume-day', { defaultValue: 'Day {{value}}', value: state.value });
    case 'wave':
      return t('resume-wave', { defaultValue: 'Wave {{value}}', value: state.value });
    case 'score':
      return t('resume-score', { defaultValue: '{{count}} point', count: state.value });
    case 'percent':
      return t('resume-percent', { defaultValue: '{{value}}% read', value: state.value });
    case 'timeLeft':
      return t('resume-time-left', {
        defaultValue: '{{count}}m left',
        count: Math.max(1, Math.round(state.value / 60)),
      });
    case 'due':
      return t('resume-due', { defaultValue: '{{count}} card due', count: state.value });
    case 'words':
      return t('resume-words', { defaultValue: '{{count}} word', count: state.value });
    case 'scheduled':
      return t('resume-scheduled', {
        defaultValue: 'Scheduled {{when}}',
        when: formatDay(state.value, locale),
      });
    default:
      return '';
  }
}

function formatDay(epochMs: number, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(
      new Date(epochMs),
    );
  } catch {
    return new Date(epochMs).toISOString().slice(0, 10);
  }
}
