import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

/** Sprint 06 #17: why a conversation switch is locked off — the account switch in Settings > Privacy is off. */
export function AccountReceiptReason({ id }: { id: string }) {
  const { t } = useTranslation('read-receipts');
  return (
    <span id={id} className="t-meta block">
      {t('account-off', {
        defaultValue: 'Off for all conversations in Settings > Privacy.',
      })}{' '}
      <Link to="/settings/privacy" className="underline">
        {t('account-off-link', {
          defaultValue: 'Change it',
        })}
      </Link>
    </span>
  );
}
