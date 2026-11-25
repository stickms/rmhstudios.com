/**
 * YourMatches — "Your matches": the member's finished versus matches (place, score, combo, solved and missed, the other
 * players by their current names), paged by cursor. In the game's own look (L8).
 *
 * The game's UI uses no React Query (it stays ready to become a real island), so the read is a hook the menu owns:
 * `open()` and `more()` are called from click handlers and call `api()`; nothing fetches from an effect.
 * Scores in versus matches are reported by each player's game and are never verified, which the list says once.
 */
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useArrival } from '@/components/ui/arrive';
import { useRefusalText } from '@/components/errors/useRefusalText';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';
import { api } from '@/lib/contract/client';
import { HttpError } from '@/lib/http';
import { cn } from '@/lib/utils';
import { MenuBackdrop } from './MenuBackdrop';
import { getSynapseStormMatchesApi } from '@features/synapse-storm/engine/matches.contract';
import type { MatchView, OtherPlayerView } from '@features/synapse-storm/engine/matches';

type LoadStatus = 'idle' | 'loading' | 'ready' | 'error' | 'signed-out';

export interface YourMatchesState {
  status: LoadStatus;
  matches: MatchView[];
  nextCursor: string | null;
  loadingMore: boolean;
  /** A failed "Show more": the rows already shown stay. */
  moreFailed: boolean;
  error: unknown;
}

const IDLE: YourMatchesState = {
  status: 'idle',
  matches: [],
  nextCursor: null,
  loadingMore: false,
  moreFailed: false,
  error: null,
};

/** The matches read. `open()` starts over from the newest page; `more()` appends the next one. */
export function useYourMatches() {
  const [state, setStateRaw] = useState<YourMatchesState>(IDLE);
  // The latest state, readable from a click handler without a side effect inside a state updater.
  const latest = useRef<YourMatchesState>(IDLE);
  // A reply that arrives after a newer `open()` is dropped.
  const generation = useRef(0);

  const setState = useCallback((next: (prev: YourMatchesState) => YourMatchesState) => {
    latest.current = next(latest.current);
    setStateRaw(latest.current);
  }, []);

  const open = useCallback(() => {
    const mine = ++generation.current;
    setState(() => ({ ...IDLE, status: 'loading' }));
    api(getSynapseStormMatchesApi, { query: {} }).then(
      (page) => {
        if (generation.current !== mine) return;
        setState(() => ({ ...IDLE, status: 'ready', matches: page.matches, nextCursor: page.nextCursor }));
      },
      (error: unknown) => {
        if (generation.current !== mine) return;
        const signedOut = error instanceof HttpError && error.status === 401;
        setState(() => ({ ...IDLE, status: signedOut ? 'signed-out' : 'error', error }));
      },
    );
  }, [setState]);

  const more = useCallback(() => {
    const mine = generation.current;
    const cursor = latest.current.nextCursor;
    if (latest.current.status !== 'ready' || !cursor || latest.current.loadingMore) return;
    setState((prev) => ({ ...prev, loadingMore: true, moreFailed: false }));
    api(getSynapseStormMatchesApi, { query: { cursor } }).then(
      (page) => {
        if (generation.current !== mine) return;
        setState((cur) => ({
          ...cur,
          matches: [...cur.matches, ...page.matches],
          nextCursor: page.nextCursor,
          loadingMore: false,
          moreFailed: false,
        }));
      },
      (error: unknown) => {
        if (generation.current !== mine) return;
        setState((cur) => ({ ...cur, loadingMore: false, moreFailed: true, error }));
      },
    );
  }, [setState]);

  return { state, open, more };
}

/** The menu's entry: one ghost button that opens the list. */
export function OpenMatchesButton({ onOpen }: { onOpen: () => void }) {
  const { t } = useTranslation('synapse-matches');
  return (
    <button type="button" className="ssm-btn ssm-btn--ghost ssm-btn--wide" onClick={onOpen}>
      {t('open', { defaultValue: 'YOUR MATCHES' })}
    </button>
  );
}

function OtherName({ other }: { other: OtherPlayerView }) {
  const { t } = useTranslation('synapse-matches');
  switch (other.kind) {
    case 'player':
      return <bdi dir="auto">{other.name}</bdi>;
    case 'deleted':
      return <>{t('deleted-user', { defaultValue: 'Deleted user' })}</>;
    case 'anonymous':
      return <>{t('a-player', { defaultValue: 'A player' })}</>;
  }
}

/** The loaded rows, or the empty line. Pure of data fetching, so it renders to markup in a test. */
export function MatchesList({ matches }: { matches: MatchView[] }) {
  const { t } = useTranslation('synapse-matches');
  if (matches.length === 0) {
    return <p className="ssm-matches__note">{t('empty', { defaultValue: 'No finished matches yet' })}</p>;
  }
  return (
    <ul className="ssm-matches__list">
      {matches.map((match) => (
        <MatchRow key={match.id} match={match} />
      ))}
    </ul>
  );
}

function MatchRow({ match }: { match: MatchView }) {
  const { t } = useTranslation('synapse-matches');
  const fmt = useLocaleFormat();
  return (
    <li className="ssm-matches__row">
      <div className="ssm-matches__head">
        <span className="ssm-matches__place">
          {t('place-of', {
            defaultValue: 'Place {{place}} of {{players}}',
            place: match.place,
            players: match.players,
          })}
        </span>
        <span className="ssm-matches__when">
          {fmt.dateTime(match.endedAt, { dateStyle: 'medium', timeStyle: 'short' })}
        </span>
      </div>
      <p className="ssm-matches__stats">
        <span>{t('score', { defaultValue: 'Score {{score}}', score: fmt.number(match.score) })}</span>
        <span>{t('combo', { defaultValue: 'Best combo {{combo}}', combo: fmt.number(match.maxCombo) })}</span>
        <span>{t('solved', { defaultValue: 'Solved {{solved}}', solved: fmt.number(match.solved) })}</span>
        <span>{t('missed', { defaultValue: 'Missed {{missed}}', missed: fmt.number(match.missed) })}</span>
        {!match.finished && <span>{t('left-early', { defaultValue: 'Left early' })}</span>}
      </p>
      {match.others.length > 0 && (
        <p className="ssm-matches__others">
          {t('against', { defaultValue: 'Against' })}{' '}
          {match.others.map((other, i) => (
            <span key={`${other.kind}-${i}`}>
              {i > 0 && ', '}
              <OtherName other={other} />
            </span>
          ))}
        </p>
      )}
    </li>
  );
}

interface YourMatchesProps {
  state: YourMatchesState;
  onMore: () => void;
  onRetry: () => void;
  onBack: () => void;
}

export function YourMatches({ state, onMore, onRetry, onBack }: YourMatchesProps) {
  const { t } = useTranslation('synapse-matches');
  const refusalText = useRefusalText();
  const arrival = useArrival(state.status === 'ready');
  const loading = state.status === 'idle' || state.status === 'loading';
  return (
    <div className="ssm-screen">
      <MenuBackdrop />
      <div className="ssm-scroll">
        <div className="ss-mp-menu-content">
          <h1 className="ss-mp-title">{t('title', { defaultValue: 'Your matches' })}</h1>
          <p className="ss-mp-subtitle">
            {t('honesty', { defaultValue: "Scores in versus matches are reported by each player's game" })}
          </p>
          <div className="ssm-panel ssm-panel--cyan ssm-card ssm-matches">
            {loading && (
              <p className="ssm-matches__note" role="status">
                {t('loading', { defaultValue: 'Loading your matches' })}
              </p>
            )}
            {state.status === 'signed-out' && (
              <p className={cn('ssm-matches__note', arrival)}>
                {t('signed-out', { defaultValue: 'Sign in to see your matches' })}
              </p>
            )}
            {state.status === 'error' && (
              <div className="ssm-matches__note">
                <p className="ss-mp-error" role="alert">
                  {refusalText(state.error)}
                </p>
                <button type="button" className="ssm-btn ssm-btn--secondary" onClick={onRetry}>
                  {t('retry', { defaultValue: 'Try again' })}
                </button>
              </div>
            )}
            {state.status === 'ready' && (
              <div className={arrival}>
                <MatchesList matches={state.matches} />
                {state.moreFailed && (
                  <p className="ss-mp-error" role="alert">
                    {refusalText(state.error)}
                  </p>
                )}
                {state.nextCursor && (
                  <button
                    type="button"
                    className="ssm-btn ssm-btn--secondary ssm-btn--wide ssm-matches__more"
                    onClick={onMore}
                    disabled={state.loadingMore}
                  >
                    {t('load-more', { defaultValue: 'Show more' })}
                  </button>
                )}
              </div>
            )}
            <button type="button" className="ssm-btn ssm-btn--ghost ssm-leave" onClick={onBack}>
              {t('back', { defaultValue: 'Back' })}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
