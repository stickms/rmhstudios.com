/**
 * Job Detail Route
 */

import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  Building2,
  MapPin,
  Banknote,
  Clock,
  Send,
  Loader2,
  CheckCircle2,
} from 'lucide-react';
import { useJobsDataStore } from '@/lib/store/useJobsDataStore';

export const Route = createFileRoute('/secret/jobs/$id')({
  component: JobDetailPage,
});

function JobDetailPage() {
  const { id } = Route.useParams();
  const getJob = useJobsDataStore((s) => s.getJob);
  const applyToJob = useJobsDataStore((s) => s.applyToJob);
  const applications = useJobsDataStore((s) => s.applications);
  const job = getJob(id);

  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(() => applications.some((a) => a.jobId === id));
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  const { t } = useTranslation('r-secret');

  const [interest, setInterest] = useState('');
  const [education, setEducation] = useState('');
  const [workAuth, setWorkAuth] = useState('');

  const validate = (): string[] => {
    const errors: string[] = [];
    if (!interest.trim()) errors.push(t('validation-interest', { defaultValue: 'Please tell us why you are interested in this role.' }));
    if (!education) errors.push(t('validation-education', { defaultValue: 'Please select your highest level of education.' }));
    if (!workAuth) errors.push(t('validation-work-auth', { defaultValue: 'Please select your work authorization status.' }));
    return errors;
  };

  const handleSubmitClick = () => {
    const errors = validate();
    setValidationErrors(errors);
    if (errors.length > 0) return;
    setShowConfirm(true);
  };

  const handleConfirmApply = () => {
    setShowConfirm(false);
    setApplying(true);
    setError(null);
    try {
      applyToJob(id);
      setApplied(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('error-apply-failed', { defaultValue: 'Failed to apply' }));
    } finally {
      setApplying(false);
    }
  };

  if (!job) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <p className="text-lg" style={{ color: 'var(--jobs-text-muted)' }}>{t('job-not-found', { defaultValue: 'Job not found' })}</p>
        <Link to="/secret/jobs" className="text-sm" style={{ color: 'var(--jobs-accent)' }}>
          &larr; {t('back-to-job-board', { defaultValue: 'Back to job board' })}
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <header
        className="sticky top-0 z-30 border-b backdrop-blur-md"
        style={{ background: 'rgba(10, 10, 15, 0.85)', borderColor: 'var(--jobs-border)' }}
      >
        <div className="max-w-3xl mx-auto px-4 py-3">
          <Link
            to="/secret/jobs"
            className="flex items-center gap-1.5 text-sm hover:text-(--jobs-accent) transition-colors"
            style={{ color: 'var(--jobs-text-muted)' }}
          >
            <ArrowLeft size={14} />
            {t('back-to-jobs', { defaultValue: 'Back to jobs' })}
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        <div className="mb-6">
          <div className="mb-3">
            <h1 className="text-2xl font-bold">{job.title}</h1>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm" style={{ color: 'var(--jobs-text-muted)' }}>
            <span className="flex items-center gap-1.5"><Building2 size={14} />{job.company}</span>
            <span className="flex items-center gap-1.5"><MapPin size={14} />{job.location}</span>
            {job.salaryRange && <span className="flex items-center gap-1.5"><Banknote size={14} />{job.salaryRange}</span>}
            <span className="flex items-center gap-1.5"><Clock size={14} />{t('posted-date', { defaultValue: 'Posted {{date}}', date: new Date(job.publishAt).toLocaleDateString() })}</span>
          </div>
        </div>

        <div className="border-t mb-6" style={{ borderColor: 'var(--jobs-border)' }} />

        <div className="mb-8">
          <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--jobs-text-muted)' }}>{t('about-this-role', { defaultValue: 'About this role' })}</h2>
          <p className="leading-relaxed whitespace-pre-wrap">{job.description}</p>
        </div>

        <div className="p-5 rounded-lg border" style={{ background: 'var(--jobs-surface)', borderColor: 'var(--jobs-border)', borderRadius: 'var(--jobs-radius-lg)' }}>
          {applied ? (
            <div className="text-center py-4">
              <CheckCircle2 size={40} className="mx-auto mb-4" style={{ color: 'var(--jobs-accent)' }} />
              <h3 className="text-xl font-bold mb-2">{t('application-submitted-heading', { defaultValue: 'Application Submitted!' })}</h3>
              <p className="text-sm mb-6" style={{ color: 'var(--jobs-text-muted)' }}>
                {t('application-submitted-body', { defaultValue: 'You have successfully submitted your application for {{title}} at {{company}}. You will hear back soon!', title: job.title, company: job.company })}
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <Link to="/secret/jobs" className="jobs-btn-primary px-5 py-2.5 rounded-lg text-sm inline-block" style={{ borderRadius: 'var(--jobs-radius)' }}>{t('return-to-jobs-portal', { defaultValue: 'Return to RMH Jobs Portal' })}</Link>
                <Link to="/secret/jobs/applications" className="jobs-btn-secondary px-5 py-2.5 rounded-lg text-sm inline-block" style={{ borderRadius: 'var(--jobs-radius)' }}>{t('view-my-applications', { defaultValue: 'View My Applications' })}</Link>
              </div>
            </div>
          ) : (
            <>
              <h3 className="font-semibold mb-4">{t('application-questions', { defaultValue: 'Application Questions' })}</h3>
              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--jobs-text-muted)' }}>
                    {t('label-interest', { defaultValue: 'Why are you interested in this role?' })} <span style={{ color: 'var(--jobs-danger)' }}>*</span>
                  </label>
                  <textarea rows={3} value={interest} onChange={(e) => setInterest(e.target.value)} placeholder={t('placeholder-interest', { defaultValue: 'Tell us what excites you about this opportunity...' })} className="jobs-search-input w-full px-3 py-2 rounded-lg text-sm resize-none" style={{ borderRadius: 'var(--jobs-radius)' }} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--jobs-text-muted)' }}>
                    {t('label-education', { defaultValue: 'Highest level of education' })} <span style={{ color: 'var(--jobs-danger)' }}>*</span>
                  </label>
                  <select className="jobs-search-input w-full px-3 py-2 rounded-lg text-sm" style={{ borderRadius: 'var(--jobs-radius)' }} value={education} onChange={(e) => setEducation(e.target.value)}>
                    <option value="" disabled>{t('select-placeholder', { defaultValue: 'Select...' })}</option>
                    <option value="hs">{t('edu-hs', { defaultValue: 'High School / GED' })}</option>
                    <option value="associate">{t('edu-associate', { defaultValue: "Associate's Degree" })}</option>
                    <option value="bachelor">{t('edu-bachelor', { defaultValue: "Bachelor's Degree" })}</option>
                    <option value="master">{t('edu-master', { defaultValue: "Master's Degree" })}</option>
                    <option value="doctorate">{t('edu-doctorate', { defaultValue: 'Doctorate / PhD' })}</option>
                    <option value="other">{t('edu-other', { defaultValue: 'Other' })}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--jobs-text-muted)' }}>
                    {t('label-work-auth', { defaultValue: 'Are you authorized to work in the country where this role is based?' })} <span style={{ color: 'var(--jobs-danger)' }}>*</span>
                  </label>
                  <select className="jobs-search-input w-full px-3 py-2 rounded-lg text-sm" style={{ borderRadius: 'var(--jobs-radius)' }} value={workAuth} onChange={(e) => setWorkAuth(e.target.value)}>
                    <option value="" disabled>{t('select-placeholder', { defaultValue: 'Select...' })}</option>
                    <option value="yes">{t('work-auth-yes', { defaultValue: 'Yes' })}</option>
                    <option value="no">{t('work-auth-no', { defaultValue: 'No' })}</option>
                    <option value="sponsorship">{t('work-auth-sponsorship', { defaultValue: 'Yes, with sponsorship' })}</option>
                  </select>
                </div>
              </div>
              {validationErrors.length > 0 && (
                <div className="mb-3 space-y-1">
                  {validationErrors.map((err, i) => (
                    <p key={i} className="text-sm" style={{ color: 'var(--jobs-danger)' }}>{err}</p>
                  ))}
                </div>
              )}
              {error && <p className="text-sm mb-3" style={{ color: 'var(--jobs-danger)' }}>{error}</p>}
              <button onClick={handleSubmitClick} disabled={applying} className="jobs-btn-primary flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm" style={{ borderRadius: 'var(--jobs-radius)' }}>
                {applying ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                {t('submit-application', { defaultValue: 'Submit Application' })}
              </button>
              <p className="text-xs mt-2" style={{ color: 'var(--jobs-text-subtle)' }}>{t('tos-agreement', { defaultValue: 'By submitting, you agree to our Terms of Service and Privacy Policy.' })}</p>
            </>
          )}
        </div>

        {showConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="p-6 rounded-xl border max-w-md w-full mx-4" style={{ background: 'var(--jobs-surface)', borderColor: 'var(--jobs-border)', borderRadius: 'var(--jobs-radius-lg)' }}>
              <h3 className="text-lg font-bold mb-2">{t('confirm-heading', { defaultValue: 'Are you sure?' })}</h3>
              <p className="text-sm mb-6" style={{ color: 'var(--jobs-text-muted)' }}>
                {t('confirm-body', { defaultValue: 'You are about to submit your application for {{title}} at {{company}}. This action cannot be undone.', title: job.title, company: job.company })}
              </p>
              <div className="flex items-center gap-3 justify-end">
                <button onClick={() => setShowConfirm(false)} className="jobs-btn-secondary px-4 py-2 rounded-lg text-sm" style={{ borderRadius: 'var(--jobs-radius)' }}>{t('cancel', { defaultValue: 'Cancel' })}</button>
                <button onClick={handleConfirmApply} className="jobs-btn-primary px-4 py-2 rounded-lg text-sm" style={{ borderRadius: 'var(--jobs-radius)' }}>{t('confirm-submit', { defaultValue: 'Yes, Submit Application' })}</button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
