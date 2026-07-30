import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ArrowRight, Menu, Search } from 'lucide-react';

/**
 * /covid — "Feature Leak: The True Origins of X".
 *
 * Modelled on the single-page federal landing page at
 * whitehouse.gov/lab-leak-true-origins-of-covid-19: an RMH "Office of Platform
 * Integrity" finding that the product shipping as X escaped from RMH Studios
 * via nine departing engineers.
 *
 * The layout deliberately tracks the source page beat for beat — promo ticker,
 * sticky masthead that inverts on scroll, a giant serif wordmark split around a
 * central emblem, a blue-ruled box of numbered claims over a faint map, a
 * full-bleed map plate with blue label chips, and two-column evidence rows.
 *
 * MAINTAINERS: everything on this page is fiction, in the same in-universe
 * register as /rmh-capital and /rmh-pmc — the office, the case number, the
 * exhibits, the ledger dates and the nine departures were written for the bit.
 * It is played entirely straight by editorial choice: the parody notice, the
 * disclosure FAQ and the footer disclaimer were removed on request. Keep the
 * one hard rule that remains — no real person is ever named or depicted here
 * (docs/people.md §4).
 *
 * Design system: `components/covid/covid.css`, scoped under `.cvd-root`, in the
 * standalone-arm tradition of /rmh-pmc and /rmh-capital — its own palette and
 * fonts rather than the `--site-*` contract, because the borrowed look is the
 * joke.
 *
 * Motion is progressive enhancement: the markup renders fully visible on the
 * server, `data-animate` is only set on mount for visitors who have not asked
 * for reduced motion, and the ticker stops under reduced motion.
 */

/* ── The emblem that stands between the two words of the wordmark: a radial
   hub inside a hexagon, ringed like a state seal. ─────────────────────────── */
function Seal({ withText = false, sealId }: { withText?: boolean; sealId?: string }) {
  const topArc = `${sealId}-top`;
  const bottomArc = `${sealId}-bottom`;
  return (
    <svg className="seal" viewBox="0 0 200 200" aria-hidden="true">
      {withText && sealId ? (
        <defs>
          <path id={topArc} d="M 100,100 m -74,0 a 74,74 0 1,1 148,0" fill="none" />
          <path id={bottomArc} d="M 100,100 m -76,0 a 76,76 0 0,0 152,0" fill="none" />
        </defs>
      ) : null}

      <circle cx="100" cy="100" r="97" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle
        cx="100"
        cy="100"
        r="89"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeDasharray="2 7"
        opacity="0.65"
      />
      <circle
        cx="100"
        cy="100"
        r="60"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        opacity="0.5"
      />

      {withText && sealId ? (
        <g className="seal-arc">
          <text>
            <textPath href={`#${topArc}`} startOffset="50%" textAnchor="middle">
              Office of Platform Integrity
            </textPath>
          </text>
          <text>
            <textPath href={`#${bottomArc}`} startOffset="50%" textAnchor="middle">
              RMH Studios · Est. MMXXIII
            </textPath>
          </text>
        </g>
      ) : null}

      <polygon
        points="100,52 142,76 142,124 100,148 58,124 58,76"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
      />
      <g stroke="currentColor" strokeWidth="1.6" opacity="0.7">
        <line x1="100" y1="100" x2="100" y2="66" />
        <line x1="100" y1="100" x2="129" y2="83" />
        <line x1="100" y1="100" x2="129" y2="117" />
        <line x1="100" y1="100" x2="100" y2="134" />
        <line x1="100" y1="100" x2="71" y2="117" />
        <line x1="100" y1="100" x2="71" y2="83" />
      </g>
      <circle cx="100" cy="100" r="7" fill="currentColor" />
    </svg>
  );
}

/* ── Faint cartographic watermark behind the numbered claims. Abstract
   region outlines, not a real place. ─────────────────────────────────────── */
function FrameMap() {
  return (
    <svg viewBox="0 0 900 520" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="1.4">
        <path d="M120 60 C210 40 280 90 350 80 C430 68 470 30 560 52 C640 72 690 120 780 110" />
        <path d="M60 180 C150 200 200 150 300 165 C390 178 440 220 530 205 C620 190 700 150 840 175" />
        <path d="M90 300 C180 285 240 330 330 320 C420 310 470 265 560 285 C650 305 720 350 830 330" />
        <path d="M140 430 C230 415 290 455 380 445 C470 435 520 395 610 415 C700 435 760 470 860 450" />
        <path d="M210 40 C230 130 190 210 215 300 C240 390 200 460 220 510" />
        <path d="M470 30 C490 120 450 200 475 290 C500 380 460 450 480 510" />
        <path d="M700 45 C720 135 680 215 705 305 C730 395 690 465 710 515" />
      </g>
    </svg>
  );
}

/* ── The map plate. City blocks + a river, drawn deterministically so the
   server and client markup match exactly; labels are HTML chips on top so
   they stay legible at any width. ─────────────────────────────────────────── */
const BLOCKS: { x: number; y: number; w: number; h: number; o: number }[] = (() => {
  const out: { x: number; y: number; w: number; h: number; o: number }[] = [];
  // Fixed-seed LCG rather than Math.random: the SVG is generated at module
  // scope and rendered on the server, so it has to come out identical on the
  // client or hydration mismatches.
  let seed = 20260417;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  // A coarse grid with gaps, jitter and varied footprints reads as a city;
  // a uniform grid reads as a checkerboard. Extends past the viewBox because
  // the whole group is rotated off-axis.
  for (let col = -2; col < 20; col++) {
    for (let row = -2; row < 12; row++) {
      if (rnd() < 0.2) continue; // vacant lot
      const wide = rnd() < 0.18;
      const w = wide ? 110 + rnd() * 80 : 34 + rnd() * 62;
      const h = 24 + rnd() * 66;
      out.push({
        x: col * 96 + rnd() * 22,
        y: row * 78 + rnd() * 20,
        w,
        h,
        o: 0.04 + rnd() * 0.2,
      });
    }
  }
  return out;
})();

function MapPlate() {
  return (
    <svg
      className="plate-art"
      viewBox="0 0 1600 720"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="cvd-plate-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#16203c" />
          <stop offset="55%" stopColor="#0d1530" />
          <stop offset="100%" stopColor="#0a1024" />
        </linearGradient>
      </defs>
      <rect width="1600" height="720" fill="#101a34" />
      <rect width="1600" height="720" fill="url(#cvd-plate-bg)" opacity="0.7" />

      {/* the water */}
      <path
        d="M980 -40 C900 140 860 300 900 460 C930 590 1010 660 1060 760 L1600 760 L1600 -40 Z"
        fill="#16324f"
        opacity="0.85"
      />
      <path
        d="M980 -40 C900 140 860 300 900 460 C930 590 1010 660 1060 760"
        fill="none"
        stroke="#8fc4e8"
        strokeWidth="2"
        opacity="0.35"
      />

      {/* blocks — rotated a few degrees so the street grid isn't axis-aligned */}
      <g fill="#cddcf0" transform="rotate(-7 800 360)">
        {BLOCKS.map((b, i) => (
          <rect key={i} x={b.x} y={b.y} width={b.w} height={b.h} opacity={b.o} />
        ))}
      </g>

      {/* the connector between the two sites */}
      <line x1="416" y1="173" x2="1120" y2="533" stroke="#1560e8" strokeWidth="9" />
      <circle cx="416" cy="173" r="15" fill="#ffffff" stroke="#1560e8" strokeWidth="6" />
      <circle cx="1120" cy="533" r="15" fill="#ffffff" stroke="#1560e8" strokeWidth="6" />
    </svg>
  );
}

/* ── Content ───────────────────────────────────────────────────────────────── */

const FIGURES: { figure: string; label: string }[] = [
  { figure: '01', label: 'index case — one departing engineer, one Thursday afternoon' },
  { figure: '17', label: 'RMH features that surfaced on a rival platform within nine months' },
  { figure: '09', label: 'staff who left for a company that had never heard of us' },
  { figure: '00', label: 'citations, credits, or thank-you notes received to date' },
];

/* The five numbered claims, in the clipped register of the page being
   parodied: one assertion each, emphasis in italics. */
const CASE: ReactNode[] = [
  <>
    The product possesses a design characteristic that is <em>not found in nature</em> — a
    three-degree card rake that no team has ever arrived at on its own.
  </>,
  <>
    Data shows that all seventeen affected features stem from{' '}
    <em>a single introduction into their codebase</em>. This runs contrary to previous copycat
    episodes, where there were multiple spillover events.
  </>,
  <>
    <em>San Francisco is home to the industry’s foremost engagement laboratory</em>, which has a
    history of conducting gain-of-function retention research at inadequate design-safety levels.
  </>,
  <>
    Engineers at that laboratory were <em>shipping RMH-like symptoms in the autumn of last year</em>
    , months before any of it was announced.
  </>,
  <>
    By nearly all measures of design, if there were evidence of independent origin{' '}
    <em>it would have already surfaced</em>. But it hasn’t.
  </>,
];

interface Beat {
  day: string;
  title: string;
  body: string;
}

const CHRONOLOGY: Beat[] = [
  {
    day: 'Day 0',
    title: 'Index case',
    body: 'A senior front-end engineer on the radial shell team accepts an offer from a company that, at the time, did not have a design system. We wished them well. We still do. We simply also kept a calendar.',
  },
  {
    day: 'Day 1 – 89',
    title: 'Incubation',
    body: 'No outward symptoms. Two commits to a private repository named north-star-v2, a name chosen by somebody who has never had to explain a name to a court.',
  },
  {
    day: 'Day 90',
    title: 'First symptoms',
    body: 'A rounded corner appears where a square corner had been for eleven years. Nobody on their design team claims it. Nobody on ours is surprised.',
  },
  {
    day: 'Day 140',
    title: 'Community spread',
    body: 'Four more engineers depart inside six weeks, three of them to the same floor of the same building. Recruiters call this “the market”. We call it the market, on our floor, holding our floor plan.',
  },
  {
    day: 'Day 210',
    title: 'Sustained transmission',
    body: 'The radial hub ships under a different name with a different easing curve and the same defect: a one-frame flash on first open that only occurs if you copied the animation instead of writing it.',
  },
  {
    day: 'Day 400',
    title: 'Endemic',
    body: 'Their onboarding now teaches our gestures to people who have never heard of us. That is the clinical definition of endemic. It is also the commercial definition of losing.',
  },
];

interface Row {
  feature: string;
  ours: string;
  theirs: string;
  gap: string;
  flag?: boolean;
}

const LEDGER: Row[] = [
  { feature: 'Radial navigation hub', ours: 'Mar 2024', theirs: 'Nov 2024', gap: '8 months' },
  { feature: 'Card-wheel timeline', ours: 'Jun 2024', theirs: 'Feb 2025', gap: '8 months' },
  { feature: 'Coin economy with tipping', ours: 'Sep 2023', theirs: 'Aug 2025', gap: '23 months' },
  { feature: 'Long-form composer', ours: 'Jan 2024', theirs: 'Jun 2024', gap: '5 months' },
  { feature: 'Passkey-first sign-in', ours: 'Feb 2025', theirs: 'Oct 2025', gap: '8 months' },
  { feature: 'Per-community theming', ours: 'Nov 2024', theirs: 'Jul 2025', gap: '8 months' },
  {
    feature: 'Off-by-one in the character counter',
    ours: 'Apr 2024',
    theirs: 'Apr 2025',
    gap: 'identical',
    flag: true,
  },
];

/** Named `Evidence` rather than `Record` so it doesn't shadow the built-in. */
interface Evidence {
  term: string;
  body: ReactNode[];
}

const RECORD: Evidence[] = [
  {
    term: 'Exit interviews',
    body: [
      <>
        Nine of them, each one cordial, each one ending with “I’m not allowed to say where.”
        Transcripts retained; names withheld, because the people are not the story and never were.
      </>,
    ],
  },
  {
    term: 'The farewell cake',
    body: [
      <>
        Photographed for morale purposes on the Thursday in question. The photograph is timestamped,
        and it is the only exhibit in this file we are genuinely proud of.
      </>,
    ],
  },
  {
    term: 'Stylesheet diff',
    body: [
      <>
        Ours and theirs, compared line by line. <b>Forty-one per cent</b> of their custom-property
        names match ours — including the one we spelled wrong and never fixed, because fixing it
        would have broken four pages.
      </>,
    ],
  },
  {
    term: 'Deleted screenshots',
    body: [
      <>
        Four build screenshots, posted publicly in the autumn, showing our empty-state copy still in
        frame: <em>“Nothing here yet. That is not a bug, it is an invitation.”</em>
      </>,
      <>
        All four have since been removed. We note this without further comment, in the way people
        say “without further comment” when they intend the comment to be obvious.
      </>,
    ],
  },
  {
    term: 'The off-by-one',
    body: [
      <>
        Both character counters permit one grapheme more than they advertise, and both fail on the
        same emoji. A defect is not a good idea that two teams can independently have. It is a
        fingerprint.
      </>,
    ],
  },
  {
    term: 'No litigation',
    body: [
      <>
        We are a personal web platform with a coin economy and eighteen browser games. Litigation is
        not on the roadmap. A page was on the roadmap. This is the page.
      </>,
    ],
  },
];

const ELSEWHERE: Evidence[] = [
  {
    term: 'Checkmark mandates',
    body: [
      <>
        Verification was quietly reassigned from “who you are” to “whose card is on file”, and the
        public was told this was democratisation. Ours stays free, unpurchasable, and boring — which
        is the entire job description of verification.
      </>,
    ],
  },
  {
    term: 'Rate limits',
    body: [
      <>
        Users were instructed to stand six hundred posts apart for their own protection. The measure
        appeared overnight, had no author, and was withdrawn without explanation — the three
        reliable properties of a policy nobody modelled.
      </>,
    ],
  },
  {
    term: 'The API lockdown',
    body: [
      <>
        An ecosystem of clients, researchers, and hobby projects was shut in overnight at a price
        set to make a point. We shipped a scoped developer API instead: keys anyone can request,
        quotas printed on the page, no negotiation.
      </>,
    ],
  },
  {
    term: 'Algorithmic suppression',
    body: [
      <>
        Reach was throttled for posts pointing anywhere else, and the throttle was denied while it
        was running. Our feed ranks a link away from us exactly as it ranks a link toward us. That
        is not generosity. It is the floor.
      </>,
    ],
  },
  {
    term: 'The rebrand',
    body: [
      <>
        A bird with fifteen years of public recognition was retired in favour of a single letter
        that was already somebody else’s trademark, twice. Our name is four syllables and still says
        what the thing is.
      </>,
    ],
  },
  {
    term: 'Suppression of dissent',
    body: [
      <>
        The accounts cataloguing all of this were quote-posted into the ground by the account with
        the most followers on the platform. This page has no followers. It will simply continue to
        be here.
      </>,
    ],
  },
];

const NAV: { href: string; label: string }[] = [
  { href: '#origin', label: 'The Origin' },
  { href: '#chronology', label: 'Chronology' },
  { href: '#ledger', label: 'The Ledger' },
  { href: '#coverup', label: 'The Cover-Up' },
  { href: '#record', label: 'The Record' },
  { href: '#finding', label: 'Findings' },
];

const FOOT_LINKS: { href: string; label: string }[] = [
  { href: '/', label: 'RMH Studios' },
  { href: '/design', label: 'Design language' },
  { href: '/security', label: 'Security' },
  { href: '/terms', label: 'Terms' },
  { href: '/privacy', label: 'Privacy' },
];

const TICKER = [
  'Read the full finding',
  'Case RMH-OPI-2026-0417',
  'Filed by the Office of Platform Integrity',
  'A direct line to the record →',
];

const SHARE_URL = 'https://rmhstudios.com/covid';
const SHARE_TEXT =
  'Feature Leak: The True Origins of X — a finding from the RMH Office of Platform Integrity';

const SHARE: { label: string; href: string; path: string }[] = [
  {
    label: 'Share on Facebook',
    href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(SHARE_URL)}`,
    path: 'M13.5 21v-7.2h2.6l.4-3h-3V8.9c0-.9.3-1.5 1.5-1.5h1.6V4.7c-.3 0-1.2-.1-2.3-.1-2.3 0-3.9 1.4-3.9 4v2.2H7.9v3h2.5V21z',
  },
  {
    label: 'Share on X',
    href: `https://twitter.com/intent/tweet?url=${encodeURIComponent(SHARE_URL)}&text=${encodeURIComponent(SHARE_TEXT)}`,
    path: 'M18.9 2H22l-7.5 8.6L23 22h-6.8l-5-6.6L5.3 22H2l8-9.2L1.5 2h7l4.5 6zM17 20h1.7L7.1 3.8H5.3z',
  },
  {
    label: 'Share on LinkedIn',
    href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(SHARE_URL)}`,
    path: 'M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM3 9h4v12H3zM9 9h3.8v1.7h.05c.53-1 1.83-2.05 3.77-2.05 4.03 0 4.78 2.65 4.78 6.1V21H17.4v-5.3c0-1.27-.02-2.9-1.77-2.9s-2.04 1.38-2.04 2.8V21H9z',
  },
  {
    label: 'Share by email',
    href: `mailto:?subject=${encodeURIComponent('Feature Leak: The True Origins of X')}&body=${encodeURIComponent(`${SHARE_TEXT}\n\n${SHARE_URL}`)}`,
    path: 'M3 5h18a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zm9 8L4.2 7.2v.1L12 13l7.8-5.7v-.1z',
  },
];

export function CovidPage() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    // The masthead inverts to white once the hero has scrolled under it.
    const mast = root.querySelector('.mast');
    const onScroll = () => mast?.classList.toggle('scrolled', window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });

    let observer: IntersectionObserver | null = null;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (!reduced && typeof IntersectionObserver !== 'undefined') {
      root.setAttribute('data-animate', '');
      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              entry.target.classList.add('in');
              observer?.unobserve(entry.target);
            }
          }
        },
        { threshold: 0.08, rootMargin: '0px 0px -8% 0px' },
      );
      const vh = window.innerHeight || 0;
      for (const el of root.querySelectorAll<HTMLElement>('.reveal')) {
        // Anything already above the fold shows immediately rather than fading
        // in under the visitor's cursor.
        if (el.getBoundingClientRect().top < vh * 0.92) el.classList.add('in');
        else observer.observe(el);
      }
    }

    return () => {
      window.removeEventListener('scroll', onScroll);
      observer?.disconnect();
    };
  }, []);

  const delay = (ms: number) => ({ '--cvd-delay': `${ms}ms` }) as CSSProperties;

  return (
    <div className="cvd-root" ref={rootRef}>
      <a className="skip" href="#cvd-main">
        Skip to content
      </a>

      {/* ─── Promo ticker ─────────────────────────────────────────────── */}
      <div className="ticker">
        <div className="ticker-track" aria-hidden="true">
          {[0, 1].map((run) => (
            <div className="ticker-run" key={run}>
              {TICKER.map((t) => (
                <span key={t}>{t}</span>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* ─── Masthead ─────────────────────────────────────────────────── */}
      <header className="mast">
        <div className="mast-row">
          {/* aria-label, not the visible span alone: the span is hidden below
              560px, which would leave an icon-only control unnamed. */}
          <button
            type="button"
            className="mast-menu"
            aria-label="Menu"
            aria-expanded={menuOpen}
            aria-controls="cvd-nav"
            onClick={() => setMenuOpen((v) => !v)}
          >
            <Menu aria-hidden="true" />
            <span>Menu</span>
          </button>

          <a className="mast-brand" href="/" aria-label="RMH Studios home">
            <Seal />
            <b>RMH Studios</b>
            <span>Office of Platform Integrity</span>
          </a>

          <a className="mast-search" href="/search" aria-label="Search RMH Studios">
            <span>Search</span>
            <Search aria-hidden="true" />
          </a>
        </div>

        <nav
          className="mast-nav"
          id="cvd-nav"
          data-open={menuOpen ? '' : undefined}
          aria-label="Sections of this finding"
        >
          <div className="mast-nav-inner">
            {NAV.map((n) => (
              <a key={n.href} href={n.href} onClick={() => setMenuOpen(false)}>
                {n.label}
              </a>
            ))}
          </div>
        </nav>
      </header>

      {/* ─── Fixed share rail ─────────────────────────────────────────── */}
      <div className="share">
        {SHARE.map((s) => (
          <a
            key={s.label}
            href={s.href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={s.label}
          >
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d={s.path} />
            </svg>
          </a>
        ))}
      </div>

      <main id="cvd-main">
        {/* ─── Hero ───────────────────────────────────────────────────── */}
        <section className="hero" aria-labelledby="cvd-title">
          <div className="hero-inner">
            <h1 className="hero-title" id="cvd-title">
              <span className="hero-word">Feature</span>
              <span className="hero-mark" aria-hidden="true">
                <Seal withText sealId="cvd-hero-seal" />
              </span>
              <span className="hero-word">Leak</span>
            </h1>
            <p className="hero-tagline">
              <b>The true origins of</b>
              <span className="hero-script">X</span>
            </p>
          </div>
        </section>

        {/* ─── Figures ────────────────────────────────────────────────── */}
        <section className="figures" aria-label="Key figures">
          {FIGURES.map((f, i) => (
            <div className="figure reveal" key={f.figure} style={delay(i * 70)}>
              <b>{f.figure}</b>
              <span>{f.label}</span>
            </div>
          ))}
        </section>

        {/* ─── The Origin ─────────────────────────────────────────────── */}
        <section id="origin" className="sec" aria-labelledby="cvd-origin">
          <div className="wrap">
            <h2 className="sec-title reveal" id="cvd-origin">
              The Origin
            </h2>
            <p className="sec-intro reveal">
              The “Convergent Evolution” design review — cited repeatedly by their communications
              team and the trade press to discredit the leak theory — was commissioned by the
              platform under review to push the preferred narrative that the resemblance{' '}
              <em>arose naturally</em>.
            </p>

            <div className="frame reveal">
              <div className="frame-map" aria-hidden="true">
                <FrameMap />
              </div>
              <ol className="case">
                {CASE.map((claim, i) => (
                  <li key={i}>
                    <p>{claim}</p>
                  </li>
                ))}
              </ol>
            </div>
          </div>

          {/* ─── Map plate — full-bleed, as on the source page ───────────── */}
          <figure className="plate-figure reveal">
            <div className="plate">
              <MapPlate />
              <span className="plate-brand" aria-hidden="true">
                RMH Earth
              </span>
              <span className="chip" style={{ left: '26%', top: '24%' }}>
                RMH Studios — 4th floor
              </span>
              <span className="chip" style={{ left: '70%', top: '74%' }}>
                The other platform — 11th floor
              </span>
              <span className="chip" style={{ left: '46%', top: '52%' }}>
                0.4 miles
              </span>
            </div>
            <figcaption className="plate-caption">
              Exhibit F — proximity of the two offices. The Office notes that this is walking
              distance, and that people walk.
            </figcaption>
          </figure>
        </section>

        {/* ─── Chronology ─────────────────────────────────────────────── */}
        <section id="chronology" className="sec sec--hair" aria-labelledby="cvd-chronology">
          <div className="wrap">
            <h2 className="sec-title reveal" id="cvd-chronology">
              The Chronology
            </h2>
            <p className="sec-intro reveal">
              This is not a complaint about a person. People are allowed to leave, and the ones who
              left were excellent — which is precisely why the transfer took so well. It is a
              complaint about <b>a timeline</b>.
            </p>
            <ol className="chron">
              {CHRONOLOGY.map((b) => (
                <li className="reveal" key={b.day}>
                  <span className="chron-day">{b.day}</span>
                  <div>
                    <h3>{b.title}</h3>
                    <p>{b.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ─── The ledger ─────────────────────────────────────────────── */}
        <section id="ledger" className="sec sec--hair" aria-labelledby="cvd-ledger">
          <div className="wrap">
            <h2 className="sec-title reveal" id="cvd-ledger">
              The Ledger
            </h2>
            <p className="sec-intro reveal">
              Ship dates, both platforms, in the order the Office received them. The full ledger
              runs to seventeen rows and is available to anyone who asks.
            </p>
            <div
              className="ledger-wrap reveal"
              role="region"
              aria-label="Feature ledger"
              tabIndex={0}
            >
              <table className="ledger">
                <caption>
                  The Office draws no conclusion from rows one through six. It draws its entire
                  conclusion from row seven.
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Feature</th>
                    <th scope="col">RMH Studios</th>
                    <th scope="col">The other platform</th>
                    <th scope="col">Interval</th>
                  </tr>
                </thead>
                <tbody>
                  {LEDGER.map((r) => (
                    <tr key={r.feature} data-flag={r.flag ? '' : undefined}>
                      <th scope="row">{r.feature}</th>
                      <td>{r.ours}</td>
                      <td>{r.theirs}</td>
                      <td className="gap">{r.gap}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* ─── The cover-up ───────────────────────────────────────────── */}
        <section id="coverup" className="sec sec--hair" aria-labelledby="cvd-coverup">
          <div className="wrap">
            <h2 className="sec-title reveal" id="cvd-coverup">
              The Cover-Up
            </h2>
            <figure className="pull reveal">
              <blockquote>
                “The resemblance is best understood as convergent evolution: two teams solving the
                same problem, arriving independently at the same shape.”
              </blockquote>
              <figcaption>
                — An independent design review, commissioned by the platform under review, published
                in a journal the platform advertises in, written by three authors whose
                acknowledgements thank the platform.
              </figcaption>
            </figure>
            <p className="rebuttal reveal">
              <b>Convergent evolution does not copy the comment.</b> Line 41 of their stylesheet, as
              shipped, reads <code>/* TODO: ask design why 3deg */</code>. We know why. We wrote the
              question, we wrote the TODO, and we never answered it either — but at least when we
              ask design, design is down the hall.
            </p>
          </div>
        </section>

        {/* ─── The record ─────────────────────────────────────────────── */}
        <section id="record" className="sec sec--hair" aria-labelledby="cvd-record">
          <div className="wrap">
            <h2 className="sec-title reveal" id="cvd-record">
              The Record
            </h2>
            <div className="rows">
              {RECORD.map((r) => (
                <div className="row reveal" key={r.term}>
                  <p className="row-term">{r.term}:</p>
                  <div>
                    {r.body.map((p, i) => (
                      <p className="row-body" key={i}>
                        {p}
                      </p>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── Everything else ────────────────────────────────────────── */}
        <section className="sec sec--hair" aria-labelledby="cvd-else">
          <div className="wrap">
            <h2 className="sec-title reveal" id="cvd-else">
              And Everything Else
            </h2>
            <p className="sec-intro reveal">
              The Office’s remit is the leak. But a finding of this kind is traditionally an
              opportunity, and we are told it would be strange not to take it.
            </p>
            <div className="rows">
              {ELSEWHERE.map((r) => (
                <div className="row reveal" key={r.term}>
                  <p className="row-term">{r.term}:</p>
                  <div>
                    {r.body.map((p, i) => (
                      <p className="row-body" key={i}>
                        {p}
                      </p>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── The finding ────────────────────────────────────────────── */}
        <section id="finding" className="finding" aria-labelledby="cvd-conclusion">
          <div className="wrap">
            <div className="reveal">
              <Seal withText sealId="cvd-finding-seal" />
              <h2 id="cvd-conclusion">A lab-adjacent incident remains the most likely origin</h2>
              <p>
                On the balance of the evidence, the Office concludes that the departure of nine
                people who knew where everything was is the most probable origin of the product now
                shipping as X. <b>A natural origin cannot be excluded.</b> It has simply never been
                observed.
              </p>
              <p>
                The Office recommends no action. The features are out, the gestures are taught, and
                the only remedy available to a platform in our position is to keep shipping things
                worth taking.
              </p>
              <div className="btn-row">
                <a className="btn btn--red" href="/">
                  See what they copied
                  <ArrowRight aria-hidden="true" />
                </a>
                <a className="btn btn--line" href="/design">
                  Read the design language
                </a>
              </div>
              <div className="docmeta">
                <div>
                  Issued <b>30 July 2026</b>
                </div>
                <div>
                  Case no. <b>RMH-OPI-2026-0417</b>
                </div>
                <div>
                  Classification <b>Unrestricted</b>
                </div>
                <div>
                  Peer review <b>None sought</b>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="foot" role="contentinfo">
        <div className="wrap">
          <div className="foot-top">
            <div className="foot-brand">
              <Seal />
              <div>
                <b>Office of Platform Integrity</b>
                <span>
                  Design provenance and prior-art review for RMH Studios. One page, no staff, and no
                  powers.
                </span>
              </div>
            </div>
            <nav className="foot-links" aria-label="More from RMH Studios">
              {FOOT_LINKS.map((l) => (
                <a key={l.href} href={l.href}>
                  {l.label}
                </a>
              ))}
            </nav>
          </div>

          <p className="foot-copy">
            © {new Date().getFullYear()} RMH Studios · Office of Platform Integrity
          </p>
        </div>
      </footer>

      <a className="pill" href="/">
        Join the feed
        <ArrowRight aria-hidden="true" />
      </a>
    </div>
  );
}

export default CovidPage;
