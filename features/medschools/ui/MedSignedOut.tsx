import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { medButtonClass } from './controls/MedButton';

/**
 * "Sign in to see this" in a paper panel, centred like the empty state: the page's own sentence, one line of why, and
 * the one ink primary, a link to the sign-in page that returns here (`callbackURL`). Replaces the site's
 * `SignedOutPrompt` on this app's pages.
 */
export function MedSignedOut({
  title,
  description,
  callbackURL,
}: {
  title: ReactNode;
  description?: ReactNode;
  callbackURL: string;
}) {
  const { t } = useTranslation('medschools');
  return (
    <div className="medapp-panel medapp-empty-state" data-slot="med-signed-out">
      <h2 className="medapp-h2">{title}</h2>
      {description ? <p className="medapp-meta">{description}</p> : null}
      <div className="medapp-actions">
        <Link to="/login" search={{ callbackURL }} className={medButtonClass('primary')} data-variant="primary">
          {t('signed-out-action', { defaultValue: 'Sign in' })}
        </Link>
      </div>
    </div>
  );
}
