/**
 * Edit and delete for a job the member added themselves (sprint 13, feature 08): two plain buttons under the job's
 * heading, in the pipeline's editor and on the job page. Delete asks first (`useConfirm`) and says what goes with the
 * job; the form is the lazy-loaded `OwnJobDialog`, so zod stays off the route until Edit is pressed.
 */
import { lazy, Suspense, useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useRefusalText } from '@/components/errors/useRefusalText';
import { api } from '@/lib/contract/client';
import { toast } from '@/lib/toast';
import { deleteOwnJobApi } from '@/lib/rmhladder/own-jobs.contract';
import { ownJobViewOf } from '@/lib/rmhladder/own-jobs';
import { YoursLabel } from './YoursLabel';

const OwnJobDialog = lazy(() => import('./OwnJobDialog'));

export function OwnJobControls({
  job,
  ownJobCount,
  onChanged,
  onDeleted,
}: {
  /** The job row, with its company. */
  job: Record<string, unknown>;
  ownJobCount: number;
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const { t } = useTranslation('ladder-own-jobs');
  const confirm = useConfirm();
  const refusalText = useRefusalText();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const jobTitle = String(job.title ?? '');
  const company = (job.company as { name?: string } | undefined)?.name ?? '';

  async function remove() {
    const ok = await confirm({
      title: t('delete.title', { defaultValue: 'Delete this job?' }),
      description: t('delete.description', {
        defaultValue:
          'This also deletes your application for it, its history and any offer you recorded. This cannot be undone.',
      }),
      confirmLabel: t('delete.confirm', { defaultValue: 'Delete job' }),
      cancelLabel: t('action.cancel', { defaultValue: 'Cancel' }),
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api(deleteOwnJobApi, { params: { id: String(job.id) } });
      toast.success(t('toast.deleted', { defaultValue: 'Job deleted' }));
      onDeleted();
    } catch (err) {
      toast.error(
        refusalText.maybe(err) ?? t('error.deleteFailed', { defaultValue: 'Could not delete this job. Try again.' }),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="flex flex-wrap items-center gap-2"
      role="group"
      aria-label={t('controls.label', { defaultValue: 'Your job' })}
    >
      <YoursLabel />
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={() => setEditing(true)}
        aria-label={t('controls.editNamed', { defaultValue: 'Edit {{title}}', title: jobTitle })}
      >
        <Pencil aria-hidden />
        {t('controls.edit', { defaultValue: 'Edit job' })}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="danger"
        loading={busy}
        onClick={() => void remove()}
        aria-label={t('controls.deleteNamed', {
          defaultValue: 'Delete {{title}} at {{company}}',
          title: jobTitle,
          company,
        })}
      >
        <Trash2 aria-hidden />
        {t('controls.delete', { defaultValue: 'Delete job' })}
      </Button>
      {editing && (
        <Suspense fallback={null}>
          <OwnJobDialog
            open
            onOpenChange={(open) => !open && setEditing(false)}
            job={ownJobViewOf(job)}
            ownJobCount={ownJobCount}
            onSaved={onChanged}
          />
        </Suspense>
      )}
    </div>
  );
}
