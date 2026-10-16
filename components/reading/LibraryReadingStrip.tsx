'use client';

import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import ChallengePanel from './ChallengePanel';

/** The library page's reading strip: the yearly challenge, plus a way into My reading (L3/L7/L1). */
export default function LibraryReadingStrip() {
  const { t } = useTranslation('f-reading');
  return (
    <div className="mx-auto mb-4 w-full max-w-3xl space-y-2 px-4">
      <ChallengePanel compact />
      <p className="text-sm text-site-text-muted">
        <Link
          to="/reading"
          search={{ tab: 'shelves' }}
          className="text-site-accent underline-offset-4 hover:underline"
        >
          {t('library-shelves-link', { defaultValue: 'Your shelves' })}
        </Link>
        {' · '}
        <Link
          to="/reading"
          search={{ tab: 'highlights' }}
          className="text-site-accent underline-offset-4 hover:underline"
        >
          {t('library-highlights-link', { defaultValue: 'Your highlights' })}
        </Link>
      </p>
    </div>
  );
}
