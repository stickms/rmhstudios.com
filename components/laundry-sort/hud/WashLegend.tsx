'use client';

/**
 * The four washes, in bin order, with their weave marks.
 *
 * The bins carry the same marks in 3D, but a garment tumbling at the top of the
 * frame is a long way from the bin it belongs in — the legend is what lets a
 * player check the rule without taking their eyes off the falling laundry, and
 * what makes the game playable without relying on hue at all.
 */

import { useTranslation } from 'react-i18next';
import { WASH_COLORS } from '@/lib/laundry-sort/constants';
import { WeaveMark } from './WeaveMark';

export function WashLegend({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation('c-laundry-sort');

  const labels: Record<string, string> = {
    reds: t('wash-reds', { defaultValue: 'Reds' }),
    blues: t('wash-blues', { defaultValue: 'Blues' }),
    golds: t('wash-golds', { defaultValue: 'Golds' }),
    greens: t('wash-greens', { defaultValue: 'Greens' }),
  };

  return (
    <ul
      className={
        compact
          ? 'flex flex-wrap items-center justify-center gap-x-3 gap-y-1'
          : 'grid grid-cols-2 gap-2 sm:grid-cols-4'
      }
    >
      {WASH_COLORS.map((wash) => (
        <li
          key={wash.id}
          className={
            compact
              ? 'flex items-center gap-1.5 text-[11px] font-semibold'
              : 'ls-panel flex items-center gap-2 px-2.5 py-1.5 text-xs font-semibold'
          }
        >
          <WeaveMark weave={wash.weave} color={wash.hex} size={compact ? 13 : 16} />
          <span style={{ color: wash.hex }}>{labels[wash.id] ?? wash.id}</span>
        </li>
      ))}
    </ul>
  );
}
