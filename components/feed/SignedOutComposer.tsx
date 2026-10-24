'use client';

import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';

/** Identical before and after the lazy composer loads; one compact invitation. */
export function SignedOutComposer() {
  const { t } = useTranslation('feed');

  return (
    <div className="signed-out-composer glass-fill">
      <p className="text-sm text-site-text-muted">
        {t('sign-in-prompt', { defaultValue: 'Sign in to post RMHarks' })}
      </p>
      <Button asChild variant="secondary" size="sm">
        <Link to="/login" search={{ callbackURL: '/' }}>
          {t('sign-in', { defaultValue: 'Sign in' })}
        </Link>
      </Button>
    </div>
  );
}
