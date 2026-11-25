/**
 * RunsScreen — "Your runs": the member's finished solo runs (verified numbers, the refusal in words) and their co-op
 * matches (teammates by their current names), paged by cursor. In the game's own look (L8). Every number shown is the
 * server's: a verified run's replay, a co-op match as the hub recorded it.
 */
import { useCallback, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Skull, Swords, Trophy } from 'lucide-react';
import { Tabs, type TabItem } from '@/components/ui/tabs';
import { useArrival } from '@/components/ui/arrive';
import { useRefusalText } from '@/components/errors/useRefusalText';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';
import { api } from '@/lib/contract/client';
import { formatClockSeconds } from '@/lib/core/format';
import { cn } from '@/lib/utils';
import { HttpError } from '@/lib/http';
import { getAltairRunsApi } from '@features/altair/engine/altair.contract';
import { CLASSES } from '@features/altair/engine/data/classes';
import CoopRecordLine from './CoopRecordLine';
import type {
  CoopMatchView,
  RejectReasonView,
  RunsKind,
  SoloRunView,
  TeammateView,
} from '@features/altair/engine/runs';

interface RunsScreenProps {
  onBack: () => void;
}

function className(classId: string): string {
  return CLASSES.find((c) => c.id === classId)?.name ?? classId;
}

export default function RunsScreen({ onBack }: RunsScreenProps) {
  const { t } = useTranslation('altair-runs');
  const refusalText = useRefusalText();
  const [kind, setKind] = useState<RunsKind>('solo');
  // s14-20: opening the screen moves focus to its heading, so a keyboard or screen-reader member lands in it. A stable
  // callback ref runs once when the heading mounts (no effect, no animation frame).
  const focusHeading = useCallback((el: HTMLHeadingElement | null) => el?.focus(), []);

  const query = useInfiniteQuery({
    queryKey: [getAltairRunsApi.path, kind],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      api(getAltairRunsApi, { query: pageParam ? { kind, cursor: pageParam } : { kind }, signal }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    staleTime: 0,
    retry: false,
  });
  const arrival = useArrival(!query.isPending);

  const tabs: TabItem[] = [
    { id: 'solo', label: t('tab-solo', { defaultValue: 'Solo' }) },
    { id: 'coop', label: t('tab-coop', { defaultValue: 'Co-op' }) },
  ];

  const pages = query.data?.pages ?? [];
  const soloRuns: SoloRunView[] = pages.flatMap((p) => (p.kind === 'solo' ? p.runs : []));
  const matches: CoopMatchView[] = pages.flatMap((p) => (p.kind === 'coop' ? p.matches : []));
  // The record rides on the first co-op page only.
  const firstPage = pages[0];
  const coopRecord = firstPage?.kind === 'coop' ? (firstPage.coopRecord ?? null) : null;
  const signedOut = query.error instanceof HttpError && query.error.status === 401;

  return (
    <div className="altair-scan flex flex-col items-center flex-1 px-4 pt-4 pb-12">
      <div className="w-full max-w-xl">
        <h2 ref={focusHeading} tabIndex={-1} className="text-xl font-semibold text-(--altair-text) mb-3">
          {t('title', { defaultValue: 'Your runs' })}
        </h2>
        <Tabs
          tabs={tabs}
          value={kind}
          onChange={(id) => setKind(id === 'coop' ? 'coop' : 'solo')}
          aria-label={t('tabs-label', { defaultValue: 'Run type' })}
          dense
          className="mb-3"
        />

        {query.isPending && (
          <p className="text-sm text-(--altair-text-muted) py-6 text-center" role="status">
            {t('loading', { defaultValue: 'Loading your runs' })}
          </p>
        )}
        {signedOut && (
          <p className={cn('text-sm text-(--altair-text-muted) py-6 text-center', arrival)}>
            {t('signed-out', { defaultValue: 'Sign in to see your runs' })}
          </p>
        )}
        {query.isError && !signedOut && (
          <div className={cn('py-6 text-center', arrival)}>
            <p className="text-sm text-(--altair-danger)" role="alert">
              {refusalText(query.error)}
            </p>
            <button
              type="button"
              onClick={() => void query.refetch()}
              className="altair-btn altair-btn--ghost mt-3 px-4 py-2"
            >
              {t('retry', { defaultValue: 'Try again' })}
            </button>
          </div>
        )}
        {query.isSuccess && (
          <div className={arrival}>
            {kind === 'coop' && coopRecord && <CoopRecordLine record={coopRecord} />}
            <RunsList kind={kind} soloRuns={soloRuns} matches={matches} />
            {query.hasNextPage && (
              <button
                type="button"
                onClick={() => void query.fetchNextPage()}
                disabled={query.isFetchingNextPage}
                className="altair-btn altair-btn--ghost mt-3 w-full py-2"
              >
                {t('load-more', { defaultValue: 'Show more' })}
              </button>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={onBack}
          data-altair-sfx="menu_back"
          className="altair-btn altair-btn--ghost mt-4 w-full py-3"
        >
          {t('back', { defaultValue: 'Back' })}
        </button>
      </div>
    </div>
  );
}

/** The loaded rows of one view, or its empty line. Pure of data fetching, so it renders to markup in a test. */
export function RunsList({
  kind,
  soloRuns,
  matches,
}: {
  kind: RunsKind;
  soloRuns: SoloRunView[];
  matches: CoopMatchView[];
}) {
  const { t } = useTranslation('altair-runs');
  const empty = kind === 'solo' ? soloRuns.length === 0 : matches.length === 0;
  if (empty) {
    return (
      <p className="text-sm text-(--altair-text-muted) py-6 text-center">
        {t('empty', { defaultValue: 'No finished runs yet' })}
      </p>
    );
  }
  return (
    <ul className="m-0 p-0 list-none">
      {kind === 'solo'
        ? soloRuns.map((run) => <SoloRunRow key={run.id} run={run} />)
        : matches.map((match) => <CoopMatchRow key={match.id} match={match} />)}
    </ul>
  );
}

function StatusWords({ run }: { run: SoloRunView }) {
  const { t } = useTranslation('altair-runs');
  switch (run.status) {
    case 'verified':
      return <>{t('status-verified', { defaultValue: 'Verified' })}</>;
    case 'submitted':
      return <>{t('status-submitted', { defaultValue: 'Being checked' })}</>;
    case 'rejected':
      return <>{t('status-rejected', { defaultValue: 'Refused' })}</>;
    case 'unverified':
      return <>{t('status-unverified', { defaultValue: 'Not checked' })}</>;
    case 'abandoned':
      return <>{t('status-abandoned', { defaultValue: 'Abandoned' })}</>;
    case 'expired':
      return <>{t('status-expired', { defaultValue: 'Expired' })}</>;
  }
}

function ReasonWords({ reason }: { reason: RejectReasonView }) {
  const { t } = useTranslation('altair-runs');
  switch (reason) {
    case 'invalid_log':
      return <>{t('reason-invalid-log', { defaultValue: 'The recording of the run was not readable' })}</>;
    case 'setup_mismatch':
      return <>{t('reason-setup-mismatch', { defaultValue: 'The run did not start the way the server issued it' })}</>;
    case 'stale_sim':
      return (
        <>
          {t('reason-stale-sim', { defaultValue: 'The game was updated during the run, so it could not be replayed' })}
        </>
      );
    case 'too_long_for_wall_clock':
      return <>{t('reason-too-long', { defaultValue: 'The run lasted longer than the time it took' })}</>;
    case 'illegal_event':
      return <>{t('reason-illegal-event', { defaultValue: 'The recording held an input the game does not allow' })}</>;
    case 'stalled':
      return <>{t('reason-stalled', { defaultValue: 'The run stopped making progress' })}</>;
    case 'end_mismatch':
      return <>{t('reason-end-mismatch', { defaultValue: 'The replay ended differently from the run' })}</>;
    case 'step_mismatch':
      return <>{t('reason-step-mismatch', { defaultValue: 'The replay took a different number of steps' })}</>;
    case 'timeout':
      return <>{t('reason-timeout', { defaultValue: 'The replay took too long to check' })}</>;
    case 'claim_mismatch':
      return <>{t('reason-claim-mismatch', { defaultValue: 'The numbers sent did not match the replay' })}</>;
    case 'error':
      return <>{t('reason-error', { defaultValue: 'The server hit an error while checking the run' })}</>;
    case 'no_run':
      return <>{t('reason-no-run', { defaultValue: 'The server had no record of this run' })}</>;
    case 'unknown':
      return <>{t('reason-unknown', { defaultValue: 'The run could not be checked' })}</>;
  }
}

function SoloRunRow({ run }: { run: SoloRunView }) {
  const { t } = useTranslation('altair-runs');
  const fmt = useLocaleFormat();
  const result = run.result;
  return (
    <li className="border-b border-(--altair-border) py-3">
      <div className="flex items-baseline gap-2">
        <span className="flex-1 min-w-0 truncate text-sm font-semibold text-(--altair-text)">
          {className(run.classId)}
          {run.doubleTime && (
            <span className="ml-2 text-xs font-normal text-(--altair-warning)">
              {t('double-time', { defaultValue: 'Double Time' })}
            </span>
          )}
        </span>
        <span className="text-xs text-(--altair-text-muted)">
          <StatusWords run={run} />
        </span>
      </div>
      <p className="text-xs text-(--altair-text-dim) mt-0.5">
        {fmt.dateTime(run.issuedAt, { dateStyle: 'medium', timeStyle: 'short' })}
      </p>
      {result && (
        <p className="text-sm text-(--altair-text) mt-1 tabular-nums flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="inline-flex items-center gap-1">
            {result.outcome === 'victory' ? (
              <Trophy size={13} aria-hidden="true" />
            ) : (
              <Skull size={13} aria-hidden="true" />
            )}
            {t('survived', { defaultValue: 'Survived {{time}}', time: formatClockSeconds(result.timeSurvived) })}
          </span>
          <span>
            {t('kills', { defaultValue: '{{count}} kill', defaultValue_other: '{{count}} kills', count: result.kills })}
          </span>
          <span>{t('level', { defaultValue: 'Level {{level}}', level: result.level })}</span>
          <span>
            {t('bosses', {
              defaultValue: '{{count}} boss',
              defaultValue_other: '{{count}} bosses',
              count: result.bosses,
            })}
          </span>
        </p>
      )}
      {run.status === 'verified' && run.coinsCredited > 0 && (
        <p className="text-xs text-(--altair-amber) mt-1 tabular-nums">
          {t('coins', { defaultValue: '{{coins}} coins', coins: fmt.number(run.coinsCredited) })}
          {run.firstClear && <> · {t('first-clear', { defaultValue: 'First clear' })}</>}
        </p>
      )}
      {run.reason && (
        <p className="text-xs text-(--altair-danger) mt-1">
          <ReasonWords reason={run.reason} />
        </p>
      )}
    </li>
  );
}

function TeammateName({ mate }: { mate: TeammateView }) {
  const { t } = useTranslation('altair-runs');
  switch (mate.kind) {
    case 'player':
      return <bdi dir="auto">{mate.name}</bdi>;
    case 'deleted':
      return <>{t('deleted-user', { defaultValue: 'Deleted user' })}</>;
    case 'blocked':
      return <>{t('a-player', { defaultValue: 'A player' })}</>;
  }
}

function CoopMatchRow({ match }: { match: CoopMatchView }) {
  const { t } = useTranslation('altair-runs');
  const fmt = useLocaleFormat();
  const duration = match.durationMs === null ? null : formatClockSeconds(match.durationMs / 1000);
  return (
    <li className="border-b border-(--altair-border) py-3">
      <div className="flex items-baseline gap-2">
        <span className="flex-1 min-w-0 truncate text-sm font-semibold text-(--altair-text)">
          <Swords size={13} className="inline mr-1" aria-hidden="true" />
          {match.victory ? t('victory', { defaultValue: 'Victory' }) : t('defeat', { defaultValue: 'Defeat' })}
          {match.doubleTime && (
            <span className="ml-2 text-xs font-normal text-(--altair-warning)">
              {t('double-time', { defaultValue: 'Double Time' })}
            </span>
          )}
        </span>
        <span className="text-xs text-(--altair-text-muted) tabular-nums">
          {t('players', {
            defaultValue: '{{count}} player',
            defaultValue_other: '{{count}} players',
            count: match.playerCount,
          })}
          {duration && <> · {duration}</>}
        </span>
      </div>
      <p className="text-xs text-(--altair-text-dim) mt-0.5">
        {fmt.dateTime(match.playedAt, { dateStyle: 'medium', timeStyle: 'short' })}
      </p>
      <p className="text-sm text-(--altair-text) mt-1 tabular-nums flex flex-wrap items-center gap-x-3 gap-y-1">
        <span>{className(match.me.classId)}</span>
        <span>
          {t('kills', { defaultValue: '{{count}} kill', defaultValue_other: '{{count}} kills', count: match.me.kills })}
        </span>
        <span>{t('level', { defaultValue: 'Level {{level}}', level: match.me.finalLevel })}</span>
        <span>
          {t('survived', { defaultValue: 'Survived {{time}}', time: formatClockSeconds(match.me.timeSurvived) })}
        </span>
      </p>
      {match.teammates.length > 0 && (
        <p className="text-xs text-(--altair-text-muted) mt-1">
          {t('with', { defaultValue: 'With' })}{' '}
          {match.teammates.map((mate, i) => (
            <span key={`${mate.kind}-${i}`}>
              {i > 0 && ', '}
              <TeammateName mate={mate} />
              {' ('}
              {className(mate.classId)}
              {')'}
            </span>
          ))}
        </p>
      )}
    </li>
  );
}
