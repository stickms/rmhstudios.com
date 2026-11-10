import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSession } from '@/components/Providers';
import { api } from '@/lib/contract/client';
import {
  dismissNoticeApi,
  getActiveNoticeApi,
  type NoticeView as Notice,
} from '@/lib/ops/notices.contract';

/**
 * An admin-targeted notice, fetched on idle for signed-in members and shown as a
 * floating card (no layout shift). Dismissal is recorded server-side.
 */
export function TargetedNoticeBanner() {
  const { t, i18n } = useTranslation('f-ops');
  const { data: session } = useSession();
  const signedIn = Boolean(session?.user);
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    if (!signedIn) return;
    const ctrl = new AbortController();
    const run = () =>
      api(getActiveNoticeApi, {
        query: { locale: i18n.language.slice(0, 2) },
        signal: ctrl.signal,
      })
        .then((j) => setNotice(j.notice))
        .catch(() => {});
    const id = window.setTimeout(run, 4000);
    return () => {
      window.clearTimeout(id);
      ctrl.abort();
    };
  }, [signedIn, i18n.language]);

  if (!notice) return null;
  const dismiss = () => {
    void api(dismissNoticeApi, { body: { id: notice.id } }).catch(() => {});
    setNotice(null);
  };
  return (
    <aside
      role="status"
      data-floating="feature-overlay"
      className="glass-overlay fixed inset-x-4 bottom-4 z-40 mx-auto flex max-w-md items-start gap-3 rounded-site p-5 md:left-auto md:right-4"
    >
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-sm font-semibold text-site-text">{notice.title}</p>
        <p className="break-words text-sm text-site-text-muted">{notice.body}</p>
        {notice.linkUrl && (
          <a
            href={notice.linkUrl}
            className="text-sm text-site-accent underline-offset-4 hover:underline"
          >
            {t('banner-learn-more', { defaultValue: 'Learn more' })}
          </a>
        )}
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label={t('banner-dismiss', { defaultValue: 'Dismiss' })}
        className="rounded-site-sm p-1 text-site-text-muted hover:bg-site-surface-hover hover:text-site-text"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </aside>
  );
}
