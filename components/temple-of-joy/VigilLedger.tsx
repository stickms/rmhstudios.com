'use client';

import { useTranslation } from 'react-i18next';
import { fmt, formatDuration } from '@/lib/temple-of-joy/numbers';
import { useTempleSnapshot } from './hooks';

/** R9: how the absence was counted, under the night-office report's totals. */
export function VigilLedger() {
  const { t } = useTranslation('f-worlds');
  const v = useTempleSnapshot(
    (s) => ({
      seconds: s.vigil.seconds,
      counted: s.vigil.counted ?? 0,
      efficiency: s.vigil.efficiency ?? 0,
      perHour:
        s.vigil.seconds > 0 ? fmt((s.vigil.joy / s.vigil.seconds) * 3600, s.numberFormat) : '0',
    }),
    1_000,
  );
  if (v.seconds <= 0 || v.counted <= 0) return null;
  const capped = v.counted < v.seconds - 1;

  return (
    <ul className="toj-dialog-list">
      <li>
        <span>{t('ledger-counted', { defaultValue: 'Time that earned income' })}</span>
        <strong>{formatDuration(v.counted)}</strong>
      </li>
      <li>
        <span>{t('ledger-kept', { defaultValue: 'Share of your rate kept' })}</span>
        <strong>{Math.round(v.efficiency * 100)}%</strong>
      </li>
      <li>
        <span>{t('ledger-per-hour', { defaultValue: 'Gladness per hour away' })}</span>
        <strong>{v.perHour}</strong>
      </li>
      {capped && (
        <li>
          <span>
            {t('ledger-capped', { defaultValue: 'Beyond the window, only the slow layers ran' })}
          </span>
          <strong>{formatDuration(v.seconds - v.counted)}</strong>
        </li>
      )}
    </ul>
  );
}
