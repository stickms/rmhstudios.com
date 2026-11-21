import { useTranslation } from 'react-i18next';

/**
 * What the composer says while the other person takes message requests (s04-16).
 * Both read the same to a pending and a declined request: the sender is never told
 * which happened.
 */
export function RequestComposeLabel() {
  const { t } = useTranslation('message-requests');
  return (
    <div className="border-t border-site-border py-2">
      <p className="t-label">{t('compose-title', { defaultValue: 'Send a request' })}</p>
      <p className="t-meta">
        {t('compose-hint', {
          defaultValue:
            'They cannot be messaged directly. You can send one text message, which they can accept or decline.',
        })}
      </p>
    </div>
  );
}

export function RequestSentNotice() {
  const { t } = useTranslation('message-requests');
  return (
    <p className="t-body border-t border-site-border py-3 text-site-text-muted" role="status">
      {t('sent-notice', { defaultValue: 'Request sent. You can write again if they accept.' })}
    </p>
  );
}
