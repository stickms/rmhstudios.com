/**
 * RMH PMC — shared primitives for the "Operations Dossier" system.
 * Command bar, fixed document gutter, live Zulu clock, decrypt helper,
 * transmission log, brand mark, footer, and the scroll-reveal hook.
 */
import { useEffect, useRef, useState } from 'react';
import { Link, useRouterState } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

/* Reticle-in-hex mark — the hex keeps lineage with the RMH holding mark;
   the crosshair + chevron make it PMC. */
export function BrandMark() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <polygon points="50,5 89,27 89,73 50,95 11,73 11,27" fill="none" stroke="#E89A3C" strokeWidth="3" />
      <g stroke="#E89A3C" strokeWidth="1.6" opacity="0.55">
        <line x1="50" y1="14" x2="50" y2="26" /><line x1="50" y1="74" x2="50" y2="86" />
        <line x1="18" y1="50" x2="30" y2="50" /><line x1="70" y1="50" x2="82" y2="50" />
      </g>
      <path d="M36 44 L50 58 L64 44" fill="none" stroke="#F6B45A" strokeWidth="4" strokeLinecap="square" strokeLinejoin="miter" />
      <circle cx="50" cy="50" r="3.4" fill="#E89A3C" />
    </svg>
  );
}

const prefersReduced = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Decrypt — a string that scrambles through monospace glyphs on mount before
 * settling into its real text. Renders the final text on the server and when
 * reduced motion is requested, so it's accessible and SEO-safe. Use sparingly.
 */
const GLYPHS = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789/#%<>*·';
export function Decrypt({ text, className }: { text: string; className?: string }) {
  const [out, setOut] = useState(text);
  useEffect(() => {
    if (prefersReduced()) return;
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

/** Live Zulu (UTC) clock for the command bar. */
function ZuluClock() {
  const [now, setNow] = useState<string>('--:--');
  useEffect(() => {
    const fmt = () => {
      const d = new Date();
      const p = (n: number) => String(n).padStart(2, '0');
      setNow(`${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`);
    };
    fmt();
    const id = setInterval(fmt, 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <span className="clock">
      OPS // <b>{now}</b>Z
    </span>
  );
}

/**
 * Reveal-on-scroll. Adds `.in` to every `.reveal` element inside the scope as it
 * enters the viewport. Re-runs whenever `key` changes (navigation) so freshly
 * mounted page content animates in too. Falls back to showing everything when
 * IntersectionObserver is unavailable or reduced motion is requested.
 */
export function useReveal(key: string) {
  useEffect(() => {
    const reduce = prefersReduced();
    let io: IntersectionObserver | null = null;
    const raf = requestAnimationFrame(() => {
      const nodes = Array.from(document.querySelectorAll<HTMLElement>('.rmhp-root .reveal'));
      if (reduce || !('IntersectionObserver' in window)) {
        nodes.forEach((n) => n.classList.add('in'));
        return;
      }
      const vh = window.innerHeight || document.documentElement.clientHeight;
      io = new IntersectionObserver(
        (entries) => {
          entries.forEach((e) => {
            if (e.isIntersecting) {
              e.target.classList.add('in');
              io?.unobserve(e.target);
            }
          });
        },
        { threshold: 0.1, rootMargin: '0px 0px -8% 0px' }
      );
      nodes.forEach((n) => {
        if (n.classList.contains('in')) return;
        if (n.getBoundingClientRect().top < vh * 0.92) n.classList.add('in');
        else io!.observe(n);
      });
    });
    return () => {
      cancelAnimationFrame(raf);
      io?.disconnect();
    };
  }, [key]);
}

type NavItem = { to: string; label: string };
const NAV: NavItem[] = [
  { to: '/rmh-pmc/command', label: 'Command' },
  { to: '/rmh-pmc/capabilities', label: 'Capabilities' },
  { to: '/rmh-pmc/intelligence', label: 'Intelligence' },
  { to: '/rmh-pmc/operators', label: 'Operators' },
  { to: '/rmh-pmc/contact', label: 'Contact' },
];

export function CommandBar() {
  const { t } = useTranslation("c-rmh-pmc");
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    const bar = document.querySelector('.rmhp-root .cmdbar');
    if (!bar) return;
    const onScroll = () => bar.classList.toggle('scrolled', window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const toggleMenu = (e: React.MouseEvent<HTMLButtonElement>) => {
    const btn = e.currentTarget;
    const menu = btn.closest('.cmdbar')?.querySelector('.mobile-menu');
    if (!menu) return;
    const open = menu.classList.toggle('open');
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  };
  const closeMenu = () => document.querySelector('.rmhp-root .mobile-menu')?.classList.remove('open');
  const current = (to: string) => (pathname === to ? 'page' : undefined);

  return (
    <header className="cmdbar">
      <div className="cmdbar-inner">
        <div className="cmdbar-left">
          <a className="backlink" href="/" aria-label="Back to RMH Studios">
            <span aria-hidden="true">←</span>
            <span className="backlink-label">RMH Studios</span>
          </a>
          <Link className="brand" to="/rmh-pmc" aria-label="RMH PMC home">
            <BrandMark />
            <span className="brand-text">RMH&nbsp;PMC</span>
          </Link>
        </div>
        <nav className="navlinks" aria-label={t("nav-primary-label", { defaultValue: "Primary" })}>
          {NAV.map((item) => (
            <Link key={item.to} to={item.to} aria-current={current(item.to)}>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="nav-right">
          <ZuluClock />
          <Link className="nav-cta" to="/rmh-pmc/contact">
            {t("request-briefing", { defaultValue: "Request a briefing" })}
          </Link>
        </div>
        <button className="nav-toggle" aria-label={t("open-menu", { defaultValue: "Open menu" })} aria-expanded="false" aria-controls="m-menu" onClick={toggleMenu}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
            <line x1="3" y1="7" x2="21" y2="7" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="17" x2="21" y2="17" />
          </svg>
        </button>
      </div>
      <nav className="mobile-menu" id="m-menu" aria-label={t("nav-mobile-label", { defaultValue: "Mobile" })}>
        {NAV.map((item) => (
          <Link key={item.to} to={item.to} aria-current={current(item.to)} onClick={closeMenu}>
            {item.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}

/** Fixed left document spine — classification, file code, scroll progress. Decorative. */
export function Gutter() {
  const fill = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = fill.current;
    if (!el) return;
    const onScroll = () => {
      const h = document.documentElement.scrollHeight - window.innerHeight;
      const p = h > 0 ? Math.min(window.scrollY / h, 1) : 0;
      el.style.setProperty('--p', `${(p * 100).toFixed(1)}%`);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return (
    <aside className="gutter" aria-hidden="true">
      <span className="g-class">Restricted</span>
      <div className="g-tick" />
      <div className="g-prog" ref={fill} />
      <div className="g-tick" />
      <span className="g-code">DOC·RMH-PMC·2026</span>
    </aside>
  );
}

/* Deployment-status transmission log — the marquee strip under the hero. */
export function TransmissionLog() {
  const rows = [
    ['THEATER', 'SAHEL', 'ACTIVE', false],
    ['THEATER', 'LEVANT', 'STANDBY', false],
    ['CONVOY', 'GULF OF ADEN', 'ROLLING', false],
    ['POSTURE', 'EASTERN EUROPE', 'HOLD', true],
    ['OPS CENTER', 'GLOBAL', 'MANNED 24/7', false],
    ['LIAISON', 'PARTNER SVCS', 'NOMINAL', false],
    ['EXFIL', 'SECTOR 7', 'COMPLETE', false],
  ] as const;
  return (
    <div className="transmit" aria-hidden="true">
      <div className="transmit-tag">
        <span className="led" style={{ background: 'currentColor', boxShadow: 'none' }} /> LIVE
      </div>
      <div className="transmit-track">
        {[...rows, ...rows].map(([k, label, val, hold], i) => (
          <span key={i}>
            <em className={hold ? 'led hold' : 'led'} style={{ fontStyle: 'normal' }} />
            <b>{k}: {label}</b>
            <i className={hold ? 'hold' : undefined}>{val}</i>
          </span>
        ))}
      </div>
    </div>
  );
}

export function SiteFooter() {
  const { t } = useTranslation("c-rmh-pmc");
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-top">
          <div className="footer-brand">
            <Link className="brand" to="/rmh-pmc" aria-label="RMH PMC home">
              <BrandMark />
              <span className="brand-text">RMH&nbsp;PMC</span>
            </Link>
            <p>{t("footer-tagline", { defaultValue: "The private military arm of RMH Studios. Protective, intelligence, logistics, and advisory operations for clients who cannot afford to be wrong." })}</p>
          </div>
          <div className="footer-col">
            <h4>{t("footer-capabilities-heading", { defaultValue: "Capabilities" })}</h4>
            <Link to="/rmh-pmc/capabilities" hash="protective">{t("footer-protective-services", { defaultValue: "Protective Services" })}</Link>
            <Link to="/rmh-pmc/capabilities" hash="guarding">{t("footer-static-guarding", { defaultValue: "Static Guarding" })}</Link>
            <Link to="/rmh-pmc/capabilities" hash="intelligence">{t("footer-intelligence-isr", { defaultValue: "Intelligence & ISR" })}</Link>
            <Link to="/rmh-pmc/capabilities" hash="logistics">{t("footer-logistics", { defaultValue: "Logistics" })}</Link>
            <Link to="/rmh-pmc/capabilities" hash="sovereign">{t("footer-sovereign-solutions", { defaultValue: "Sovereign Solutions" })}</Link>
          </div>
          <div className="footer-col">
            <h4>{t("footer-company-heading", { defaultValue: "Company" })}</h4>
            <Link to="/rmh-pmc/command">{t("footer-command", { defaultValue: "Command" })}</Link>
            <Link to="/rmh-pmc/intelligence">{t("footer-intelligence", { defaultValue: "Intelligence" })}</Link>
            <Link to="/rmh-pmc/operators">{t("footer-operators", { defaultValue: "Operators" })}</Link>
            <Link to="/rmh-pmc/contact">{t("footer-contact", { defaultValue: "Contact" })}</Link>
          </div>
          <div className="footer-col">
            <h4>{t("footer-engage-heading", { defaultValue: "Engage" })}</h4>
            <Link to="/rmh-pmc/contact" search={{ type: 'Protective Services' }}>{t("footer-protective-inquiries", { defaultValue: "Protective inquiries" })}</Link>
            <Link to="/rmh-pmc/contact" search={{ type: 'Sovereign Solutions' }}>{t("footer-sovereign-desk", { defaultValue: "Sovereign desk" })}</Link>
            <Link to="/rmh-pmc/operators">{t("footer-selection-recruiting", { defaultValue: "Selection & recruiting" })}</Link>
          </div>
        </div>

        <div className="footer-bottom">
          <span className="copy">© 2026 RMH PMC LLC · An RMH Studios company</span>
          <div className="footer-legal">
            <a href="#">{t("footer-vetting", { defaultValue: "Vetting" })}</a>
            <a href="#">{t("footer-compliance", { defaultValue: "Compliance" })}</a>
            <a href="#">{t("footer-rules-of-engagement", { defaultValue: "Rules of Engagement" })}</a>
            <a href="#">{t("footer-accessibility", { defaultValue: "Accessibility" })}</a>
          </div>
          <div className="footer-social">
            <a href="#" aria-label="LinkedIn">
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM3 9h4v12H3zM9 9h3.8v1.7h.05c.53-1 1.83-2.05 3.77-2.05 4.03 0 4.78 2.65 4.78 6.1V21H21.4v-5.3c0-1.27-.02-2.9-1.77-2.9s-2.04 1.38-2.04 2.8V21H13.8z" /></svg>
            </a>
            <a href="#" aria-label="X">
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.9 2H22l-7.5 8.6L23 22h-6.8l-5-6.6L5.3 22H2l8-9.2L1.5 2h7l4.5 6zM17 20h1.7L7.1 3.8H5.3z" /></svg>
            </a>
            <a href="#" aria-label="YouTube">
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M23 12s0-3.4-.4-5c-.2-.9-.9-1.6-1.8-1.8C19.2 5 12 5 12 5s-7.2 0-8.8.4c-.9.2-1.6.9-1.8 1.8C1 8.6 1 12 1 12s0 3.4.4 5c.2.9.9 1.6 1.8 1.8 1.6.4 8.8.4 8.8.4s7.2 0 8.8-.4c.9-.2 1.6-.9 1.8-1.8.4-1.6.4-5 .4-5zM9.8 15.2V8.8l6 3.2z" /></svg>
            </a>
          </div>
        </div>

        <p className="disclaimer">
          {t("footer-disclaimer", { defaultValue: "This website is for informational purposes only and does not constitute an offer of services, a solicitation, or a representation of present operational capability. RMH PMC provides services only to vetted, lawful clients, subject to applicable export controls, sanctions regimes, the laws of armed conflict, and the jurisdictions in which it operates. Unit affiliations, theaters, partner relationships, and personnel histories described herein are illustrative. RMH PMC and the RMH reticle mark are trademarks of RMH PMC LLC, an RMH Studios company." })}
        </p>
      </div>
    </footer>
  );
}
