/**
 * Why a run was not ranked (sprint 12 17): one line of text under a solo result, or beside a room player who did
 * not finish. The server decides (`lib/rmhtype/run-check.ts`); this only says it, in the member's language.
 */
import { useTranslation } from 'react-i18next';
import type { RunReason } from '@/lib/rmhtype/run-check';

/** The sentence for a reason: literal keys, one per reason. */
export function useRunReasonText(): (reason: RunReason) => string {
  const { t } = useTranslation('type-scoring');
  return (reason) => {
    switch (reason) {
      case 'short':
        return t('reason-short', { defaultValue: 'Not ranked: the run did not reach the end of the passage.' });
      case 'too-fast':
        return t('reason-too-fast', { defaultValue: 'Not ranked: the speed is above what can be typed.' });
      case 'implausible':
        return t('reason-implausible', { defaultValue: 'Not ranked: the run could not be checked.' });
    }
  };
}

/** A solo result's "Not ranked: …" line. */
export function RunReasonLine({ reason, className }: { reason: RunReason; className?: string }) {
  const text = useRunReasonText();
  return (
    <p role="status" className={className ?? 'text-sm text-app-danger mb-4'}>
      {text(reason)}
    </p>
  );
}
