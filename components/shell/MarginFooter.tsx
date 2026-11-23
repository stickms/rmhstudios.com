import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { FOOT_LINKS } from './foot-links';

/**
 * The margin's foot (Steel L6): the pages a site has to carry but few people look for, kept off the section list so the
 * sidebar stays about where you are going. Plain `t-meta` links on one wrapping line, no boxes (R3); it sits at the
 * bottom of the margin column, after whatever the page portals in (site-shell.css `.site-margin__foot`). The pages are
 * `FOOT_LINKS`, shared with /sections.
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
      {FOOT_LINKS.map((link) => (
        <Link key={link.to} to={link.to} className="site-margin__foot-link t-meta">
          {t(link.tKey, { defaultValue: link.label })}
        </Link>
      ))}
    </nav>
  );
}
