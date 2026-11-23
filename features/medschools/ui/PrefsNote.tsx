import { useTranslation } from 'react-i18next';

/**
 * The page's view is not the URL's alone while a default came from the viewer's preferences (plan D14), so say so in
 * one `t-meta` line with a way to change it. Nothing renders for a viewer without preferences or for a URL that chose
 * everything itself.
 *
 * A plain anchor, not `Link`: the lists page (the preferences section) is a later task's route and a typed `Link` to a
 * route that does not exist yet does not compile. The link is a document load either way.
 */
export function PrefsNote({ fromPrefs }: { fromPrefs: boolean }) {
  const { t } = useTranslation('medschools');
  if (!fromPrefs) return null;
  return (
    <p className="t-meta m-0 mt-3">
      {t('prefs-from-note', { defaultValue: 'Filters from your preferences.' })}{' '}
      <a href="/rmh-medschool/lists#preferences" className="underline">
        {t('prefs-from-link', { defaultValue: 'Change preferences' })}
      </a>
    </p>
  );
}
