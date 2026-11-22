/** Version history for one game on /settings/cloud-saves: snapshots newest first, each with Restore and Download. */

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Download, RotateCcw } from 'lucide-react';
import { api, apiQuery, apiUrl } from '@/lib/contract/client';
import {
  downloadSaveSnapshotApi,
  listGameSavesApi,
  listSaveSnapshotsApi,
  restoreGameSaveApi,
  type SnapshotSummary,
} from '@/lib/game-saves/saves.contract';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useArrival } from '@/components/ui/arrive';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { formatSize, formatWhen } from '@/components/settings/cloud-saves-shared';

export function SaveHistory({
  gameId,
  gameName,
  currentSavedAt,
  onRestored,
}: {
  gameId: string;
  gameName: string;
  /** The live save's time, or `null` when the game has none. */
  currentSavedAt: string | null;
  onRestored: () => void;
}) {
  const { t } = useTranslation('cloud-saves');
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const query = useQuery(
    apiQuery(listSaveSnapshotsApi, {
      params: {
        gameId,
      },
    }),
  );
  const loading = query.isPending;
  const arrival = useArrival(!loading);
  const snapshots = query.data?.snapshots ?? [];

  const reasonLabel = (reason: SnapshotSummary['reason']) =>
    reason === 'before-restore'
      ? t('reason-before-restore', {
          defaultValue: 'Before a restore',
        })
      : reason === 'before-delete'
        ? t('reason-before-delete', {
            defaultValue: 'Before a delete',
          })
        : t('reason-auto', {
            defaultValue: 'Automatic',
          });

  async function restore(snapshot: SnapshotSummary) {
    const when = formatWhen(snapshot.createdAt);
    const ok = await confirm({
      title: t('restore-snapshot-title', {
        game: gameName,
        date: when,
        defaultValue: 'Restore the {{game}} save from {{date}}?',
      }),
      description: currentSavedAt
        ? t('restore-snapshot-description', {
            current: formatWhen(currentSavedAt),
            defaultValue: 'Your current save, from {{current}}, is kept in this history first.',
          })
        : t('restore-snapshot-description-none', {
            defaultValue: 'There is no current cloud save, so nothing is replaced.',
          }),
      confirmLabel: t('restore', {
        defaultValue: 'Restore',
      }),
      danger: true,
    });
    if (!ok) return;
    setBusy(snapshot.id);
    try {
      await api(restoreGameSaveApi, {
        params: {
          gameId,
        },
        body: {
          snapshotId: snapshot.id,
        },
      });
      await queryClient.invalidateQueries({
        queryKey: [listGameSavesApi.path],
      });
      await queryClient.invalidateQueries({
        queryKey: [listSaveSnapshotsApi.path],
      });
      onRestored();
    } catch {
      toast.error(
        t('restore-failed', {
          defaultValue: 'Could not restore this version. Try again.',
        }),
      );
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <div
        role="status"
        aria-label={t('history-loading', {
          defaultValue: 'Loading version history',
        })}
      >
        {[0, 1].map((n) => (
          <div key={n} className="border-b border-site-border py-3">
            <Skeleton className="h-4 w-1/2" />
          </div>
        ))}
      </div>
    );
  }

  if (query.isError) {
    return (
      <p className="t-body py-3 text-site-text-muted">
        {t('history-error', {
          defaultValue: 'Could not load the version history.',
        })}{' '}
        <Button variant="ghost" size="sm" onClick={() => void query.refetch()}>
          {t('retry', {
            defaultValue: 'Try again',
          })}
        </Button>
      </p>
    );
  }

  if (snapshots.length === 0) {
    return (
      <p className="t-body py-3 text-site-text-muted">
        {t('history-empty', {
          defaultValue:
            'No earlier versions yet. One is kept when a save is replaced after six hours, and before a restore or a delete.',
        })}
      </p>
    );
  }

  return (
    <ul
      className={cn(arrival)}
      aria-label={t('history-label', {
        game: gameName,
        defaultValue: '{{game}} version history',
      })}
    >
      {snapshots.map((snapshot) => {
        const when = formatWhen(snapshot.createdAt);
        return (
          <li
            key={snapshot.id}
            className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-site-border py-3"
          >
            <div className="min-w-0 flex-1">
              <p className="t-body text-site-text">
                <time dateTime={snapshot.createdAt}>{when}</time>
              </p>
              <p className="t-meta text-site-text-muted">
                {reasonLabel(snapshot.reason)} · {formatSize(snapshot.sizeBytes)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                loading={busy === snapshot.id}
                disabled={busy !== null}
                aria-label={t('restore-aria', {
                  date: when,
                  defaultValue: 'Restore the version from {{date}}',
                })}
                onClick={() => void restore(snapshot)}
              >
                <RotateCcw aria-hidden />
                {t('restore', {
                  defaultValue: 'Restore',
                })}
              </Button>
              <Button size="sm" asChild>
                <a
                  href={apiUrl(downloadSaveSnapshotApi, {
                    params: {
                      gameId,
                      id: snapshot.id,
                    },
                  })}
                  download
                  aria-label={t('download-aria', {
                    date: when,
                    defaultValue: 'Download the version from {{date}}',
                  })}
                >
                  <Download aria-hidden />
                  {t('download', {
                    defaultValue: 'Download',
                  })}
                </a>
              </Button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
