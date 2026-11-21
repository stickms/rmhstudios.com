/** The RMHType landing page's card for the touch-typing course (strings in `rmhtype-lessons`). */
import { Link } from '@tanstack/react-router';
import { GraduationCap } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export function LessonsEntry() {
  const {
    t,
  } =
    useTranslation(
      'rmhtype-lessons',
    );
  return (
    <Link
      to="/rmhtype/lessons"
      className="rounded-app surface-card p-6 text-left transition-colors hover:border-app-accent hover:bg-app-surface-hover"
    >
      <GraduationCap
        className="h-8 w-8 mb-4 text-app-accent"
        aria-hidden="true"
      />
      <h3 className="text-xl font-semibold mb-2">
        {t(
          'entry-title',
          {
            defaultValue:
              'Touch-typing Lessons',
          },
        )}
      </h3>
      <p className="text-sm text-app-text-muted">
        {t(
          'entry-desc',
          {
            defaultValue:
              'Learn the home row first, then one new group of keys at a time, with the right finger shown for every key.',
          },
        )}
      </p>
    </Link>
  );
}
