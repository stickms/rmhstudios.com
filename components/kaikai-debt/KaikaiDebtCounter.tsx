'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { Flame, ScrollText, Users } from 'lucide-react';
import { PageLayout } from '@/components/feed/PageLayout';
import {
  formatDebt,
  type DebtEntryDto,
  type DebtSnapshot,
  type DebtStreamEvent,
} from '@/lib/kaikai-debt/debt';
import {
  getMutedServerSnapshot,
  isMuted,
  playRemoteDebt,
  subscribeMuted,
} from '@/lib/kaikai-debt/sound';
import { DebtCounter } from './DebtCounter';
import { DebtFx } from './DebtFx';
import { DebtLog, LedgerSubtotal } from './DebtLog';
import { AddDebtForm, type AddDebtResult } from './AddDebtForm';
import { AskDebtPanel } from './AskDebtPanel';
import { DebtDesks } from './DebtDesks';
import { SoundToggle } from './SoundToggle';
import './kaikai-debt.css';

/** How many arrivals keep their flash class before it stops meaning anything. */
const MAX_FRESH = 24;

/**
 * The Kaikai Debt Counter.
 *
 * Owns the two pieces of state everything else reads: the **basis** (the scalar
 * the live counter compounds — see `lib/kaikai-debt/debt.ts`) and the list of
 * lines that have arrived since load. Both are updated from exactly two places,
 * this reader's own submission and the SSE stream, and both updates are the
 * same shape, so a line added in another tab and a line added here take an
 * identical path.
 *
 * Note what is *not* here: the ticking number. That is `e^(r·t)` evaluated in
 * `DebtCounter`'s rAF loop against the basis below. Holding the displayed total
 * in this component's state would re-render the whole page — including the
 * infinite log — eight times a second.
 */
export function KaikaiDebtCounter({ snapshot }: { snapshot: DebtSnapshot }) {
  const { t } = useTranslation('c-kaikai-debt');

  const [basisCents, setBasisCents] = useState(snapshot.basisCents);
  const [principalCents, setPrincipalCents] = useState(snapshot.principalCents);
  const [entryCount, setEntryCount] = useState(snapshot.entryCount);
  const [memberPrincipalCents, setMemberPrincipalCents] = useState(snapshot.memberPrincipalCents);
  const [memberEntryCount, setMemberEntryCount] = useState(snapshot.memberEntryCount);
  const [contributorCount, setContributorCount] = useState(snapshot.contributorCount);

  const [liveEntries, setLiveEntries] = useState<DebtEntryDto[]>([]);
  const [freshIds, setFreshIds] = useState<ReadonlySet<string>>(() => new Set());

  const soundEnabled = !useSyncExternalStore(subscribeMuted, isMuted, getMutedServerSnapshot);

  // Ids this tab has already rendered, so an echo of our own POST arriving back
  // over SSE does not add the row twice or re-fire the sound.
  const seenRef = useRef<Set<string>>(new Set(snapshot.entries.map((e) => e.id)));

  const acceptEntry = useCallback((entry: DebtEntryDto) => {
    if (seenRef.current.has(entry.id)) return false;
    seenRef.current.add(entry.id);
    setLiveEntries((prev) => [entry, ...prev]);
    setFreshIds((prev) => {
      const next = new Set(prev);
      next.add(entry.id);
      // Unbounded, this set grows for as long as the tab is open on a page
      // designed to be left open. The flash only matters while the row is near
      // the top, so the oldest entries can be forgotten.
      if (next.size > MAX_FRESH) {
        const iterator = next.values();
        const oldest = iterator.next().value;
        if (oldest) next.delete(oldest);
      }
      return next;
    });
    return true;
  }, []);

  /* --- Live stream ------------------------------------------------------- */
  useEffect(() => {
    if (typeof EventSource === 'undefined') return;

    let source: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let retries = 0;
    let closed = false;

    const connect = () => {
      if (closed) return;
      source = new EventSource('/api/kaikai-debt/stream');

      source.addEventListener('entry.added', (event) => {
        try {
          const data = JSON.parse((event as MessageEvent).data) as DebtStreamEvent;
          // Totals are absolute, not deltas — a tab that slept through three
          // additions converges on the next event it sees instead of drifting
          // further out with every one it missed.
          setBasisCents(data.basisCents);
          setPrincipalCents(data.principalCents);
          setEntryCount(data.entryCount);
          setMemberPrincipalCents(data.memberPrincipalCents);
          setMemberEntryCount(data.memberEntryCount);
          setContributorCount(data.contributorCount);
          if (acceptEntry(data.entry)) playRemoteDebt();
        } catch {
          // Malformed frame — the next one will carry the current totals anyway.
        }
      });

      source.addEventListener('open', () => {
        retries = 0;
      });

      source.addEventListener('error', () => {
        source?.close();
        if (closed) return;
        // Exponential backoff, capped at 30s. EventSource reconnects on its own,
        // but only on a clean drop — a 429 or a 500 closes it for good, and
        // those are exactly the cases where hammering is worst.
        const delay = Math.min(30_000, 1_000 * 2 ** retries);
        retries += 1;
        retryTimer = setTimeout(connect, delay);
      });
    };

    connect();
    return () => {
      closed = true;
      if (retryTimer) clearTimeout(retryTimer);
      source?.close();
    };
  }, [acceptEntry]);

  /* --- Local submission -------------------------------------------------- */
  const onAdded = useCallback(
    (payload: AddDebtResult) => {
      setBasisCents(payload.basisCents);
      setContributorCount(payload.contributorCount);
      // The author's own line is theirs immediately. The SSE echo is deduped by
      // `seenRef`, and the counts follow from the next event or the next load —
      // an optimistic +1 that could disagree with the server buys nothing here.
      acceptEntry(payload.entry);
      setMemberEntryCount((n) => n + 1);
      setEntryCount((n) => n + 1);
      setPrincipalCents((n) => n + payload.entry.amountCents);
      setMemberPrincipalCents((n) => n + payload.entry.amountCents);
    },
    [acceptEntry],
  );

  const onTotals = useCallback(
    (totals: { basisCents: number; principalCents: number; entryCount: number }) => {
      setBasisCents(totals.basisCents);
      setPrincipalCents(totals.principalCents);
      setEntryCount(totals.entryCount);
    },
    [],
  );

  return (
    <div className="kd-root">
      <DebtFx soundEnabled={soundEnabled} />

      <PageLayout
        title={t('page.title', { defaultValue: 'The Kaikai Debt Counter' })}
        description={t('page.description', {
          defaultValue:
            'A live, compounding, permanently public record of everything Kaikai owes. Anyone can add to it. Nobody can pay it down.',
        })}
        headerRight={<SoundToggle />}
      >
        {/* `relative z-10` on every band: the FX layer is `position: fixed` at
            z-index 0 behind the page, and content without a stacking context of
            its own would render underneath the fire. */}
        <div className="relative z-10 flex flex-col gap-6">
          <section className="glass-pane rounded-site px-4 py-2">
            <DebtCounter basisCents={basisCents} asOfMs={snapshot.asOfMs} />

            <dl className="grid grid-cols-1 gap-3 border-t border-site-border pt-4 pb-2 sm:grid-cols-3">
              <Stat
                icon={ScrollText}
                label={t('stats.itemised', { defaultValue: 'Itemised on the books' })}
                value={formatDebt(principalCents)}
                detail={t('stats.itemisedDetail', {
                  defaultValue: '{{count}} lines recovered',
                  count: entryCount,
                })}
              />
              <Stat
                icon={Flame}
                label={t('stats.members', { defaultValue: 'Added by members' })}
                value={formatDebt(memberPrincipalCents)}
                detail={t('stats.membersDetail', {
                  defaultValue: '{{count}} lines',
                  count: memberEntryCount,
                })}
              />
              <Stat
                icon={Users}
                label={t('stats.creditors', { defaultValue: 'Creditors' })}
                value={String(contributorCount)}
                detail={t('stats.creditorsDetail', {
                  defaultValue: 'people he owes',
                })}
              />
            </dl>
          </section>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <AddDebtForm onAdded={onAdded} disabled={!snapshot.aiEnabled} />
            <AskDebtPanel disabled={!snapshot.aiEnabled} />
          </div>

          {!snapshot.aiEnabled && (
            <p className="glass-inset rounded-site-sm p-4 text-sm text-site-text-muted">
              {t('page.aiOffline', {
                defaultValue:
                  'The appraiser is offline, so nothing new can be added or answered right now. The counter and the log below still work.',
              })}
            </p>
          )}

          <DebtDesks />

          <section className="flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-display text-xl font-semibold text-site-text">
                {t('log.title', { defaultValue: 'Why he’s in debt' })}
              </h2>
              <LedgerSubtotal cents={principalCents} count={entryCount} />
            </div>
            <p className="text-sm text-site-text-muted">
              {t('log.help', {
                defaultValue:
                  'Every line he never paid, newest first. Keep scrolling and the ledger keeps digging — each receipt it recovers is saved for everyone who comes after you.',
              })}
            </p>

            <DebtLog
              initialEntries={snapshot.entries}
              initialCursor={snapshot.nextCursor}
              liveEntries={liveEntries}
              freshIds={freshIds}
              onTotals={onTotals}
            />
          </section>
        </div>
      </PageLayout>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof Flame;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="glass-fill flex flex-col gap-1 rounded-site p-3">
      <dt className="flex items-center gap-1.5 text-xs text-site-text-dim">
        <Icon className="size-3.5" aria-hidden />
        {label}
      </dt>
      <dd className="font-display text-lg font-semibold text-site-text tabular-nums">{value}</dd>
      <p className="text-xs text-site-text-dim">{detail}</p>
    </div>
  );
}
