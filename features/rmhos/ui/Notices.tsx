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
}

export default function Notices({ session, busy, onDownload }: Props) {
  const { t } = useTranslation('c-rmhos');
  const last = session.lastSave?.result;
  const report = last ? reportSave(last) : null;
  const changedElsewhere = report?.kind === 'notice' && report.key === 'changed-elsewhere';
  const emptyHome = report?.kind === 'notice' && report.key === 'empty-home';
  const blocked = session.desktopReady && session.storeKind === 'memory';
  if (!changedElsewhere && !emptyHome && !blocked) return null;

  return (
    <div className="rmhos-notices" role="status">
      {blocked && (
        <p className="text-xs text-(--app-warning)">
          {t('notice-storage-blocked', {
            defaultValue: 'Files are not being saved: this browser is blocking storage.',
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
