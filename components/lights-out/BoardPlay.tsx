/**
 * Play a member-made Lights Out board from its link. The cells are the daily's (`LightsGrid`); there is a Restart and
 * no hint. A finished attempt sends its press sequence and the server replays it: the count shown after a solve is the
 * one the server recorded, never the page's own tally.
 */
import { lazy, Suspense, useState } from 'react';
import { useNavigate, Link } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Flag, RotateCcw, Share2, Trash2 } from 'lucide-react';
import { PageLayout } from '@/components/feed/PageLayout';
import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/ui/copy-button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useArrival } from '@/components/ui/arrive';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useRefusalText } from '@/components/errors/useRefusalText';
import { LightsGrid } from '@/components/lights-out/LightsGrid';
import { useSession } from '@/components/Providers';
import { api, apiQuery } from '@/lib/contract/client';
import { toast } from '@/lib/toast';
import {
  deleteLightsOutBoardApi,
  getLightsOutBoardApi,
  playLightsOutBoardApi,
  solveLightsOutBoardApi,
} from '@/lib/lights-out/boards.contract';
import { decodeCells, isAllowedShape, shapeName } from '@/lib/lights-out/boards';
import { isSolved, toggleCellInGrid, type Grid } from '@/lib/lights-out/lights-out';
import type { GridShape } from '@/lib/lights-out/shapes';

// The report form carries zod, which stays off this page's first load (lib/__tests__/zod-off-hot-routes.test.ts).
const ReportDialog = lazy(() =>
  import('@/components/moderation/ReportDialog').then((m) => ({ default: m.ReportDialog })),
);

interface Outcome {
  moves: number;
  best: number;
  improved: boolean;
}

function Attempt({ id, shape, start, signedIn }: { id: string; shape: GridShape; start: Grid; signedIn: boolean }) {
  const { t } = useTranslation('lights-out-maker');
  const refusalText = useRefusalText();
  const queryClient = useQueryClient();
  const [grid, setGrid] = useState<Grid>(start);
  const [presses, setPresses] = useState<[number, number][]>([]);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const solved = isSolved(grid, shape);

  async function press(r: number, c: number) {
    if (solved) return;
    const nextPresses: [number, number][] = [...presses, [r, c]];
    const next = toggleCellInGrid(grid, r, c, shape);
    setGrid(next);
    setPresses(nextPresses);
    if (!signedIn) return;
    // The first press counts as a play; the server ignores every later one.
    if (presses.length === 0) void api(playLightsOutBoardApi, { params: { id } }).catch(() => {});
    if (!isSolved(next, shape)) return;
    try {
      const res = await api(solveLightsOutBoardApi, { params: { id }, body: { presses: nextPresses } });
      setOutcome({ moves: res.moves, best: res.best, improved: res.improved });
      void queryClient.invalidateQueries({ queryKey: apiQuery(getLightsOutBoardApi, { params: { id } }).queryKey });
    } catch (e) {
      toast.error(refusalText(e));
    }
  }

  function restart() {
    setGrid(start);
    setPresses([]);
    setOutcome(null);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="mx-auto w-full max-w-sm rounded-site border border-site-border p-5">
        <LightsGrid grid={grid} shape={shape} onPress={(r, c) => void press(r, c)} disabled={solved} />
      </div>
      <p className="t-meta text-center" aria-live="polite">
        {solved
          ? t('solved-line', {
              defaultValue_one: 'Solved in {{count}} move',
              defaultValue: 'Solved in {{count}} moves',
              count: outcome?.moves ?? presses.length,
            })
          : t('moves-line', {
              defaultValue_one: '{{count}} move',
              defaultValue: '{{count}} moves',
              count: presses.length,
            })}
      </p>
      {solved && outcome ? (
        <p className="t-body text-center">
          {outcome.improved
            ? t('new-best', { defaultValue: 'New best: {{count}}', count: outcome.best })
            : t('your-best', { defaultValue: 'Your best: {{count}}', count: outcome.best })}
        </p>
      ) : null}
      {solved && !signedIn ? (
        <p className="t-body text-center text-site-text-muted">
          <Link to="/login" search={{ callbackURL: `/lights-out/b/${id}` }} className="underline">
            {t('sign-in-to-record', { defaultValue: 'Sign in to record your moves' })}
          </Link>
        </p>
      ) : null}
      <div className="flex justify-center">
        <Button type="button" onClick={restart}>
          <RotateCcw aria-hidden />
          {t('restart', { defaultValue: 'Restart' })}
        </Button>
      </div>
    </div>
  );
}

export function BoardPlay({ id }: { id: string }) {
  const { t } = useTranslation('lights-out-maker');
  const session = useSession();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const refusalText = useRefusalText();
  const [reporting, setReporting] = useState(false);
  const query = useQuery({ ...apiQuery(getLightsOutBoardApi, { params: { id } }), retry: false });
  const arrival = useArrival(!query.isPending);

  if (query.isPending) {
    return (
      <PageLayout title={t('play-title', { defaultValue: 'Lights Out board' })}>
        <div
          role="status"
          aria-label={t('loading', { defaultValue: 'Loading the board' })}
          className="flex flex-col gap-3"
        >
          <Skeleton className="mx-auto h-72 w-full max-w-sm" />
        </div>
      </PageLayout>
    );
  }
  if (query.isError || !query.data) {
    return (
      <PageLayout title={t('play-title', { defaultValue: 'Lights Out board' })}>
        <EmptyState
          title={t('missing-title', { defaultValue: 'This board is not available' })}
          description={t('missing-description', { defaultValue: 'It may have been removed.' })}
          action={
            <Button asChild>
              <Link to="/lights-out/boards">{t('see-boards', { defaultValue: 'See other boards' })}</Link>
            </Button>
          }
        />
      </PageLayout>
    );
  }

  const board = query.data.board;
  const shape = isAllowedShape(board.shape);
  const start = shape ? decodeCells(board.cells, shape) : null;
  const url = typeof window === 'undefined' ? `/lights-out/b/${id}` : `${window.location.origin}/lights-out/b/${id}`;

  async function remove() {
    const ok = await confirm({
      title: t('delete-title', { defaultValue: 'Delete this board?' }),
      description: t('delete-description', { defaultValue: 'Its link stops working and its moves are lost.' }),
      confirmLabel: t('delete-confirm', { defaultValue: 'Delete board' }),
      danger: true,
    });
    if (!ok) return;
    try {
      await api(deleteLightsOutBoardApi, { params: { id } });
      void navigate({ to: '/lights-out/boards' });
    } catch (e) {
      toast.error(refusalText(e));
    }
  }

  return (
    <PageLayout
      title={t('play-title', { defaultValue: 'Lights Out board' })}
      backTo="/lights-out/boards"
      backLabel={t('back', { defaultValue: 'Boards' })}
    >
      <div className={`flex flex-col gap-6 pb-6 ${arrival ?? ''}`}>
        <div className="flex flex-col gap-1">
          <h2 className="t-heading" dir="auto">
            {board.title}
          </h2>
          <p className="t-meta">
            {t('by', { defaultValue: 'by' })} <bdi dir="auto">{board.author.name || board.author.handle}</bdi>
            {shape ? ` · ${shapeName(shape)}` : ''}
          </p>
        </div>
        {shape && start ? (
          <Attempt key={board.cells} id={id} shape={shape} start={start} signedIn={Boolean(session.data)} />
        ) : null}

        <section aria-labelledby="lights-out-fewest-h">
          <h2 id="lights-out-fewest-h" className="t-heading">
            {t('fewest-heading', { defaultValue: 'Fewest moves' })}
          </h2>
          <p className="t-meta py-2">
            {t('best-possible', { defaultValue: 'Best possible: {{count}}', count: board.optimalMoves })}
          </p>
          {board.fewest.length === 0 ? (
            <p className="t-body py-3 text-site-text-muted">
              {t('fewest-empty', { defaultValue: 'No one has solved this board yet.' })}
            </p>
          ) : (
            <ol>
              {board.fewest.map((row) => (
                <li
                  key={`${row.rank}-${row.solvedAt}`}
                  className="flex items-center justify-between gap-3 border-b border-site-border py-3"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="t-meta w-6">{row.rank}</span>
                    <bdi className="t-body truncate" dir="auto">
                      {row.name || row.handle}
                    </bdi>
                  </span>
                  <span className="t-meta">
                    {t('row-moves', {
                      defaultValue_one: '{{count}} move',
                      defaultValue: '{{count}} moves',
                      count: row.moves,
                    })}
                  </span>
                </li>
              ))}
            </ol>
          )}
          {board.mine?.bestMoves != null ? (
            <p className="t-meta py-3">
              {t('mine-best', { defaultValue: 'Your best: {{count}}', count: board.mine.bestMoves })}
            </p>
          ) : null}
        </section>

        <div className="flex flex-wrap gap-2">
          <CopyButton value={url} icon={Share2} variant="default" toastOnCopy>
            {t('copy-link', { defaultValue: 'Copy link' })}
          </CopyButton>
          <Button
            type="button"
            onClick={() =>
              void navigate({
                to: '/share',
                search: {
                  title: '',
                  text: t('share-text', {
                    defaultValue: 'Can you turn every light off on "{{title}}"?',
                    title: board.title,
                  }),
                  url,
                  pending: '',
                },
              })
            }
          >
            {t('post-it', { defaultValue: 'Post it' })}
          </Button>
          {board.isAuthor ? (
            <Button type="button" variant="danger" onClick={() => void remove()}>
              <Trash2 aria-hidden />
              {t('delete', { defaultValue: 'Delete' })}
            </Button>
          ) : session.data ? (
            <Button type="button" variant="ghost" onClick={() => setReporting(true)}>
              <Flag aria-hidden />
              {t('report', { defaultValue: 'Report' })}
            </Button>
          ) : null}
        </div>
      </div>
      {reporting && (
        <Suspense fallback={null}>
          <ReportDialog open onOpenChange={setReporting} entityType="lights-out-board" entityId={id} />
        </Suspense>
      )}
    </PageLayout>
  );
}
