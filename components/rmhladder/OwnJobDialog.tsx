/**
 * Add or edit a job found elsewhere (sprint 13, feature 08). Lazy-loaded by `OwnJobControls` and the pipeline route, so
 * the zod schema it validates with never reaches the route's critical path.
 *
 * `OwnJobForm` is the hooks-free view (labels come in as props, so the test renders it to markup with no DOM); the
 * dialog holds the state, validates with the shared schema and calls the typed endpoints from an event handler.
 */
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { useRefusalText } from '@/components/errors/useRefusalText';
import { api } from '@/lib/contract/client';
import { toast } from '@/lib/toast';
import { createOwnJobApi, updateOwnJobApi } from '@/lib/rmhladder/own-jobs.contract';
import {
  LADDER_OWN_JOB_LIMIT,
  OWN_JOB_COMPANY_MAX,
  OWN_JOB_LINK_MAX,
  OWN_JOB_LOCATION_MAX,
  OWN_JOB_TITLE_MAX,
  type OwnJobView,
} from '@/lib/rmhladder/own-jobs';
import { ownJobBody } from '@/lib/rmhladder/own-jobs-schema';

export interface OwnJobFormValues {
  title: string;
  company: string;
  link: string;
  location: string;
  remoteStatus: string;
  employmentType: string;
  deadline: string;
  payMin: string;
  payMax: string;
  payPeriod: string;
  payCurrency: string;
}

export type OwnJobField = keyof OwnJobFormValues;

export interface OwnJobFormLabels {
  title: string;
  company: string;
  link: string;
  linkHint: string;
  location: string;
  remote: string;
  remoteOptions: { value: string; label: string }[];
  employment: string;
  employmentOptions: { value: string; label: string }[];
  deadline: string;
  payMin: string;
  payMax: string;
  payPeriod: string;
  payPeriodOptions: { value: string; label: string }[];
  currency: string;
  submit: string;
  cancel: string;
}

const CURRENCIES = ['USD', 'CAD', 'EUR', 'GBP', 'AUD', 'INR', 'JPY', 'CHF', 'SGD', 'NZD'] as const;

export const EMPTY_OWN_JOB_VALUES: OwnJobFormValues = {
  title: '',
  company: '',
  link: '',
  location: '',
  remoteStatus: 'onsite',
  employmentType: 'internship',
  deadline: '',
  payMin: '',
  payMax: '',
  payPeriod: 'year',
  payCurrency: 'USD',
};

export function valuesOf(job: OwnJobView | undefined): OwnJobFormValues {
  if (!job) return EMPTY_OWN_JOB_VALUES;
  return {
    title: job.title,
    company: job.company,
    link: job.link ?? '',
    location: job.location ?? '',
    remoteStatus: job.remoteStatus,
    employmentType: job.employmentType,
    deadline: job.deadline ?? '',
    payMin: job.payMin === null ? '' : String(job.payMin),
    payMax: job.payMax === null ? '' : String(job.payMax),
    payPeriod: job.payPeriod,
    payCurrency: job.payCurrency,
  };
}

const idOf = (field: OwnJobField) => `own-job-${field}`;

/** The form as markup: every field is named by a label linked with `htmlFor`, and member-text fields carry `dir="auto"`. */
export function OwnJobForm({
  labels,
  values,
  errors,
  notice,
  formError,
  busy,
  capReached,
  onChange,
  onSubmit,
  onCancel,
}: {
  labels: OwnJobFormLabels;
  values: OwnJobFormValues;
  errors: Partial<Record<OwnJobField, string>>;
  /** The cap message, shown instead of letting a new job be saved. */
  notice: string | null;
  formError: string | null;
  busy: boolean;
  capReached: boolean;
  onChange: (field: OwnJobField, value: string) => void;
  onSubmit: (event: FormEvent) => void;
  onCancel: () => void;
}) {
  const describedBy = (field: OwnJobField) => (errors[field] ? `${idOf(field)}-error` : undefined);
  const error = (field: OwnJobField) =>
    errors[field] ? (
      <p id={`${idOf(field)}-error`} className="t-meta text-site-danger">
        {errors[field]}
      </p>
    ) : null;
  const select = (field: OwnJobField, label: string, options: { value: string; label: string }[]) => (
    <div className="space-y-2">
      <Label htmlFor={idOf(field)}>{label}</Label>
      <Select id={idOf(field)} value={values[field]} onChange={(e) => onChange(field, e.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
    </div>
  );

  return (
    <form onSubmit={onSubmit} className="grid gap-5" noValidate>
      {notice && (
        <p role="status" className="t-meta border-b border-site-border pb-2">
          {notice}
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor={idOf('title')}>{labels.title}</Label>
          <Input
            id={idOf('title')}
            dir="auto"
            maxLength={OWN_JOB_TITLE_MAX}
            required
            aria-invalid={errors.title ? true : undefined}
            aria-describedby={describedBy('title')}
            value={values.title}
            onChange={(e) => onChange('title', e.target.value)}
          />
          {error('title')}
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor={idOf('company')}>{labels.company}</Label>
          <Input
            id={idOf('company')}
            dir="auto"
            maxLength={OWN_JOB_COMPANY_MAX}
            required
            aria-invalid={errors.company ? true : undefined}
            aria-describedby={describedBy('company')}
            value={values.company}
            onChange={(e) => onChange('company', e.target.value)}
          />
          {error('company')}
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor={idOf('link')}>{labels.link}</Label>
          <Input
            id={idOf('link')}
            dir="auto"
            type="url"
            inputMode="url"
            maxLength={OWN_JOB_LINK_MAX}
            placeholder="https://"
            aria-invalid={errors.link ? true : undefined}
            aria-describedby={describedBy('link')}
            value={values.link}
            onChange={(e) => onChange('link', e.target.value)}
          />
          {errors.link ? error('link') : <p className="t-meta">{labels.linkHint}</p>}
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor={idOf('location')}>{labels.location}</Label>
          <Input
            id={idOf('location')}
            dir="auto"
            maxLength={OWN_JOB_LOCATION_MAX}
            value={values.location}
            onChange={(e) => onChange('location', e.target.value)}
          />
        </div>
        {select('remoteStatus', labels.remote, labels.remoteOptions)}
        {select('employmentType', labels.employment, labels.employmentOptions)}
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor={idOf('deadline')}>{labels.deadline}</Label>
          <Input
            id={idOf('deadline')}
            type="date"
            aria-invalid={errors.deadline ? true : undefined}
            aria-describedby={describedBy('deadline')}
            value={values.deadline}
            onChange={(e) => onChange('deadline', e.target.value)}
          />
          {error('deadline')}
        </div>
        <div className="space-y-2">
          <Label htmlFor={idOf('payMin')}>{labels.payMin}</Label>
          <Input
            id={idOf('payMin')}
            inputMode="numeric"
            aria-invalid={errors.payMin ? true : undefined}
            aria-describedby={describedBy('payMin')}
            value={values.payMin}
            onChange={(e) => onChange('payMin', e.target.value)}
          />
          {error('payMin')}
        </div>
        <div className="space-y-2">
          <Label htmlFor={idOf('payMax')}>{labels.payMax}</Label>
          <Input
            id={idOf('payMax')}
            inputMode="numeric"
            aria-invalid={errors.payMax ? true : undefined}
            aria-describedby={describedBy('payMax')}
            value={values.payMax}
            onChange={(e) => onChange('payMax', e.target.value)}
          />
          {error('payMax')}
        </div>
        {select('payPeriod', labels.payPeriod, labels.payPeriodOptions)}
        {select(
          'payCurrency',
          labels.currency,
          CURRENCIES.map((code) => ({ value: code, label: code })),
        )}
      </div>
      {formError && (
        <p role="alert" className="t-meta text-site-danger">
          {formError}
        </p>
      )}
      <DialogFooter>
        <Button type="button" onClick={onCancel}>
          {labels.cancel}
        </Button>
        <Button type="submit" variant="primary" loading={busy} disabled={capReached}>
          {labels.submit}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** What the member typed, as the schema's input: blank fields become `null`, pay fields numbers. */
export function candidateOf(values: OwnJobFormValues) {
  const num = (text: string) => (text.trim() === '' ? null : Number(text.trim()));
  return {
    title: values.title,
    company: values.company,
    link: values.link.trim() || null,
    location: values.location.trim() || null,
    remoteStatus: values.remoteStatus,
    employmentType: values.employmentType,
    deadline: values.deadline || null,
    payMin: num(values.payMin),
    payMax: num(values.payMax),
    payPeriod: values.payPeriod,
    payCurrency: values.payCurrency,
  };
}

export function OwnJobDialog({
  open,
  onOpenChange,
  job,
  ownJobCount,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Set to edit this job instead of adding a new one. */
  job?: OwnJobView;
  /** How many own jobs the member has, to show the cap before a refused save. */
  ownJobCount: number;
  onSaved: (job: OwnJobView) => void;
}) {
  const { t } = useTranslation('ladder-own-jobs');
  const refusalText = useRefusalText();
  const [values, setValues] = useState<OwnJobFormValues>(() => valuesOf(job));
  const [errors, setErrors] = useState<Partial<Record<OwnJobField, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const capReached = !job && ownJobCount >= LADDER_OWN_JOB_LIMIT;

  const labels: OwnJobFormLabels = {
    title: t('field.title', { defaultValue: 'Job title' }),
    company: t('field.company', { defaultValue: 'Company' }),
    link: t('field.link', { defaultValue: 'Link to the posting' }),
    linkHint: t('field.linkHint', { defaultValue: 'Saved as a link only. RMHLadder never opens it.' }),
    location: t('field.location', { defaultValue: 'Location' }),
    remote: t('field.remote', { defaultValue: 'Work setup' }),
    remoteOptions: [
      { value: 'onsite', label: t('remote.onsite', { defaultValue: 'On site' }) },
      { value: 'hybrid', label: t('remote.hybrid', { defaultValue: 'Hybrid' }) },
      { value: 'remote_us', label: t('remote.remote', { defaultValue: 'Remote' }) },
    ],
    employment: t('field.employment', { defaultValue: 'Type' }),
    employmentOptions: [
      { value: 'internship', label: t('employment.internship', { defaultValue: 'Internship' }) },
      { value: 'full_time', label: t('employment.fullTime', { defaultValue: 'Full time' }) },
    ],
    deadline: t('field.deadline', { defaultValue: 'Application deadline' }),
    payMin: t('field.payMin', { defaultValue: 'Pay, lowest' }),
    payMax: t('field.payMax', { defaultValue: 'Pay, highest' }),
    payPeriod: t('field.payPeriod', { defaultValue: 'Paid per' }),
    payPeriodOptions: [
      { value: 'year', label: t('period.year', { defaultValue: 'Year' }) },
      { value: 'month', label: t('period.month', { defaultValue: 'Month' }) },
      { value: 'hour', label: t('period.hour', { defaultValue: 'Hour' }) },
    ],
    currency: t('field.currency', { defaultValue: 'Currency' }),
    submit: job ? t('action.save', { defaultValue: 'Save job' }) : t('action.add', { defaultValue: 'Add job' }),
    cancel: t('action.cancel', { defaultValue: 'Cancel' }),
  };

  const fieldMessage = (field: OwnJobField, kind: string): string => {
    if (kind === 'payOrder')
      return t('error.payOrder', { defaultValue: 'The highest pay must be at least the lowest.' });
    if (kind === 'payTooLarge') return t('error.payTooLarge', { defaultValue: 'That pay is too large.' });
    switch (field) {
      case 'title':
        return t('error.title', { defaultValue: 'Enter the job title.' });
      case 'company':
        return t('error.company', { defaultValue: 'Enter the company.' });
      case 'link':
        return t('error.link', { defaultValue: 'Enter a link that starts with http:// or https://.' });
      case 'deadline':
        return t('error.deadline', { defaultValue: 'Pick a valid date.' });
      case 'payMin':
      case 'payMax':
        return t('error.pay', { defaultValue: 'Enter pay as a whole number.' });
      default:
        return t('error.field', { defaultValue: 'Check this field.' });
    }
  };

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (capReached) return;
    const parsed = ownJobBody.safeParse(candidateOf(values));
    if (!parsed.success) {
      const next: Partial<Record<OwnJobField, string>> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as OwnJobField | undefined;
        if (field && !next[field]) next[field] = fieldMessage(field, issue.message);
      }
      setErrors(next);
      setFormError(null);
      const first = (Object.keys(next) as OwnJobField[])[0];
      if (first) document.getElementById(idOf(first))?.focus();
      return;
    }
    setErrors({});
    setFormError(null);
    setBusy(true);
    try {
      const saved = job
        ? await api(updateOwnJobApi, { params: { id: job.id }, body: parsed.data })
        : await api(createOwnJobApi, { body: parsed.data });
      toast.success(
        job ? t('toast.saved', { defaultValue: 'Job saved' }) : t('toast.added', { defaultValue: 'Job added' }),
      );
      onSaved(saved.job);
      onOpenChange(false);
    } catch (err) {
      setFormError(
        refusalText.maybe(err) ?? t('error.saveFailed', { defaultValue: 'Could not save this job. Try again.' }),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent mobileFullscreen>
        <DialogHeader>
          <DialogTitle>
            {job
              ? t('dialog.editTitle', { defaultValue: 'Edit this job' })
              : t('dialog.addTitle', { defaultValue: 'Add a job you found elsewhere' })}
          </DialogTitle>
          <DialogDescription>
            {t('dialog.description', {
              defaultValue: 'Track a job from another site or a friend in your pipeline. Only you can see it.',
            })}
          </DialogDescription>
        </DialogHeader>
        <OwnJobForm
          labels={labels}
          values={values}
          errors={errors}
          notice={
            capReached
              ? t('dialog.capReached', {
                  defaultValue: 'You can track up to {{max}} jobs you added yourself. Delete one first.',
                  max: LADDER_OWN_JOB_LIMIT,
                })
              : null
          }
          formError={formError}
          busy={busy}
          capReached={capReached}
          onChange={(field, value) => setValues((current) => ({ ...current, [field]: value }))}
          onSubmit={(event) => void submit(event)}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

export default OwnJobDialog;
