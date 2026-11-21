/** The RMHType landing page's card for the progress page (strings in `rmhtype-progress`). */
import { Link } from '@tanstack/react-router';
import { LineChart as TrendIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export function ProgressEntry() {
  const {
    t,
  } =
    useTranslation(
      'rmhtype-progress',
    );
  return (
    <Link
      to="/rmhtype/progress"
      className="rounded-app surface-card p-6 text-left transition-colors hover:border-app-accent hover:bg-app-surface-hover"
    >
      <TrendIcon
        className="h-8 w-8 mb-4 text-app-accent"
        aria-hidden="true"
      />
      <h3 className="text-xl font-semibold mb-2">
        {t(
          'entry-title',
          {
            defaultValue:
              'Your Progress',
          },
        )}
      </h3>
      <p className="text-sm text-app-text-muted">
        {t(
          'entry-desc',
          {
            defaultValue:
              'See your speed and accuracy over weeks and months, your personal bests and your recent runs.',
          },
        )}
      </p>
    </Link>
  );
}
