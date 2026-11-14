import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import type { VmPhase, VmPhaseDetail } from '../engine/vm';

interface Props {
  phase: VmPhase;
  detail?: VmPhaseDetail;
  /** A phone with no keyboard: ask before downloading the machine. */
  needsKeyboardNotice: boolean;
  onStart: () => void;
  onRetry: () => void;
}

export default function BootScreen({
  phase,
  detail,
  needsKeyboardNotice,
  onStart,
  onRetry,
}: Props) {
  const { t } = useTranslation('c-rmhos');
  const progress =
    detail && 'total' in detail && detail.total > 0
      ? Math.min(1, detail.loaded / detail.total)
      : null;
  const error = detail && 'error' in detail ? detail.error : null;

  let status: string;
  if (phase === 'failed')
    status = t('boot-failed', { defaultValue: 'The machine could not start.' });
  else if (phase === 'booting')
    status = t('boot-starting', { defaultValue: 'Starting the machine' });
  else if (phase === 'downloading')
    status = t('boot-downloading', { defaultValue: 'Downloading the machine' });
  else status = t('boot-preparing', { defaultValue: 'Preparing' });

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
            {phase !== 'failed' && (
              <div className="rmhos-boot-bar" aria-hidden="true">
                <span style={{ width: `${Math.round((progress ?? 0) * 100)}%` }} />
              </div>
            )}
            {phase === 'downloading' && progress !== null && (
              <p className="text-xs font-mono text-(--app-text-muted)">
                {Math.round(progress * 100)}%
              </p>
            )}
            {phase === 'failed' && (
              <>
                {error && <p className="text-xs font-mono text-(--app-text-muted)">{error}</p>}
                <div>
                  <Button variant="primary" onClick={onRetry}>
                    {t('retry', { defaultValue: 'Try again' })}
                  </Button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
