import { useId, useState, type FormEvent } from 'react';
import { ShieldCheck, Send, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { submitSecurityReport } from '@/lib/security-reports';
import { SECURITY_CATEGORIES, SECURITY_SEVERITIES } from '@/lib/security-report-schema';
import { Select } from '@/components/ui/select';

/**
 * Public bug-bounty submission form on /security. Calls the `submitSecurityReport`
 * server function (rate-limited + validated server-side); this component only
 * does light client-side validation for fast feedback. Fully labelled and
 * keyboard-operable, with a visually-hidden honeypot to blunt bots.
 */
export function BugBountyForm() {
  const uid = useId();
  const [values, setValues] = useState({
    title: '',
    category: '',
    severity: '',
    affectedArea: '',
    description: '',
    reporterName: '',
    reporterEmail: '',
    company: '', // honeypot
  });
  const [status, setStatus] = useState<'idle' | 'submitting' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);

  const set =
    (key: keyof typeof values) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setValues((v) => ({ ...v, [key]: e.target.value }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (
      !values.title.trim() ||
      !values.category ||
      !values.severity ||
      values.description.trim().length < 40
    ) {
      setError(
        'Please add a title, pick a category and severity, and describe the issue (at least 40 characters).',
      );
      return;
    }

    setStatus('submitting');
    try {
      const res = await submitSecurityReport({ data: values });
      if (res.ok) {
        setStatus('done');
      } else {
        setStatus('idle');
        setError(res.error);
      }
    } catch {
      setStatus('idle');
      setError('We couldn’t reach the server. Please try again, or email security@rmhstudios.com.');
    }
  }

  if (status === 'done') {
    return (
      <div className="sec-form__done" role="status">
        <span className="sec-form__done-icon">
          <CheckCircle2 aria-hidden="true" />
        </span>
        <h3 className="sec-form__done-title">Report received. Thank you.</h3>
        <p className="sec-form__done-body">
          Our security team reviews every submission. If we need more detail — or you’re in line for
          a reward — we’ll reach out to the contact you gave us.
        </p>
      </div>
    );
  }

  const submitting = status === 'submitting';

  return (
    <form className="sec-form" onSubmit={onSubmit} noValidate aria-describedby={`${uid}-intro`}>
      <p id={`${uid}-intro`} className="sec-form__intro">
        <ShieldCheck aria-hidden="true" />
        Submit a vulnerability. Fields marked <span aria-hidden="true">*</span>
        <span className="sr-only"> (required)</span> are required.
      </p>

      <div className="sec-form__row">
        <div className="sec-field">
          <label className="sec-field__label" htmlFor={`${uid}-title`}>
            Title <span aria-hidden="true">*</span>
          </label>
          <input
            id={`${uid}-title`}
            className="sec-field__input"
            type="text"
            required
            maxLength={160}
            autoComplete="off"
            placeholder="e.g. Stored XSS in build comments"
            value={values.title}
            onChange={set('title')}
          />
        </div>
      </div>

      <div className="sec-form__row sec-form__row--split">
        <div className="sec-field">
          <label className="sec-field__label" htmlFor={`${uid}-category`}>
            Category <span aria-hidden="true">*</span>
          </label>
          <Select
            id={`${uid}-category`}
            className="sec-field__input"
            required
            value={values.category}
            onChange={set('category')}
          >
            <option value="" disabled>
              Choose a category…
            </option>
            {SECURITY_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </Select>
        </div>

        <div className="sec-field">
          <label className="sec-field__label" htmlFor={`${uid}-severity`}>
            Severity <span aria-hidden="true">*</span>
          </label>
          <Select
            id={`${uid}-severity`}
            className="sec-field__input"
            required
            value={values.severity}
            onChange={set('severity')}
          >
            <option value="" disabled>
              How severe?…
            </option>
            {SECURITY_SEVERITIES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="sec-form__row">
        <div className="sec-field">
          <label className="sec-field__label" htmlFor={`${uid}-area`}>
            Affected URL or area <span className="sec-field__opt">(optional)</span>
          </label>
          <input
            id={`${uid}-area`}
            className="sec-field__input"
            type="text"
            maxLength={300}
            autoComplete="off"
            placeholder="https://rmhstudios.com/…  ·  or an endpoint / feature"
            value={values.affectedArea}
            onChange={set('affectedArea')}
          />
        </div>
      </div>

      <div className="sec-form__row">
        <div className="sec-field">
          <label className="sec-field__label" htmlFor={`${uid}-desc`}>
            What did you find? <span aria-hidden="true">*</span>
          </label>
          <textarea
            id={`${uid}-desc`}
            className="sec-field__input sec-field__textarea"
            required
            rows={7}
            maxLength={8000}
            placeholder="Reproduction steps, the impact, and any proof-of-concept. The clearer the write-up, the faster we can validate and reward it."
            value={values.description}
            onChange={set('description')}
          />
        </div>
      </div>

      <div className="sec-form__row sec-form__row--split">
        <div className="sec-field">
          <label className="sec-field__label" htmlFor={`${uid}-name`}>
            Your name <span className="sec-field__opt">(optional)</span>
          </label>
          <input
            id={`${uid}-name`}
            className="sec-field__input"
            type="text"
            maxLength={120}
            autoComplete="name"
            placeholder="For the credit"
            value={values.reporterName}
            onChange={set('reporterName')}
          />
        </div>
        <div className="sec-field">
          <label className="sec-field__label" htmlFor={`${uid}-email`}>
            Contact email <span className="sec-field__opt">(optional)</span>
          </label>
          <input
            id={`${uid}-email`}
            className="sec-field__input"
            type="email"
            maxLength={200}
            autoComplete="email"
            placeholder="So we can follow up and pay you"
            value={values.reporterEmail}
            onChange={set('reporterEmail')}
          />
        </div>
      </div>

      {/* Honeypot: hidden from people, catnip for bots. */}
      <div className="sec-form__hp" aria-hidden="true">
        <label htmlFor={`${uid}-company`}>Company</label>
        <input
          id={`${uid}-company`}
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={values.company}
          onChange={set('company')}
        />
      </div>

      {error ? (
        <p className="sec-form__error" role="alert">
          <AlertTriangle aria-hidden="true" />
          {error}
        </p>
      ) : null}

      <div className="sec-form__actions">
        <button className="sec-btn sec-btn--primary" type="submit" disabled={submitting}>
          {submitting ? (
            <>
              <Loader2 className="sec-spin" aria-hidden="true" />
              Submitting…
            </>
          ) : (
            <>
              <Send aria-hidden="true" />
              Submit report
            </>
          )}
        </button>
        <span className="sec-form__note">
          Prefer email? <a href="mailto:security@rmhstudios.com">security@rmhstudios.com</a>
        </span>
      </div>
    </form>
  );
}

export default BugBountyForm;
