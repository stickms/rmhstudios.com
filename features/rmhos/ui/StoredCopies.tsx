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
import { copyTime } from './save-messages';
import type { RmhosSessionValue } from './useRmhosSession';

type Source = Pick<RmhosSessionValue, 'storedCopies' | 'exportCopy' | 'removeCopy'>;


function size(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function StoredCopies({
  session,
  container,
  currentDamaged,
}: {
  session: Source;
  container: HTMLElement | null;
  /** The current archive is unreadable: its download carries the damaged name. */
  currentDamaged: boolean;
}) {
  const { t } = useTranslation('c-rmhos');
  const [copies, setCopies] = useState<Copies | null>(null);
  const [removing, setRemoving] = useState<'replaced' | 'damaged' | null>(null);

  const { storedCopies, exportCopy, removeCopy } = session;
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
                    size: size(r.info!.size),
                    time: copyTime(r.info!.savedAt),
                  })}
                </span>
              </span>
              <span className="flex gap-2">
                <Button size="sm" onClick={() => void download(r.kind)}>
                  {t('download', { defaultValue: 'Download' })}
                </Button>
                {r.kind !== 'current' && (
                  <Button size="sm" onClick={() => setRemoving(r.kind as 'replaced' | 'damaged')}>
                    {t('remove', { defaultValue: 'Remove' })}
                  </Button>
                )}
              </span>
            </li>
          ))}
      </ul>
      <ConfirmBox
        open={removing !== null}
        container={container}
        title={
          removing === 'replaced' && copies.replaced
            ? t('remove-replaced-confirm', {
                defaultValue: 'Remove the files from {{time}}? They cannot be recovered.',
                time: copyTime(copies.replaced.savedAt),
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
