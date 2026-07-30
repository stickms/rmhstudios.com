import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import {
  ArrowRight,
  BadgeCheck,
  Bird,
  ChevronLeft,
  EyeOff,
  FileText,
  FlaskConical,
  Gauge,
  Landmark,
  Lock,
  Megaphone,
  type LucideIcon,
} from 'lucide-react';

/**
 * /covid — "Feature Leak: The True Origins of X".
 *
 * A parody of the confident official information page: an in-universe RMH
 * "Office of Platform Integrity" finding that the product now shipping as X
 * escaped from RMH Studios via nine departing staff. It is satire, and the
 * page says so in three places (the top strip, the FAQ, the footer
 * disclaimer) — no allegation here is a statement of fact, and no real person
 * is named, per docs/people.md §4.
 *
 * Design system: `components/covid/covid.css`, scoped under `.cvd-root`, in the
 * same standalone-arm tradition as `/rmh-pmc` and `/rmh-capital` — its own
 * palette and fonts rather than the `--site-*` contract, because the joke is
 * the borrowed federal-document look.
 *
 * Motion is progressive enhancement: the markup renders fully visible on the
 * server, and `data-animate` is only set on mount for visitors who have not
 * asked for reduced motion.
 */

/* ── The seal. A radial hub inside a hexagon, ringed like a state seal —
   RMH lineage (the hex mark) plus enough engraving to read as officialdom. ── */
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

      {/* hexagon + radial hub */}
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

/* ── The numbers block under the hero ─────────────────────────────────────── */
const FACTS: { figure: string; label: string }[] = [
  { figure: '01', label: 'index case — a single departing engineer, one Thursday afternoon' },
  { figure: '17', label: 'RMH features that surfaced on a rival platform within nine months' },
  { figure: '09', label: 'staff who left for a company that had never heard of us' },
  { figure: '00', label: 'citations, credits, or thank-you notes received to date' },
];

/* ── "The Science": the five findings ─────────────────────────────────────── */
interface Finding {
  title: string;
  body: string[];
  cite: string;
}

const FINDINGS: Finding[] = [
  {
    title: 'The product possesses a design characteristic not found in nature.',
    body: [
      'Their timeline rakes its cards onto a shallow cylinder at three degrees and stops the hairline exactly one pixel short of the card edge. No design language arrives at three degrees on its own. Three degrees is a decision a tired person makes at 2 a.m. on a staging server, defends in review the next morning, and never writes down.',
      'We know this because we are the tired person. The rake is ours, the hairline is ours, and both crossed the street intact.',
    ],
    cite: 'Exhibit A — stylesheet diff, 41% custom-property overlap',
  },
  {
    title: 'Every affected feature traces to a single introduction event.',
    body: [
      'Independent invention leaves a scatter: teams arrive at similar ideas over years, from different directions, with different mistakes. Ours leaves a point. All seventeen features cluster into one autumn — specifically, into the nine months following a farewell cake in the fourth-floor kitchen.',
      'Previous copycat episodes in this industry show multiple spillovers across multiple quarters. This one has a date, and the date has a photograph, and the photograph has a cake in it.',
    ],
    cite: 'Exhibit B — ship-date ledger, both platforms',
  },
  {
    title: 'Their headquarters is the industry’s foremost engagement laboratory.',
    body: [
      'It is a facility with a documented history of gain-of-function retention research conducted at inadequate design-safety levels: features are made deliberately more compulsive for study purposes and then released directly into production, because that building has answered every question that way for fifteen years.',
      'We are not alleging malice. We are observing that if you keep a copy of somebody else’s design language in a building like that, it will eventually get out.',
    ],
    cite: 'Exhibit C — public engineering blog, since edited',
  },
  {
    title: 'Their engineers were shipping RMH-like symptoms months before launch.',
    body: [
      'Three of them were observed in the autumn posting build screenshots with our empty-state copy still in frame — “Nothing here yet. That is not a bug, it is an invitation.” — months before any of it was announced.',
      'The screenshots have since been deleted. We note this without further comment, in the way that people say “without further comment” when they intend the comment to be obvious.',
    ],
    cite: 'Exhibit D — four archived posts, timestamps intact',
  },
  {
    title: 'If there were evidence of independent origin, it would have surfaced by now.',
    body: [
      'A design that genuinely evolves in the open leaves a trail behind it: abandoned drafts, a directory of dead ends, a bad first version everyone is embarrassed by. Eighteen months of looking has produced none of that.',
      'There is no bad first version of their timeline. That is the finding. Ours was the bad first version.',
    ],
    cite: 'Exhibit E — the absence of a trail, reviewed exhaustively',
  },
];

/* ── Chronology of the outbreak ───────────────────────────────────────────── */
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

/* ── The ledger ───────────────────────────────────────────────────────────── */
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

/* ── Everything else they got wrong ──────────────────────────────────────── */
interface Card {
  icon: LucideIcon;
  title: string;
  body: string;
  tag: string;
}

const FAILURES: Card[] = [
  {
    icon: BadgeCheck,
    title: 'Checkmark mandates',
    body: 'Verification was quietly reassigned from “who you are” to “whose card is on file”, and the public was told this was democratisation. Ours stays free, unpurchasable, and boring, which is the entire job description of verification.',
    tag: 'Identity',
  },
  {
    icon: Gauge,
    title: 'Rate limits',
    body: 'Users were instructed to stand six hundred posts apart for their own protection. The measure appeared overnight, had no author, and was withdrawn without explanation — the three reliable properties of a policy nobody modelled.',
    tag: 'Distancing',
  },
  {
    icon: Lock,
    title: 'The API lockdown',
    body: 'An ecosystem of clients, researchers, and hobby projects was shut in overnight at a price set to make a point. We shipped a scoped developer API instead: keys anyone can request, quotas printed on the page, no negotiation.',
    tag: 'Closure',
  },
  {
    icon: EyeOff,
    title: 'Algorithmic suppression',
    body: 'Reach was throttled for posts pointing anywhere else, and the throttle was denied while it was running. Our feed ranks a link away from us exactly as it ranks a link toward us. That is not generosity. It is the floor.',
    tag: 'Reach',
  },
  {
    icon: Bird,
    title: 'The rebrand',
    body: 'A bird with fifteen years of public recognition was retired in favour of a single letter that was already somebody else’s trademark, twice. Our name is four syllables and still says what the thing is.',
    tag: 'Branding',
  },
  {
    icon: Megaphone,
    title: 'Suppression of dissent',
    body: 'The accounts cataloguing all of this were quote-posted into the ground by the account with the most followers on the platform. This page has no followers. It will simply continue to be here.',
    tag: 'Dissent',
  },
];

/* ── The record ───────────────────────────────────────────────────────────── */
const RECORD: { term: string; desc: string }[] = [
  {
    term: 'Nine exit interviews',
    desc: 'Each one cordial. Each one ending with “I’m not allowed to say where.” Transcripts retained; names withheld, because the people are not the story and never were.',
  },
  {
    term: 'One farewell cake',
    desc: 'Photographed for morale purposes on the Thursday in question. The photograph is timestamped, and it is the only exhibit in this file we are genuinely proud of.',
  },
  {
    term: 'Seventeen features',
    desc: 'Documented with ship dates on both sides, cross-referenced against changelogs. Available on request to anybody who asks, which so far is nobody.',
  },
  {
    term: 'Two stylesheets',
    desc: 'Ours and theirs, diffed line by line. Forty-one per cent of their custom-property names match ours, including the one we spelled wrong and never fixed because fixing it would have broken four pages.',
  },
  {
    term: 'Zero lawsuits',
    desc: 'We are a personal web platform with a coin economy and eighteen browser games. Litigation is not on the roadmap. A page was on the roadmap. This is the page.',
  },
];

const FAQ: { q: string; a: ReactNode }[] = [
  {
    q: 'Is any of this real?',
    a: (
      <>
        No. This page is satire — a parody of a particular genre of official web page, set in the
        same fiction as <a href="/rmh-capital">RMH Capital</a> and <a href="/rmh-pmc">RMH PMC</a>.
        There is no Office of Platform Integrity, there was no investigation, no cake was
        photographed, nobody left, and X Corp. has taken nothing from RMH Studios. Every date,
        exhibit, and finding above is invented.
      </>
    ),
  },
  {
    q: 'Then why put it at /covid?',
    a: (
      <>
        Because the page being imitated is, and because “outbreak” turned out to be the right shape
        for a story about a design language spreading: an index case, an incubation period,
        community spread, endemicity. We considered /origins. This was funnier.
      </>
    ),
  },
  {
    q: 'Is this a shot at X specifically?',
    a: (
      <>
        It is a shot at the format — the confident official page that arranges circumstantial detail
        into a conclusion it had picked before it started, and prints it under a seal. X is the
        pretext, chosen because its product is the one closest to ours. Their engineers have our
        sympathy; they work in the building described in finding three.
      </>
    ),
  },
  {
    q: 'Can I steal this design?',
    a: (
      <>
        Yes. That is the joke, and you have our written permission, which is more than we got. The
        stylesheet is <code>components/covid/covid.css</code>.
      </>
    ),
  },
];

const FOOT_LINKS: { href: string; label: string }[] = [
  { href: '/', label: 'RMH Studios' },
  { href: '/design', label: 'Design language' },
  { href: '/security', label: 'Security' },
  { href: '/terms', label: 'Terms' },
  { href: '/privacy', label: 'Privacy' },
];

export function CovidPage() {
  const rootRef = useRef<HTMLDivElement>(null);

  // Scroll-reveal + the sticky bar's scrolled state. Both are enhancements:
  // without JS (or with reduced motion) the page is complete and static.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const bar = root.querySelector('.bar');
    const onScroll = () => bar?.classList.toggle('scrolled', window.scrollY > 12);
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
        // Anything already above the fold is shown immediately rather than
        // fading in under the visitor's cursor.
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

      {/* ─── The banner every government page has, told the other way ─── */}
      <div className="strip">
        <div className="strip-inner">
          <Landmark aria-hidden="true" />
          <b>An unofficial page of a fictional office.</b>
          <span>RMH Studios satire — no investigation exists, and none is planned.</span>
        </div>
      </div>

      <header className="bar">
        <div className="bar-inner">
          <a className="back" href="/">
            <ChevronLeft size={15} strokeWidth={2.2} aria-hidden="true" />
            <span className="back-label">RMH Studios</span>
          </a>
          <div className="bar-brand">
            <Seal />
            <span className="bar-brand-text">
              <b>Feature Leak</b>
              <span>Office of Platform Integrity</span>
            </span>
          </div>
          <nav className="bar-nav" aria-label="Sections of this finding">
            <a href="#science">The science</a>
            <a href="#chronology">Chronology</a>
            <a href="#ledger">The ledger</a>
            <a href="#coverup">The cover-up</a>
            <a href="#finding">Findings</a>
          </nav>
          <a className="btn btn--gold btn--sm bar-cta" href="#finding">
            Read the finding
            <ArrowRight aria-hidden="true" />
          </a>
        </div>
      </header>

      <main id="cvd-main">
        {/* ─── Hero ─────────────────────────────────────────────────────── */}
        <section className="hero" aria-labelledby="cvd-title">
          <div className="hero-watermark" aria-hidden="true">
            <Seal />
          </div>
          <div className="hero-inner">
            <div className="hero-head">
              <Seal withText sealId="cvd-hero-seal" />
              <p className="hero-office">
                RMH Studios
                <span>Office of Platform Integrity</span>
              </p>
              <span className="stamp">Parody · Uncontrolled copy</span>
            </div>

            <h1 id="cvd-title" className="display">
              <span className="hero-lead">
                Feature <em>Leak</em>
              </span>
              <span className="hero-sub">The true origins of X</span>
            </h1>

            <p className="hero-lede">
              After eighteen months of review, the Office of Platform Integrity has concluded that
              the product now shipping as X did not evolve independently.{' '}
              <b>It escaped from us — via nine people who knew where everything was.</b>
            </p>

            <div className="hero-actions">
              <a className="btn btn--gold" href="#science">
                <FlaskConical aria-hidden="true" />
                The science
              </a>
              <a className="btn btn--line" href="#coverup">
                <FileText aria-hidden="true" />
                The cover-up
              </a>
            </div>

            <dl className="docmeta">
              <div>
                <dt>Issued</dt>
                <dd>30 July 2026</dd>
              </div>
              <div>
                <dt>Case no.</dt>
                <dd>RMH-OPI-2026-0417</dd>
              </div>
              <div>
                <dt>Classification</dt>
                <dd>Parody — unclassified</dd>
              </div>
              <div>
                <dt>Peer review</dt>
                <dd>None sought</dd>
              </div>
            </dl>
          </div>
        </section>

        {/* ─── The numbers ──────────────────────────────────────────────── */}
        <section className="facts" aria-label="Key figures">
          {FACTS.map((f, i) => (
            <div className="fact reveal" key={f.figure} style={delay(i * 70)}>
              <b>{f.figure}</b>
              <span>{f.label}</span>
            </div>
          ))}
        </section>

        {/* ─── The Science ──────────────────────────────────────────────── */}
        <section id="science" className="sec paper" aria-labelledby="cvd-science">
          <div className="container">
            <div className="sechead">
              <p className="kicker reveal">Section I — the science</p>
              <h2 id="cvd-science" className="reveal">
                Five facts that are difficult to explain any other way.
              </h2>
              <p className="lede reveal">
                Taken individually, each of the following could be coincidence. Taken together, in
                the order they occurred, they are a <b>design-adjacent incident</b> — and the Office
                is obliged to say so plainly.
              </p>
            </div>

            <ol className="ev-list">
              {FINDINGS.map((f) => (
                <li className="ev reveal" key={f.title}>
                  <span className="ev-num" aria-hidden="true" />
                  <div className="ev-body">
                    <h3>{f.title}</h3>
                    {f.body.map((p) => (
                      <p key={p.slice(0, 24)}>{p}</p>
                    ))}
                    <span className="ev-cite">{f.cite}</span>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ─── Chronology ───────────────────────────────────────────────── */}
        <section id="chronology" className="sec" aria-labelledby="cvd-chronology">
          <div className="container">
            <div className="sechead">
              <p className="kicker reveal">Section II — chronology</p>
              <h2 id="cvd-chronology" className="reveal">
                Patient zero was a very good engineer.
              </h2>
              <p className="lede reveal">
                This is not a complaint about a person. People are allowed to leave, and the ones
                who left were excellent, which is precisely why the transfer took so well. It is a
                complaint about a <b>timeline</b>.
              </p>
            </div>

            <ol className="chron">
              {CHRONOLOGY.map((b, i) => (
                <li className="reveal" key={b.day} style={delay((i % 3) * 60)}>
                  <span className="chron-day">{b.day}</span>
                  <h3>{b.title}</h3>
                  <p>{b.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ─── The ledger ───────────────────────────────────────────────── */}
        <section id="ledger" className="sec paper" aria-labelledby="cvd-ledger">
          <div className="container">
            <div className="sechead">
              <p className="kicker reveal">Section III — the ledger</p>
              <h2 id="cvd-ledger" className="reveal">
                Seventeen features. We are printing seven.
              </h2>
              <p className="lede reveal">
                Ship dates, both platforms, in the order the Office received them. The full ledger
                runs to seventeen rows and is available to anyone who asks.
              </p>
            </div>

            <div
              className="ledger-wrap reveal"
              role="region"
              aria-label="Feature ledger"
              tabIndex={0}
            >
              <table className="ledger">
                <caption>Exhibit B — ship-date ledger (extract)</caption>
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
            <p className="table-note reveal">
              The Office draws no conclusion from rows one through six. The Office draws its entire
              conclusion from row seven: a defect is not a good idea two teams can independently
              have.
            </p>
          </div>
        </section>

        {/* ─── The cover-up ─────────────────────────────────────────────── */}
        <section id="coverup" className="sec" aria-labelledby="cvd-coverup">
          <div className="container">
            <div className="sechead">
              <p className="kicker reveal">Section IV — the cover-up</p>
              <h2 id="cvd-coverup" className="reveal">
                They commissioned a review, and the review agreed with them.
              </h2>
            </div>

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
              <p className="rebuttal">
                <b>Convergent evolution does not copy the comment.</b> Line 41 of their stylesheet,
                as shipped, reads <code>/* TODO: ask design why 3deg */</code>. We know why. We
                wrote the question, we wrote the TODO, and we never answered it either — but at
                least when we ask design, design is down the hall.
              </p>
            </figure>
          </div>
        </section>

        {/* ─── Everything else ──────────────────────────────────────────── */}
        <section className="sec paper" aria-labelledby="cvd-else">
          <div className="container">
            <div className="sechead">
              <p className="kicker reveal">Section V — the wider record</p>
              <h2 id="cvd-else" className="reveal">
                And while we have the page open.
              </h2>
              <p className="lede reveal">
                The Office’s remit is the leak. But a finding of this kind is traditionally an
                opportunity, and we are told it would be strange not to take it.
              </p>
            </div>

            <div className="grid">
              {FAILURES.map((c, i) => {
                const Icon = c.icon;
                return (
                  <article className="card reveal" key={c.title} style={delay((i % 3) * 80)}>
                    <span className="card-icon">
                      <Icon aria-hidden="true" />
                    </span>
                    <h3>{c.title}</h3>
                    <p>{c.body}</p>
                    <span className="card-tag">{c.tag}</span>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        {/* ─── The record ───────────────────────────────────────────────── */}
        <section className="sec" aria-labelledby="cvd-record">
          <div className="container">
            <div className="sechead">
              <p className="kicker reveal">Section VI — what the file contains</p>
              <h2 id="cvd-record" className="reveal">
                The evidence, stated without adjectives.
              </h2>
            </div>
            <div className="rec reveal">
              {RECORD.map((r) => (
                <div className="rec-row" key={r.term}>
                  <p className="rec-term">{r.term}</p>
                  <p className="rec-desc">{r.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── The finding ──────────────────────────────────────────────── */}
        <section id="finding" className="sec sec--tight" aria-labelledby="cvd-conclusion">
          <div className="container">
            <div className="finding reveal">
              <Seal withText sealId="cvd-finding-seal" />
              <h2 id="cvd-conclusion">A lab-adjacent incident remains the most likely origin.</h2>
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
              <div className="finding-actions">
                <a className="btn btn--gold" href="/">
                  See what they copied
                  <ArrowRight aria-hidden="true" />
                </a>
                <a className="btn btn--line" href="/design">
                  Read the design language
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* ─── FAQ — where the joke stops and the disclosure starts ─────── */}
        <section className="sec paper" aria-labelledby="cvd-faq">
          <div className="container">
            <div className="sechead sechead--center">
              <p className="kicker kicker--center reveal">Questions the Office anticipates</p>
              <h2 id="cvd-faq" className="reveal">
                Straight answers, for once.
              </h2>
            </div>
            <div className="faq reveal">
              {FAQ.map((f) => (
                <details key={f.q}>
                  <summary>{f.q}</summary>
                  <p>{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="foot" role="contentinfo">
        <div className="container">
          <div className="foot-top">
            <div className="foot-brand">
              <Seal />
              <div className="foot-brand-text">
                <b>Office of Platform Integrity</b>
                <span>
                  An in-universe office of RMH Studios, alongside RMH Capital and RMH PMC. It has
                  one page, no staff, and no powers.
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

          <p className="disclaimer">
            <b>This page is satire.</b> RMH Studios has no Office of Platform Integrity, has
            conducted no investigation, and makes no allegation of any kind against X Corp.,
            Twitter, or any of their staff, past or present. Nothing above is a statement of fact:
            the case number, the dates, the ledger, the exhibits, the nine departures and the cake
            are invented for the joke, and the visual language is a pastiche of official information
            pages in general rather than a copy of any particular one. No real person is named or
            depicted anywhere on this page.{' '}
            <b>
              If you came here looking for public-health information about COVID-19, this is not
              that page
            </b>{' '}
            — please use your national health service or the{' '}
            <a
              href="https://www.who.int/health-topics/coronavirus"
              target="_blank"
              rel="noopener noreferrer"
            >
              World Health Organization
            </a>
            .
          </p>

          <p className="foot-copy">
            © {new Date().getFullYear()} RMH Studios · Filed under fiction
          </p>
        </div>
      </footer>
    </div>
  );
}

export default CovidPage;
