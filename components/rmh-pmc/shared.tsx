/**
 * RMH PMC — shared primitives for the quiet liquid-metal system (rmh-pmc.css).
 *
 * The site's furniture: the glass command capsule, the brand mark, the footer.
 * The page helpers: `Words` (headline words rising on load), `Decrypt`,
 * `MetaLine`, `SecHead`, `PageHead` (the one dark stage, holding one mercury),
 * `CtaBand` (the closing call to action, on paper) and `Arrow`.
 *
 * Motion is CSS. The scripts are `useVerticalNav` (the mobile menu) and
 * `Decrypt` here, and the mercury renderer behind <Mercury/>.
 */
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useVerticalNav } from '@/hooks/useVerticalNav';
import { cssVars } from '@/components/shared/scroll-scene';
import { Mercury } from './Mercury';

export { cssVars };

/* ── marks and icons ─────────────────────────────────────────────────────── */

/* Reticle-in-hex mark, drawn in the liquid lettering stops. The hex keeps
   lineage with the RMH holding mark; the crosshair and chevron make it PMC. */
export function BrandMark() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <linearGradient id="rmhp-mark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--st-1)' }} />
          <stop offset="0.5" style={{ stopColor: 'var(--st-2)' }} />
          <stop offset="0.52" style={{ stopColor: 'var(--st-3)' }} />
          <stop offset="1" style={{ stopColor: 'var(--st-4)' }} />
        </linearGradient>
      </defs>
      <polygon points="50,5 89,27 89,73 50,95 11,73 11,27" fill="none" stroke="url(#rmhp-mark)" strokeWidth="7" strokeLinejoin="round" />
      <g style={{ stroke: 'var(--ink)' }} strokeWidth="3" strokeLinecap="round">
        <line x1="50" y1="19" x2="50" y2="29" /><line x1="50" y1="71" x2="50" y2="81" />
        <line x1="22" y1="50" x2="32" y2="50" /><line x1="68" y1="50" x2="78" y2="50" />
      </g>
      <path d="M37 43 L50 56 L63 43" fill="none" stroke="url(#rmhp-mark)" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="50" cy="50" r="4" style={{ fill: 'var(--ink)' }} />
    </svg>
  );
}

/** An arrow that flips in RTL (the CSS mirrors `.arw`). */
export function Arrow({ className = 'arw' }: { className?: string }) {
  return <ArrowRight className={className} aria-hidden="true" strokeWidth={1.8} />;
}

/**
 * Decrypt — a string that scrambles through monospace glyphs on mount before
 * settling into its real text. Renders the final text on the server, so it's
 * accessible and SEO-safe. Use sparingly: the meta lines only.
 */
const GLYPHS = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789/#%<>*·';
export function Decrypt({ text, className }: { text: string; className?: string }) {
  const [out, setOut] = useState(text);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const dur = Math.min(180 + text.length * 34, 900);
    const tick = (t: number) => {
      const p = Math.min((t - start) / dur, 1);
      const revealed = Math.floor(p * text.length);
      let s = '';
      for (let i = 0; i < text.length; i++) {
        s += i < revealed || text[i] === ' ' ? text[i] : GLYPHS[(Math.random() * GLYPHS.length) | 0];
      }
      setOut(s);
      if (p < 1) raf = requestAnimationFrame(tick);
      else setOut(text);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [text]);
  return <span className={className}>{out}</span>;
}

/* ── headline and page primitives ────────────────────────────────────────── */

/**
 * A headline whose words rise out of masks, one after another, on load.
 * Pass the translated string; it stays ordinary text for a screen reader.
 * `start` offsets the stagger so several `Words` in one heading continue each
 * other, and `steel` lists the word indices set in liquid lettering (ONE word).
 */
export function Words({ text, start = 0, steel }: { text: string; start?: number; steel?: number[] }) {
  const words = text.split(' ');
  return (
    <span className="words">
      {words.map((word, i) => (
        <span key={i}>
          <span className="w">
            <span className={steel?.includes(i) ? 'steel' : undefined} style={cssVars({ '--i': start + i })}>
              {word}
            </span>
          </span>
          {i < words.length - 1 ? ' ' : null}
        </span>
      ))}
    </span>
  );
}

/** A mono line of `Label ▸ VALUE` fields; values decrypt in on load and print as written. */
export function MetaLine({ fields }: { fields: [ReactNode, string][] }) {
  return (
    <div className="metaline">
      {fields.map(([label, value], i) => (
        <span className="field" key={i}>
          <b>{label}</b> ▸ <span className="v"><Decrypt text={value} /></span>
        </span>
      ))}
    </div>
  );
}

/** A section header: designator, h2, optional lede. Left-aligned. */
export function SecHead({ desig, title, lede, className = '' }: { desig: ReactNode; title: ReactNode; lede?: ReactNode; className?: string }) {
  return (
    <header className={`sechead ${className}`.trim()}>
      <span className="desig">{desig}</span>
      <h2 className="h2">{title}</h2>
      {lede ? <p className="lede">{lede}</p> : null}
    </header>
  );
}

/**
 * The stage that opens every interior page: meta line, designator, a heavy
 * headline and a lede on the left; one mercury body on the right. `seed`
 * varies the mercury's droplets so each page's body is its own.
 */
export function PageHead({
  meta,
  desig,
  title,
  lede,
  seed,
  children,
}: {
  meta?: [ReactNode, string][];
  desig?: ReactNode;
  title: string;
  lede?: ReactNode;
  seed?: number;
  children?: ReactNode;
}) {
  return (
    <section className="pagehead stage">
      <div className="wrap">
        <div className="ph-copy">
          {meta ? <MetaLine fields={meta} /> : null}
          {desig ? <span className="desig">{desig}</span> : null}
          <h1 className="display">
            <Words text={title} />
          </h1>
          {lede ? <p className="lede ld">{lede}</p> : null}
          {children ? <div className="actions ld" style={cssVars({ '--i': 1 })}>{children}</div> : null}
        </div>
        <Mercury className="ph-orb" seed={seed} blobs={4} />
      </div>
    </section>
  );
}

/** The closing call to action, on paper: designator, headline, a line of body, the action(s). */
export function CtaBand({ desig, title, body, children }: { desig: ReactNode; title: ReactNode; body?: ReactNode; children: ReactNode }) {
  return (
    <section className="cta">
      <div className="wrap">
        <span className="desig rv">{desig}</span>
        <h2 className="h2 rv">{title}</h2>
        {body ? <p className="body rv">{body}</p> : null}
        <div className="actions rv">{children}</div>
      </div>
    </section>
  );
}

/* ── the site's furniture ────────────────────────────────────────────────── */

export function CommandBar() {
  const { t } = useTranslation('c-rmh-pmc');
  const NAV = [
    { to: '/rmh-pmc/command', label: t('nav-command', { defaultValue: 'Command' }) },
    { to: '/rmh-pmc/capabilities', label: t('nav-capabilities', { defaultValue: 'Capabilities' }) },
    { to: '/rmh-pmc/intelligence', label: t('nav-intelligence', { defaultValue: 'Intelligence' }) },
    { to: '/rmh-pmc/operators', label: t('nav-operators', { defaultValue: 'Operators' }) },
    { to: '/rmh-pmc/contact', label: t('nav-contact', { defaultValue: 'Contact' }) },
  ];
  // Shared with RMH Capital's TopNav — see `hooks/useVerticalNav.ts`.
  const { toggleMenu, closeMenu, current } = useVerticalNav({
    rootClass: 'rmhp-root',
    barClass: 'cmdbar',
  });

  return (
    <header className="cmdbar">
      <div className="cmdbar-inner">
        <Link className="brand" to="/rmh-pmc" aria-label={t('rmh-pmc-home', { defaultValue: 'RMH PMC home' })}>
          <BrandMark />
          <span className="brand-text">RMH&nbsp;PMC</span>
        </Link>
        <nav className="navlinks" aria-label={t('nav-primary-label', { defaultValue: 'Primary' })}>
          {NAV.map((item) => (
            <Link key={item.to} to={item.to} aria-current={current(item.to)}>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="nav-right">
          <Link className="btn nav-cta" to="/rmh-pmc/contact">
            {t('request-briefing', { defaultValue: 'Request a briefing' })}
          </Link>
          <button className="nav-toggle" aria-label={t('open-menu', { defaultValue: 'Open menu' })} aria-expanded="false" aria-controls="m-menu" onClick={toggleMenu}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
              <line x1="4" y1="8" x2="20" y2="8" /><line x1="4" y1="16" x2="20" y2="16" />
            </svg>
          </button>
        </div>
      </div>
      <nav className="mobile-menu" id="m-menu" aria-label={t('nav-mobile-label', { defaultValue: 'Mobile' })}>
        {NAV.map((item) => (
          <Link key={item.to} to={item.to} aria-current={current(item.to)} onClick={closeMenu}>
            {item.label}
          </Link>
        ))}
        <Link className="btn" to="/rmh-pmc/contact" onClick={closeMenu}>
          {t('request-briefing', { defaultValue: 'Request a briefing' })}
        </Link>
      </nav>
    </header>
  );
}

export function SiteFooter() {
  const { t } = useTranslation('c-rmh-pmc');
  return (
    <footer className="footer">
      <div className="wrap">
        <div className="footer-top">
          <div className="footer-brand">
            <Link className="brand" to="/rmh-pmc" aria-label={t('rmh-pmc-home', { defaultValue: 'RMH PMC home' })}>
              <BrandMark />
              <span className="brand-text">RMH&nbsp;PMC</span>
            </Link>
            <p>{t('footer-tagline', { defaultValue: 'The private military arm of RMH Studios. Protective, intelligence, logistics, and advisory operations for clients who cannot afford to be wrong.' })}</p>
          </div>
          <div className="footer-col">
            <h4>{t('footer-capabilities-heading', { defaultValue: 'Capabilities' })}</h4>
            <Link to="/rmh-pmc/capabilities" hash="protective">{t('footer-protective-services', { defaultValue: 'Protective Services' })}</Link>
            <Link to="/rmh-pmc/capabilities" hash="guarding">{t('footer-static-guarding', { defaultValue: 'Static Guarding' })}</Link>
            <Link to="/rmh-pmc/capabilities" hash="intelligence">{t('footer-intelligence-isr', { defaultValue: 'Intelligence & ISR' })}</Link>
            <Link to="/rmh-pmc/capabilities" hash="logistics">{t('footer-logistics', { defaultValue: 'Logistics' })}</Link>
            <Link to="/rmh-pmc/capabilities" hash="sovereign">{t('footer-sovereign-solutions', { defaultValue: 'Sovereign Solutions' })}</Link>
          </div>
          <div className="footer-col">
            <h4>{t('footer-company-heading', { defaultValue: 'Company' })}</h4>
            <Link to="/rmh-pmc/command">{t('footer-command', { defaultValue: 'Command' })}</Link>
            <Link to="/rmh-pmc/intelligence">{t('footer-intelligence', { defaultValue: 'Intelligence' })}</Link>
            <Link to="/rmh-pmc/operators">{t('footer-operators', { defaultValue: 'Operators' })}</Link>
            <Link to="/rmh-pmc/contact">{t('footer-contact', { defaultValue: 'Contact' })}</Link>
          </div>
          <div className="footer-col">
            <h4>{t('footer-engage-heading', { defaultValue: 'Engage' })}</h4>
            <Link to="/rmh-pmc/contact" search={{ type: 'Protective Services' }}>{t('footer-protective-inquiries', { defaultValue: 'Protective inquiries' })}</Link>
            <Link to="/rmh-pmc/contact" search={{ type: 'Sovereign Solutions' }}>{t('footer-sovereign-desk', { defaultValue: 'Sovereign desk' })}</Link>
            <Link to="/rmh-pmc/operators">{t('footer-selection-recruiting', { defaultValue: 'Selection & recruiting' })}</Link>
          </div>
        </div>

        <div className="footer-bottom">
          <span className="copy">{t('copyright', { defaultValue: '© 2026 RMH PMC LLC · An RMH Studios company' })}</span>
          <div className="footer-legal">
            <a href="#">{t('footer-vetting', { defaultValue: 'Vetting' })}</a>
            <a href="#">{t('footer-compliance', { defaultValue: 'Compliance' })}</a>
            <a href="#">{t('footer-rules-of-engagement', { defaultValue: 'Rules of Engagement' })}</a>
            <a href="#">{t('footer-accessibility', { defaultValue: 'Accessibility' })}</a>
          </div>
        </div>

        <p className="disclaimer">
          {t('footer-disclaimer', { defaultValue: 'This website is for informational purposes only and does not constitute an offer of services, a solicitation, or a representation of present operational capability. RMH PMC provides services only to vetted, lawful clients, subject to applicable export controls, sanctions regimes, the laws of armed conflict, and the jurisdictions in which it operates. Unit affiliations, theaters, partner relationships, and personnel histories described herein are illustrative. RMH PMC and the RMH reticle mark are trademarks of RMH PMC LLC, an RMH Studios company.' })}
        </p>
      </div>
    </footer>
  );
}
