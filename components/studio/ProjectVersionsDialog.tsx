/**
 * Versions — the earlier versions of the open account project, newest first. Each row has Restore (written back as a
 * new save, after a confirmation that names the time) and Open as copy (a new local project; the account copy is not
 * touched). Painted with `--app-*` tokens, like every Studio overlay.
 */
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
// The shared overlay owns the full-viewport layer (one audited place for iOS's edge contract).
import { DialogOverlay } from '@/components/ui/dialog';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useArrival } from '@/components/ui/arrive';
import { appRoot } from '@/components/studio/app-root';
import { apiQuery } from '@/lib/contract/client';
import { formatProjectSize } from '@/lib/studio/project-session';
import { listProjectVersionsApi, type ProjectVersionSummary } from '@/lib/studio/project-history.contract';
import type { ProjectSession } from '@/components/studio/useProjectSession';

const ROW = 'flex flex-wrap items-center gap-2 border-b border-app-border px-4 py-2 text-sm';
const BUTTON =
  'min-h-9 rounded-app-sm border border-app-border px-3 text-sm font-medium hover:bg-app-surface-hover pointer-coarse:min-h-11';

export function ProjectVersionsDialog({ session, onClose }: { session: ProjectSession; onClose: () => void }) {
  const { t, i18n } = useTranslation('studio-history');
  const confirm = useConfirm();
  const projectId = session.projectId;
  const versions = useQuery({
    ...apiQuery(listProjectVersionsApi, { params: { id: projectId ?? '' } }),
    enabled: projectId !== null,
  });
  const arrival = useArrival(!versions.isPending);

  const format = (iso: string, short: boolean) =>
    new Intl.DateTimeFormat(
      i18n.language,
      short
        ? { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }
        : { dateStyle: 'medium', timeStyle: 'short' },
    ).format(new Date(iso));

  const restore = async (version: ProjectVersionSummary) => {
    const when = format(version.savedAt, false);
    const ok = await confirm({
      title: t('restore-title', { when, defaultValue: 'Restore the version from {{when}}?' }),
      description: t('restore-description', {
        defaultValue:
          'It is saved to your account as a new save. The current version is kept in this list first, so you can go back.',
      }),
      confirmLabel: t('restore-confirm', { defaultValue: 'Restore' }),
      cancelLabel: t('restore-cancel', { defaultValue: 'Cancel' }),
    });
    if (ok && (await session.restoreVersion(version.id))) onClose();
  };

  const openCopy = async (version: ProjectVersionSummary) => {
    const copyName = t('copy-name', {
      name: session.name,
      when: format(version.savedAt, true),
      defaultValue: '{{name}} (version of {{when}})',
    });
    if (await session.openVersionAsCopy(version.id, copyName)) onClose();
  };

  return (
    <DialogPrimitive.Root open onOpenChange={(next) => !next && onClose()}>
      {/* Into the app root, where the --app-* tokens are defined (a body-level portal would lose them). */}
      <DialogPrimitive.Portal container={appRoot()}>
        <DialogOverlay className="app-overlay" style={{ background: 'var(--app-scrim)' }} />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="app-modal border border-app-border bg-app-surface text-app-text fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100dvh-1.5rem)] w-[calc(100dvw-1.5rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden outline-none"
          style={{ borderRadius: 'var(--app-radius-lg)' }}
        >
          <div className="flex shrink-0 items-center justify-between gap-2 px-4 pb-3 pt-4">
            <DialogPrimitive.Title className="text-base font-semibold">
              {t('title', { defaultValue: 'Versions' })}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              aria-label={t('close', { defaultValue: 'Close' })}
              className="flex size-9 items-center justify-center rounded-app-sm text-app-text-muted hover:bg-app-surface-hover hover:text-app-text pointer-coarse:size-11"
            >
              <X className="size-4" aria-hidden />
            </DialogPrimitive.Close>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto border-t border-app-border">
            {!session.signedIn ? (
              <p className="px-4 py-6 text-sm text-app-text-muted">
                {t('signed-out', { defaultValue: 'Sign in to see earlier versions of your account projects.' })}
              </p>
            ) : versions.isPending ? (
              <p className="px-4 py-6 text-sm text-app-text-muted">{t('loading', { defaultValue: 'Loading…' })}</p>
            ) : versions.isError ? (
              <div className="flex flex-col items-start gap-2 px-4 py-6 text-sm">
                <p className="text-app-text-muted">
                  {t('load-failed', { defaultValue: 'Could not load the versions.' })}
                </p>
                <button type="button" className={BUTTON} onClick={() => void versions.refetch()}>
                  {t('retry', { defaultValue: 'Try again' })}
                </button>
              </div>
            ) : versions.data.versions.length === 0 ? (
              <p className="px-4 py-6 text-sm text-app-text-muted">
                {t('empty', {
                  defaultValue:
                    'No earlier versions yet. Versions are kept when you save, at most one every ten minutes.',
                })}
              </p>
            ) : (
              <ul aria-label={t('list', { defaultValue: 'Earlier versions' })} className={arrival}>
                {versions.data.versions.map((version) => (
                  <li key={version.id} className={ROW}>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{format(version.savedAt, false)}</span>
                      <span className="block text-xs text-app-text-muted">
                        {t('meta', {
                          size: formatProjectSize(version.sizeBytes, i18n.language),
                          count: version.trackCount,
                          defaultValue_one: '{{size}} · {{count}} track',
                          defaultValue_other: '{{size}} · {{count}} tracks',
                          defaultValue: '{{size}} · {{count}} tracks',
                        })}
                      </span>
                    </span>
                    <button type="button" className={BUTTON} onClick={() => void restore(version)}>
                      {t('restore', { defaultValue: 'Restore' })}
                    </button>
                    <button type="button" className={BUTTON} onClick={() => void openCopy(version)}>
                      {t('open-copy', { defaultValue: 'Open as copy' })}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
