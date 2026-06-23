/**
 * RMH Capital — shared primitives ported from the original static site.
 * Nav, footer, ticker, brand mark, and the scroll-reveal hook.
 */
import { useEffect } from 'react';
import { Link, useRouterState } from '@tanstack/react-router';
import { useTranslation } from "react-i18next";

/* The geometric RMH mark used in the nav + footer. */
export function BrandMark() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <polygon points="50,5 89,27 89,73 50,95 11,73 11,27" fill="none" stroke="#C8A24A" strokeWidth="3" />
      <polygon points="50,25 72,38 72,62 50,75 28,62 28,38" fill="none" stroke="#C8A24A" strokeWidth="2" opacity="0.55" />
      <circle cx="50" cy="50" r="5" fill="#C8A24A" />
    </svg>
  );
}

/**
 * Reveal-on-scroll. Adds `.in` to every `.reveal` element inside the scope as it
 * enters the viewport. Re-runs whenever `key` changes (i.e. on navigation) so
 * freshly-mounted page content animates in too. Falls back to showing everything
 * if IntersectionObserver is unavailable or the user prefers reduced motion.
 */
export function useReveal(key: string) {
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let io: IntersectionObserver | null = null;

    // Defer one frame so the freshly-navigated page is in the DOM and laid out
    // before we query/measure it. Without this, a client-side route change can
    // run before the new page commits and the reveal nodes never get `.in`.
    const raf = requestAnimationFrame(() => {
      const nodes = Array.from(document.querySelectorAll<HTMLElement>('.rmhc-root .reveal'));
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
        // Reveal anything already at/above the fold right away — don't rely on the
        // observer's async first callback, which is unreliable after an SPA nav.
        // Observe only below-the-fold nodes so they still animate in on scroll.
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

type NavItem = { to: string; labelKey: string; labelDefault: string };
const NAV: NavItem[] = [
  { to: '/rmh-capital/firm', labelKey: 'nav-our-firm', labelDefault: 'Our Firm' },
  { to: '/rmh-capital/businesses', labelKey: 'nav-businesses', labelDefault: 'Businesses' },
  { to: '/rmh-capital/insights', labelKey: 'nav-insights', labelDefault: 'Insights' },
  { to: '/rmh-capital/careers', labelKey: 'nav-careers', labelDefault: 'Careers' },
  { to: '/rmh-capital/contact', labelKey: 'nav-contact', labelDefault: 'Contact' },
];

export function TopNav() {
  const { t } = useTranslation("c-rmh-capital");
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    const nav = document.querySelector('.rmhc-root .topnav');
    if (!nav) return;
    const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const toggleMenu = (e: React.MouseEvent<HTMLButtonElement>) => {
    const btn = e.currentTarget;
    const menu = btn.closest('.topnav')?.querySelector('.mobile-menu');
    if (!menu) return;
    const open = menu.classList.toggle('open');
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  };

  const closeMenu = () => {
    document.querySelector('.rmhc-root .mobile-menu')?.classList.remove('open');
  };

  const current = (to: string) => (pathname === to ? 'page' : undefined);

  return (
    <header className="topnav">
      <div className="topnav-inner">
        <div className="topnav-left">
          <a className="backlink" href="/" aria-label={t("back-to-rmh-studios", { defaultValue: "Back to RMH Studios" })}>
            <span aria-hidden="true">←</span>
            <span className="backlink-label">RMH Studios</span>
          </a>
          <Link className="brand" to="/rmh-capital" aria-label={t("rmh-capital-home", { defaultValue: "RMH Capital home" })}>
            <BrandMark />
            <span className="brand-text">RMH&nbsp;Capital</span>
          </Link>
        </div>
        <nav className="navlinks" aria-label={t("nav-primary", { defaultValue: "Primary" })}>
          {NAV.map((item) => (
            <Link key={item.to} to={item.to} aria-current={current(item.to)}>
              {t(item.labelKey, { defaultValue: item.labelDefault })}
            </Link>
          ))}
        </nav>
        <div className="nav-right">
          <Link className="nav-cta" to="/rmh-capital/contact">
            {t("contact-us", { defaultValue: "Contact us" })}
          </Link>
        </div>
        <button className="nav-toggle" aria-label={t("open-menu", { defaultValue: "Open menu" })} aria-expanded="false" aria-controls="m-menu" onClick={toggleMenu}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
            <line x1="3" y1="7" x2="21" y2="7" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="17" x2="21" y2="17" />
          </svg>
        </button>
      </div>
      <nav className="mobile-menu" id="m-menu" aria-label={t("nav-mobile", { defaultValue: "Mobile" })}>
        {NAV.map((item) => (
          <Link key={item.to} to={item.to} aria-current={current(item.to)} onClick={closeMenu}>
            {t(item.labelKey, { defaultValue: item.labelDefault })}
          </Link>
        ))}
      </nav>
    </header>
  );
}

export function MarketsTicker() {
  const rows = [
    ['RMH Global Equity', '+1.24%', false],
    ['Investment Grade Credit', '+0.38%', false],
    ['Leveraged Finance Index', '−0.42%', true],
    ['Venture Activity', '+3.10%', false],
    ['10Y Benchmark', '4.18%', false],
    ['RMH M&A Pipeline', '+2.05%', false],
    ['Housing Credit Spread', '−0.15%', true],
  ] as const;
  return (
    <div className="ticker" aria-hidden="true">
      <div className="ticker-track">
        {[...rows, ...rows].map(([label, val, down], i) => (
          <span key={i}>
            <b>{label}</b>
            <i className={down ? 'dn' : undefined}>{val}</i>
          </span>
        ))}
      </div>
    </div>
  );
}

export function SiteFooter() {
  const { t } = useTranslation("c-rmh-capital");
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-top">
          <div className="footer-brand">
            <Link className="brand" to="/rmh-capital" aria-label={t("rmh-capital-home", { defaultValue: "RMH Capital home" })}>
              <BrandMark />
              <span className="brand-text">RMH&nbsp;Capital</span>
            </Link>
            <p>{t("footer-brand-desc", { defaultValue: "An integrated investment bank and financial platform, partnering with clients across the full company arc." })}</p>
          </div>
          <div className="footer-col">
            <h4>{t("nav-businesses", { defaultValue: "Businesses" })}</h4>
            <Link to="/rmh-capital/businesses" hash="investment-banking">{t("investment-banking", { defaultValue: "Investment Banking" })}</Link>
            <Link to="/rmh-capital/businesses" hash="markets">{t("markets", { defaultValue: "Markets" })}</Link>
            <Link to="/rmh-capital/businesses" hash="corporate-banking">{t("corporate-banking", { defaultValue: "Corporate Banking" })}</Link>
            <Link to="/rmh-capital/businesses" hash="venture-capital">{t("venture-capital", { defaultValue: "Venture Capital" })}</Link>
            <Link to="/rmh-capital/businesses" hash="private-equity">{t("private-equity", { defaultValue: "Private Equity" })}</Link>
          </div>
          <div className="footer-col">
            <h4>{t("footer-firm-heading", { defaultValue: "Firm" })}</h4>
            <Link to="/rmh-capital/firm">{t("nav-our-firm", { defaultValue: "Our Firm" })}</Link>
            <Link to="/rmh-capital/insights">{t("nav-insights", { defaultValue: "Insights" })}</Link>
            <Link to="/rmh-capital/careers">{t("nav-careers", { defaultValue: "Careers" })}</Link>
            <Link to="/rmh-capital/contact">{t("nav-contact", { defaultValue: "Contact" })}</Link>
            <a href="/rmh-capital-board-book.html">{t("operating-atlas", { defaultValue: "Operating Atlas" })}</a>
          </div>
          <div className="footer-col">
            <h4>{t("footer-connect-heading", { defaultValue: "Connect" })}</h4>
            <Link to="/rmh-capital/contact" search={{ type: 'Media' }}>{t("media-inquiries", { defaultValue: "Media inquiries" })}</Link>
            <Link to="/rmh-capital/contact" search={{ type: 'Investment Banking' }}>{t("banking-inquiries", { defaultValue: "Banking inquiries" })}</Link>
            <Link to="/rmh-capital/careers">{t("open-roles", { defaultValue: "Open roles" })}</Link>
          </div>
        </div>

        <div className="footer-bottom">
          <span className="copy">{t("copyright", { defaultValue: "© 2026 RMH Capital LLC. All rights reserved." })}</span>
          <div className="footer-legal">
            <a href="#">{t("privacy", { defaultValue: "Privacy" })}</a>
            <a href="#">{t("terms", { defaultValue: "Terms" })}</a>
            <a href="#">{t("disclosures", { defaultValue: "Disclosures" })}</a>
            <a href="#">{t("accessibility", { defaultValue: "Accessibility" })}</a>
          </div>
          <div className="footer-social">
            <a href="#" aria-label={t("linkedin", { defaultValue: "LinkedIn" })}>
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM3 9h4v12H3zM9 9h3.8v1.7h.05c.53-1 1.83-2.05 3.77-2.05 4.03 0 4.78 2.65 4.78 6.1V21H21.4v-5.3c0-1.27-.02-2.9-1.77-2.9s-2.04 1.38-2.04 2.8V21H13.8z" /></svg>
            </a>
            <a href="#" aria-label={t("x", { defaultValue: "X" })}>
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.9 2H22l-7.5 8.6L23 22h-6.8l-5-6.6L5.3 22H2l8-9.2L1.5 2h7l4.5 6zM17 20h1.7L7.1 3.8H5.3z" /></svg>
            </a>
            <a href="#" aria-label={t("youtube", { defaultValue: "YouTube" })}>
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M23 12s0-3.4-.4-5c-.2-.9-.9-1.6-1.8-1.8C19.2 5 12 5 12 5s-7.2 0-8.8.4c-.9.2-1.6.9-1.8 1.8C1 8.6 1 12 1 12s0 3.4.4 5c.2.9.9 1.6 1.8 1.8 1.6.4 8.8.4 8.8.4s7.2 0 8.8-.4c.9-.2 1.6-.9 1.8-1.8.4-1.6.4-5 .4-5zM9.8 15.2V8.8l6 3.2z" /></svg>
            </a>
          </div>
        </div>

        <p className="disclaimer">
          {t("disclaimer", { defaultValue: "This website is for informational purposes only and does not constitute an offer to sell or a solicitation to buy securities. RMH Capital and its businesses provide services subject to applicable law and regulation; nothing herein is investment, legal, or tax advice. Certain content is illustrative. RMH Capital, RMHCombinator, and the RMH geometric mark are trademarks of RMH Capital LLC." })}
        </p>
      </div>
    </footer>
  );
}
