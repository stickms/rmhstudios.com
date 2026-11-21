/**
 * The owner's controls for one replay: a Public / Unlisted switch and Delete. Used by the replay list in settings and
 * by the replay viewer, so both refuse the same things for the same reasons: a speedrun proof can be neither deleted
 * nor unlisted (the run's evidence would go), and a race ghost is always unlisted.
 */
import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { api } from '@/lib/contract/client';
import { serverError } from '@/lib/http';
import { toast } from '@/lib/toast';
import { deleteReplayApi, setReplayVisibilityApi } from '@/lib/game/replay-library.contract';
import {
  allowedActions,
  replayGameTitle,
  type LibraryReplay,
  type ReplayKind,
  type ReplayVisibility,
} from '@/lib/game/replay-library';

export interface OwnedReplay {
  id: string;
  game: string;
  score: number | null;
  kind: ReplayKind;
  visibility: ReplayVisibility;
}

/** "Lights Out, score 1,200": the name the buttons announce. */
export function useReplayName() {
  const { t, i18n } = useTranslation('replay-library');
  return (replay: Pick<OwnedReplay, 'game' | 'score'>): string => {
    const game = replayGameTitle(replay.game);
    return replay.score == null
      ? t('row-name-unscored', { defaultValue: '{{game}}, unscored', game })
      : t('row-name', {
          defaultValue: '{{game}}, score {{score}}',
          game,
          score: new Intl.NumberFormat(i18n.language).format(replay.score),
        });
  };
}

export function ReplayOwnerActions({
  replay,
  onVisibilityChanged,
  onDeleted,
}: {
  replay: OwnedReplay;
  onVisibilityChanged: (row: LibraryReplay) => void;
  onDeleted: () => void;
}) {
  const { t } = useTranslation('replay-library');
  const confirm = useConfirm();
  const replayName = useReplayName();
  const [busy, setBusy] = useState(false);
  const actions = allowedActions(replay.kind);
  const name = replayName(replay);
  const isPublic = replay.visibility === 'public';

  async function setVisibility(next: boolean) {
    setBusy(true);
    try {
      const row = await api(setReplayVisibilityApi, {
        params: { id: replay.id },
        body: { visibility: next ? 'public' : 'unlisted' },
      });
      onVisibilityChanged(row);
      toast.success(
        next
          ? t('made-public', { defaultValue: 'Replay is now public.' })
          : t('made-unlisted', { defaultValue: 'Replay is now unlisted.' }),
      );
    } catch (e) {
      toast.error(serverError(e) ?? t('visibility-failed', { defaultValue: 'Could not change the replay.' }));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    const ok = await confirm({
      title: t('delete-title', { defaultValue: 'Delete this replay?' }),
      description: t('delete-description', {
        defaultValue: 'The replay is removed for good. Anyone with its link will no longer be able to watch it.',
      }),
      confirmLabel: t('delete', { defaultValue: 'Delete' }),
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api(deleteReplayApi, { params: { id: replay.id } });
      onDeleted();
    } catch (e) {
      toast.error(serverError(e) ?? t('delete-failed', { defaultValue: 'Could not delete the replay.' }));
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <div className="flex flex-wrap items-center gap-3">
        <label className="t-body inline-flex items-center gap-2">
          <Switch
            checked={isPublic}
            onCheckedChange={(next) => void setVisibility(next)}
            disabled={busy || !actions.canChangeVisibility}
            aria-label={t('visibility-aria', {
              defaultValue: 'Public: replay of {{name}}',
              name,
            })}
          />
          {t('public', { defaultValue: 'Public' })}
        </label>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void remove()}
          disabled={busy || !actions.canDelete}
          aria-label={t('delete-aria', { defaultValue: 'Delete replay of {{name}}', name })}
        >
          <Trash2 aria-hidden />
          {t('delete', { defaultValue: 'Delete' })}
        </Button>
      </div>
      {actions.lock === 'speedrun' ? (
        <p className="t-meta max-w-prose">
          {t('lock-speedrun', {
            defaultValue: 'This replay is the proof for a speedrun entry, so it cannot be deleted or unlisted.',
          })}{' '}
          <Link to="/compete" search={{ tab: 'speedruns' }} className="underline">
            {t('lock-speedrun-link', { defaultValue: 'See speedruns' })}
          </Link>
        </p>
      ) : null}
      {actions.lock === 'ghost' ? (
        <p className="t-meta max-w-prose">
          {t('lock-ghost', { defaultValue: 'A race ghost is always unlisted.' })}
        </p>
      ) : null}
    </div>
  );
}
