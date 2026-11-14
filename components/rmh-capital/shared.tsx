/**
 * RMH Capital — the shared parts every page is built from: the nav and footer,
 * and the primitives of the chrome design (rmh-capital.css): the page-head
 * slab, plates, the headline that rises word by word, counting figures, the
 * deal tombstones and the satire notice.
 *
 * Motion is CSS (see the MOTION block in rmh-capital.css). The one script is
 * the pointer handler in Layout.tsx, which tells a chrome surface where the
 * pointer is so its reflection can follow.
 */

import type { CSSProperties, ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useVerticalNav } from '@/hooks/useVerticalNav';

/** A CSS custom property in a `style` prop, without a cast at every call site. */
export function cssVars(vars: Record<`--${string}`, string | number>): CSSProperties {
  return vars as CSSProperties;
}

/* ── marks and icons ─────────────────────────────────────────────────────── */

/** The RMH hexagon, in chrome. The stops are the site's chrome tokens. */
export function BrandMark() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <linearGradient id="rmhc-mark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--st-1)' }} />
          <stop offset="0.5" style={{ stopColor: 'var(--st-2)' }} />
          <stop offset="0.52" style={{ stopColor: 'var(--st-3)' }} />
          <stop offset="1" style={{ stopColor: 'var(--st-4)' }} />
        </linearGradient>
      </defs>
      <path
        fill="url(#rmhc-mark)"
        fillRule="evenodd"
        d="M50 4 90 27v46L50 96 10 73V27Zm0 20L27.5 37v26L50 76l22.5-13V37Z"
      />
      <circle cx="50" cy="50" r="7" style={{ fill: 'var(--ink)' }} />
    </svg>
  );
}

/** The arrow inside a `.cta`. */
export function ArrowIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      <path d="M1.5 8h12M9 3.5 13.5 8 9 12.5" />
    </svg>
  );
}

/** The corner arrow that ends a list item or a `.go` link. */
export function CornerArrow({ className = 'go-arrow' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 22 22"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      aria-hidden="true"
    >
      <path d="M3 2.5v10.5h14M12.5 8.5 17 13l-4.5 4.5" />
    </svg>
  );
}

/* ── primitives ──────────────────────────────────────────────────────────── */

/**
 * A headline whose words rise out of masks, one after another, on load.
 * Pass the translated string; it stays ordinary text for a screen reader.
 * `delay` (seconds) is when the first word starts.
 */
export function Words({ text, delay }: { text: string; delay?: number }) {
  const words = text.split(' ');
  return (
    <span
      className="words"
      style={delay === undefined ? undefined : cssVars({ '--d': `${delay}s` })}
    >
      {words.map((word, i) => (
        <span key={i}>
          <span className="w">
            <span style={cssVars({ '--i': i })}>{word}</span>
          </span>
          {i < words.length - 1 ? ' ' : null}
        </span>
      ))}
    </span>
  );
}

export type PlateKind = 'colonnade' | 'louvres' | 'ingot' | 'disc' | 'orb';

/**
 * A piece of chrome where a bank would hang a photograph. Decorative, so it is
 * hidden from assistive technology. `className` takes a shape (`plate--wide`,
 * `plate--tall`, `plate--sq`, `plate--free`). To reveal one on scroll, wrap it
 * in a `<div className="rv-wipe">` — never put `rv*` on the plate itself.
 */
export function Plate({
  kind,
  className = '',
  children,
}: {
  kind: PlateKind;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div
      className={`plate plate--${kind} chrome ${className}`.trim()}
      data-chrome-live=""
      aria-hidden="true"
    >
      {children}
    </div>
  );
}

/** The slab that opens every interior page. `children` go under the lede. */
export function PageHead({
  title,
  lede,
  children,
}: {
  title: string;
  lede?: string;
  children?: ReactNode;
}) {
  return (
    <section className="pagehead">
      <div className="pagehead-slab chrome chrome-satin" data-chrome-live="">
        <div className="pagehead-copy">
          <h1 className="display">
            <Words text={title} />
          </h1>
          {lede ? <p className="lede ld">{lede}</p> : null}
          {children}
        </div>
      </div>
    </section>
  );
}

/**
 * An integer that counts up as it scrolls into view. `pre` and `suf` are
 * printed around it ("$", "B"). A screen reader gets the final figure.
 */
export function Count({
  to,
  pre = '',
  suf = '',
  className,
}: {
  to: number;
  pre?: string;
  suf?: string;
  className?: string;
}) {
  return (
    <span className={className}>
      <span className="sr">
        {pre}
        {to}
        {suf}
      </span>
      <span
        className="count-n"
        aria-hidden="true"
        data-pre={pre}
        data-suf={suf}
        style={cssVars({ '--to': to })}
      />
    </span>
  );
}

/** RMH Capital is a parody. Every page that names a deal carries this. */
export function SatireNotice() {
  const { t } = useTranslation('c-rmh-capital');
  return (
    <p className="notice">
      {t('satire-notice', {
        defaultValue:
          'RMH Capital is a work of satire. The transactions described on this site are fictional. No company or individual named has any connection to them.',
      })}
    </p>
  );
}

/**
 * The two announced transactions, as tombstones. Used on the home page and at
 * the top of Deals, so the wording lives in one place. Each links to its
 * section on the Deals page.
 */
export function DealTombstones() {
  const { t } = useTranslation('c-rmh-capital');
  return (
    <div className="tombs">
      <Link className="tomb chrome" data-chrome-live="" to="/rmh-capital/deals" hash="nvidiamd">
        <div className="tomb-face">
          <p className="tomb-record">
            {t('tomb-record', {
              defaultValue: 'This announcement appears as a matter of record only.',
            })}
          </p>
          <p className="tomb-date">
            {t('tomb-nvidiamd-date', { defaultValue: 'November 13, 2026' })}
          </p>
          <h3 className="tomb-parties">
            {t('tomb-nvidiamd-parties', { defaultValue: 'AMD and Nvidia' })}
          </h3>
          <p className="tomb-amount steel">
            <Count to={955} pre="$" />
          </p>
          <p className="tomb-what">
            {t('tomb-nvidiamd-what', {
              defaultValue: 'billion all-stock combination to form NvidiAMD',
            })}
          </p>
          <span className="tomb-rule" />
          <p className="tomb-role">
            <b>RMHan Stanley</b>
            {t('tomb-nvidiamd-role', { defaultValue: 'Lead financial advisor' })}
          </p>
          <span className="go">
            {t('tomb-read', { defaultValue: 'Read the transaction' })} <CornerArrow className="" />
          </span>
        </div>
      </Link>

      <Link
        className="tomb chrome"
        data-chrome-live=""
        to="/rmh-capital/deals"
        hash="tibetan-buddhism"
      >
        <div className="tomb-face">
          <p className="tomb-record">
            {t('tomb-record-karma', {
              defaultValue: 'This announcement appears as a matter of karma only.',
            })}
          </p>
          <p className="tomb-date">
            {t('tomb-buddhism-date', { defaultValue: 'November 7, 2026' })}
          </p>
          <h3 className="tomb-parties">
            {t('tomb-buddhism-parties', { defaultValue: 'Bain Capital' })}
          </h3>
          <p className="tomb-amount steel">
            <Count to={35} pre="$" />
          </p>
          <p className="tomb-what">
            {t('tomb-buddhism-what', {
              defaultValue:
                'million Senior Secured Enlightenment Facility for the acquisition of Tibetan Buddhism',
            })}
          </p>
          <span className="tomb-rule" />
          <p className="tomb-role">
            <b>RMH Capital</b>
            {t('tomb-buddhism-role', { defaultValue: 'Lead left bookrunner' })}
          </p>
          <span className="go">
            {t('tomb-read', { defaultValue: 'Read the transaction' })} <CornerArrow className="" />
          </span>
        </div>
      </Link>
    </div>
  );
}

/* ── nav ─────────────────────────────────────────────────────────────────── */

export function TopNav() {
  const { t } = useTranslation('c-rmh-capital');
  // Condense-on-scroll, the mobile menu and `aria-current` are identical here
  // and in RMH PMC — see `hooks/useVerticalNav.ts` for why the shared part is
  // the behaviour and not a component.
  const { toggleMenu, closeMenu, current } = useVerticalNav({
    rootClass: 'rmhc-root',
    barClass: 'topnav',
  });
  // Literal keys, so the extractor can see them (a key read out of a table is
  // invisible to it and never reaches the catalogs).
  const nav = [
    { to: '/rmh-capital/firm', label: t('nav-our-firm', { defaultValue: 'Our Firm' }) },
    { to: '/rmh-capital/businesses', label: t('nav-businesses', { defaultValue: 'Businesses' }) },
    { to: '/rmh-capital/deals', label: t('nav-deals', { defaultValue: 'Deals' }) },
    { to: '/rmh-capital/insights', label: t('nav-insights', { defaultValue: 'Insights' }) },
    { to: '/rmh-capital/careers', label: t('nav-careers', { defaultValue: 'Careers' }) },
    { to: '/rmh-capital/contact', label: t('nav-contact', { defaultValue: 'Contact' }) },
  ];

  return (
    <header className="topnav">
      <div className="topnav-inner">
        <div className="topnav-left">
          <a
            className="backlink"
            href="/"
            aria-label={t('back-to-rmh-studios', { defaultValue: 'Back to RMH Studios' })}
          >
            <svg
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              aria-hidden="true"
            >
              <path d="M14.5 8h-12M7 3.5 2.5 8 7 12.5" />
            </svg>
            <span className="backlink-label">RMH Studios</span>
          </a>
          <Link
            className="brand"
            to="/rmh-capital"
            aria-label={t('rmh-capital-home', { defaultValue: 'RMH Capital home' })}
          >
            <BrandMark />
            <span className="brand-text">RMH Capital</span>
          </Link>
        </div>
        <nav className="navlinks" aria-label={t('nav-primary', { defaultValue: 'Primary' })}>
          {nav.map((item) => (
            <Link key={item.to} to={item.to} aria-current={current(item.to)}>
              {item.label}
            </Link>
          ))}
        </nav>
        <button
          className="nav-toggle"
          aria-label={t('open-menu', { defaultValue: 'Open menu' })}
          aria-expanded="false"
          aria-controls="m-menu"
          onClick={toggleMenu}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4">
            <line x1="3" y1="7" x2="21" y2="7" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="17" x2="21" y2="17" />
          </svg>
        </button>
      </div>
      <nav
        className="mobile-menu"
        id="m-menu"
        aria-label={t('nav-mobile', { defaultValue: 'Mobile' })}
      >
        {nav.map((item, i) => (
          <Link
            key={item.to}
            to={item.to}
            aria-current={current(item.to)}
            onClick={closeMenu}
            style={cssVars({ '--i': i })}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}

/* ── footer ──────────────────────────────────────────────────────────────── */

export function SiteFooter() {
  const { t } = useTranslation('c-rmh-capital');
  return (
    <footer className="footer">
      <div className="wrap">
        <span className="footer-word steel" aria-hidden="true">
          RMH Capital
        </span>

        <div className="footer-top">
          <div className="footer-brand">
            <p>
              {t('footer-brand-desc', {
                defaultValue:
                  'An integrated investment bank and financial platform, partnering with clients across the full company arc.',
              })}
            </p>
            <Link className="go" to="/rmh-capital/contact">
              {t('contact-us', { defaultValue: 'Contact us' })} <CornerArrow className="" />
            </Link>
          </div>
          <div className="footer-col">
            <h4>{t('nav-businesses', { defaultValue: 'Businesses' })}</h4>
            <Link to="/rmh-capital/businesses" hash="investment-banking">
              {t('investment-banking', { defaultValue: 'Investment Banking' })}
            </Link>
            <Link to="/rmh-capital/businesses" hash="markets">
              {t('markets', { defaultValue: 'Markets' })}
            </Link>
            <Link to="/rmh-capital/businesses" hash="corporate-banking">
              {t('corporate-banking', { defaultValue: 'Corporate Banking' })}
            </Link>
            <Link to="/rmh-capital/businesses" hash="venture-capital">
              {t('venture-capital', { defaultValue: 'Venture Capital' })}
            </Link>
            <Link to="/rmh-capital/businesses" hash="private-equity">
              {t('private-equity', { defaultValue: 'Private Equity' })}
            </Link>
          </div>
          <div className="footer-col">
            <h4>{t('footer-firm-heading', { defaultValue: 'Firm' })}</h4>
            <Link to="/rmh-capital/firm">{t('nav-our-firm', { defaultValue: 'Our Firm' })}</Link>
            <Link to="/rmh-capital/deals">{t('nav-deals', { defaultValue: 'Deals' })}</Link>
            <Link to="/rmh-capital/insights">
              {t('nav-insights', { defaultValue: 'Insights' })}
            </Link>
            <Link to="/rmh-capital/careers">{t('nav-careers', { defaultValue: 'Careers' })}</Link>
            <a href="/rmh-capital-board-book.html">
              {t('operating-atlas', { defaultValue: 'Operating Atlas' })}
            </a>
          </div>
          <div className="footer-col">
            <h4>{t('footer-connect-heading', { defaultValue: 'Connect' })}</h4>
            <Link to="/rmh-capital/contact" search={{ type: 'Media' }}>
              {t('media-inquiries', { defaultValue: 'Media inquiries' })}
            </Link>
            <Link to="/rmh-capital/contact" search={{ type: 'Investment Banking' }}>
              {t('banking-inquiries', { defaultValue: 'Banking inquiries' })}
            </Link>
            <Link to="/rmh-capital/careers">{t('open-roles', { defaultValue: 'Open roles' })}</Link>
          </div>
        </div>

        <div className="footer-bottom">
          <span className="copy">
            {t('copyright', { defaultValue: '© 2026 RMH Capital LLC. All rights reserved.' })}
          </span>
          <div className="footer-legal">
            <a href="/privacy">{t('privacy', { defaultValue: 'Privacy' })}</a>
            <a href="/terms">{t('terms', { defaultValue: 'Terms' })}</a>
          </div>
        </div>

        <p className="disclaimer">
          {t('disclaimer', {
            defaultValue:
              'This website is for informational purposes only and does not constitute an offer to sell or a solicitation to buy securities. RMH Capital and its businesses provide services subject to applicable law and regulation; nothing herein is investment, legal, or tax advice. Certain content is illustrative. RMH Capital, RMHCombinator, and the RMH geometric mark are trademarks of RMH Capital LLC.',
          })}
        </p>
        <p className="disclaimer">
          {t('satire-notice', {
            defaultValue:
              'RMH Capital is a work of satire. The transactions described on this site are fictional. No company or individual named has any connection to them.',
          })}
        </p>
      </div>
    </footer>
  );
}
