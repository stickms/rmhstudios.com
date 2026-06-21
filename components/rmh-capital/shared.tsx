/**
 * RMH Capital — shared primitives ported from the original static site.
 * Nav, footer, ticker, brand mark, and the scroll-reveal hook.
 */
import { useEffect } from 'react';
import { Link, useRouterState } from '@tanstack/react-router';

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
    const nodes = Array.from(document.querySelectorAll<HTMLElement>('.rmhc-root .reveal'));
    if (reduce || !('IntersectionObserver' in window)) {
      nodes.forEach((n) => n.classList.add('in'));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('in');
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.1, rootMargin: '0px 0px -8% 0px' }
    );
    nodes.forEach((n) => {
      if (!n.classList.contains('in')) io.observe(n);
    });
    return () => io.disconnect();
  }, [key]);
}

type NavItem = { to: string; label: string };
const NAV: NavItem[] = [
  { to: '/rmh-capital/firm', label: 'Our Firm' },
  { to: '/rmh-capital/businesses', label: 'Businesses' },
  { to: '/rmh-capital/insights', label: 'Insights' },
  { to: '/rmh-capital/careers', label: 'Careers' },
  { to: '/rmh-capital/contact', label: 'Contact' },
];

export function TopNav() {
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
        <div className="brand-group">
          <a className="nav-back" href="/" aria-label="Back to RMH Studios">
            <span aria-hidden="true">&larr;</span>
            <span className="nav-back-label">RMH&nbsp;Studios</span>
          </a>
          <Link className="brand" to="/rmh-capital" aria-label="RMH Capital home">
            <BrandMark />
            <span className="brand-text">RMH&nbsp;Capital</span>
          </Link>
        </div>
        <nav className="navlinks" aria-label="Primary">
          {NAV.map((item) => (
            <Link key={item.to} to={item.to} aria-current={current(item.to)}>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="nav-right">
          <Link className="nav-cta" to="/rmh-capital/contact">
            Contact us
          </Link>
        </div>
        <button className="nav-toggle" aria-label="Open menu" aria-expanded="false" aria-controls="m-menu" onClick={toggleMenu}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
            <line x1="3" y1="7" x2="21" y2="7" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="17" x2="21" y2="17" />
          </svg>
        </button>
      </div>
      <nav className="mobile-menu" id="m-menu" aria-label="Mobile">
        {NAV.map((item) => (
          <Link key={item.to} to={item.to} aria-current={current(item.to)} onClick={closeMenu}>
            {item.label}
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
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-top">
          <div className="footer-brand">
            <Link className="brand" to="/rmh-capital" aria-label="RMH Capital home">
              <BrandMark />
              <span className="brand-text">RMH&nbsp;Capital</span>
            </Link>
            <p>An integrated investment bank and financial platform, partnering with clients across the full company arc.</p>
          </div>
          <div className="footer-col">
            <h4>Businesses</h4>
            <Link to="/rmh-capital/businesses" hash="investment-banking">Investment Banking</Link>
            <Link to="/rmh-capital/businesses" hash="markets">Markets</Link>
            <Link to="/rmh-capital/businesses" hash="corporate-banking">Corporate Banking</Link>
            <Link to="/rmh-capital/businesses" hash="venture-capital">Venture Capital</Link>
            <Link to="/rmh-capital/businesses" hash="private-equity">Private Equity</Link>
          </div>
          <div className="footer-col">
            <h4>Firm</h4>
            <Link to="/rmh-capital/firm">Our Firm</Link>
            <Link to="/rmh-capital/insights">Insights</Link>
            <Link to="/rmh-capital/careers">Careers</Link>
            <Link to="/rmh-capital/contact">Contact</Link>
            <a href="/rmh-capital-board-book.html">Operating Atlas</a>
          </div>
          <div className="footer-col">
            <h4>Connect</h4>
            <Link to="/rmh-capital/contact" search={{ type: 'Media' }}>Media inquiries</Link>
            <Link to="/rmh-capital/contact" search={{ type: 'Investment Banking' }}>Banking inquiries</Link>
            <Link to="/rmh-capital/careers">Open roles</Link>
          </div>
        </div>

        <div className="footer-bottom">
          <span className="copy">© 2026 RMH Capital LLC. All rights reserved.</span>
          <div className="footer-legal">
            <a href="#">Privacy</a>
            <a href="#">Terms</a>
            <a href="#">Disclosures</a>
            <a href="#">Accessibility</a>
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
          This website is for informational purposes only and does not constitute an offer to sell or a solicitation to buy securities. RMH Capital and its businesses provide services subject to applicable law and regulation; nothing herein is investment, legal, or tax advice. Certain content is illustrative. RMH Capital, RMHCombinator, and the RMH geometric mark are trademarks of RMH Capital LLC.
        </p>
      </div>
    </footer>
  );
}
