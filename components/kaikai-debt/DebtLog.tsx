'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Spinner } from '@/components/ui/spinner';
import { useLiveNow } from '@/components/ui/RelativeTime';
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
 * The observer fires when a sentinel enters the margin, off the main thread, and
 * `rootMargin` starts the fetch 1200px early so the next page is usually already
 * in the DOM by the time the reader would have seen it.
 *
 * ## The three ways an infinite scroll silently stops
 *
 * All three were live here, and each has its own defence below:
 *
 *  1. **The observer never fires again.** It reports *transitions*, so if a
 *     loaded page fails to push the sentinel back out of the margin — a short
 *     page, a tall viewport, a scroll that outran the fetch — no callback ever
 *     comes. Fixed by tracking visibility and pumping in a loop while it holds.
 *  2. **The callback reads a stale cursor.** A `loadMore` that closed over
 *     `cursor` from a render requests the same page forever, because the state
 *     update advancing it is invisible to a closure made before it. Fixed by
 *     keeping the cursor in a ref, which also keeps `loadMore`'s identity stable
 *     so the observer is not torn down and re-created on every render.
 *  3. **The server drops the cursor.** An empty page used to answer
 *     `nextCursor: null`, which threw away the reader's position with no way
 *     back. The server now echoes the cursor it was given, so an empty page is a
 *     retryable pause rather than an ending.
 *
 * There is deliberately no terminal state in this component. Reaching the
 * frontier means generation is in flight in another request; the reader is told
 * that, a retry is already scheduled, and the list resumes on its own.
 */
export function DebtLog({
  initialEntries,
  initialCursor,
  freshIds,
  liveEntries,
  onTotals,
}: DebtLogProps) {
  const { t } = useTranslation('c-kaikai-debt');
  const [entries, setEntries] = useState<DebtEntryDto[]>(initialEntries);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The reader is at the bottom and the last request added nothing. */
  const [stalled, setStalled] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // One clock for every row, ticking every 30s, shared with the rest of the
  // site's relative timestamps. Null until hydration — rows fall back to face
  // value, which is deterministic and therefore hydration-safe.
  const liveNow = useLiveNow();
  const nowMs = liveNow ?? 0;

  /*
   * The cursor, the in-flight flag and the row count all live in refs rather
   * than state, and `loadMore` therefore has a STABLE identity.
   *
   * This is what makes the pump loop below correct. `loadMore` is called
   * repeatedly inside a `while`, and a version of it that closed over `cursor`
   * from a render would request the same page on every iteration — the state
   * update that advanced the cursor cannot be observed by a closure created
   * before it. Reading through a ref means each call sees the cursor the
   * previous call just set.
   *
   * The stable identity is a second, independent benefit: the observer effect
   * depends on `loadMore`, so an identity that changed per render would tear
   * down and re-create the IntersectionObserver constantly — and a freshly
   * observed element reports its state asynchronously, which drops callbacks
   * during exactly the fast scrolling this needs to survive.
   */
  const cursorRef = useRef<string | null>(initialCursor);
  const loadingRef = useRef(false);
  const loadedCountRef = useRef(initialEntries.length);
  // The one piece of cursor state the render needs: whether there is any point
  // showing a loading affordance at all.
  const [hasCursor, setHasCursor] = useState(Boolean(initialCursor));

  const loadMore = useCallback(async () => {
    const cursor = cursorRef.current;
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

      let added = 0;
      setEntries((prev) => {
        // The server can only return rows older than the cursor, but a
        // concurrent generation on another connection makes an overlap possible
        // in principle — and a duplicate key here is a React warning plus a row
        // rendered twice, which on an infinite list is very hard to spot.
        const seen = new Set(prev.map((e) => e.id));
        const fresh = page.entries.filter((e) => !seen.has(e.id));
        added = fresh.length;
        const next = [...prev, ...fresh];
        loadedCountRef.current = next.length;
        return next;
      });

      cursorRef.current = page.nextCursor;
      setHasCursor(Boolean(page.nextCursor));
      // Nothing new: the reader has caught up with generation, which is a pause
      // and not an ending. The retry effect picks it up from here.
      setStalled(added === 0);

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
  }, [onTotals, t]);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasCursor) return;
    if (typeof IntersectionObserver === 'undefined') return;

    // Whether the sentinel is currently inside the margin. An IntersectionObserver
    // only fires on a *transition*, which is the classic way an infinite scroll
    // silently stops: if a loaded page does not push the sentinel back out of
    // view — a short page, a tall viewport, a fast scroll that outran the
    // fetch — no further callback ever comes and the list is stuck with content
    // it never asked for. Tracking the state lets the effect below re-fire while
    // it is still visible, so loading continues until the sentinel is genuinely
    // pushed off screen.
    let visible = false;
    let cancelled = false;

    const pump = async () => {
      // `loadMore` no-ops when a request is already in flight, so overlapping
      // callers collapse into one chain rather than stacking requests.
      while (!cancelled && visible) {
        const before = loadedCountRef.current;
        await loadMore();
        // No progress — the server had nothing to give this time (generation is
        // in flight elsewhere). Stop pumping and let the retry timer below take
        // over, rather than spinning on a request that is not advancing.
        if (loadedCountRef.current === before) break;
      }
    };

    const observer = new IntersectionObserver(
      (records) => {
        visible = records.some((r) => r.isIntersecting);
        if (visible) void pump();
      },
      // Fetch well before the reader can see the bottom. Generous because the
      // server generates ahead too — between them, the aim is that a page is
      // already in the DOM by the time it would have been looked at.
      { rootMargin: '1200px 0px' },
    );
    observer.observe(node);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [hasCursor, loadMore]);

  // The ledger's frontier is a moving target: a short page means generation is
  // happening in another request, not that the archive ended. Retrying on a
  // timer is what turns "the scroll stopped" into "the scroll paused", and it
  // only runs while the reader is actually parked at the bottom.
  useEffect(() => {
    if (!stalled) return;
    const timer = setTimeout(() => void loadMore(), 2_500);
    return () => clearTimeout(timer);
  }, [stalled, loadMore]);

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

        {/* No dead end. Reaching the frontier means generation is in flight in
            another request, not that the archive ran out — so this says
            "writing more", the retry timer is already counting, and the manual
            button is there only for someone impatient enough to want it. */}
        {!loading && !error && stalled && (
          <div className="flex flex-col items-center gap-2">
            <p className="max-w-sm text-sm text-site-text-muted">
              {t('log.frontierWriting', {
                defaultValue:
                  'You’ve outrun the archive. More of his history is being written right now — it’ll appear in a moment.',
              })}
            </p>
            <Button size="sm" variant="outline" onClick={() => void loadMore()}>
              {t('log.digDeeper', { defaultValue: 'Dig deeper' })}
            </Button>
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
