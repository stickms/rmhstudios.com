/**
 * Persistent notices about where the files are, shown while the desktop runs. They are not
 * toasts: the person has to be able to act on them, and they stay until the cause is gone.
 */
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { reportSave } from './save-messages';
import type { RmhosSessionValue } from './useRmhosSession';

interface Props {
  session: RmhosSessionValue;
  busy: boolean;
  onDownload: () => void;
  /** The browser may delete the stored files: say so, with the two things that help. */
  evictionRisk?: boolean;
  /** Asks the browser to keep the files; call it from the click. */
  onKeep?: () => void;
}

export default function Notices({ session, busy, onDownload, evictionRisk = false, onKeep }: Props) {
  const { t } = useTranslation('c-rmhos');
  const last = session.lastSave?.result;
  const report = last ? reportSave(last) : null;
  const changedElsewhere = report?.kind === 'notice' && report.key === 'changed-elsewhere';
  const emptyHome = report?.kind === 'notice' && report.key === 'empty-home';
  const blocked = session.desktopReady && session.storeKind === 'memory';
  const netEnded = session.net?.enabled === true && session.netEnded;
  // Only where files are being kept at all: with storage blocked the notice above says more.
  const evictable = evictionRisk && session.desktopReady && session.storeKind === 'indexeddb';
  if (!changedElsewhere && !emptyHome && !blocked && !netEnded && !evictable) return null;

  return (
    <div className="rmhos-notices" role="status">
      {blocked && (
        <p className="text-xs text-(--app-warning)">
          {t('notice-storage-blocked', {
            defaultValue: 'Files are not being saved: this browser is blocking storage.',
          })}
        </p>
      )}
      {evictable && (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs text-(--app-warning)">
            {t('eviction-line', {
              defaultValue:
                'This browser may delete these files to free space. Download a backup to keep them.',
            })}
          </p>
          {onKeep && (
            <Button size="sm" onClick={onKeep}>
              {t('keep-files', { defaultValue: 'Keep my files in this browser' })}
            </Button>
          )}
          <Button size="sm" disabled={busy} onClick={onDownload}>
            {t('download-backup', { defaultValue: 'Download backup' })}
          </Button>
        </div>
      )}
      {netEnded && (
        <p className="text-xs text-(--app-warning)">
          {t('notice-net-ended', {
            defaultValue: 'Your network session ended. Restart rmhOS to reconnect.',
          })}
        </p>
      )}
      {emptyHome && (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs text-(--app-warning)">
            {t('notice-empty-home', {
              defaultValue: 'Your home folder is empty. Nothing was saved over your stored files.',
            })}
          </p>
          <Button
            size="sm"
            disabled={busy || session.saving}
            onClick={() => void session.saveNow({ allowEmpty: true })}
          >
            {t('save-empty-anyway', { defaultValue: 'Save the empty folder anyway' })}
          </Button>
        </div>
      )}
      {changedElsewhere && (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs text-(--app-warning)">
            {t('notice-changed-elsewhere', {
              defaultValue:
                'Your files were changed in another tab. Reload to use them, or download a backup of this session first.',
            })}
          </p>
          <Button size="sm" disabled={busy} onClick={onDownload}>
            {t('download-backup', { defaultValue: 'Download backup' })}
          </Button>
          <Button size="sm" onClick={() => void session.restart({ save: false })}>
            {t('reload', { defaultValue: 'Reload' })}
          </Button>
        </div>
      )}
    </div>
  );
}
