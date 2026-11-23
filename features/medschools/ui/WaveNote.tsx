import { useTranslation } from 'react-i18next';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';
import { formatUtcDay } from '../engine/public-read';
import type { WaveDto } from '../medschools.contract';

/** How many waves the note names. */
const SHOWN = 3;

/**
 * "Waves: Nov 4 (41 invites), Oct 28 (37 invites)": the three latest, newest first. This line is also the non-visual
 * reading of the ticks on the chart. Renders nothing when there is no wave.
 */
export function WaveNote({ waves }: { waves: readonly WaveDto[] }) {
  const { t } = useTranslation('medschools');
  const { locale } = useLocaleFormat();
  if (waves.length === 0) return null;
  const nf = new Intl.NumberFormat(locale);
  const latest = [...waves].sort((a, b) => b.date.localeCompare(a.date)).slice(0, SHOWN);
  const items = latest.map((w) =>
    t('wave-note-item', {
      count: w.count,
      defaultValue_one: '{{date}} ({{n}} invite)',
      defaultValue_other: '{{date}} ({{n}} invites)',
      defaultValue: '{{date}} ({{n}} invites)',
      date: formatUtcDay(w.date, locale),
      n: nf.format(w.count),
    }),
  );
  const list = new Intl.ListFormat(locale, { type: 'unit', style: 'short' }).format(items);
  return <p className="t-meta m-0">{t('wave-note', { defaultValue: 'Waves: {{list}}', list })}</p>;
}
