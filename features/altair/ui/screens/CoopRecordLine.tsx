/**
 * CoopRecordLine — the member's co-op totals above the co-op match list on "Your runs" (sprint 14 04): runs, wins and
 * win rate, revives given and received, kills and the class played most. In the game's own look (L8).
 */
import { useTranslation } from 'react-i18next';
import { CLASSES } from '@features/altair/engine/data/classes';
import type { CoopRecord } from '@features/altair/engine/coop-record';

function className(classId: string): string {
  return CLASSES.find((c) => c.id === classId)?.name ?? classId;
}

/** The member's co-op totals above the match list: runs, wins and win rate, revives, kills, most-played class. */
export default function CoopRecordLine({ record }: { record: CoopRecord }) {
  const { t } = useTranslation('altair-coop');
  return (
    <section
      aria-label={t('record-label', { defaultValue: 'Your co-op record' })}
      className="border-b border-(--altair-border) pb-3 mb-1"
    >
      <h3 className="text-sm font-semibold text-(--altair-text)">
        {t('record-title', { defaultValue: 'Co-op record' })}
      </h3>
      <p className="text-sm text-(--altair-text) mt-1 tabular-nums flex flex-wrap items-center gap-x-3 gap-y-1">
        <span>
          {t('record-runs', {
            defaultValue: '{{count}} run',
            defaultValue_other: '{{count}} runs',
            count: record.runs,
          })}
        </span>
        <span>
          {t('record-wins', {
            defaultValue: '{{count}} win ({{rate}}%)',
            defaultValue_other: '{{count}} wins ({{rate}}%)',
            count: record.wins,
            rate: record.winRate,
          })}
        </span>
        <span>
          {t('record-revives-given', {
            defaultValue: 'Revives given {{count}}',
            defaultValue_other: 'Revives given {{count}}',
            count: record.revivesGiven,
          })}
        </span>
        <span>
          {t('record-revives-received', {
            defaultValue: 'Revives received {{count}}',
            defaultValue_other: 'Revives received {{count}}',
            count: record.revivesReceived,
          })}
        </span>
        <span>
          {t('record-kills', {
            defaultValue: '{{count}} kill',
            defaultValue_other: '{{count}} kills',
            count: record.kills,
          })}
        </span>
      </p>
      {record.favouriteClass && (
        <p className="text-xs text-(--altair-text-muted) mt-1">
          {t('record-favourite', { defaultValue: 'Most played: {{class}}', class: className(record.favouriteClass) })}
        </p>
      )}
    </section>
  );
}
