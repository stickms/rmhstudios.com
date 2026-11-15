import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import type { VmPhaseDetail } from '../engine/vm-types';
import type { RmhosFailure, RmhosPhase } from './useRmhosSession';

interface Props {
  phase: RmhosPhase;
  detail?: VmPhaseDetail | undefined;
  failure: RmhosFailure | null;
  /** A phone with no keyboard: ask before downloading the machine. */
  needsKeyboardNotice: boolean;
  onStart: () => void;
  /** Starts the machine over (Try again / Restart). */
  onRetry: () => void;
  /** `corrupt` only: the raw stored bytes as a download. */
  onDownloadDamaged: () => void | Promise<void>;
  /** `corrupt` only: keep the unreadable entry aside and start with an empty home. */
  onStartEmpty: () => void | Promise<void>;
  /** `corrupt` only: open the file picker for a backup. */
  onRestoreBackup: () => void;
  /** `handshake` only, when a restored backup replaced a home that can be put back. */
  previousAvailable: boolean;
  onPutPreviousBack: () => void | Promise<void>;
}

export default function BootScreen({
  phase,
  detail,
  failure,
  needsKeyboardNotice,
  onStart,
  onRetry,
  onDownloadDamaged,
  onStartEmpty,
  onRestoreBackup,
  previousAvailable,
  onPutPreviousBack,
}: Props) {
  const { t } = useTranslation('c-rmhos');
  const [busy, setBusy] = useState(false);
  const progress =
    detail && 'total' in detail && detail.total > 0
      ? Math.min(1, detail.loaded / detail.total)
      : null;
  const error = detail && 'error' in detail ? detail.error : null;
  const ended = phase === 'failed' || phase === 'stopped';

  let status: string;
  if (phase === 'failed') {
    if (failure === 'corrupt')
      status = t('failed-corrupt', { defaultValue: 'Your saved files could not be read.' });
    else if (failure === 'locked')
      status = t('failed-locked', { defaultValue: 'rmhOS is already open in another tab.' });
    else if (failure === 'handshake')
      status = t('failed-handshake', {
        defaultValue: 'rmhOS started but could not sign you in.',
      });
    else status = t('failed-load', { defaultValue: 'rmhOS could not be loaded.' });
  } else if (phase === 'stopped') status = t('stopped', { defaultValue: 'rmhOS has stopped.' });
  else if (phase === 'session') status = t('boot-session', { defaultValue: 'Signing in' });
  else if (phase === 'booting')
    status = t('boot-starting', { defaultValue: 'Starting the machine' });
  else if (phase === 'downloading')
    status = t('boot-downloading', { defaultValue: 'Downloading the machine' });
  else status = t('boot-preparing', { defaultValue: 'Preparing' });

  const run = (fn: () => void | Promise<void>) => async () => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  const retryLabel =
    failure === 'handshake' || phase === 'stopped'
      ? t('restart', { defaultValue: 'Restart' })
      : t('retry', { defaultValue: 'Try again' });

  return (
    <div className="rmhos-boot" data-phase={phase}>
      <div className="rmhos-boot-panel" role="status" aria-live="polite">
        <h1 className="text-lg font-semibold">{t('title', { defaultValue: 'rmhOS' })}</h1>
        {needsKeyboardNotice ? (
          <>
            <p className="text-sm text-(--app-text-muted)">
              {t('keyboard-needed', { defaultValue: 'rmhOS needs a keyboard.' })}
            </p>
            <div>
              <Button variant="primary" onClick={onStart}>
                {t('start-anyway', { defaultValue: 'Start anyway' })}
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-(--app-text-muted)">{status}</p>
            {!ended && (
              <div className="rmhos-boot-bar" aria-hidden="true">
                <span style={{ width: `${Math.round((progress ?? 0) * 100)}%` }} />
              </div>
            )}
            {phase === 'downloading' && progress !== null && (
              <p className="text-xs font-mono text-(--app-text-muted)">
                {Math.round(progress * 100)}%
              </p>
            )}
            {ended && failure === 'corrupt' && (
              <div className="flex flex-wrap gap-2">
                <Button variant="primary" disabled={busy} onClick={run(onDownloadDamaged)}>
                  {t('download-damaged', { defaultValue: 'Download the damaged backup' })}
                </Button>
                <Button disabled={busy} onClick={onRestoreBackup}>
                  {t('restore-backup', { defaultValue: 'Restore backup' })}
                </Button>
                <Button disabled={busy} onClick={run(onStartEmpty)}>
                  {t('start-empty', { defaultValue: 'Start with an empty home' })}
                </Button>
              </div>
            )}
            {ended && failure !== 'corrupt' && (
              <>
                {error && failure !== 'locked' && (
                  <p className="text-xs font-mono text-(--app-text-muted)">{error}</p>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button variant="primary" onClick={onRetry}>
                    {retryLabel}
                  </Button>
                  {failure === 'handshake' && previousAvailable && (
                    <Button disabled={busy} onClick={run(onPutPreviousBack)}>
                      {t('put-previous-back', { defaultValue: 'Put the previous files back' })}
                    </Button>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
