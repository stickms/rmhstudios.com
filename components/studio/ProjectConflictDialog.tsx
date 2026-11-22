/**
 * "This project changed on another device." A cloud save was refused because the account copy moved on since this
 * device last synced. The member overwrites the account copy, opens the newer copy (replacing the open project), or
 * cancels and decides later. Escape and the scrim are a cancel: nothing is overwritten without a choice.
 */
import { useTranslation } from 'react-i18next';
import * as DialogPrimitive from '@radix-ui/react-dialog';
// The shared overlay owns the full-viewport layer (one audited place for iOS's edge contract).
import { DialogOverlay } from '@/components/ui/dialog';
import { appRoot } from '@/components/studio/app-root';
import type { ProjectConflict, ProjectSession } from '@/components/studio/useProjectSession';

const BUTTON =
  'min-h-9 rounded-app-sm border border-app-border px-3 py-2 text-sm font-medium hover:bg-app-surface-hover pointer-coarse:min-h-11';

export function ProjectConflictDialog({ conflict, session }: { conflict: ProjectConflict; session: ProjectSession }) {
  const { t } = useTranslation('studio-projects');
  return (
    <DialogPrimitive.Root open onOpenChange={(next) => !next && void session.resolveConflict('cancel')}>
      {/* Into the app root, where the --app-* tokens are defined (a body-level portal would lose them). */}
      <DialogPrimitive.Portal container={appRoot()}>
        <DialogOverlay className="app-overlay" style={{ background: 'var(--app-scrim)' }} />
        <DialogPrimitive.Content
          className="app-modal border border-app-border bg-app-surface text-app-text fixed left-1/2 top-1/2 z-50 w-[calc(100dvw-1.5rem)] max-w-md -translate-x-1/2 -translate-y-1/2 p-5 outline-none"
          style={{ borderRadius: 'var(--app-radius-lg)' }}
        >
          <DialogPrimitive.Title className="text-base font-semibold">
            {t('conflict-title', { defaultValue: 'This project changed on another device' })}
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="mt-2 text-sm text-app-text-muted">
            {t('conflict-description', {
              name: conflict.name,
              defaultValue:
                'The copy of {{name}} on your account is newer than the one this device last synced. Overwrite it with this version, or open the newer copy. Opening it replaces the project on this device.',
            })}
          </DialogPrimitive.Description>
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <DialogPrimitive.Close className={BUTTON}>
              {t('conflict-cancel', { defaultValue: 'Cancel' })}
            </DialogPrimitive.Close>
            <button type="button" className={BUTTON} onClick={() => void session.resolveConflict('open-newer')}>
              {t('conflict-open-newer', { defaultValue: 'Open newer copy' })}
            </button>
            <button
              type="button"
              className="min-h-9 rounded-app-sm bg-app-accent px-3 py-2 text-sm font-semibold text-app-accent-fg hover:bg-app-accent-hover pointer-coarse:min-h-11"
              onClick={() => void session.resolveConflict('overwrite')}
            >
              {t('conflict-overwrite', { defaultValue: 'Overwrite' })}
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
