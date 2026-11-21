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
 * 3. **Progress is a still `scaleX` fill.** It never animates: it answers no
 *    input, so under R5 it does not move.
 *
 * `components/ui/radial-loader.tsx` is deliberately NOT used for the progress
 * ring: it is the site's loading MARK — orbiting blobs around a pulsing core —
 * and takes no value, so it can say "busy" but not "40%". A ring that animates
 * forever next to a book you are 40% through would read as the card still
 * loading.
 */

import { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { BookOpen, FileText, Gamepad2, History, Layers, PlayCircle, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSession } from '@/components/Providers';
import { SpineItem } from '@/components/ui/spine';
import { IconButton } from '@/components/ui/icon-button';
import { readJson, writeJson } from '@/lib/core/persist';
import { toast } from '@/lib/toast';
import { useArrival } from '@/components/ui/arrive';
import type { ResumeCard, ResumeKind, ResumeState } from '@/lib/history/resume.server';
import { clamp01 } from '@/lib/core/math';
import { api } from '@/lib/contract/client';
import { resumeCardsApi } from '@/lib/site-reads.contract';

/**
 * Set when the viewer hides the section from its own header. Per device, like
 * the other dismissals on the home feed; the toast offers Undo, and clearing it
 * brings the section back.
 */
const HIDDEN_KEY = 'rmh-resume-hidden';

/** Rows shown at once; the rest stay one visit away on their own pages. */
const MAX_ROWS = 3;

const KIND_ICONS: Record<ResumeKind, LucideIcon> = {
  game: Gamepad2,
  watch: PlayCircle,
  draft: FileText,
  deck: Layers,
  book: BookOpen,
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
  const { t: ts } = useTranslation('reading-sync');
  const { data: session } = useSession();
  const [cards, setCards] = useState<ResumeCard[] | null>(initial ?? null);
  // Read on the client only: the server renders nothing here either way (no
  // cards until the fetch below), so the first client render matches it.
  const [hidden, setHidden] = useState(false);
  // False until the stored choice has been read, so a hidden section never fetches.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setHidden(readJson(HIDDEN_KEY, false, { validate: (v) => (typeof v === 'boolean' ? v : undefined) }));
    setReady(true);
  }, []);

  const hide = () => {
    setHidden(true);
    writeJson(HIDDEN_KEY, true);
    toast(t('resume-hidden', { defaultValue: 'Hidden on this device' }), {
      action: {
        label: t('undo', { defaultValue: 'Undo' }),
        onClick: () => {
          setHidden(false);
          writeJson(HIDDEN_KEY, false);
        },
      },
    });
  };

  useEffect(() => {
    if (!ready || hidden || initial || !session?.user) return;
    const controller = new AbortController();
    api(resumeCardsApi, { signal: controller.signal })
      .then((data) => setCards(data.cards ?? []))
      .catch(() => {
        // Aborted, offline, or signed out between render and fetch. The rail is
        // an accelerator, never the only path to any of this content.
      });
    return () => controller.abort();
  }, [ready, hidden, initial, session?.user]);

  const list = cards ?? [];
  // Steel M9: a rail fetched here appears in a gap, so it fades in; server-seeded cards do not.
  const arrival = useArrival(list.length > 0);
  // Rule 1 above: nothing to resume, nothing to render — not an empty state.
  // A section the viewer hid renders nothing too.
  if (hidden || list.length === 0) return null;

  // Zeigarnik effect (Bluma Zeigarnik, 1927): unfinished tasks stay in mind, so
  // the most useful thing to show is the one already started. Hick's law argues
  // against a long shelf of them: a few rows, most recent first.
  const rows = list.slice(0, MAX_ROWS);

  return (
    <SpineItem dot={false}>
      <section
        aria-labelledby="resume-title"
        className={arrival}
      >
        <div className="flex items-center justify-between gap-2 pb-1">
          <h2
            id="resume-title"
            className="t-label"
          >
            {t('resume-title', { defaultValue: 'Pick up where you left off' })}
          </h2>
          <IconButton
            icon={X}
            label={t('resume-hide', { defaultValue: 'Hide this section' })}
            variant="ghost"
            onClick={hide}
          />
        </div>
        <ul aria-label={t('resume-rail-label', { defaultValue: 'Unfinished games, books and drafts' })}>
          {rows.map((card) => {
            const Icon = KIND_ICONS[card.kind] ?? History;
            const detail = card.state
              .map((state) => describeState(state, t, i18n.language))
              .filter(Boolean)
              .join(' · ');
            const link = resumeLink(card.href);
            return (
              <li
                key={`${card.kind}:${card.href}`}
                className="border-b border-site-border last:border-b-0"
              >
                <Link
                  to={link.to}
                  search={link.search}
                  hash={link.hash}
                  className="flex min-w-0 items-center gap-3 py-2.5"
                >
                  <Icon
                    className="size-4 shrink-0 text-site-text-muted"
                    aria-hidden
                  />
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="t-body truncate font-medium text-site-text">
                      {card.kind === 'book'
                        ? ts('resume-continue', {
                            defaultValue: 'Continue reading {{title}}',
                            title: card.title,
                          })
                        : card.title}
                    </span>
                    {detail ? <span className="t-meta truncate">{detail}</span> : null}
                  </span>
                  {typeof card.progress === 'number' ? (
                    <span
                      className="block h-1 w-16 shrink-0 overflow-hidden rounded-site-sm bg-site-bg-subtle"
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(card.progress * 100)}
                      aria-label={t('resume-progress', { defaultValue: 'Progress' })}
                    >
                      {/* A still fill: nothing here responds to input, so nothing moves (R5). */}
                      <span
                        aria-hidden
                        className="block h-full w-full origin-left bg-site-text"
                        style={{ transform: `scaleX(${clamp01(card.progress)})` }}
                      />
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    </SpineItem>
  );
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
 * `/hearthworks?resume=1`, `/library/x#ch-4`) because that is what a card IS — a
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
      return t('resume-score', {
        defaultValue_one: '{{count}} point',
        defaultValue: '{{count}} points',
        count: state.value,
      });
    case 'percent':
      return t('resume-percent', { defaultValue: '{{value}}% read', value: state.value });
    case 'timeLeft':
      return t('resume-time-left', {
        defaultValue: '{{count}}m left',
        count: Math.max(1, Math.round(state.value / 60)),
      });
    case 'due':
      return t('resume-due', {
        defaultValue_one: '{{count}} card due',
        defaultValue: '{{count}} cards due',
        count: state.value,
      });
    case 'words':
      return t('resume-words', {
        defaultValue_one: '{{count}} word',
        defaultValue: '{{count}} words',
        count: state.value,
      });
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
