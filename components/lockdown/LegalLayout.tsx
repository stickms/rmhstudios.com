import type { ReactNode } from 'react';
import { ChevronLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import './lockdown.css';

const LEGAL_LINKS = [
  { href: '/terms',     key: 'terms-of-use',    defaultLabel: 'Terms of Use' },
  { href: '/privacy',   key: 'privacy-policy',  defaultLabel: 'Privacy Policy' },
  { href: '/cookies',   key: 'cookie-policy',   defaultLabel: 'Cookie Policy' },
  { href: '/copyright', key: 'copyright',       defaultLabel: 'Copyright' },
  { href: '/security',  key: 'security',        defaultLabel: 'Security' },
];

export function LegalLayout({
  title,
  eyebrow,
  updatedDate,
  children,
}: {
  title: string;
  eyebrow: string;
  updatedDate: string;
  children: ReactNode;
}) {
  const { t } = useTranslation("c-lockdown");

  return (
    <div className="legal-page">
      <nav className="legal-nav" aria-label={t("legal-navigation", { defaultValue: "Legal navigation" })}>
        <a href="/" className="legal-nav__back" aria-label={t("back-to-rmhstudios", { defaultValue: "Back to RMHStudios" })}>
          <ChevronLeft size={14} strokeWidth={2.2} aria-hidden="true" />
          RMHStudios
        </a>
        <span className="legal-nav__sep" aria-hidden="true">/</span>
        <span className="legal-nav__title">{title}</span>
      </nav>

      <main className="legal-content">
        <p className="legal-content__eyebrow">{eyebrow}</p>
        <h1 className="legal-content__title">{title}</h1>
        <p className="legal-content__date">{t("last-updated", { defaultValue: "Last updated: {{date}}", date: updatedDate })}</p>

        <div className="legal-content__body">{children}</div>
      </main>

      <footer className="legal-footer" role="contentinfo">
        {LEGAL_LINKS.map((l) => (
          <a key={l.href} href={l.href} className="legal-footer__link">
            {t(l.key, { defaultValue: l.defaultLabel })}
          </a>
        ))}
        <span className="legal-footer__link" style={{ cursor: 'default' }}>
          &copy; {new Date().getFullYear()} RMHStudios
        </span>
      </footer>
    </div>
  );
}
