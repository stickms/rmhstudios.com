/**
 * "Your co-op runs": the finished co-op runs the member played in, newest first, 20 a page, with the other players
 * under their current names ("A player" where one is hidden, banned or across a block, "Deleted user" where the account
 * is gone). In the game's own look (L8).
 *
 * Dream Rift is an island with no React Query: the read is a hook this entry owns, `open()` and `more()` are called
 * from click handlers and nothing fetches from an effect. Scores are the host's claim and are never verified.
 */
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useRefusalText } from '@/components/errors/useRefusalText';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useArrival } from '@/components/ui/arrive';
import { useFocusReturn } from '@/components/shared/useFocusReturn';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';
import { api } from '@/lib/contract/client';
import { formatClockSeconds } from '@/lib/core/format';
import { HttpError } from '@/lib/http';
import { cn } from '@/lib/utils';
import { listMyDreamRiftCoopApi } from '@features/dream-rift/engine/dream-rift.contract';
import type { CoopPlayerView, MyCoopRun } from '@features/dream-rift/engine/coop-runs';

type LoadStatus = 'idle' | 'loading' | 'ready' | 'error' | 'signed-out';

export interface YourCoopRunsState {
  status: LoadStatus;
  runs: MyCoopRun[];
  nextCursor: string | null;
  loadingMore: boolean;
  /** A failed "Show more": the rows already shown stay. */
  moreFailed: boolean;
  error: unknown;
}

const IDLE: YourCoopRunsState = {
  status: 'idle',
  runs: [],
  nextCursor: null,
  loadingMore: false,
  moreFailed: false,
  error: null,
};

/** The runs read. `open()` starts over from the newest page; `more()` appends the next one. */
export function useYourCoopRuns() {
  const [state, setStateRaw] = useState<YourCoopRunsState>(IDLE);
  // The latest state, readable from a click handler without a side effect inside a state updater.
  const latest = useRef<YourCoopRunsState>(IDLE);
  // A reply that arrives after a newer `open()` is dropped.
  const generation = useRef(0);

  const setState = useCallback((next: (prev: YourCoopRunsState) => YourCoopRunsState) => {
    latest.current = next(latest.current);
    setStateRaw(latest.current);
  }, []);

  const open = useCallback(() => {
    const mine = ++generation.current;
    setState(() => ({ ...IDLE, status: 'loading' }));
    api(listMyDreamRiftCoopApi, { query: {} }).then(
      (page) => {
        if (generation.current !== mine) return;
        setState(() => ({ ...IDLE, status: 'ready', runs: page.runs, nextCursor: page.nextCursor }));
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
    api(listMyDreamRiftCoopApi, { query: { cursor } }).then(
      (page) => {
        if (generation.current !== mine) return;
        setState((cur) => ({
          ...cur,
          runs: [...cur.runs, ...page.runs],
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

function OtherName({ player }: { player: CoopPlayerView }) {
  const { t } = useTranslation('dream-rift-coop');
  if (player.kind === 'deleted') return <>{t('deleted-user', { defaultValue: 'Deleted user' })}</>;
  if (player.name) return <bdi dir="auto">{player.name}</bdi>;
  return <>{t('a-player', { defaultValue: 'A player' })}</>;
}

function RunRow({ run }: { run: MyCoopRun }) {
  const { t } = useTranslation('dream-rift-coop');
  const fmt = useLocaleFormat();
  return (
    <li className="drm-row">
      <div className="min-w-0">
        <div className="drm-row__name">
          {t('run-score', { defaultValue: 'Score {{score}}', score: fmt.number(run.combinedScore) })}
        </div>
        <div className="drm-row__meta">
          {t('run-meta', {
            defaultValue: '{{difficulty}} · stage {{stage}} · {{time}}',
            difficulty: run.difficulty,
            stage: run.stageReached,
            time: formatClockSeconds(run.timeSurvived),
          })}
          {run.cleared ? ` · ${t('run-cleared', { defaultValue: 'cleared' })}` : ''}
        </div>
        <div className="drm-row__meta">{fmt.dateTime(run.endedAt, { dateStyle: 'medium', timeStyle: 'short' })}</div>
        {run.players.length > 0 && (
          <div className="drm-row__meta">
            {t('run-with', { defaultValue: 'With' })}{' '}
            {run.players.map((p, i) => (
              <span key={i}>
                {i > 0 && ', '}
                <OtherName player={p} />
              </span>
            ))}
          </div>
        )}
      </div>
    </li>
  );
}

/** The loaded rows, or the empty line. Pure of data fetching, so it renders to markup in a test. */
export function CoopRunsList({ runs }: { runs: MyCoopRun[] }) {
  const { t } = useTranslation('dream-rift-coop');
  if (runs.length === 0) {
    return <div className="drm-empty">{t('runs-empty', { defaultValue: 'No co-op runs yet' })}</div>;
  }
  return (
    <ul className="drm-list">
      {runs.map((run) => (
        <RunRow key={run.id} run={run} />
      ))}
    </ul>
  );
}

/** The entry on the multiplayer screen: one ghost button that opens the list in a dialog. */
export function YourCoopRunsEntry() {
  const { t } = useTranslation('dream-rift-coop');
  const refusalText = useRefusalText();
  const returnFocus = useFocusReturn();
  const { state, open, more } = useYourCoopRuns();
  const [shown, setShown] = useState(false);
  const arrival = useArrival(state.status === 'ready');
  const loading = state.status === 'idle' || state.status === 'loading';

  return (
    <>
      <button
        type="button"
        className="drm-btn drm-btn--ghost mt-7"
        onClick={() => {
          setShown(true);
          open();
        }}
      >
        <span className="drm-btn__label">{t('your-runs', { defaultValue: 'Your co-op runs' })}</span>
      </button>
      {shown && (
        <Dialog open onOpenChange={(next) => !next && setShown(false)}>
          <DialogContent
            hideClose
            onCloseAutoFocus={returnFocus}
            overlayClassName="bg-black/80"
            data-liquid-material="off"
            data-dialog-shell="bare"
            className="max-w-md gap-0 rounded-none border-0 bg-transparent p-0 shadow-none"
          >
            <div className="drm-dialog">
              <DialogTitle className="drm-h">{t('your-runs', { defaultValue: 'Your co-op runs' })}</DialogTitle>
              <DialogDescription className="drm-muted">
                {t('runs-honesty', { defaultValue: "Scores are reported by the host's game" })}
              </DialogDescription>
              {loading && (
                <div className="drm-empty" role="status">
                  {t('runs-loading', { defaultValue: 'Loading your runs' })}
                </div>
              )}
              {state.status === 'signed-out' && (
                <div className={cn('drm-empty', arrival)}>
                  {t('runs-signed-out', { defaultValue: 'Sign in to see your co-op runs' })}
                </div>
              )}
              {state.status === 'error' && (
                <div className="drm-empty">
                  <p className="drm-error" role="alert">
                    {refusalText(state.error)}
                  </p>
                  <button type="button" className="drm-btn drm-btn--ghost" onClick={open}>
                    <span className="drm-btn__label">{t('runs-retry', { defaultValue: 'Try again' })}</span>
                  </button>
                </div>
              )}
              {state.status === 'ready' && (
                <div className={arrival}>
                  <CoopRunsList runs={state.runs} />
                  {state.moreFailed && (
                    <p className="drm-error" role="alert">
                      {refusalText(state.error)}
                    </p>
                  )}
                  {state.nextCursor && (
                    <button
                      type="button"
                      className="drm-btn drm-btn--ghost w-full"
                      onClick={more}
                      disabled={state.loadingMore}
                    >
                      <span className="drm-btn__label">{t('runs-more', { defaultValue: 'Show more' })}</span>
                    </button>
                  )}
                </div>
              )}
              <DialogClose className="drm-btn drm-btn--primary w-full">
                <span className="drm-btn__label">{t('runs-close', { defaultValue: 'Close' })}</span>
              </DialogClose>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
