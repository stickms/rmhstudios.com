/**
 * "Your season" on the Ranked tab of /compete (sprint 13 #13): the signed-in member's own standing in each ranked game
 * this season, above the ladder. Rating and tier or the placement matches left, the record, the place on the ladder
 * (a count, never another member's name), the decay sentence, and the season's end with a 1px progress rule.
 *
 * Read with React Query when the tab opens, and again after a ranked match is reported (`RankedColumn` invalidates
 * {@link RANKED_STANDING_QUERY_KEY}); no polling. Rows on rules, `t-*` type, no colour for a tier (a tier is a word).
 */
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { apiQuery } from '@/lib/contract/client';
import { getRankedStandingApi } from '@/lib/ranked/ranked.contract';
import {
  decayNotice,
  placeSummary,
  splitPlayed,
  type RankedStandingGame,
  type RankedStandingResponse,
} from '@/lib/ranked/standing';
import { Skeleton } from '@/components/ui/skeleton';
import { useArrival } from '@/components/ui/arrive';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';

/** Invalidate this (by prefix) after a ranked result is reported. */
export const RANKED_STANDING_QUERY_KEY = [getRankedStandingApi.path] as const;

export type RankedStandingState =
  { kind: 'signed-out' } | { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; data: RankedStandingResponse };

/** The container: reads the standing for a signed-in member and hands the state to the view. */
export function RankedStanding({ signedIn }: { signedIn: boolean }) {
  const query = useQuery({ ...apiQuery(getRankedStandingApi), enabled: signedIn, retry: false });
  const state: RankedStandingState = !signedIn
    ? { kind: 'signed-out' }
    : query.data
      ? { kind: 'ready', data: query.data }
      : query.isError
        ? { kind: 'error' }
        : { kind: 'loading' };
  return <RankedStandingView state={state} />;
}

export function RankedStandingView({ state }: { state: RankedStandingState }) {
  const { t } = useTranslation('ranked-standing');
  const arrival = useArrival(state.kind !== 'loading');

  return (
    <section aria-labelledby="ranked-standing-heading">
      <h2 id="ranked-standing-heading" className="site-section-label mb-3">
        {t('heading', { defaultValue: 'Your season' })}
      </h2>
      {state.kind === 'signed-out' && (
        <p className="t-body text-site-text-muted">
          {t('signed-out', { defaultValue: 'Sign in to see your standing this season.' })}
        </p>
      )}
      {state.kind === 'loading' && (
        <div aria-busy="true" className="space-y-3">
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      )}
      {state.kind === 'error' && (
        <p role="alert" className="t-body text-site-text-muted">
          {t('error', { defaultValue: 'Could not load your standing.' })}
        </p>
      )}
      {state.kind === 'ready' && (
        <div className={arrival}>
          <StandingBody data={state.data} />
        </div>
      )}
    </section>
  );
}

function StandingBody({ data }: { data: RankedStandingResponse }) {
  const { t } = useTranslation('ranked-standing');
  const fmt = useLocaleFormat();
  const { played, unplayed } = splitPlayed(data.games);
  const percent = Math.round(Math.min(1, Math.max(0, data.progress)) * 100);

  return (
    <div>
      <div className="mb-3">
        <p className="t-meta">
          {t('season-ends', {
            season: data.season,
            date: fmt.date(data.endsAt, { dateStyle: 'medium' }),
            defaultValue: 'Season {{season}} ends {{date}}',
          })}
        </p>
        <div
          role="progressbar"
          aria-label={t('season-progress', { defaultValue: 'Season progress' })}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          className="mt-2 h-px w-full bg-site-border"
        >
          <div className="h-px bg-site-text" style={{ width: `${percent}%` }} />
        </div>
      </div>

      {played.length === 0 ? (
        <p className="t-body text-site-text-muted">{t('empty', { defaultValue: 'No ranked matches this season' })}</p>
      ) : (
        <div>
          {played.map((g) => (
            <StandingRow key={g.game} g={g} />
          ))}
        </div>
      )}

      {unplayed.length > 0 && (
        <p className="t-meta mt-3">
          {t('not-played', {
            games: unplayed.map((g) => g.name).join(', '),
            defaultValue: 'Not played this season: {{games}}',
          })}
        </p>
      )}
    </div>
  );
}

function StandingRow({ g }: { g: RankedStandingGame }) {
  const { t } = useTranslation('ranked-standing');
  const fmt = useLocaleFormat();
  const decay = decayNotice(g.shed, g.idleDays);
  const summary = placeSummary(g);

  return (
    <div className="rule-row py-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="t-body min-w-0 truncate font-medium">{g.name}</span>
        <span className="t-meta shrink-0">
          {g.rating === null ? (
            t('placement-left', {
              count: g.placementsLeft,
              defaultValue_one: 'Placement: {{count}} match left',
              defaultValue_other: 'Placement: {{count}} matches left',
            })
          ) : (
            <>
              <span className="text-site-text">{fmt.number(g.rating)}</span>
              {g.tier ? ` ${g.tier}` : ''}
            </>
          )}
        </span>
      </div>
      <p className="t-meta mt-1">
        {t('record', {
          wins: g.wins,
          losses: g.losses,
          draws: g.draws,
          defaultValue: '{{wins}}W {{losses}}L {{draws}}D',
        })}
        {' · '}
        {summary.kind === 'placed' && summary.of !== null
          ? t('place-of', {
              place: fmt.number(summary.place),
              total: fmt.number(summary.of),
              defaultValue: 'Place {{place}} of {{total}}',
            })
          : summary.kind === 'placed'
            ? t('place', { place: fmt.number(summary.place), defaultValue: 'Place {{place}}' })
            : summary.kind === 'beyond-cap'
              ? t('beyond-cap', {
                  top: fmt.number(summary.cap),
                  defaultValue: 'Outside the top {{top}}',
                })
              : t('off-ladder', { defaultValue: 'Not on the ladder' })}
      </p>
      {decay && (
        <p className="t-meta mt-1">
          {t('decay', {
            count: decay.count,
            days: decay.days,
            defaultValue_one: 'Down {{count}} point: no ranked match in {{days}} days',
            defaultValue_other: 'Down {{count}} points: no ranked match in {{days}} days',
          })}
        </p>
      )}
    </div>
  );
}
