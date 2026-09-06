/**
 * RMH Datacenter — shared primitives for the "Cold Aisle" system.
 *
 * Brand mark, the sticky top bar, the fixed facility rail, the live floor
 * marquee, the rack-elevation hero object, a capacity meter, and the footer.
 *
 * Two deliberate absences. There is no scroll-reveal hook: the reveal is a
 * scroll-driven CSS animation in `rmh-datacenter.css`, so there is nothing for
 * JavaScript to drive. And nothing here runs a rAF loop — the only recurring
 * work on the site is one `setInterval` for the clock cluster, which ticks once
 * a second rather than once a frame.
 */
import { useEffect, useRef, useState } from 'react';
import { Link, useRouterState } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

/**
 * Hex-in-hex mark: the RMH holding hexagon with a rack elevation inside it.
 * Same lineage as the PMC reticle and the Capital monogram — the outer shape is
 * the family, the inside says which arm.
 */
export function BrandMark() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <polygon
        points="50,5 89,27 89,73 50,95 11,73 11,27"
        fill="none"
        stroke="#35D6C0"
        strokeWidth="3"
      />
      <g fill="#35D6C0" opacity="0.9">
        <rect x="34" y="31" width="32" height="7" rx="1.5" />
        <rect x="34" y="42" width="32" height="7" rx="1.5" opacity="0.62" />
        <rect x="34" y="53" width="32" height="7" rx="1.5" />
        <rect x="34" y="64" width="32" height="7" rx="1.5" opacity="0.45" />
      </g>
      <g fill="#6BEFDC">
        <circle cx="61" cy="34.5" r="1.8" />
        <circle cx="61" cy="56.5" r="1.8" />
      </g>
    </svg>
  );
}

/**
 * The three floors the clock cluster reports. Fixed IANA zones rather than an
 * offset, so the strip stays right across both DST transitions without anybody
 * editing a number twice a year.
 */
const FLOORS: { code: string; zone: string }[] = [
  { code: 'ASH', zone: 'America/New_York' },
  { code: 'DUB', zone: 'Europe/Dublin' },
  { code: 'SIN', zone: 'Asia/Singapore' },
];

/** Local time at three halls — the strip a NOC wall always carries. */
function Clocks() {
  const [times, setTimes] = useState<string[]>(() => FLOORS.map(() => '--:--'));

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setTimes(
        FLOORS.map((f) =>
          new Intl.DateTimeFormat('en-GB', {
            timeZone: f.zone,
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          }).format(now),
        ),
      );
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <span className="clocks">
      {FLOORS.map((f, i) => (
        <span key={f.code}>
          {f.code} <b>{times[i]}</b>
        </span>
      ))}
    </span>
  );
}

type NavItem = { to: string; label: string };

/**
 * Nav labels are English literals rather than `t()` calls for the same reason
 * the PMC bar's are: they are the site's five section names, they appear in the
 * URL, and a translated label beside an untranslated path reads as two
 * different destinations. Everything that is prose goes through `t()`.
 */
const NAV: NavItem[] = [
  { to: '/rmh-datacenter/facilities', label: 'Facilities' },
  { to: '/rmh-datacenter/platform', label: 'Platform' },
  { to: '/rmh-datacenter/network', label: 'Network' },
  { to: '/rmh-datacenter/power', label: 'Power' },
  { to: '/rmh-datacenter/contact', label: 'Contact' },
];

export function TopBar() {
  const { t } = useTranslation('c-rmh-datacenter');
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    const bar = document.querySelector('.rmhdc-root .topbar');
    if (!bar) return;
    const onScroll = () => bar.classList.toggle('scrolled', window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const toggleMenu = (e: React.MouseEvent<HTMLButtonElement>) => {
    const btn = e.currentTarget;
    const menu = btn.closest('.topbar')?.querySelector('.mobile-menu');
    if (!menu) return;
    const open = menu.classList.toggle('open');
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  };
  const closeMenu = () =>
    document.querySelector('.rmhdc-root .mobile-menu')?.classList.remove('open');
  const current = (to: string) => (pathname === to ? 'page' : undefined);

  return (
    <header className="topbar">
      <div className="topbar-inner">
        <div className="topbar-left">
          <a className="backlink" href="/" aria-label="Back to RMH Studios">
            <span aria-hidden="true">←</span>
            <span className="backlink-label">RMH Studios</span>
          </a>
          <Link className="brand" to="/rmh-datacenter" aria-label="RMH Datacenter home">
            <BrandMark />
            <span className="brand-text">RMH&nbsp;Datacenter</span>
          </Link>
        </div>
        <nav className="navlinks" aria-label={t('nav-primary-label', { defaultValue: 'Primary' })}>
          {NAV.map((item) => (
            <Link key={item.to} to={item.to} aria-current={current(item.to)}>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="nav-right">
          <Clocks />
          <Link className="nav-cta" to="/rmh-datacenter/contact">
            {t('request-capacity', { defaultValue: 'Request capacity' })}
          </Link>
        </div>
        <button
          className="nav-toggle"
          aria-label={t('open-menu', { defaultValue: 'Open menu' })}
          aria-expanded="false"
          aria-controls="dc-menu"
          onClick={toggleMenu}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
            <line x1="3" y1="7" x2="21" y2="7" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="17" x2="21" y2="17" />
          </svg>
        </button>
      </div>
      <nav
        className="mobile-menu"
        id="dc-menu"
        aria-label={t('nav-mobile-label', { defaultValue: 'Mobile' })}
      >
        {NAV.map((item) => (
          <Link key={item.to} to={item.to} aria-current={current(item.to)} onClick={closeMenu}>
            {item.label}
          </Link>
        ))}
        <Link className="nav-cta" to="/rmh-datacenter/contact" onClick={closeMenu}>
          {t('request-capacity', { defaultValue: 'Request capacity' })}
        </Link>
      </nav>
    </header>
  );
}

/**
 * The facility spine — hall designation, scroll progress, drawing number.
 * Decorative, and written to the rail element itself rather than to
 * `documentElement`: a custom property on the root is inherited by the whole
 * document, so one write per scroll event there is a whole-document restyle.
 */
export function Rail() {
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
    <aside className="rail" aria-hidden="true">
      <span className="rail-label">Cold aisle</span>
      <div className="rail-tick" />
      <div className="rail-prog" ref={fill} />
      <div className="rail-tick" />
      <span className="rail-code">DWG·RMH-DC·2026</span>
    </aside>
  );
}

/**
 * The live floor marquee. Decorative and `aria-hidden`: it is a wall display,
 * and the same figures are in the telemetry readout below it as real text.
 */
export function FloorLine() {
  const rows = [
    ['ASH-01', 'HALL A', 'NOMINAL', false],
    ['ASH-01', 'PUE', '1.09', false],
    ['DUB-02', 'HALL C', 'NOMINAL', false],
    ['DUB-02', 'LOAD', '74%', true],
    ['SIN-01', 'HALL B', 'NOMINAL', false],
    ['FRA-03', 'GRID', '100% RENEWABLE', false],
    ['PDX-01', 'HEAT REUSE', 'EXPORTING', false],
    ['GLOBAL', 'NOC', 'MANNED 24/7', false],
  ] as const;
  return (
    <div className="floorline" aria-hidden="true">
      <div className="floorline-tag">
        <span className="led" style={{ background: 'currentColor', boxShadow: 'none' }} /> LIVE
      </div>
      <div className="floorline-track">
        {[...rows, ...rows].map(([site, label, val, load], i) => (
          <span key={i}>
            <em className={load ? 'led load' : 'led'} style={{ fontStyle: 'normal' }} />
            <b>
              {site}: {label}
            </b>
            <i className={load ? 'load' : undefined}>{val}</i>
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * The rack elevation behind the hero — the site's signature object.
 *
 * Forty-two U drawn as forty-two rects, because that is what a rack is. The
 * four blinking status LEDs are `steps(1, end)` rather than a fade: a drive
 * light is on or it is off, and an eased opacity ramp reads as a glow instead
 * of a disk seeking.
 */
export function RackElevation() {
  const units = Array.from({ length: 42 }, (_, i) => i);
  return (
    <svg
      className="elevation"
      viewBox="0 0 320 520"
      fill="none"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      <rect
        x="60"
        y="20"
        width="200"
        height="480"
        stroke="#35D6C0"
        strokeOpacity="0.28"
        strokeWidth="1.5"
      />
      <rect x="70" y="30" width="180" height="460" stroke="#35D6C0" strokeOpacity="0.12" />
      {units.map((u) => {
        const y = 34 + u * 10.7;
        const filled = u < 31;
        return (
          <g key={u}>
            <rect
              x="74"
              y={y}
              width="172"
              height="8.4"
              fill={filled ? '#12181B' : 'transparent'}
              stroke="#EDF3F2"
              strokeOpacity={filled ? 0.09 : 0.045}
            />
            {filled ? (
              <rect
                x="78"
                y={y + 3}
                width="26"
                height="2.4"
                fill="#35D6C0"
                fillOpacity={u % 3 === 0 ? 0.5 : 0.25}
              />
            ) : null}
          </g>
        );
      })}
      <g fill="#6BEFDC">
        <circle className="u-lit" cx="238" cy="60" r="2.6" />
        <circle className="u-lit b2" cx="238" cy="145" r="2.6" />
        <circle className="u-lit b3" cx="238" cy="252" r="2.6" />
        <circle className="u-lit b4" cx="238" cy="337" r="2.6" />
      </g>
      <g stroke="#35D6C0" strokeOpacity="0.35" strokeWidth="1" strokeDasharray="6 10">
        <path className="airflow" d="M28 120 H58" />
        <path className="airflow" d="M28 200 H58" />
        <path className="airflow" d="M28 280 H58" />
        <path className="airflow" d="M28 360 H58" />
      </g>
      <g stroke="#E8934A" strokeOpacity="0.3" strokeWidth="1" strokeDasharray="6 10">
        <path className="airflow" d="M262 160 H292" />
        <path className="airflow" d="M262 300 H292" />
      </g>
      <text
        x="160"
        y="512"
        textAnchor="middle"
        fill="#7F9296"
        fontFamily="monospace"
        fontSize="11"
        letterSpacing="2"
      >
        42U · A17
      </text>
    </svg>
  );
}

/**
 * A capacity meter drawn as rack units rather than a bar, so "72% sold" and
 * "30 of 42 U" are the same picture. `hot` marks the units past the point where
 * a hall starts being scheduled for expansion.
 */
export function Meter({
  label,
  value,
  filled,
  total = 24,
  hotFrom,
}: {
  label: string;
  value: string;
  /** Units lit. */
  filled: number;
  total?: number;
  /** Index from which lit units are drawn in thermal orange. */
  hotFrom?: number;
}) {
  return (
    <div className="meter">
      <div className="meter-head">
        <span>{label}</span>
        <b>{value}</b>
      </div>
      <div className="meter-bar">
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            className={`meter-u${i < filled ? (hotFrom !== undefined && i >= hotFrom ? ' hot' : ' on') : ''}`}
          />
        ))}
      </div>
    </div>
  );
}

export function SiteFooter() {
  const { t } = useTranslation('c-rmh-datacenter');
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-top">
          <div className="footer-brand">
            <Link className="brand" to="/rmh-datacenter" aria-label="RMH Datacenter home">
              <BrandMark />
              <span className="brand-text">RMH&nbsp;Datacenter</span>
            </Link>
            <p>
              {t('footer-tagline', {
                defaultValue:
                  'The infrastructure arm of RMH Studios. Six campuses, one network, and the floor space, power and cooling that everything else in the group runs on.',
              })}
            </p>
          </div>
          <div className="footer-col">
            <h4>{t('footer-platform-heading', { defaultValue: 'Platform' })}</h4>
            <Link to="/rmh-datacenter/platform" hash="colocation">
              {t('footer-colocation', { defaultValue: 'Colocation' })}
            </Link>
            <Link to="/rmh-datacenter/platform" hash="bare-metal">
              {t('footer-bare-metal', { defaultValue: 'Bare metal' })}
            </Link>
            <Link to="/rmh-datacenter/platform" hash="accelerated">
              {t('footer-accelerated', { defaultValue: 'Accelerated compute' })}
            </Link>
            <Link to="/rmh-datacenter/platform" hash="storage">
              {t('footer-storage', { defaultValue: 'Storage' })}
            </Link>
            <Link to="/rmh-datacenter/platform" hash="resilience">
              {t('footer-resilience', { defaultValue: 'Resilience' })}
            </Link>
          </div>
          <div className="footer-col">
            <h4>{t('footer-facility-heading', { defaultValue: 'Facility' })}</h4>
            <Link to="/rmh-datacenter/facilities">
              {t('footer-campuses', { defaultValue: 'Campuses' })}
            </Link>
            <Link to="/rmh-datacenter/network">
              {t('footer-network', { defaultValue: 'Network' })}
            </Link>
            <Link to="/rmh-datacenter/power">
              {t('footer-power', { defaultValue: 'Power & cooling' })}
            </Link>
            <Link to="/rmh-datacenter/contact">
              {t('footer-contact', { defaultValue: 'Contact' })}
            </Link>
          </div>
          <div className="footer-col">
            <h4>{t('footer-engage-heading', { defaultValue: 'Engage' })}</h4>
            <Link to="/rmh-datacenter/contact" search={{ intent: 'Colocation' }}>
              {t('footer-reserve-space', { defaultValue: 'Reserve floor space' })}
            </Link>
            <Link to="/rmh-datacenter/contact" search={{ intent: 'Accelerated compute' }}>
              {t('footer-gpu-desk', { defaultValue: 'Accelerated compute desk' })}
            </Link>
            <Link to="/rmh-datacenter/contact" search={{ intent: 'Site tour' }}>
              {t('footer-book-tour', { defaultValue: 'Book a site tour' })}
            </Link>
          </div>
        </div>

        <div className="footer-bottom">
          <span className="copy">© 2026 RMH Datacenter LLC · An RMH Studios company</span>
          <div className="footer-legal">
            <Link to="/terms">{t('footer-terms', { defaultValue: 'Terms' })}</Link>
            <Link to="/privacy">{t('footer-privacy', { defaultValue: 'Privacy' })}</Link>
            <Link to="/cookies">{t('footer-cookies', { defaultValue: 'Cookies' })}</Link>
            <Link to="/security">{t('footer-security', { defaultValue: 'Security' })}</Link>
          </div>
        </div>

        <p className="disclaimer">
          {t('footer-disclaimer', {
            defaultValue:
              'This website is informational and is not an offer of service, a quotation, or a commitment of capacity. Site designations, power figures, efficiency ratios, certifications and latency measurements described here are illustrative and are confirmed per engagement in a signed service agreement. RMH Datacenter and the RMH hexagon mark are trademarks of RMH Datacenter LLC, an RMH Studios company.',
          })}
        </p>
      </div>
    </footer>
  );
}
