import { useTranslation } from 'react-i18next';
import { formatPay } from '@/lib/rmhladder/pay';

const PERIOD_KEY: Record<string, string> = {
  hour: 'hourly',
  week: 'weekly',
  month: 'monthly',
  year: 'yearly',
};

/**
 * "≈ $96k/yr" for a job whose posting stated its pay (F7). Internships say
 * "annualized": the figure is the posted rate at a full-time year, not what a
 * summer will actually pay. Renders nothing when the posting stated no pay.
 */
export function PayBadge({ job, className }: { job: Record<string, unknown>; className?: string }) {
  const { t } = useTranslation('f-ladder-homes');
  const min = job.payMinAnnual as number | null | undefined;
  const max = job.payMaxAnnual as number | null | undefined;
  if (!min || !max) return null;
  const period = PERIOD_KEY[(job.payPeriod as string | null) ?? ''];
  const annualized = job.employmentType === 'internship';
  const label = formatPay({
    currency: (job.payCurrency as string | null) ?? 'USD',
    minAnnual: min,
    maxAnnual: max,
  });
  const detail = t('pay-detail', {
    defaultValue: 'Posted {{period}}; shown per year at a full-time year (2,080 hours).',
    period: period ?? 'yearly',
  });
  return (
    <span className={className ?? 'text-sm font-medium text-site-text'} title={detail}>
      {label}
      {annualized && (
        <span className="ml-1 text-xs font-normal text-site-text-muted">
          {t('pay-annualized', { defaultValue: 'annualized' })}
        </span>
      )}
    </span>
  );
}
