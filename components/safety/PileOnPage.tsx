import { useCallback, useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { PageLayout } from '@/components/feed/PageLayout';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

type State = { status: 'OFFERED' | 'ACTIVE' | 'REVERTED' | 'DISMISSED'; expiresAt: string | null };

/** S7: the one-tap page behind the "burst of replies" notification. */
export default function PileOnPage({ postId }: { postId: string }) {
  const { t } = useTranslation('f-safety');
  const [state, setState] = useState<State | null | 'missing'>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!postId) return setState('missing');
    fetch(`/api/safety/pile-on?post=${encodeURIComponent(postId)}`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: State | null) => setState(d ?? 'missing'))
      .catch(() => setState('missing'));
  }, [postId]);

  const act = useCallback(
    async (action: 'accept' | 'dismiss' | 'undo') => {
      setBusy(true);
      const res = await fetch('/api/safety/pile-on', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId, action }),
      });
      setBusy(false);
      if (!res.ok)
        return toast.error(t('pileon-failed', { defaultValue: 'That did not work. Try again.' }));
      const d = (await res.json()) as State;
      setState({ status: d.status, expiresAt: d.expiresAt ?? null });
    },
    [postId, t],
  );

  return (
    <PageLayout
      title={t('pileon-title', { defaultValue: 'Replies on your post' })}
      backTo="/notifications"
    >
      <div className="mx-auto max-w-xl p-4 md:p-8">
        {state === null ? (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        ) : state === 'missing' ? (
          <p className="text-site-text-muted">
            {t('pileon-missing', { defaultValue: 'We could not find that notice.' })}
          </p>
        ) : (
          <div className="glass-pane flex flex-col gap-4 rounded-site p-5">
            <div className="flex items-center gap-2 text-site-text">
              <ShieldCheck className="h-5 w-5 shrink-0 text-site-accent" aria-hidden />
              <h2 className="text-lg font-bold">
                {state.status === 'ACTIVE'
                  ? t('pileon-active', { defaultValue: 'Replies are limited for 24 hours' })
                  : state.status === 'OFFERED'
                    ? t('pileon-offer', { defaultValue: 'Limit who can reply?' })
                    : t('pileon-done', { defaultValue: 'All set' })}
              </h2>
            </div>
            <p className="text-sm text-site-text-muted">
              {state.status === 'OFFERED'
                ? t('pileon-offer-body', {
                    defaultValue:
                      'Your post is getting a burst of replies from people who do not follow you. You can limit replies to people you follow for the next 24 hours. It switches back by itself.',
                  })
                : state.status === 'ACTIVE'
                  ? t('pileon-active-body', {
                      defaultValue: 'Only people you follow can reply until {{time}}.',
                      time: state.expiresAt ? new Date(state.expiresAt).toLocaleString() : '',
                    })
                  : state.status === 'REVERTED'
                    ? t('pileon-reverted-body', { defaultValue: 'Replies are open again.' })
                    : t('pileon-dismissed-body', { defaultValue: 'Nothing was changed.' })}
            </p>
            <div className="flex justify-end gap-2">
              {state.status === 'OFFERED' && (
                <>
                  <Button variant="ghost" disabled={busy} onClick={() => act('dismiss')}>
                    {t('pileon-dismiss', { defaultValue: 'Leave it open' })}
                  </Button>
                  <Button variant="accent" disabled={busy} onClick={() => act('accept')}>
                    {t('pileon-accept', { defaultValue: 'Limit replies for 24h' })}
                  </Button>
                </>
              )}
              {state.status === 'ACTIVE' && (
                <Button variant="outline" disabled={busy} onClick={() => act('undo')}>
                  {t('pileon-undo', { defaultValue: 'Open replies again' })}
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </PageLayout>
  );
}
