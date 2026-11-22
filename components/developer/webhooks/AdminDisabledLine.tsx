import { useTranslation } from 'react-i18next';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';

/**
 * What the owner sees on a webhook an admin turned off, in place of the switch: when and why, on a rule (a line of
 * text, not a box). The reason is the admin's own words; it is the member-readable record of the decision.
 */
export function AdminDisabledLine({ at, reason }: { at: string; reason: string }) {
  const { t } = useTranslation('admin-webhooks');
  const fmt = useLocaleFormat();
  return (
    <p className="t-meta mt-2 border-t border-site-border pt-2 break-words text-site-text" dir="auto">
      {t('owner-admin-disabled', {
        defaultValue: 'An admin turned this webhook off on {{date}}: {{reason}}. It stays off until they lift it.',
        date: fmt.date(at),
        reason,
      })}
    </p>
  );
}
