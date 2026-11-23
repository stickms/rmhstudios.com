/**
 * The reference pages kept out of the section list (client-safe): the margin's foot (`MarginFooter`) and the "More pages"
 * group on /sections both render this one list, so a page added here shows up in both. `tKey` is the i18n key
 * (namespace "feed"); `label` is the English fallback.
 *
 * Add a page here only if it is reference material. A page people come to on purpose belongs in a section.
 */
export const FOOT_LINKS = [
  { to: '/roadmap', tKey: 'shell-foot-roadmap', label: 'Roadmap' },
  { to: '/help', tKey: 'shell-foot-help', label: 'Help and feedback' },
  { to: '/site-history', tKey: 'shell-foot-site-history', label: 'Site history' },
  { to: '/security', tKey: 'shell-foot-security', label: 'Security' },
  { to: '/terms', tKey: 'shell-foot-terms', label: 'Terms' },
  { to: '/privacy', tKey: 'shell-foot-privacy', label: 'Privacy' },
  { to: '/cookies', tKey: 'shell-foot-cookies', label: 'Cookies' },
  { to: '/copyright', tKey: 'shell-foot-copyright', label: 'Copyright' },
] as const;
