/**
 * Shared links — the member's shares: name, when it was made, how many times it was opened, with Copy link and Stop
 * sharing (revoke, after a confirmation). A stopped link stays in the list, marked, and no longer works.
 */
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SHARE_BUTTON, ShareDialogFrame } from '@/components/studio/ShareDialogFrame';
import { shareUrl, writeToClipboard } from '@/components/studio/share-link';
import { useRefusalText } from '@/components/errors/useRefusalText';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useArrival } from '@/components/ui/arrive';
import { api, apiQuery } from '@/lib/contract/client';
import { HttpError } from '@/lib/http';
import { toast } from '@/lib/toast';
import { listSharesApi, revokeShareApi, type ShareSummary } from '@/lib/studio/share.contract';

const ROW = 'flex flex-wrap items-center gap-2 border-b border-app-border px-4 py-2 text-sm';

export function SharedLinksDialog({ signedIn, onClose }: { signedIn: boolean; onClose: () => void }) {
  const { t, i18n } = useTranslation('studio-share');
  const confirm = useConfirm();
  const refusalText = useRefusalText();
  const queryClient = useQueryClient();
  const shares = useQuery({ ...apiQuery(listSharesApi), enabled: signedIn });
  const arrival = useArrival(!shares.isPending);

  const revoke = useMutation({
    mutationFn: (token: string) => api(revokeShareApi, { params: { token } }),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: [listSharesApi.path] }),
    onError: (error) => {
      // Already stopped (or taken down) is the outcome asked for.
      if (error instanceof HttpError && error.status === 404) return;
      toast.error(refusalText.maybe(error) ?? t('revoke-failed', { defaultValue: 'Could not stop sharing.' }));
    },
  });

  const date = (iso: string) => new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(new Date(iso));

  const copy = async (token: string) => {
    if (await writeToClipboard(shareUrl(token))) toast.success(t('link-copied', { defaultValue: 'Link copied.' }));
    else toast.error(t('copy-failed', { defaultValue: 'Could not copy the link. Select it and copy it by hand.' }));
  };

  const stop = async (share: ShareSummary) => {
    const ok = await confirm({
      title: t('stop-title', { name: share.name, defaultValue: 'Stop sharing {{name}}?' }),
      description: t('stop-description', {
        defaultValue: 'The link stops working at once. Copies people already opened stay with them.',
      }),
      confirmLabel: t('stop-confirm', { defaultValue: 'Stop sharing' }),
      cancelLabel: t('cancel', { defaultValue: 'Cancel' }),
      danger: true,
    });
    if (ok) revoke.mutate(share.token);
  };

  return (
    <ShareDialogFrame title={t('links-title', { defaultValue: 'Shared links' })} onClose={onClose}>
      {!signedIn ? (
        <p className="px-4 py-6 text-sm text-app-text-muted">
          {t('links-signed-out', { defaultValue: 'Sign in to see the links you have shared.' })}
        </p>
      ) : shares.isPending ? (
        <p className="px-4 py-6 text-sm text-app-text-muted">{t('loading', { defaultValue: 'Loading…' })}</p>
      ) : shares.isError ? (
        <div className="flex flex-col items-start gap-2 px-4 py-6 text-sm">
          <p className="text-app-text-muted">{t('links-failed', { defaultValue: 'Could not load your links.' })}</p>
          <button type="button" className={SHARE_BUTTON} onClick={() => void shares.refetch()}>
            {t('retry', { defaultValue: 'Try again' })}
          </button>
        </div>
      ) : shares.data.shares.length === 0 ? (
        <p className="px-4 py-6 text-sm text-app-text-muted">
          {t('links-empty', {
            defaultValue: 'You have not shared anything yet. Use Share a copy in the Projects menu.',
          })}
        </p>
      ) : (
        <ul aria-label={t('links-list', { defaultValue: 'Your shared links' })} className={arrival}>
          {shares.data.shares.map((share) => (
            <li key={share.token} className={ROW}>
              <span className="min-w-0 flex-1">
                <bdi dir="auto" className="block truncate font-medium">
                  {share.name}
                </bdi>
                <span className="block text-xs text-app-text-muted">
                  {share.revoked
                    ? t('links-meta-stopped', {
                        date: date(share.createdAt),
                        defaultValue: '{{date}} · sharing stopped',
                      })
                    : t('links-meta', {
                        date: date(share.createdAt),
                        count: share.openCount,
                        defaultValue_one: '{{date}} · opened {{count}} time',
                        defaultValue_other: '{{date}} · opened {{count}} times',
                        defaultValue: '{{date}} · opened {{count}} times',
                      })}
                </span>
              </span>
              {share.revoked ? null : (
                <>
                  <button type="button" className={SHARE_BUTTON} onClick={() => void copy(share.token)}>
                    {t('copy-link', { defaultValue: 'Copy link' })}
                  </button>
                  <button type="button" className={SHARE_BUTTON} onClick={() => void stop(share)}>
                    {t('stop-sharing', { defaultValue: 'Stop sharing' })}
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </ShareDialogFrame>
  );
}
