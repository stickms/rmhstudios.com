import { useTranslation } from 'react-i18next';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';
import type { DmReportView } from '@/lib/messages/dm-report';

/**
 * s13-17: the one message a moderator reads when a direct or group message is reported: what it says now, when it was
 * sent, what it said before each edit (newest first), and nothing around it. Admin pages only; no participant ever
 * sees the earlier versions.
 */
export function DmReportMessage({ view }: { view: DmReportView }) {
  const { t } = useTranslation('dm-reports');
  const fmt = useLocaleFormat();
  return (
    <div className="space-y-2">
      <p className="t-meta">
        {view.conversation === 'group'
          ? t('conversation-group', { defaultValue: 'Group conversation' })
          : t('conversation-direct', { defaultValue: 'Direct conversation' })}
        {' · '}
        {t('sent-at', { time: fmt.dateTime(new Date(view.at)), defaultValue: 'Sent {{time}}' })}
        {view.removed ? ` · ${t('removed', { defaultValue: 'Unsent or removed' })}` : ''}
      </p>
      <p dir="auto" className="t-body whitespace-pre-wrap break-words text-site-text">
        {view.text.trim() ? view.text : t('no-text', { defaultValue: 'No text' })}
      </p>
      {view.hasImage && (
        <p className="t-meta">
          {t('has-image', { defaultValue: 'Has an image' })}
          {view.imageAlts.length > 0 && (
            <>
              {': '}
              <span dir="auto">{view.imageAlts.join(' / ')}</span>
            </>
          )}
        </p>
      )}
      {view.edited && (
        <section aria-label={t('earlier-versions', { defaultValue: 'Edited — earlier versions' })}>
          <h4 className="t-label">{t('earlier-versions', { defaultValue: 'Edited — earlier versions' })}</h4>
          {view.versions.length === 0 ? (
            <p className="t-meta">{t('no-versions', { defaultValue: 'No earlier versions are kept.' })}</p>
          ) : (
            <ol className="divide-y divide-site-border border-y border-site-border">
              {view.versions.map((v) => (
                <li key={v.replacedAt + v.content} className="space-y-1 py-2">
                  <p className="t-meta">
                    {t('replaced-at', {
                      time: fmt.dateTime(new Date(v.replacedAt)),
                      defaultValue: 'Replaced {{time}}',
                    })}
                  </p>
                  <p dir="auto" className="t-body whitespace-pre-wrap break-words text-site-text">
                    {v.content}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}
    </div>
  );
}
