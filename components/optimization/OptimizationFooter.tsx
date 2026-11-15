import {
  Gauge,
} from 'lucide-react';
import { LEGAL_LINKS } from './optimization-data';

export function OptimizationFooter() {
  return (
      <footer className="sec-footer" role="contentinfo">
        <div className="sec-footer__inner">
          <div className="sec-footer__top">
            <div className="sec-footer__brand">
              <span className="sec-footer__brand-row">
                <Gauge size={18} aria-hidden="true" />
                RMH Studios
              </span>
              <span className="sec-footer__tagline">
                Engineered to feel instant — and to keep getting faster.
              </span>
            </div>
            <nav className="sec-footer__links" aria-label="More">
              {LEGAL_LINKS.map((l) => (
                <a key={l.href} href={l.href} className="sec-footer__link">
                  {l.label}
                </a>
              ))}
            </nav>
          </div>
          <div className="sec-footer__copy">
            &copy; {new Date().getFullYear()} RMH Studios. Every figure on this
            page is measured from our own build and deploy pipeline.
          </div>
        </div>
      </footer>
  );
}
