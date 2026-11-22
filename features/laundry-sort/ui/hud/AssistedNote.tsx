import { useTranslation } from 'react-i18next';

/** One line in the solo results when the server says the run was assisted and kept off the board. */
export function AssistedNote({ ranked }: { ranked: boolean | null }) {
  const { t } = useTranslation('driftway-laundry-assists');
  if (ranked !== false) return null;
  return (
    <p role="status" data-testid="assist-not-ranked" className="ls-muted text-center text-sm">
      {t('assisted-not-ranked', { defaultValue: 'Assisted, not ranked' })}
    </p>
  );
}
