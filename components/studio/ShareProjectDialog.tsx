/**
 * Share a copy — make a link to a snapshot of the open account project. The copy is made on the server from the
 * version saved on the account, with every audio clip's sample left out (samples stay on this device), and the member
 * is told how many clips that is before anything is created. The link is shown once it exists; "Shared links" lists
 * it afterwards.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Copy } from 'lucide-react';
import { useRefusalText } from '@/components/errors/useRefusalText';
import { SHARE_BUTTON, SHARE_PRIMARY_BUTTON, ShareDialogFrame } from '@/components/studio/ShareDialogFrame';
import type { ProjectSession } from '@/components/studio/useProjectSession';
import { api } from '@/lib/contract/client';
import { toast } from '@/lib/toast';
import { countAudioClips } from '@/lib/studio/share';
import { createShareApi, listSharesApi, type ShareSummary } from '@/lib/studio/share.contract';
import { useStudioStore } from '@/lib/studio/store';
import { shareUrl, writeToClipboard } from '@/components/studio/share-link';

export function ShareProjectDialog({ session, onClose }: { session: ProjectSession; onClose: () => void }) {
  const { t } = useTranslation('studio-share');
  const refusalText = useRefusalText();
  const queryClient = useQueryClient();
  const clips = useStudioStore((s) => s.clips);
  const [created, setCreated] = useState<ShareSummary | null>(null);
  const [copied, setCopied] = useState(false);
  const missing = countAudioClips(clips);

  const create = useMutation({
    mutationFn: async () => {
      const id = session.projectId;
      // The copy is made from the account's version, so bring it up to date first (it also saves this device's copy).
      if (session.signedIn && (!session.linked || session.saveState !== 'saved')) await session.saveToAccount();
      if (!id) throw new Error('no-project');
      return api(createShareApi, { body: { projectId: id } });
    },
    onSuccess: ({ share }) => {
      setCreated(share);
      void queryClient.invalidateQueries({ queryKey: [listSharesApi.path] });
    },
    onError: (error) => {
      toast.error(
        refusalText.maybe(error) ??
          t('create-failed', {
            defaultValue: 'Could not make a link. Save the project to your account and try again.',
          }),
      );
    },
  });

  const copy = async (token: string) => {
    const ok = await writeToClipboard(shareUrl(token));
    if (ok) {
      setCopied(true);
      toast.success(t('link-copied', { defaultValue: 'Link copied.' }));
    } else {
      toast.error(t('copy-failed', { defaultValue: 'Could not copy the link. Select it and copy it by hand.' }));
    }
  };

  return (
    <ShareDialogFrame title={t('share-title', { defaultValue: 'Share a copy' })} onClose={onClose}>
      {!session.signedIn ? (
        <p className="px-4 py-6 text-sm text-app-text-muted">
          {t('share-signed-out', { defaultValue: 'Sign in and save this project to your account to share a copy.' })}
        </p>
      ) : created ? (
        <div className="flex flex-col gap-3 px-4 py-4 text-sm">
          <p>{t('share-created', { defaultValue: 'Your link is ready. Anyone who has it can open a copy.' })}</p>
          <input
            readOnly
            dir="ltr"
            aria-label={t('share-link-label', { defaultValue: 'Link to the copy' })}
            value={shareUrl(created.token)}
            onFocus={(event) => event.currentTarget.select()}
            className="min-h-9 w-full rounded-app-sm border border-app-border bg-app-bg px-2 text-xs pointer-coarse:min-h-11"
          />
          <div className="flex gap-2">
            <button type="button" className={SHARE_PRIMARY_BUTTON} onClick={() => void copy(created.token)}>
              <span className="inline-flex items-center gap-1.5">
                {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
                {t('copy-link', { defaultValue: 'Copy link' })}
              </span>
            </button>
            <button type="button" className={SHARE_BUTTON} onClick={onClose}>
              {t('done', { defaultValue: 'Done' })}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3 px-4 py-4 text-sm">
          <p>
            <bdi dir="auto" className="font-medium">
              {session.name}
            </bdi>
          </p>
          <p className="text-app-text-muted">
            {t('share-explain', {
              defaultValue:
                'This makes a copy of the version saved on your account. Later changes do not reach the copy, and changes made to it do not reach your project. You can stop sharing at any time.',
            })}
          </p>
          <p>
            {missing === 0
              ? t('share-no-samples', { defaultValue: 'No clips use a sample of your own.' })
              : t('share-samples', {
                  count: missing,
                  defaultValue_one:
                    '{{count}} clip needs a sample. Your samples stay on this device, so it plays silent in the copy.',
                  defaultValue_other:
                    '{{count}} clips need a sample. Your samples stay on this device, so they play silent in the copy.',
                  defaultValue:
                    '{{count}} clips need a sample. Your samples stay on this device, so they play silent in the copy.',
                })}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              className={SHARE_PRIMARY_BUTTON}
              disabled={create.isPending}
              onClick={() => create.mutate()}
            >
              {create.isPending
                ? t('share-working', { defaultValue: 'Making the link…' })
                : t('share-confirm', { defaultValue: 'Make link' })}
            </button>
            <button type="button" className={SHARE_BUTTON} onClick={onClose}>
              {t('cancel', { defaultValue: 'Cancel' })}
            </button>
          </div>
        </div>
      )}
    </ShareDialogFrame>
  );
}
