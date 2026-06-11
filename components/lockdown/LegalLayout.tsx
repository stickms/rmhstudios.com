import type { ReactNode } from 'react';
import { ChevronLeft } from 'lucide-react';
import './lockdown.css';

const LEGAL_LINKS = [
  { href: '/terms',     label: 'Terms of Use' },
  { href: '/privacy',   label: 'Privacy Policy' },
  { href: '/cookies',   label: 'Cookie Policy' },
  { href: '/copyright', label: 'Copyright' },
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
  return (
    <div className="legal-page">
      <nav className="legal-nav" aria-label="Legal navigation">
        <a href="/" className="legal-nav__back" aria-label="Back to RMHStudios">
          <ChevronLeft size={14} strokeWidth={2.2} aria-hidden="true" />
          RMHStudios
        </a>
        <span className="legal-nav__sep" aria-hidden="true">/</span>
        <span className="legal-nav__title">{title}</span>
      </nav>

      <main className="legal-content">
        <p className="legal-content__eyebrow">{eyebrow}</p>
        <h1 className="legal-content__title">{title}</h1>
        <p className="legal-content__date">Last updated: {updatedDate}</p>

        <div className="legal-content__body">{children}</div>
      </main>

      <footer className="legal-footer" role="contentinfo">
        {LEGAL_LINKS.map((l) => (
          <a key={l.href} href={l.href} className="legal-footer__link">
            {l.label}
          </a>
        ))}
        <span className="legal-footer__link" style={{ cursor: 'default' }}>
          &copy; {new Date().getFullYear()} RMHStudios
        </span>
      </footer>
    </div>
  );
}
