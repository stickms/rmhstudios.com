/**
 * /settings/cloud-saves: every cloud-save game with its save's time and size, download, restore from a backup file,
 * delete, and the per-game version history (`SaveHistory`). Game names and pictures come from the catalog.
 */

import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { ChevronDown, Download, Gamepad2, History, Upload } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { api, apiQuery } from '@/lib/contract/client';
import {
  deleteGameSaveApi,
  getGameSaveApi,
  listGameSavesApi,
  listSaveSnapshotsApi,
  restoreGameSaveApi,
  type SaveSummary,
} from '@/lib/game-saves/saves.contract';
import { backupFileName, parseBackupFile, type BackupError } from '@/lib/game-saves/backup';
import { SettingsSection } from '@/components/settings/SettingsSection';
import { SaveHistory } from '@/components/settings/SaveHistory';
import { downloadBackup, formatSize, formatWhen, gameInfo, gameTitle } from '@/components/settings/cloud-saves-shared';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useArrival } from '@/components/ui/arrive';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';

function backupError(t: TFunction, error: BackupError): string {
  switch (error) {
    case 'not-json':
      return t('error-not-json', {
        defaultValue: 'This file is not valid JSON.',
      });
    case 'wrong-format':
      return t('error-wrong-format', {
        defaultValue: 'This file is not a cloud save backup.',
      });
    case 'wrong-version':
      return t('error-wrong-version', {
        defaultValue: 'This backup was made by a version that is not supported.',
      });
    case 'wrong-game':
      return t('error-wrong-game', {
        defaultValue: 'This backup is for a different game.',
      });
    case 'bad-date':
      return t('error-bad-date', {
        defaultValue: 'This backup has no valid save date.',
      });
    case 'bad-save':
      return t('error-bad-save', {
        defaultValue: 'This backup does not contain a save.',
      });
    case 'too-large':
      return t('error-too-large', {
        defaultValue: 'This backup is too large to restore.',
      });
  }
}

function SaveRow({
  save,
  open,
  onToggle,
  onRestored,
}: {
  save: SaveSummary;
  open: boolean;
  onToggle: () => void;
  onRestored: () => void;
}) {
  const { t } = useTranslation('cloud-saves');
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const { gameId } = save;
  const name = gameTitle(gameId);
  const image = gameInfo(gameId)?.imagePath;
  const historyId = `save-history-${gameId}`;

  async function refresh() {
    await queryClient.invalidateQueries({
      queryKey: [listGameSavesApi.path],
    });
    await queryClient.invalidateQueries({
      queryKey: [listSaveSnapshotsApi.path],
    });
  }

  async function download() {
    setBusy(true);
    try {
      const { saveData, updatedAt } = await api(getGameSaveApi, {
        params: {
          gameId,
        },
      });
      if (!saveData || !updatedAt) {
        toast.error(
          t('download-none', {
            defaultValue: 'There is no cloud save to download.',
          }),
        );
        await refresh();
        return;
      }
      downloadBackup(gameId, updatedAt, saveData, backupFileName(gameId, updatedAt));
    } catch {
      toast.error(
        t('download-failed', {
          defaultValue: 'Could not download this save. Try again.',
        }),
      );
    } finally {
      setBusy(false);
    }
  }

  async function restoreFromFile(file: File) {
    let text: string;
    try {
      text = await file.text();
    } catch {
      toast.error(
        t('file-unreadable', {
          defaultValue: 'Could not read this file.',
        }),
      );
      return;
    }
    const parsed = parseBackupFile(text, gameId);
    if (!parsed.ok) {
      toast.error(backupError(t, parsed.error));
      return;
    }
    const backupDate = formatWhen(parsed.backup.savedAt);
    const ok = await confirm({
      title: t('restore-file-title', {
        game: name,
        defaultValue: 'Restore the {{game}} save from this file?',
      }),
      description: save.savedAt
        ? t('restore-file-description', {
            backup: backupDate,
            current: formatWhen(save.savedAt),
            defaultValue:
              'The backup is from {{backup}}. Your current save is from {{current}} and is kept in version history first.',
          })
        : t('restore-file-description-none', {
            backup: backupDate,
            defaultValue: 'The backup is from {{backup}}. There is no current cloud save, so nothing is replaced.',
          }),
      confirmLabel: t('restore', {
        defaultValue: 'Restore',
      }),
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api(restoreGameSaveApi, {
        params: {
          gameId,
        },
        body: {
          backup: parsed.backup,
        },
      });
      await refresh();
      onRestored();
    } catch {
      toast.error(
        t('restore-failed', {
          defaultValue: 'Could not restore this version. Try again.',
        }),
      );
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    const ok = await confirm({
      title: t('delete-title', {
        game: name,
        defaultValue: 'Delete the {{game}} cloud save?',
      }),
      description: save.savedAt
        ? t('delete-description', {
            date: formatWhen(save.savedAt),
            defaultValue:
              'The save from {{date}} is removed from your account. A copy stays in version history, so you can restore it while it is among the last 10.',
          })
        : undefined,
      confirmLabel: t('delete', {
        defaultValue: 'Delete save',
      }),
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api(deleteGameSaveApi, {
        params: {
          gameId,
        },
      });
      await refresh();
    } catch {
      toast.error(
        t('delete-failed', {
          defaultValue: 'Could not delete this save. Try again.',
        }),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="border-b border-site-border py-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        {image ? (
          <img
            src={image}
            alt=""
            width={40}
            height={40}
            loading="lazy"
            className="size-10 shrink-0 rounded-site border border-site-border bg-site-bg-subtle object-cover"
          />
        ) : (
          <span className="flex size-10 shrink-0 items-center justify-center rounded-site border border-site-border bg-site-bg-subtle text-site-text-muted">
            <Gamepad2 className="size-4" aria-hidden />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="t-heading text-site-text">{name}</p>
          {save.savedAt && save.sizeBytes !== null ? (
            <p className="t-meta text-site-text-muted">
              {t('saved-at', {
                relative: formatDistanceToNow(new Date(save.savedAt), {
                  addSuffix: true,
                }),
                exact: formatWhen(save.savedAt),
                size: formatSize(save.sizeBytes),
                defaultValue: 'Saved {{relative}} ({{exact}}) · {{size}}',
              })}
            </p>
          ) : (
            <p className="t-meta text-site-text-muted">
              {t('no-save', {
                defaultValue: 'No cloud save',
              })}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {save.savedAt ? (
            <Button
              size="sm"
              disabled={busy}
              aria-label={t('download-backup-aria', {
                game: name,
                defaultValue: 'Download a backup of {{game}}',
              })}
              onClick={() => void download()}
            >
              <Download aria-hidden />
              {t('download-backup', {
                defaultValue: 'Download backup',
              })}
            </Button>
          ) : null}
          <Button
            size="sm"
            disabled={busy}
            aria-label={t('restore-file-aria', {
              game: name,
              defaultValue: 'Restore {{game}} from a backup file',
            })}
            onClick={() => fileInput.current?.click()}
          >
            <Upload aria-hidden />
            {t('restore-file', {
              defaultValue: 'Restore from file',
            })}
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            tabIndex={-1}
            aria-label={t('file-input-aria', {
              game: name,
              defaultValue: 'Backup file for {{game}}',
            })}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void restoreFromFile(file);
            }}
          />
          {save.savedAt ? (
            <Button
              variant="ghost"
              size="sm"
              className="text-site-danger"
              disabled={busy}
              aria-label={t('delete-aria', {
                game: name,
                defaultValue: 'Delete the {{game}} cloud save',
              })}
              onClick={() => void remove()}
            >
              {t('delete', {
                defaultValue: 'Delete save',
              })}
            </Button>
          ) : null}
          <Button variant="ghost" size="sm" aria-expanded={open} aria-controls={historyId} onClick={onToggle}>
            <History aria-hidden />
            {t('history', {
              count: save.snapshotCount,
              defaultValue: 'History ({{count}})',
            })}
            <ChevronDown className={cn(open && 'rotate-180')} aria-hidden />
          </Button>
        </div>
      </div>
      {open ? (
        <div id={historyId} className="mt-2 ps-14">
          <SaveHistory gameId={gameId} gameName={name} currentSavedAt={save.savedAt} onRestored={onRestored} />
        </div>
      ) : null}
    </li>
  );
}

export function CloudSaves() {
  const { t } = useTranslation('cloud-saves');
  const query = useQuery(apiQuery(listGameSavesApi));
  const [openGame, setOpenGame] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);
  const loading = query.isPending;
  const arrival = useArrival(!loading);
  const saves = query.data?.saves ?? [];

  return (
    <SettingsSection
      title={t('title', {
        defaultValue: 'Your saves',
      })}
      description={t('description', {
        defaultValue:
          'Progress from games that save to your account. Earlier versions are kept so a bad save is never final.',
      })}
    >
      {restored ? (
        <p role="status" className="t-body py-2 text-site-text">
          {t('restored', {
            defaultValue: 'Restored. Reload the game if it is open in another tab, and it will load this save.',
          })}
        </p>
      ) : null}

      {loading ? (
        <div
          role="status"
          aria-label={t('loading', {
            defaultValue: 'Loading your saves',
          })}
        >
          {[0, 1, 2].map((n) => (
            <div key={n} className="flex items-center gap-3 border-b border-site-border py-3">
              <Skeleton className="size-10 shrink-0" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ))}
        </div>
      ) : query.isError ? (
        <EmptyState
          title={t('error-title', {
            defaultValue: 'Could not load your saves.',
          })}
          description={t('error-description', {
            defaultValue: 'Check your connection and try again.',
          })}
          action={
            <Button onClick={() => void query.refetch()}>
              {t('retry', {
                defaultValue: 'Try again',
              })}
            </Button>
          }
        />
      ) : saves.length === 0 ? (
        <EmptyState
          title={t('empty-title', {
            defaultValue: 'No games save to your account yet.',
          })}
          description={t('empty-description', {
            defaultValue: 'Games that keep a cloud save will appear here.',
          })}
        />
      ) : (
        <ul className={cn(arrival)}>
          {saves.map((save) => (
            <SaveRow
              key={save.gameId}
              save={save}
              open={openGame === save.gameId}
              onToggle={() => setOpenGame(openGame === save.gameId ? null : save.gameId)}
              onRestored={() => setRestored(true)}
            />
          ))}
        </ul>
      )}
    </SettingsSection>
  );
}
