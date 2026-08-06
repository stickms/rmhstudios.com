/**
 * Slice It — the ranked chart pool, for moderators (`R10`).
 *
 * The two human decisions in R10 (`promoteToRanked`, `demote`) had no caller
 * anywhere in the app, so no chart ever reached `ranked`, so every player's
 * skill rating stayed 0 and the global board fell through to its `totalScore`
 * tie-break. This page is the caller.
 *
 * ## Why every number is on the row
 *
 * The automatic gate answers a yes/no question — five thresholds, all of them
 * arbitrary. The question this page asks a human is a different one: *should
 * this particular chart be in everyone's skill rating*, given that scores set
 * on it become numbers people earned and unranking it later takes those away.
 * A row that said only "qualified" would be asking a moderator to rubber-stamp
 * the thresholds. So each row shows the evidence the gate ran on — clear rate,
 * plays, distinct players, lint errors, visibility — with the threshold beside
 * the value, and names every blocker on a chart that did not pass.
 *
 * This is a `_site/` page, so it is on the **site** token contract
 * (`--site-*`, glass elevation classes), not the game's `--slice-*` neumorphic
 * palette. It is chrome for the site's admin area that happens to be about a
 * game, and a moderator reaches it from `/admin` in whatever theme they run the
 * rest of the site in.
 */

import { createFileRoute } from '@tanstack/react-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  AlertTriangle,
  ArrowDownCircle,
  Check,
  Eye,
  Gauge,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import { PageLayout } from '@/components/feed/PageLayout';
import { LiquidTabs } from '@/components/ui/liquid-tabs';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Spinner } from '@/components/ui/spinner';

/** Mirrors `QualificationReport` in `lib/slice-it/ranking.server.ts`. */
interface Evidence {
  chartId: string;
  eligible: boolean;
  blockers: string[];
  players: number;
  plays: number;
  clearRate: number | null;
  lintErrors: number;
  status: string;
}

interface RankingRow {
  id: string;
  songId: string;
  songTitle: string;
  songArtist: string;
  name: string;
  difficulty: string;
  authorName: string | null;
  authorHandle: string | null;
  rating: number | null;
  ratingVersion: number | null;
  status: string;
  rankStatus: string;
  rankStatusAt: string | null;
  updatedAt: string;
  evidence: Evidence;
}

type RankStatus = 'unranked' | 'qualified' | 'ranked';

/**
 * The thresholds, duplicated for display only.
 *
 * They are `QUALIFY_MIN_*` in `ranking.server.ts`, which is a `.server` module
 * and cannot be imported here. Nothing branches on these copies — the server
 * decides eligibility and this page renders `evidence.blockers` — so a drift
 * shows a stale target beside a correct verdict rather than a wrong verdict.
 */
const SHOW_MIN_PLAYERS = 20;
const SHOW_MIN_PLAYS = 50;
const SHOW_MIN_CLEAR_RATE = 0.05;

export const Route = createFileRoute('/_site/admin/slice-it')({
  component: AdminSliceItRankingPage,
});

function AdminSliceItRankingPage() {
  const { t } = useTranslation('r-slice-it');
  const [status, setStatus] = useState<RankStatus>('qualified');
  const [rows, setRows] = useState<RankingRow[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<string | null>(null);

  const load = useCallback(async (next: RankStatus) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/slice-it/charts/ranking?status=${next}&limit=25`);
      if (!response.ok) throw new Error(String(response.status));
      const data = (await response.json()) as {
        charts: RankingRow[];
        counts: Record<string, number>;
      };
      setRows(data.charts ?? []);
      setCounts(data.counts ?? {});
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(status);
  }, [load, status]);

  const act = async (chartId: string, action: 'promote' | 'demote') => {
    setPending(chartId);
    try {
      const response = await fetch('/api/slice-it/charts/ranking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chartId, action }),
      });
      const data = (await response.json()) as { error?: string; rankStatus?: string };
      if (!response.ok) {
        toast.error(
          data.error ?? t('admin-rank-action-failed', { defaultValue: 'That did not go through.' }),
        );
        // A 409 means this list is stale, which is exactly the case where
        // re-reading it is the useful thing to do.
        await load(status);
        return;
      }
      toast.success(
        action === 'promote'
          ? t('admin-rank-promoted', { defaultValue: 'Chart promoted to the ranked pool.' })
          : t('admin-rank-demoted', { defaultValue: 'Chart removed from the ranked pool.' }),
      );
      await load(status);
    } catch {
      toast.error(t('admin-rank-action-failed', { defaultValue: 'That did not go through.' }));
    } finally {
      setPending(null);
    }
  };

  const tabs = [
    {
      id: 'qualified',
      label: t('admin-rank-tab-qualified', { defaultValue: 'Awaiting review' }),
      icon: Sparkles,
      count: counts.qualified ?? 0,
    },
    {
      id: 'ranked',
      label: t('admin-rank-tab-ranked', { defaultValue: 'Ranked' }),
      icon: ShieldCheck,
      count: counts.ranked ?? 0,
    },
    {
      id: 'unranked',
      label: t('admin-rank-tab-unranked', { defaultValue: 'Unranked' }),
      icon: ArrowDownCircle,
      count: counts.unranked ?? 0,
    },
  ];

  return (
    <PageLayout
      title={t('admin-rank-title', { defaultValue: 'Slice It — ranked pool' })}
      description={t('admin-rank-lede', {
        defaultValue:
          'Qualification is automatic and reversible. Promotion is not: scores set on a ranked chart become part of every player’s skill rating.',
      })}
      backTo="/admin"
      backLabel={t('admin-rank-back', { defaultValue: 'Back to admin' })}
      wide
    >
      <div className="space-y-6 p-4 md:p-6">
        <LiquidTabs
          tabs={tabs}
          value={status}
          onChange={(id) => setStatus(id as RankStatus)}
          aria-label={t('admin-rank-filter', { defaultValue: 'Filter charts by pool state' })}
        />

        {loading ? (
          <div className="flex flex-col items-center gap-3 py-16 text-site-text-muted">
            <Spinner size={32} />
            <span>{t('admin-rank-loading', { defaultValue: 'Reading the pool…' })}</span>
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Gauge}
            title={t('admin-rank-empty', { defaultValue: 'No charts in this state.' })}
          />
        ) : (
          <ul className="space-y-4">
            {rows.map((row) => (
              <ChartRow
                key={row.id}
                row={row}
                busy={pending === row.id}
                onAct={(action) => void act(row.id, action)}
              />
            ))}
          </ul>
        )}
      </div>
    </PageLayout>
  );
}

function ChartRow({
  row,
  busy,
  onAct,
}: {
  row: RankingRow;
  busy: boolean;
  onAct: (action: 'promote' | 'demote') => void;
}) {
  const { t } = useTranslation('r-slice-it');
  const evidence = row.evidence;
  const clearRate = evidence.clearRate;

  return (
    <li className="glass-fill rounded-site p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-lg font-semibold text-site-text">{row.songTitle}</span>
            <span className="text-sm text-site-text-dim">{row.songArtist}</span>
            <StateBadge state={row.rankStatus} />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-site-text-muted">
            <span className="font-medium text-site-text-muted">{row.name}</span>
            <span aria-hidden="true">&bull;</span>
            <span className="uppercase tracking-wide">{row.difficulty}</span>
            <span aria-hidden="true">&bull;</span>
            <span>
              {row.authorHandle
                ? `@${row.authorHandle}`
                : (row.authorName ?? t('admin-rank-no-author', { defaultValue: 'unnamed author' }))}
            </span>
            <span aria-hidden="true">&bull;</span>
            <span>
              {row.rating === null
                ? t('admin-rank-unrated', { defaultValue: 'unrated' })
                : t('admin-rank-rating', {
                    defaultValue: 'rating {{value}}',
                    value: row.rating.toFixed(1),
                  })}
            </span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="default"
            size="sm"
            disabled={busy || row.rankStatus !== 'qualified'}
            onClick={() => onAct('promote')}
          >
            <ShieldCheck aria-hidden="true" />
            {t('admin-rank-promote', { defaultValue: 'Promote' })}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={busy || row.rankStatus === 'unranked'}
            onClick={() => onAct('demote')}
          >
            <ArrowDownCircle aria-hidden="true" />
            {t('admin-rank-demote', { defaultValue: 'Demote' })}
          </Button>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <Gate
          icon={Eye}
          label={t('admin-rank-gate-visibility', { defaultValue: 'Visibility' })}
          value={row.status}
          target={t('admin-rank-gate-visibility-target', { defaultValue: 'must be public' })}
          passed={row.status === 'public'}
        />
        <Gate
          icon={AlertTriangle}
          label={t('admin-rank-gate-lint', { defaultValue: 'Lint errors' })}
          value={String(evidence.lintErrors)}
          target={t('admin-rank-gate-lint-target', { defaultValue: 'must be 0' })}
          passed={evidence.lintErrors === 0}
        />
        <Gate
          icon={Users}
          label={t('admin-rank-gate-players', { defaultValue: 'Distinct players' })}
          value={String(evidence.players)}
          target={t('admin-rank-gate-target', {
            defaultValue: 'of {{needed}}',
            needed: SHOW_MIN_PLAYERS,
          })}
          passed={evidence.players >= SHOW_MIN_PLAYERS}
        />
        <Gate
          icon={Gauge}
          label={t('admin-rank-gate-plays', { defaultValue: 'Total plays' })}
          value={String(evidence.plays)}
          target={t('admin-rank-gate-target', {
            defaultValue: 'of {{needed}}',
            needed: SHOW_MIN_PLAYS,
          })}
          passed={evidence.plays >= SHOW_MIN_PLAYS}
        />
        <Gate
          icon={Sparkles}
          label={t('admin-rank-gate-clear-rate', { defaultValue: 'Clear rate' })}
          value={
            clearRate === null
              ? t('admin-rank-no-runs', { defaultValue: 'no runs' })
              : `${(clearRate * 100).toFixed(1)}%`
          }
          target={t('admin-rank-gate-clear-target', {
            defaultValue: 'at least {{needed}}%',
            needed: (SHOW_MIN_CLEAR_RATE * 100).toFixed(0),
          })}
          passed={clearRate !== null && clearRate >= SHOW_MIN_CLEAR_RATE}
        />
      </dl>

      {evidence.blockers.length > 0 && (
        <p className="mt-3 text-sm text-site-text-muted">
          <span className="font-semibold text-site-warning">
            {t('admin-rank-blockers', { defaultValue: 'Blocked by:' })}
          </span>{' '}
          {evidence.blockers.map((blocker) => blockerLabel(blocker, t)).join(', ')}
        </p>
      )}

      {row.rankStatus === 'ranked' && !evidence.eligible && (
        <p className="mt-2 text-sm text-site-warning">
          {t('admin-rank-slipped', {
            defaultValue:
              'This chart no longer meets the automatic gate. Nothing demotes it on its own — a rating built on it stays until a human decides.',
          })}
        </p>
      )}
    </li>
  );
}

function Gate({
  icon: Icon,
  label,
  value,
  target,
  passed,
}: {
  icon: typeof Users;
  label: string;
  value: string;
  target: string;
  passed: boolean;
}) {
  return (
    <div className="glass-inset rounded-site-sm p-3">
      <dt className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-site-text-dim">
        <Icon className="size-3.5" aria-hidden="true" />
        {label}
      </dt>
      <dd className="mt-1 flex items-baseline gap-2">
        <span
          className={
            passed
              ? 'text-base font-semibold text-site-text'
              : 'text-base font-semibold text-site-warning'
          }
        >
          {value}
        </span>
        <span className="text-xs text-site-text-dim">{target}</span>
        {passed ? (
          <Check className="size-3.5 shrink-0 text-site-success" aria-hidden="true" />
        ) : (
          <X className="size-3.5 shrink-0 text-site-warning" aria-hidden="true" />
        )}
      </dd>
    </div>
  );
}

function StateBadge({ state }: { state: string }) {
  const { t } = useTranslation('r-slice-it');
  const tone =
    state === 'ranked'
      ? 'bg-site-success/10 text-site-success'
      : state === 'qualified'
        ? 'bg-site-accent/10 text-site-accent'
        : 'bg-site-bg text-site-text-dim';
  const label =
    state === 'ranked'
      ? t('admin-rank-state-ranked', { defaultValue: 'Ranked' })
      : state === 'qualified'
        ? t('admin-rank-state-qualified', { defaultValue: 'Qualified' })
        : t('admin-rank-state-unranked', { defaultValue: 'Unranked' });
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${tone}`}
    >
      {label}
    </span>
  );
}

/** `QualifyBlocker` codes, spelled out. */
function blockerLabel(code: string, t: (key: string, options: { defaultValue: string }) => string) {
  switch (code) {
    case 'not-public':
      return t('admin-rank-blocker-not-public', { defaultValue: 'still a draft' });
    case 'lint-errors':
      return t('admin-rank-blocker-lint', { defaultValue: 'has lint errors' });
    case 'too-few-players':
      return t('admin-rank-blocker-players', { defaultValue: 'too few distinct players' });
    case 'too-few-plays':
      return t('admin-rank-blocker-plays', { defaultValue: 'too few plays' });
    case 'clear-rate-unknown':
      return t('admin-rank-blocker-no-runs', { defaultValue: 'nobody has played it' });
    case 'clear-rate-too-low':
      return t('admin-rank-blocker-clear-rate', { defaultValue: 'clear rate below the floor' });
    case 'not-found':
      return t('admin-rank-blocker-missing', { defaultValue: 'chart row is missing' });
    default:
      return code;
  }
}
