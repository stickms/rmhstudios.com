import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

/**
 * The page's view is not the URL's alone while a default came from the viewer's preferences (plan D14) or from this
 * device's saved filters (owner 2026-11-24), so say so in one muted line with a way to change it. Nothing renders for
 * a viewer without either, or for a URL that chose everything itself.
 */
export function PrefsNote({
  fromPrefs,
  fromDevice = false,
  onClearSaved,
}: {
  fromPrefs: boolean;
  fromDevice?: boolean;
  /** Forget this device's saved filters (the page falls back to the preferences, then the defaults). */
  onClearSaved?: () => void;
}) {
  const { t } = useTranslation('medschools');
  return (
    <>
      {fromDevice ? (
        <p className="medapp-note" data-saved-filters-note="">
          {t('index-saved-filters-note', { defaultValue: 'Showing your saved filters.' })}{' '}
          {onClearSaved ? (
            <button type="button" className="medapp-link medapp-inlinebtn" onClick={onClearSaved}>
              {t('index-saved-filters-clear', { defaultValue: 'Clear saved filters' })}
            </button>
          ) : null}
        </p>
      ) : null}
      {fromPrefs ? (
        <p className="medapp-note">
          {t('prefs-from-note', { defaultValue: 'Filters from your preferences.' })}{' '}
          <Link to="/med/lists" hash="preferences" className="medapp-link">
            {t('prefs-from-link', { defaultValue: 'Change preferences' })}
          </Link>
        </p>
      ) : null}
    </>
  );
}
