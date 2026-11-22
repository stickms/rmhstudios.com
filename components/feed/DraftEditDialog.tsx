import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { api } from '@/lib/contract/client';
import { HttpError } from '@/lib/http';
import { updateScheduledApi } from '@/lib/scheduled/scheduled.contract';
import { MAX_IMAGE_ALT_LENGTH, MAX_RMHARK_LENGTH } from '@/lib/rmhark-limits';
import { toast } from '@/lib/toast';
import {
  MAX_CONTENT_WARNING_LENGTH,
  diffDraftEdit,
  draftEditError,
  formFromRow,
  hasChanges,
  isPastTime,
  warningInvalid,
  type DraftEditError,
  type DraftEditForm,
  type DraftEditRow,
} from './draft-edit';

/** The row as the drafts list holds it, plus the parts the dialog shows read-only. */
export interface DraftEditSubject extends DraftEditRow {
  gifUrl: string | null;
  poll: { question?: string } | null;
  unlockPrice: number | null;
}

/**
 * The dialog's fields. Presentational: the state lives in {@link DraftEditDialog}, so this renders on the server for
 * the test and the dialog can ask before it throws unsaved changes away.
 */
export function DraftEditFields({
  row,
  form,
  onChange,
  error,
  pastNow,
  uid,
}: {
  row: DraftEditSubject;
  form: DraftEditForm;
  onChange: (next: DraftEditForm) => void;
  error: DraftEditError | null;
  /** The chosen time is not in the future (shown before the round trip). */
  pastNow: boolean;
  uid: string;
}) {
  const { t } = useTranslation('draft-edit');
  const textId = `${uid}-text`;
  const timeId = `${uid}-time`;
  const timeErrId = `${uid}-time-error`;
  const audienceId = `${uid}-audience`;
  const warningId = `${uid}-warning`;
  const warningErrId = `${uid}-warning-error`;
  const imagesErrId = `${uid}-images-error`;
  const remaining = MAX_RMHARK_LENGTH - form.content.length;
  const timeError = pastNow || error?.field === 'time';
  const warnBad = warningInvalid(form);
  const missing = error?.field === 'images' ? (error.missing ?? []) : [];
  const readOnly: string[] = [];
  if (row.gifUrl) readOnly.push(t('read-only-gif', { defaultValue: 'GIF' }));
  if (row.poll) readOnly.push(t('read-only-poll', { defaultValue: 'Poll' }));
  if (row.unlockPrice && row.unlockPrice > 0) readOnly.push(t('read-only-price', { defaultValue: 'Unlock price' }));

  return (
    <div className="grid gap-4">
      <div className="grid gap-1.5">
        <label htmlFor={textId} className="t-label">
          {t('field-text', { defaultValue: 'Text' })}
        </label>
        <Textarea
          id={textId}
          dir="auto"
          value={form.content}
          maxLength={MAX_RMHARK_LENGTH}
          rows={4}
          onChange={(e) => onChange({ ...form, content: e.target.value })}
        />
        <p className="t-meta" aria-live="off">
          {t('characters-left', { count: remaining, defaultValue: '{{count}} characters left' })}
        </p>
      </div>

      <div className="grid gap-1.5">
        <label htmlFor={timeId} className="t-label">
          {t('field-time', { defaultValue: 'Publish at' })}
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            id={timeId}
            type="datetime-local"
            value={form.time}
            className="w-auto"
            aria-invalid={timeError || undefined}
            aria-describedby={timeError ? timeErrId : undefined}
            onChange={(e) => onChange({ ...form, time: e.target.value })}
          />
          {form.time !== '' && (
            <Button type="button" size="sm" variant="ghost" onClick={() => onChange({ ...form, time: '' })}>
              {t('keep-as-draft', { defaultValue: 'Keep as draft' })}
            </Button>
          )}
        </div>
        {form.time === '' && (
          <p className="t-meta">{t('draft-note', { defaultValue: 'No time set: this stays a draft.' })}</p>
        )}
        {timeError && (
          <p id={timeErrId} role="alert" className="t-meta text-site-danger">
            {t('error-past', { defaultValue: 'Pick a time in the future' })}
          </p>
        )}
      </div>

      <div className="grid gap-1.5">
        <label htmlFor={audienceId} className="t-label">
          {t('field-audience', { defaultValue: 'Audience' })}
        </label>
        <Select
          id={audienceId}
          value={form.audience}
          onChange={(e) => onChange({ ...form, audience: e.target.value as DraftEditForm['audience'] })}
        >
          <option value="PUBLIC">{t('audience-public', { defaultValue: 'Public' })}</option>
          <option value="FOLLOWERS">{t('audience-followers', { defaultValue: 'Followers' })}</option>
          <option value="PRIVATE">{t('audience-private', { defaultValue: 'Private' })}</option>
        </Select>
      </div>

      <div className="grid gap-1.5">
        <label htmlFor={warningId} className="t-label">
          {t('field-warning', { defaultValue: 'Content warning' })}
        </label>
        <Input
          id={warningId}
          value={form.contentWarning}
          placeholder={t('warning-placeholder', { defaultValue: 'Optional reason' })}
          aria-invalid={warnBad || undefined}
          aria-describedby={warnBad ? warningErrId : undefined}
          onChange={(e) => onChange({ ...form, contentWarning: e.target.value })}
        />
        {warnBad && (
          <p id={warningErrId} role="alert" className="t-meta text-site-danger">
            {t('error-warning', {
              max: MAX_CONTENT_WARNING_LENGTH,
              defaultValue: 'A reason is at most {{max}} characters on one line',
            })}
          </p>
        )}
      </div>

      {row.imageUrls.length > 0 && (
        <fieldset className="grid gap-3">
          <legend className="t-label">{t('field-images', { defaultValue: 'Image descriptions' })}</legend>
          {row.imageUrls.map((url, i) => {
            const id = `${uid}-alt-${i}`;
            const needed = missing.includes(i);
            return (
              <div key={url} className="flex items-start gap-3">
                <img
                  src={url}
                  alt=""
                  loading="lazy"
                  className="size-16 shrink-0 rounded-site border border-site-border bg-site-bg-subtle object-cover"
                />
                <div className="grid min-w-0 flex-1 gap-1.5">
                  <label htmlFor={id} className="t-meta">
                    {t('field-image-alt', { number: i + 1, defaultValue: 'Description of image {{number}}' })}
                  </label>
                  <Input
                    id={id}
                    value={form.imageAlts[i] ?? ''}
                    maxLength={MAX_IMAGE_ALT_LENGTH}
                    aria-invalid={needed || undefined}
                    aria-describedby={error?.field === 'images' ? imagesErrId : undefined}
                    onChange={(e) => {
                      const imageAlts = [...form.imageAlts];
                      imageAlts[i] = e.target.value;
                      onChange({ ...form, imageAlts });
                    }}
                  />
                </div>
              </div>
            );
          })}
          {error?.field === 'images' && (
            <p id={imagesErrId} role="alert" className="t-meta text-site-danger">
              {t('error-alt-required', { defaultValue: 'This community needs a description for every image' })}
            </p>
          )}
        </fieldset>
      )}

      {(row.imageUrls.length > 0 || readOnly.length > 0) && (
        <p className="t-meta">
          {t('read-only-note', {
            defaultValue:
              'Images, GIF, poll and price stay as they are. To change them, discard the draft and write it again.',
          })}
          {readOnly.length > 0 && ` (${readOnly.join(', ')})`}
        </p>
      )}

      {error && error.field === 'form' && (
        <p role="alert" className="t-meta text-site-danger">
          <FormErrorLine error={error} />
        </p>
      )}
    </div>
  );
}

function FormErrorLine({ error }: { error: DraftEditError }) {
  const { t } = useTranslation('draft-edit');
  switch (error.code) {
    case 'published':
      return <>{t('error-published', { defaultValue: 'This post has already been published' })}</>;
    case 'not_found':
      return <>{t('error-not-found', { defaultValue: 'This draft no longer exists' })}</>;
    case 'capsule_sealed':
      return <>{t('error-capsule', { defaultValue: 'A time capsule is sealed and cannot be edited' })}</>;
    case 'message':
      return <>{error.message}</>;
    default:
      return <>{t('error-unknown', { defaultValue: 'Could not save. Try again.' })}</>;
  }
}

/**
 * Edit a draft or scheduled post. Mounted only while editing (the list keys it by row), so the form starts from the
 * row each time. Saving sends only what changed; closing with unsaved changes asks first.
 */
export function DraftEditDialog({
  row,
  onClose,
  onSaved,
}: {
  row: DraftEditSubject;
  onClose: () => void;
  /** Called after a save, or when the row turned out to be published or gone, so the list can reload. */
  onSaved: () => void;
}) {
  const { t } = useTranslation('draft-edit');
  const confirm = useConfirm();
  const uid = useId();
  const [form, setForm] = useState<DraftEditForm>(() => formFromRow(row));
  const [error, setError] = useState<DraftEditError | null>(null);
  const [saving, setSaving] = useState(false);
  const patch = diffDraftEdit(row, form);
  const dirty = hasChanges(patch);
  const pastNow = isPastTime(form.time);

  async function requestClose() {
    if (saving) return;
    if (dirty) {
      const discard = await confirm({
        title: t('discard-title', { defaultValue: 'Discard your changes?' }),
        confirmLabel: t('discard-confirm', { defaultValue: 'Discard' }),
        cancelLabel: t('discard-cancel', { defaultValue: 'Keep editing' }),
        danger: true,
      });
      if (!discard) return;
    }
    onClose();
  }

  async function save() {
    if (!dirty || saving) return;
    if (pastNow) {
      setError({ field: 'time', code: 'past' });
      return;
    }
    if (warningInvalid(form)) return;
    setSaving(true);
    setError(null);
    try {
      await api(updateScheduledApi, { params: { id: row.id }, body: patch });
      onSaved();
      onClose();
    } catch (e) {
      const line = draftEditError(e instanceof HttpError ? { status: e.status, body: e.body } : {});
      if (line.code === 'published' || line.code === 'not_found') {
        // The row left the list: say so, close, and reload.
        toast.error(
          line.code === 'published'
            ? t('error-published', { defaultValue: 'This post has already been published' })
            : t('error-not-found', { defaultValue: 'This draft no longer exists' }),
        );
        onSaved();
        onClose();
        return;
      }
      setError(line);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) void requestClose();
      }}
    >
      <DialogContent mobileFullscreen>
        <DialogHeader>
          <DialogTitle>{t('title', { defaultValue: 'Edit post' })}</DialogTitle>
        </DialogHeader>
        <DraftEditFields
          row={row}
          form={form}
          onChange={(next) => {
            setForm(next);
            setError(null);
          }}
          error={error}
          pastNow={pastNow}
          uid={uid}
        />
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => void requestClose()}>
            {t('cancel', { defaultValue: 'Cancel' })}
          </Button>
          <Button
            type="button"
            variant="default"
            loading={saving}
            disabled={!dirty || warningInvalid(form)}
            onClick={() => void save()}
          >
            {t('save', { defaultValue: 'Save' })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
