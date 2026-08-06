'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { LogIn, ScrollText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Spinner } from '@/components/ui/spinner';
import { useLiveNow } from '@/components/ui/RelativeTime';
import { useSession } from '@/components/Providers';
import { formatDebt, type DebtEntryDto, type DebtLedgerPage } from '@/lib/kaikai-debt/debt';
import { playLedgerExtended } from '@/lib/kaikai-debt/sound';
import { DebtLogRow } from './DebtLogRow';

interface DebtLogProps {
  initialEntries: DebtEntryDto[];
  initialCursor: string | null;
  /** Ids of lines that arrived live, so only those flash. */
  freshIds: ReadonlySet<string>;
  /** Live additions from SSE / this reader's own submissions, newest first. */
  liveEntries: DebtEntryDto[];
  onTotals: (totals: { basisCents: number; principalCents: number; entryCount: number }) => void;
}

/**
 * The debt log — why Kaikai is in debt — as an infinite scroll.
 *
 * Reads backwards through time forever. Member-added lines sit at the top;
 * below them the ledger's own history, which the server generates with DeepSeek
 * and caches permanently the first time anyone scrolls far enough to need it.
 * The second reader to reach page forty is served from Postgres.
 *
 * ## Why IntersectionObserver and not a scroll handler
 *
 * A `scroll` listener fires at input rate and would have this component doing
 * arithmetic on the main thread during the one interaction the page exists for.
 * The observer fires once when a sentinel enters the margin, off the main
 * thread, and `rootMargin` starts the fetch 800px early so the next page is
 * usually already there when the reader arrives.
 *
 * ## The end of the list is never "the end"
 *
 * A null cursor means "cannot extend right now" — signed out, budget spent, or
 * another reader holds the generation lock — and each renders as its own
 * message. None of them says the debt is finite, because it is not: the whole
 * conceit is that there is always more.
 */
export function DebtLog({
  initialEntries,
  initialCursor,
  freshIds,
  liveEntries,
  onTotals,
}: DebtLogProps) {
  const { t } = useTranslation('c-kaikai-debt');
  const { data: session } = useSession();
  const signedIn = Boolean(session?.user);

  const [entries, setEntries] = useState<DebtEntryDto[]>(initialEntries);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // One clock for every row, ticking every 30s, shared with the rest of the
  // site's relative timestamps. Null until hydration — rows fall back to face
  // value, which is deterministic and therefore hydration-safe.
  const liveNow = useLiveNow();
  const nowMs = liveNow ?? 0;

  // `loading` is read inside the observer callback, which closes over the render
  // it was created in. A ref is the only way for it to see the current value
  // without re-creating (and re-observing) on every state change.
  const loadingRef = useRef(false);
  loadingRef.current = loading;

  const loadMore = useCallback(async () => {
    if (loadingRef.current || !cursor) return;
    loadingRef.current = true;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/kaikai-debt/ledger?cursor=${encodeURIComponent(cursor)}`);
      if (!res.ok) {
        setError(t('log.loadFailed', { defaultValue: 'Could not read any further back.' }));
        return;
      }
      const page = (await res.json()) as DebtLedgerPage;

      setEntries((prev) => {
        // The server can only return rows older than the cursor, but a
        // concurrent generation on another connection makes an overlap possible
        // in principle — and a duplicate key here is a React warning plus a row
        // rendered twice, which on an infinite list is very hard to spot.
        const seen = new Set(prev.map((e) => e.id));
        return [...prev, ...page.entries.filter((e) => !seen.has(e.id))];
      });
      setCursor(page.nextCursor);
      onTotals({
        basisCents: page.basisCents,
        principalCents: page.principalCents,
        entryCount: page.entryCount,
      });
      if (page.generated) playLedgerExtended();
    } catch {
      setError(t('log.loadFailed', { defaultValue: 'Could not read any further back.' }));
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [cursor, onTotals, t]);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !cursor) return;
    if (typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (records) => {
        if (records.some((r) => r.isIntersecting)) void loadMore();
      },
      // Fetch before the reader can see the bottom, so the list rarely visibly
      // stalls. Larger than this and a fast scroll fires several pages at once.
      { rootMargin: '800px 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [cursor, loadMore]);

  // Live additions are always newer than anything paged in, so they belong on
  // top. Deduped because this reader's own submission arrives twice: once from
  // the POST response and once back over SSE.
  const pagedIds = new Set(entries.map((e) => e.id));
  const all = [...liveEntries.filter((e) => !pagedIds.has(e.id)), ...entries];

  if (all.length === 0) {
    return (
      <EmptyState
        icon={ScrollText}
        title={t('log.emptyTitle', { defaultValue: 'The books are clean' })}
        description={t('log.emptyBody', {
          defaultValue: 'Nothing itemised yet. Be the first to put something on his tab.',
        })}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2">
        {all.map((entry) => (
          <DebtLogRow
            key={entry.id}
            entry={entry}
            nowMs={nowMs || entry.createdAtMs}
            fresh={freshIds.has(entry.id)}
          />
        ))}
      </ul>

      <div ref={sentinelRef} className="flex flex-col items-center gap-2 py-6 text-center">
        {loading && (
          <p className="flex items-center gap-2 text-sm text-site-text-muted">
            <Spinner className="size-4" />
            {t('log.digging', { defaultValue: 'Digging further into his history…' })}
          </p>
        )}

        {!loading && error && (
          <>
            <p className="text-sm text-site-danger">{error}</p>
            <Button size="sm" variant="outline" onClick={() => void loadMore()}>
              {t('log.retry', { defaultValue: 'Try again' })}
            </Button>
          </>
        )}

        {!loading && !error && !cursor && (
          <div className="flex flex-col items-center gap-2">
            <p className="max-w-sm text-sm text-site-text-muted">
              {signedIn
                ? t('log.frontierSignedIn', {
                    defaultValue:
                      'That’s everything recovered so far. More of his history is still out there — check back in a moment.',
                  })
                : t('log.frontierSignedOut', {
                    defaultValue:
                      'That’s everything recovered so far. Sign in to dig further back — the receipts you uncover are saved for everyone.',
                  })}
            </p>
            {!signedIn && (
              <Button asChild size="sm" variant="outline">
                <Link to="/login" search={{ callbackURL: '/kaikaidebtcounter' }}>
                  <LogIn aria-hidden />
                  {t('log.signInToDig', { defaultValue: 'Sign in to keep digging' })}
                </Link>
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** The itemised subtotal, rendered beside the log's heading. */
export function LedgerSubtotal({ cents, count }: { cents: number; count: number }) {
  const { t } = useTranslation('c-kaikai-debt');
  return (
    <span className="text-sm text-site-text-muted tabular-nums">
      {t('log.subtotal', {
        defaultValue: '{{amount}} itemised across {{count}} lines',
        amount: formatDebt(cents),
        count,
      })}
    </span>
  );
}
