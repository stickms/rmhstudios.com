import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

/**
 * The page's view is not the URL's alone while a default came from the viewer's preferences (plan D14), so say so in
 * one `t-meta` line with a way to change it. Nothing renders for a viewer without preferences or for a URL that chose
 * everything itself.
 */
export function PrefsNote({ fromPrefs }: { fromPrefs: boolean }) {
  const { t } = useTranslation('medschools');
  if (!fromPrefs) return null;
  return (
    <p className="t-meta m-0 mt-3">
      {t('prefs-from-note', { defaultValue: 'Filters from your preferences.' })}{' '}
      <Link to="/rmh-medschool/lists" hash="preferences" className="underline">
        {t('prefs-from-link', { defaultValue: 'Change preferences' })}
      </Link>
    </p>
  );
}
