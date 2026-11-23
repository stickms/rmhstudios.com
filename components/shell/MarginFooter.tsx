import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

/**
 * The margin's foot (Steel L6): the pages a site has to carry but few people look for, kept off the section list so the
 * sidebar stays about where you are going. Plain `t-meta` links on one wrapping line, no boxes (R3); it sits at the
 * bottom of the margin column, after whatever the page portals in (site-shell.css `.site-margin__foot`).
 *
 * Add a page here only if it is reference material. A page people come to on purpose belongs in a section.
 */
export function MarginFooter() {
  const { t } = useTranslation('feed');
  return (
    <nav
      className="site-margin__foot"
      aria-label={t('shell-margin-foot-label', {
        defaultValue: 'More pages',
      })}
    >
      <Link to="/roadmap" className="site-margin__foot-link t-meta">
        {t('shell-foot-roadmap', { defaultValue: 'Roadmap' })}
      </Link>
      <Link to="/help" className="site-margin__foot-link t-meta">
        {t('shell-foot-help', { defaultValue: 'Help and feedback' })}
      </Link>
      <Link to="/site-history" className="site-margin__foot-link t-meta">
        {t('shell-foot-site-history', { defaultValue: 'Site history' })}
      </Link>
      <Link to="/security" className="site-margin__foot-link t-meta">
        {t('shell-foot-security', { defaultValue: 'Security' })}
      </Link>
      <Link to="/terms" className="site-margin__foot-link t-meta">
        {t('shell-foot-terms', { defaultValue: 'Terms' })}
      </Link>
      <Link to="/privacy" className="site-margin__foot-link t-meta">
        {t('shell-foot-privacy', { defaultValue: 'Privacy' })}
      </Link>
      <Link to="/cookies" className="site-margin__foot-link t-meta">
        {t('shell-foot-cookies', { defaultValue: 'Cookies' })}
      </Link>
      <Link to="/copyright" className="site-margin__foot-link t-meta">
        {t('shell-foot-copyright', { defaultValue: 'Copyright' })}
      </Link>
    </nav>
  );
}
