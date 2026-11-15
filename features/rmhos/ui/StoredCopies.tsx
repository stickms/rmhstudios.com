/**
 * What this browser holds for the account, in the About dialog: the current archive, the home a
 * restored backup replaced (if any) and a damaged copy (if any). Each can be downloaded; the two
 * extras can be removed after a confirmation. Nothing sits in storage that cannot be seen,
 * saved or deleted from here.
 */
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { toast } from '@/lib/shared/app-toast';
import type { CopyKind, StoredCopies as Copies } from '../engine/home-sync';
import ConfirmBox from './ConfirmBox';
import { copyFileName, downloadBytes } from './download';
import { formatBytes } from './format';
import { copyTime } from './save-messages';

/** Where the copies come from: the store itself (see engine/stored-home.ts), never the machine. */
export interface StoredCopiesSource {
  storedCopies: () => Promise<Copies | null>;
  exportCopy: (kind: CopyKind) => Promise<Uint8Array | null>;
  removeCopy: (kind: 'replaced' | 'damaged') => Promise<void>;
  /** Deletes everything stored for the account (the caller stops its machine first). */
  deleteAll: () => Promise<void>;
}


export default function StoredCopies({
  session,
  container,
  currentDamaged,
  readOnly = false,
  machineUp = false,
}: {
  session: StoredCopiesSource;
  container: HTMLElement | null;
  /** Another tab is running rmhOS for this account: list and download only. */
  readOnly?: boolean;
  /** The current archive is unreadable: its download carries the damaged name. */
  currentDamaged: boolean;
  /** A machine is up in this tab: deleting the files stops it. */
  machineUp?: boolean;
}) {
  const { t, i18n } = useTranslation('c-rmhos');
  const locale = i18n.language;
  const [copies, setCopies] = useState<Copies | null>(null);
  const [removing, setRemoving] = useState<'replaced' | 'damaged' | null>(null);
  const [deleting, setDeleting] = useState(false);

  const { storedCopies, exportCopy, removeCopy, deleteAll } = session;
  const load = useCallback(() => {
    void storedCopies().then(setCopies, () => setCopies(null));
  }, [storedCopies]);
  useEffect(load, [load]);

  if (!copies || (!copies.current && !copies.replaced && !copies.damaged)) return null;

  const download = async (kind: CopyKind) => {
    try {
      const bytes = await exportCopy(kind);
      if (!bytes) throw new Error('missing');
      downloadBytes(copyFileName(kind, currentDamaged), bytes);
    } catch {
      toast.error(
        t('copy-download-failed', { defaultValue: 'Could not download the copy. Nothing was changed.' }),
      );
    }
  };

  const rows: Array<{ kind: CopyKind; label: string; info: Copies['current'] }> = [
    {
      kind: 'current',
      label: t('copy-current', { defaultValue: 'Saved files' }),
      info: copies.current,
    },
    {
      kind: 'replaced',
      label: t('copy-replaced', { defaultValue: 'Files replaced by a backup' }),
      info: copies.replaced,
    },
    {
      kind: 'damaged',
      label: t('copy-damaged', { defaultValue: 'Damaged copy' }),
      info: copies.damaged,
    },
  ];

  return (
    <section aria-labelledby="rmhos-copies" className="flex flex-col gap-2">
      <h3 id="rmhos-copies" className="text-sm font-semibold">
        {t('copies-title', { defaultValue: 'Stored copies' })}
      </h3>
      <ul className="flex flex-col gap-2">
        {rows
          .filter((r) => r.info)
          .map((r) => (
            <li key={r.kind} className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm">
                {r.label}
                <span className="text-(--app-text-muted)">
                  {' '}
                  {t('copy-detail', {
                    defaultValue: '{{size}}, saved {{time}}',
                    size: formatBytes(r.info!.size, locale),
                    time: copyTime(r.info!.savedAt, locale),
                  })}
                </span>
              </span>
              <span className="flex gap-2">
                <Button size="sm" onClick={() => void download(r.kind)}>
                  {t('download', { defaultValue: 'Download' })}
                </Button>
                {r.kind !== 'current' && !readOnly && (
                  <Button size="sm" onClick={() => setRemoving(r.kind as 'replaced' | 'damaged')}>
                    {t('remove', { defaultValue: 'Remove' })}
                  </Button>
                )}
              </span>
            </li>
          ))}
      </ul>
      {!readOnly && (
        <div>
          <Button size="sm" onClick={() => setDeleting(true)}>
            {t('delete-files', { defaultValue: 'Delete my files from this browser' })}
          </Button>
        </div>
      )}
      <ConfirmBox
        open={deleting}
        container={container}
        title={
          machineUp
            ? t('delete-files-confirm-stops', {
                defaultValue:
                  'Delete your files from this browser? This removes your saved files, the files replaced by a backup and any damaged copy, and stops rmhOS. It cannot be undone. Download a backup first to keep them.',
              })
            : t('delete-files-confirm', {
                defaultValue:
                  'Delete your files from this browser? This removes your saved files, the files replaced by a backup and any damaged copy. It cannot be undone. Download a backup first to keep them.',
              })
        }
        confirmLabel={t('delete', { defaultValue: 'Delete' })}
        onCancel={() => setDeleting(false)}
        onConfirm={() => {
          setDeleting(false);
          deleteAll().then(
            () => {
              toast.success(
                t('files-deleted', { defaultValue: 'Your files were deleted from this browser.' }),
              );
              load();
            },
            () =>
              toast.error(
                t('delete-files-failed', {
                  defaultValue: 'Could not delete the files. Nothing was changed.',
                }),
              ),
          );
        }}
      />
      <ConfirmBox
        open={removing !== null}
        container={container}
        title={
          removing === 'replaced' && copies.replaced
            ? t('remove-replaced-confirm', {
                defaultValue: 'Remove the files from {{time}}? They cannot be recovered.',
                time: copyTime(copies.replaced.savedAt, locale),
              })
            : t('remove-damaged-confirm', {
                defaultValue: 'Remove the earlier damaged copy? It cannot be recovered.',
              })
        }
        confirmLabel={t('remove', { defaultValue: 'Remove' })}
        onCancel={() => setRemoving(null)}
        onConfirm={() => {
          const kind = removing;
          setRemoving(null);
          if (kind) {
            removeCopy(kind).then(load, () =>
              toast.error(
                t('copy-remove-failed', {
                  defaultValue: 'Could not remove the copy. Nothing was changed.',
                }),
              ),
            );
          }
        }}
      />
    </section>
  );
}
