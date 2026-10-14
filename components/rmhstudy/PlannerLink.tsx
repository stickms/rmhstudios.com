import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { ArrowRight, CalendarCheck } from 'lucide-react';

/** Landing-page entry to the exam planner. */
export default function PlannerLink() {
  const { t } = useTranslation('f-tools');
  return (
    <Link
      to="/rmhstudy/planner"
      className="group flex w-full items-center gap-4 rounded-xl border border-(--app-border) bg-(--app-surface) p-5 text-left transition-colors hover:border-(--app-accent)"
    >
      <div className="rounded-lg bg-(--app-bg) p-3">
        <CalendarCheck className="h-6 w-6 text-(--app-accent)" />
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="font-semibold">{t('plan-link-title', { defaultValue: 'Exam planner' })}</h3>
        <p className="text-sm text-(--app-text-muted)">
          {t('plan-link-sub', {
            defaultValue:
              'Turn an exam date and topics into a day-by-day plan, then start each block in a room.',
          })}
        </p>
      </div>
      <ArrowRight className="h-5 w-5 shrink-0 text-(--app-text-muted) transition-transform group-hover:translate-x-1" />
    </Link>
  );
}
