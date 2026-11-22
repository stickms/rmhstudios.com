import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { ArrowRight, ChartColumn } from 'lucide-react';

/** Landing-page entry to the focus history. */
export default function HistoryLink() {
  const { t } = useTranslation('rmhstudy-focus');
  return (
    <Link
      to="/rmhstudy/history"
      className="group flex w-full items-center gap-4 rounded-app surface-card p-5 text-left transition-colors hover:border-app-accent"
    >
      <div className="rounded-app-sm bg-app-bg p-3">
        <ChartColumn className="h-6 w-6 text-app-accent" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="font-semibold">
          {t('link-title', {
            defaultValue: 'Focus history',
          })}
        </h3>
        <p className="text-sm text-app-text-muted">
          {t('link-sub', {
            defaultValue: 'See your focus time by day and week, and set a weekly goal.',
          })}
        </p>
      </div>
      <ArrowRight className="h-5 w-5 shrink-0 text-app-text-muted transition-transform group-hover:translate-x-1" />
    </Link>
  );
}
