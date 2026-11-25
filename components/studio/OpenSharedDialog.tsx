/**
 * Open a shared project — the dialog behind `/studio?share=<token>`. It shows the project's name, who shared it, its
 * tracks and how many clips need a sample, and "Open a copy" makes a new project on this device (fresh ids). Signed-out
 * visitors can open a copy too. A revoked, taken-down or unknown link shows "This link no longer works" (the server
 * answers all three the same way). The address bar is cleaned of `?share=` as soon as the token is read, so it is not
 * left in the history of a shared computer.
 */
import { lazy, Suspense, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { SHARE_BUTTON, SHARE_PRIMARY_BUTTON, ShareDialogFrame } from '@/components/studio/ShareDialogFrame';
import type { ProjectSession } from '@/components/studio/useProjectSession';
import { apiQuery } from '@/lib/contract/client';
import { HttpError } from '@/lib/http';
import { toast } from '@/lib/toast';
import { SHARE_TOKEN_PATTERN, extractShareParam, withoutShareParam } from '@/lib/studio/share';
import { readShareApi } from '@/lib/studio/share.contract';
import type { Project } from '@/lib/studio/types';

// The report dialog carries zod; it is fetched only when someone reports.
const ReportDialog = lazy(() =>
  import('@/components/moderation/ReportDialog').then((m) => ({ default: m.ReportDialog })),
);

/**
 * The share token in the address, read once after mount and then removed from the address bar
 * (`history.replaceState`). `dismiss` closes the dialog.
 */
export function useSharedLink(): { token: string | null; dismiss: () => void } {
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    const found = extractShareParam(window.location.search);
    if (found === null) return;
    setToken(found);
    try {
      window.history.replaceState(window.history.state, '', withoutShareParam(window.location.href));
    } catch {
      // A browser that refuses the rewrite leaves the address as it was; the dialog still works.
    }
  }, []);
  return { token, dismiss: () => setToken(null) };
}

export function OpenSharedDialog({
  token,
  session,
  onClose,
}: {
  token: string;
  session: ProjectSession;
  onClose: () => void;
}) {
  const { t } = useTranslation('studio-share');
  const valid = SHARE_TOKEN_PATTERN.test(token);
  const [reporting, setReporting] = useState(false);
  const [opening, setOpening] = useState(false);
  const shared = useQuery({
    ...apiQuery(readShareApi, { params: { token } }),
    enabled: valid,
    retry: false,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const gone = !valid || (shared.isError && shared.error instanceof HttpError && shared.error.status === 404);

  const openCopy = async () => {
    if (!shared.data) return;
    setOpening(true);
    try {
      const { share } = shared.data;
      // The validated snapshot has the shape of a project; the copy mints its own ids.
      if (await session.openSharedCopy(share.data as Project, share.name)) {
        toast.success(t('opened', { defaultValue: 'Opened a copy. Your changes stay on your copy.' }));
        onClose();
      }
    } finally {
      setOpening(false);
    }
  };

  return (
    <>
      {/* While the report dialog is up this one steps aside, so two modal layers never stack. */}
      {reporting ? null : (
        <ShareDialogFrame title={t('open-title', { defaultValue: 'Shared project' })} onClose={onClose}>
          {gone ? (
            <div className="flex flex-col items-start gap-3 px-4 py-6 text-sm">
              <p>{t('gone', { defaultValue: 'This link no longer works.' })}</p>
              <button type="button" className={SHARE_BUTTON} onClick={onClose}>
                {t('close', { defaultValue: 'Close' })}
              </button>
            </div>
          ) : shared.isPending ? (
            <p className="px-4 py-6 text-sm text-app-text-muted">{t('loading', { defaultValue: 'Loading…' })}</p>
          ) : shared.isError ? (
            <div className="flex flex-col items-start gap-2 px-4 py-6 text-sm">
              <p className="text-app-text-muted">{t('open-failed', { defaultValue: 'Could not load this link.' })}</p>
              <button type="button" className={SHARE_BUTTON} onClick={() => void shared.refetch()}>
                {t('retry', { defaultValue: 'Try again' })}
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3 px-4 py-4 text-sm">
              <p dir="auto" className="text-base font-semibold">
                {shared.data.share.name}
              </p>
              {shared.data.share.sharerName ? (
                <p className="text-app-text-muted">
                  {t('shared-by', {
                    name: shared.data.share.sharerName,
                    defaultValue: 'Shared by {{name}}',
                  })}
                </p>
              ) : null}
              <p>
                {t('tracks', {
                  count: shared.data.share.trackCount,
                  defaultValue_one: '{{count}} track',
                  defaultValue_other: '{{count}} tracks',
                  defaultValue: '{{count}} tracks',
                })}
              </p>
              {shared.data.share.missingSamples > 0 ? (
                <p>
                  {t('needs-samples', {
                    count: shared.data.share.missingSamples,
                    defaultValue_one: '{{count}} clip needs a sample',
                    defaultValue_other: '{{count}} clips need a sample',
                    defaultValue: '{{count}} clips need a sample',
                  })}
                </p>
              ) : null}
              <p className="text-app-text-muted">
                {t('open-explain', {
                  defaultValue:
                    'You get a copy of your own on this device. Changes you make do not reach the original.',
                })}
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={SHARE_PRIMARY_BUTTON}
                  disabled={opening}
                  onClick={() => void openCopy()}
                >
                  {t('open-copy', { defaultValue: 'Open a copy' })}
                </button>
                <button type="button" className={SHARE_BUTTON} onClick={onClose}>
                  {t('cancel', { defaultValue: 'Cancel' })}
                </button>
                {session.signedIn ? (
                  <button type="button" className={SHARE_BUTTON} onClick={() => setReporting(true)}>
                    {t('report', { defaultValue: 'Report' })}
                  </button>
                ) : null}
              </div>
            </div>
          )}
        </ShareDialogFrame>
      )}
      {reporting ? (
        <Suspense fallback={null}>
          <ReportDialog open onOpenChange={setReporting} entityType="studio-share" entityId={token} />
        </Suspense>
      ) : null}
    </>
  );
}
