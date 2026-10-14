import { useTranslation } from 'react-i18next';
import { ExternalLink } from 'lucide-react';

/** Pointer from the Dunesday Connect panel to the any-franchise planner. */
export function MarathonLink() {
  const { t } = useTranslation('f-tools');
  return (
    <div className="ds-card" style={{ padding: 14 }}>
      <div className="ds-row" style={{ marginBottom: 6 }}>
        <strong>{t('marathon-link-title', { defaultValue: 'Plan a marathon of your own' })}</strong>
      </div>
      <p className="ds-hint" style={{ margin: '0 0 10px' }}>
        {t('marathon-link-body', {
          defaultValue:
            'Build a watch list for any franchise, set a deadline, and share the schedule.',
        })}
      </p>
      <a className="ds-btn ds-btn--ghost ds-btn--sm" href="/marathon">
        <ExternalLink size={14} aria-hidden="true" />
        {t('marathon-link-open', { defaultValue: 'Open the marathon planner' })}
      </a>
    </div>
  );
}
