/**
 * Persistent notices about where the files are, shown while the desktop runs. They are not
 * toasts: the person has to be able to act on them, and they stay until the cause is gone.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { toast } from '@/lib/shared/app-toast';
import { backupBytes } from './backup';
import { BACKUP_FILE, downloadBytes } from './download';
import type { RmhosSessionValue } from './useRmhosSession';

export default function Notices({ session }: { session: RmhosSessionValue }) {
  const { t } = useTranslation('c-rmhos');
  const [busy, setBusy] = useState(false);
  const last = session.lastSave?.result;
  const changedElsewhere = last?.status === 'failed' && last.code === 'changed_elsewhere';
  const blocked = session.desktopReady && session.storeKind === 'memory';
  if (!changedElsewhere && !blocked) return null;

  const download = async () => {
    setBusy(true);
    try {
      const bytes = await backupBytes(session);
      if (bytes) downloadBytes(BACKUP_FILE, bytes);
      else toast.error(t('backup-failed', { defaultValue: 'Could not create the backup.' }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rmhos-notices" role="status">
      {blocked && (
        <p className="text-xs text-(--app-warning)">
          {t('notice-storage-blocked', {
            defaultValue: 'Files are not being saved: this browser is blocking storage.',
          })}
        </p>
      )}
      {changedElsewhere && (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs text-(--app-warning)">
            {t('notice-changed-elsewhere', {
              defaultValue:
                'Your files were changed in another tab. Reload to use them, or download a backup of this session first.',
            })}
          </p>
          <Button size="sm" disabled={busy} onClick={() => void download()}>
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
