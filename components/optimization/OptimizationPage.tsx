import { useEffect, useRef, type CSSProperties } from 'react';
import {
  Gauge,
  Zap,
  Rocket,
  Package,
  Image as ImageIcon,
  Radio,
  Layers,
  HardDrive,
  Feather,
  Wand2,
  Timer,
  Cpu,
  Activity,
  CheckCircle2,
  ChevronLeft,
  ArrowRight,
  type LucideIcon,
} from 'lucide-react';
// Reuse the security page's liquid-glass "store style" design system verbatim
// so the two standalone pages are visually identical (same `sec-*` classes).
import '@/components/security/security.css';
import { PinnedHero } from '@/components/feed/PinnedHero';

/**
 * /optimization — a standalone page describing how RMH Studios makes the app
 * fast, from runtime to build/deploy. Every number below is real and measured:
 * the runtime wins come from the shipped router config + perf commits, and the
 * build/deploy figures come from the profiled audits in docs/opti/*.
 *
 * Shares SecurityPage's design system and its progressive-enhancement motion
 * model (content renders visible server-side; scroll-reveal only enhances for
 * visitors who haven't asked for reduced motion).
 */

interface Pillar {
  icon: LucideIcon;
  title: string;
  body: string;
  tag: string;
}

const RUNTIME: Pillar[] = [
  {
    icon: Gauge,
    title: 'Seeded, server-rendered first paint',
    body: 'The server resolves your session and the page’s data in a single pass, so the app renders signed-in and populated on the very first paint — no spinner, no flash of signed-out, no client-side waterfall.',
    tag: 'SSR · Route loaders',
  },
  {
    icon: Zap,
    title: 'Prefetched on intent',
    body: 'Hover or focus a link and we quietly preload its data 50 ms later; the real click then renders from a warm 30-second cache. Navigation feels instant because the work already happened.',
    tag: 'Intent preload',
  },
  {
    icon: Rocket,
    title: 'Optimistic everything',
    body: 'Likes, posts, comments, and bookmarks apply the instant you act, then reconcile with the authoritative server record — rolling back only if it truly fails. One shared apply / commit / rollback primitive powers it all.',
    tag: 'Optimistic writes',
  },
  {
    icon: Package,
    title: 'Ship only what’s needed',
    body: 'Routes are code-split, heavy libraries (3D, editors, audio) are externalized from the main bundle, and we load only your language — the eager locale payload dropped from 866 KB to 292 KB.',
    tag: 'Code splitting',
  },
  {
    icon: ImageIcon,
    title: 'Images that adapt',
    body: 'Everything is re-encoded to WebP, sized down the wire with srcset, and blurred-up while it loads. Our image proxy is SSRF-guarded and cached immutably for a year.',
    tag: 'WebP · srcset · blur-up',
  },
  {
    icon: Radio,
    title: 'Real-time without polling',
    body: 'The feed streams over Server-Sent Events instead of hammering the API on a timer, and a service worker serves immutable assets instantly — keeping the app usable even offline.',
    tag: 'SSE · Service worker',
  },
];

interface Stat {
  num: string;
  label: string;
}

const STATS: Stat[] = [
  { num: '292 KB', label: 'Active-language client payload — down from 866 KB' },
  { num: '~40 s', label: 'Full production build across 7,830 modules' },
  { num: '50 ms', label: 'Intent-preload — before you even click' },
  { num: '40–110 s', label: 'Trimmed from every changed deploy' },
];

interface BuildFeature {
  icon: LucideIcon;
  title: string;
  body: string;
}

const BUILDTIME: BuildFeature[] = [
  {
    icon: Layers,
    title: 'One parallel build graph',
    body: 'Images build as a single BuildKit DAG (COMPOSE_BAKE), folding the server build under the client build’s shadow — 30–90 seconds off every changed build.',
  },
  {
    icon: HardDrive,
    title: 'Caches that survive',
    body: 'The pnpm store, the Vite/Vinxi cache, and a shared BuildKit registry cache persist across builds, with disk-aware pruning that keeps the cache warm instead of nuking it.',
  },
  {
    icon: Feather,
    title: 'A lean build context',
    body: 'Half a gigabyte of static PDFs is served off-host, shrinking the build context from ~520 MB to ~30 MB — smaller images, faster pulls, and far fewer cold builds.',
  },
  {
    icon: Wand2,
    title: 'A compiler plugin we wrote',
    body: 'Our stub-server-files Vite plugin swaps server-only modules for stubs on the client, so Node-only dependency trees never reach the browser bundle — and we pre-filtered it to cut its own build cost.',
  },
  {
    icon: Timer,
    title: 'Measured, never guessed',
    body: 'Every stage is profiled — client 16 s, SSR 12 s, Nitro 7 s — so we optimize against real numbers and record what worked, and what didn’t.',
  },
];

interface Milestone {
  metric: string;
  before: string;
  after: string;
  result: string;
}

const MILESTONES: Milestone[] = [
  {
    metric: 'Client language payload',
    before: '866 KB (all languages)',
    after: '292 KB (yours only)',
    result: '−66% eager JS; other locales load on demand',
  },
  {
    metric: 'Docker build context',
    before: '~520 MB',
    after: '~30 MB',
    result: '−94%; smaller images, fewer cold builds',
  },
  {
    metric: 'Deploy wall-clock',
    before: 'serial build + boots',
    after: 'parallel DAG + gated boots',
    result: '40–110 s faster per changed deploy',
  },
  {
    metric: 'Opening a conversation',
    before: 'fetched the entire inbox',
    after: 'loader seeds one participant',
    result: 'a whole request eliminated',
  },
  {
    metric: 'Build-plugin overhead',
    before: '37% of build time',
    after: '30% of build time',
    result: 'a one-line resolver pre-filter',
  },
];

interface Advanced {
  title: string;
  body: string;
}

const ADVANCED: Advanced[] = [
  {
    title: 'A server/client compiler boundary',
    body: 'The stub-server-files plugin rewrites every `*.server` import to a matching stub in the browser build, so heavy Node-only trees (Postgres, image codecs, auth) are physically absent from the client — enforced at compile time, not by convention.',
  },
  {
    title: 'SSR-exact language hydration',
    body: 'Only your active non-English language is serialized into the server render payload, so the client hydrates synchronously in the right language with no flash and no mismatch — while English needs nothing shipped at all.',
  },
  {
    title: 'An optimistic-action primitive',
    body: 'A single apply / commit / rollback / reconcile hook drives every instant interaction, and de-duplicates its own optimistic item against the real-time event that later confirms it — so nothing ever double-renders.',
  },
  {
    title: 'Disk-aware build caching',
    body: 'Instead of wiping the cache when disk gets tight, the deploy trims stale cache mounts surgically and keeps the expensive layers (three.js, native modules) warm — avoiding minutes-long cold builds.',
  },
];

interface Spec {
  term: string;
  desc: string;
}

const RENDER_SPECS: Spec[] = [
  {
    term: 'Server-side render',
    desc: 'The first response is a finished page, not an empty shell waiting on JavaScript. TanStack Start renders on the server and sends HTML the browser can paint straight away.',
  },
  {
    term: 'Session seeding',
    desc: 'The root loader resolves your session on the server, so the shell renders signed-in on the very first paint instead of flashing signed-out while a client request catches up.',
  },
  {
    term: 'Route loaders',
    desc: 'Each route fetches its data on the server — or on intent-preload — through a shared server helper, so the page arrives already populated. No client-side request waterfall on mount.',
  },
  {
    term: 'Exact-language hydration',
    desc: 'Only your active language is serialized into the render payload, so the client picks up in the right language synchronously — no flash of English, no re-render to swap it.',
  },
  {
    term: 'Render discipline',
    desc: 'Hot components are memoized and subscribe to only the slice of state they use, so a like or a new post re-renders the one card that changed — not the whole timeline.',
  },
];

const BUNDLE_SPECS: Spec[] = [
  {
    term: 'Code-split routes',
    desc: 'Every route is its own async chunk, so heavy screens — the 3D games, the code editor — never weigh down the entry bundle for someone who just opened the feed.',
  },
  {
    term: 'Externalized heavy libraries',
    desc: 'three.js, Monaco, PixiJS, and Tone.js are split into their own vendor chunks (Monaco is even split by editor area), so you download them only when you reach a screen that actually needs them.',
  },
  {
    term: 'One language, not all',
    desc: 'The eager locale payload dropped from 866 KB to 292 KB by shipping only the default language up front; the rest code-split and load on demand.',
  },
  {
    term: 'Dead weight removed',
    desc: 'console.log and debug calls are stripped from production, source maps and compressed-size reporting are off in CI, and tree-shaking prunes anything nothing references.',
  },
];

const BUILD_SPECS: Spec[] = [
  {
    term: 'Vite + Rolldown',
    desc: 'The production build runs three passes — client (~16 s over 7,830 modules), SSR (~12 s), and the Nitro server bundle (~7 s) — for roughly 40 seconds steady-state.',
  },
  {
    term: 'stub-server-files',
    desc: 'A Vite plugin we wrote replaces every server-only module with a stub in the browser build, so Node-only trees never enter the client graph. We pre-filtered its resolver to skip ~99% of imports, cutting its own share of build time from 37% to 30%.',
  },
  {
    term: 'Traced server deps',
    desc: 'Heavy native and server-only packages are externalized from the server bundle and traced into the output, so the bundler transforms far fewer modules per build.',
  },
  {
    term: 'Parallel service bundle',
    desc: 'The standalone realtime services are bundled separately with esbuild, off the critical Vite path, so they never serialize behind the main build.',
  },
];

interface Step {
  title: string;
  body: string;
}

const DEPLOY_STEPS: Step[] = [
  {
    title: 'Build in parallel',
    body: 'Images build as a single BuildKit DAG (COMPOSE_BAKE), so the server image builds under the client build’s shadow instead of after it — 30 to 90 seconds saved on a changed build.',
  },
  {
    title: 'Reuse the cache',
    body: 'The pnpm store and the Vite cache persist across builds as cache mounts, and a shared BuildKit registry cache lets separate machines warm each other.',
  },
  {
    title: 'Keep the cache warm',
    body: 'When disk gets tight we trim stale cache mounts surgically instead of wiping everything — avoiding a minutes-long cold rebuild of three.js and native modules.',
  },
  {
    title: 'Ship a lean image',
    body: 'Half a gigabyte of static PDFs is served off-host, so the build context and runtime image are ~500 MB lighter — faster pulls, faster boots, fewer cold builds.',
  },
  {
    title: 'Skip needless boots',
    body: 'Per-deploy container steps that don’t apply to a given change are gated out, trimming another handful of seconds off every deploy.',
  },
];

interface Measure {
  icon: LucideIcon;
  text: string;
}

const MEASURE: Measure[] = [
  { icon: Activity, text: 'Real-user Core Web Vitals (LCP, CLS, INP) are collected from actual sessions, so “feels slow” becomes a number we can trend.' },
  { icon: Cpu, text: 'Runtime errors and unhandled rejections are captured globally, so a regression surfaces in our logs instead of failing silently for users.' },
  { icon: Timer, text: 'Every build stage is profiled with wall-clock timing, so we spend effort on the real bottleneck rather than a guess.' },
  { icon: CheckCircle2, text: 'When an idea doesn’t pan out — and some “obvious” wins don’t — we write down why, so we never chase the same dead end twice.' },
];

interface Faq {
  q: string;
  a: string;
}

const OPT_FAQ: Faq[] = [
  {
    q: 'Why does the app feel instant even on a slow connection?',
    a: 'Because most of the work already happened before you asked. The page is rendered on the server, its data is prefetched the moment you show intent to click, your actions apply optimistically, and a service worker serves cached assets instantly. The network is rarely on your critical path.',
  },
  {
    q: 'Do all the animations slow things down?',
    a: 'No. Motion is CSS-driven, runs on the compositor, and never blocks interaction — and it’s switched off entirely for anyone who prefers reduced motion. The scroll-reveals on this very page are progressive enhancement: the content is fully there without them.',
  },
  {
    q: 'How big is the initial download?',
    a: 'Only what the first screen needs: your language and the current route. Heavy libraries — 3D engines, the editor, audio — are code-split and arrive lazily when you reach a screen that uses them, not up front.',
  },
  {
    q: 'Is “optimization” ever done?',
    a: 'No, and that’s the point. We keep the numbers honest, keep profiling, and keep trimming. The fastest version of RMH Studios is always the next one.',
  },
];

const LEGAL_LINKS: { href: string; label: string }[] = [
  { href: '/security', label: 'Security' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/terms', label: 'Terms' },
  { href: '/cookies', label: 'Cookies' },
];

export function OptimizationPage() {
  const pageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const page = pageRef.current;
    if (!page || typeof IntersectionObserver === 'undefined') return;

    const prefersReduced = window.matchMedia?.(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    if (prefersReduced) return;

    page.setAttribute('data-animate', '');
    const revealables = Array.from(page.querySelectorAll<HTMLElement>('.sec-reveal'));

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
    );

    revealables.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <div className="sec-page" ref={pageRef}>
      <a className="sec-skip" href="#opt-main">
        Skip to content
      </a>

      <header>
        <nav className="sec-nav" aria-label="Optimization">
          <div className="sec-nav__inner">
            <a className="sec-nav__back" href="/">
              <ChevronLeft size={15} strokeWidth={2.2} aria-hidden="true" />
              RMH Studios
            </a>
            <span className="sec-nav__sep" aria-hidden="true">
              /
            </span>
            <span className="sec-nav__title">Speed</span>
            <a className="sec-nav__cta" href="#opt-milestones">
              See the numbers
              <ArrowRight size={14} aria-hidden="true" />
            </a>
          </div>
        </nav>
      </header>

      <main id="opt-main">
        {/* ─── Hero — the signature pinned scroll-narrative ──────────────── */}
        <PinnedHero
          eyebrow="Speed & optimization"
          title={
            <>
              Speed you can <span className="text-site-accent">feel.</span>
            </>
          }
          subtitle="Fast isn’t a setting we flipped on — it’s hundreds of small decisions, from the first byte the server sends to the last second of a deploy. Here’s how we keep RMH Studios quick."
          scrollCue="The runtime"
          actions={
            <>
              <a className="sec-btn sec-btn--primary" href="#opt-runtime">
                How it stays fast
                <ArrowRight aria-hidden="true" />
              </a>
              <a className="sec-btn sec-btn--ghost" href="#opt-milestones">
                The measured wins
              </a>
            </>
          }
        />

        {/* ─── Trust bar ────────────────────────────────────────────────── */}
        <section className="sec-stats" aria-label="Performance at a glance">
          {STATS.map((s, i) => (
            <div
              key={s.label}
              className="sec-stat sec-reveal"
              style={{ '--sec-delay': `${i * 70}ms` } as CSSProperties}
            >
              <p className="sec-stat__num">{s.num}</p>
              <p className="sec-stat__label">{s.label}</p>
            </div>
          ))}
        </section>

        {/* ─── Statement ────────────────────────────────────────────────── */}
        <section className="sec-section sec-statement" aria-labelledby="opt-statement-title">
          <div className="sec-shell">
            <p className="sec-eyebrow sec-reveal">The philosophy</p>
            <h2 id="opt-statement-title" className="sec-statement__text sec-reveal">
              Every millisecond <b>is a decision.</b>
            </h2>
          </div>
        </section>

        {/* ─── Runtime ──────────────────────────────────────────────────── */}
        <section
          id="opt-runtime"
          className="sec-section sec-section--hair"
          aria-labelledby="opt-runtime-title"
        >
          <div className="sec-shell">
            <div className="sec-section__head">
              <p className="sec-eyebrow sec-reveal">At runtime</p>
              <h2 id="opt-runtime-title" className="sec-section__title sec-reveal">
                Instant, on purpose.
              </h2>
              <p className="sec-section__sub sec-reveal">
                Perceived speed is engineered. These are the techniques that make
                the app feel like it’s already one step ahead of you.
              </p>
            </div>

            <div className="sec-grid">
              {RUNTIME.map((p, i) => {
                const Icon = p.icon;
                return (
                  <article
                    key={p.title}
                    className="sec-card sec-reveal"
                    style={{ '--sec-delay': `${(i % 3) * 80}ms` } as CSSProperties}
                  >
                    <span className="sec-card__icon">
                      <Icon aria-hidden="true" />
                    </span>
                    <h3 className="sec-card__title">{p.title}</h3>
                    <p className="sec-card__body">{p.body}</p>
                    <span className="sec-card__tag">{p.tag}</span>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        {/* ─── Rendering pipeline ───────────────────────────────────────── */}
        <section className="sec-section sec-section--hair" aria-labelledby="opt-render-title">
          <div className="sec-shell">
            <div className="sec-section__head">
              <p className="sec-eyebrow sec-reveal">The rendering pipeline</p>
              <h2 id="opt-render-title" className="sec-section__title sec-reveal">
                Painted before you blink.
              </h2>
              <p className="sec-section__sub sec-reveal">
                The path from a request to a usable screen is where perceived speed
                is won or lost. Here’s how ours is wired.
              </p>
            </div>
            <div className="sec-spec sec-reveal">
              {RENDER_SPECS.map((s) => (
                <div className="sec-spec__row" key={s.term}>
                  <div className="sec-spec__term">{s.term}</div>
                  <p className="sec-spec__desc">{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── The bundle ───────────────────────────────────────────────── */}
        <section className="sec-section sec-section--hair" aria-labelledby="opt-bundle-title">
          <div className="sec-shell">
            <div className="sec-section__head">
              <p className="sec-eyebrow sec-reveal">The bundle</p>
              <h2 id="opt-bundle-title" className="sec-section__title sec-reveal">
                Download only what this screen needs.
              </h2>
              <p className="sec-section__sub sec-reveal">
                The cheapest byte is the one we never send. We stay aggressive
                about what actually reaches your browser.
              </p>
            </div>
            <div className="sec-spec sec-reveal">
              {BUNDLE_SPECS.map((s) => (
                <div className="sec-spec__row" key={s.term}>
                  <div className="sec-spec__term">{s.term}</div>
                  <p className="sec-spec__desc">{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── Buildtime ────────────────────────────────────────────────── */}
        <section
          className="sec-section sec-section--hair"
          aria-labelledby="opt-build-title"
        >
          <div className="sec-shell">
            <div className="sec-section__head">
              <p className="sec-eyebrow sec-reveal">At build &amp; deploy</p>
              <h2 id="opt-build-title" className="sec-section__title sec-reveal">
                Fast to build. Fast to ship.
              </h2>
              <p className="sec-section__sub sec-reveal">
                Speed isn’t only what users feel — it’s how quickly we can get a
                fix in front of them. So we profile and tune the pipeline too.
              </p>
            </div>

            <div className="sec-features">
              {BUILDTIME.map((f, i) => {
                const Icon = f.icon;
                return (
                  <article
                    key={f.title}
                    className="sec-feature sec-reveal"
                    style={{ '--sec-delay': `${(i % 2) * 90}ms` } as CSSProperties}
                  >
                    <span className="sec-feature__icon">
                      <Icon aria-hidden="true" />
                    </span>
                    <div>
                      <h3 className="sec-feature__title">{f.title}</h3>
                      <p className="sec-feature__body">{f.body}</p>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        {/* ─── Build pipeline ───────────────────────────────────────────── */}
        <section className="sec-section sec-section--hair" aria-labelledby="opt-buildpipe-title">
          <div className="sec-shell">
            <div className="sec-section__head">
              <p className="sec-eyebrow sec-reveal">Inside the build</p>
              <h2 id="opt-buildpipe-title" className="sec-section__title sec-reveal">
                Forty seconds, measured.
              </h2>
              <p className="sec-section__sub sec-reveal">
                A fast build is a fast feedback loop. Every stage is understood,
                profiled, and tuned.
              </p>
            </div>
            <div className="sec-spec sec-reveal">
              {BUILD_SPECS.map((s) => (
                <div className="sec-spec__row" key={s.term}>
                  <div className="sec-spec__term">{s.term}</div>
                  <p className="sec-spec__desc">{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── Deploy pipeline ──────────────────────────────────────────── */}
        <section className="sec-section sec-section--hair" aria-labelledby="opt-deploy-title">
          <div className="sec-shell">
            <div className="sec-section__head">
              <p className="sec-eyebrow sec-reveal">Getting it live</p>
              <h2 id="opt-deploy-title" className="sec-section__title sec-reveal">
                From commit to production, quickly.
              </h2>
              <p className="sec-section__sub sec-reveal">
                Shipping a fix fast is part of performance too. The deploy is a
                cache-aware, mostly-parallel pipeline.
              </p>
            </div>
            <ol className="sec-steps">
              {DEPLOY_STEPS.map((s, i) => (
                <li
                  className="sec-step sec-reveal"
                  key={s.title}
                  style={{ '--sec-delay': `${(i % 2) * 80}ms` } as CSSProperties}
                >
                  <span className="sec-step__num">{i + 1}</span>
                  <div>
                    <h3 className="sec-step__title">{s.title}</h3>
                    <p className="sec-step__body">{s.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ─── Measured over time ───────────────────────────────────────── */}
        <section
          id="opt-milestones"
          className="sec-section sec-section--hair"
          aria-labelledby="opt-milestones-title"
        >
          <div className="sec-shell">
            <div className="sec-section__head">
              <p className="sec-eyebrow sec-reveal">Measured over time</p>
              <h2 id="opt-milestones-title" className="sec-section__title sec-reveal">
                We optimize against numbers.
              </h2>
              <p className="sec-section__sub sec-reveal">
                Not vibes — profiles. A few of the wins we’ve booked, with the
                before and after.
              </p>
            </div>

            <div
              className="sec-bounty-table-wrap sec-reveal"
              role="region"
              aria-labelledby="opt-milestones-title"
              tabIndex={0}
            >
              <table className="sec-bounty-table">
                <caption className="sr-only">
                  Performance improvements with their before and after measurements.
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Improvement</th>
                    <th scope="col">Before</th>
                    <th scope="col">After</th>
                    <th scope="col">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {MILESTONES.map((m) => (
                    <tr key={m.metric}>
                      <th scope="row">{m.metric}</th>
                      <td>{m.before}</td>
                      <td className="sec-bounty-table__reward">{m.after}</td>
                      <td>{m.result}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* ─── How we measure ───────────────────────────────────────────── */}
        <section className="sec-section sec-section--hair" aria-labelledby="opt-measure-title">
          <div className="sec-shell">
            <div className="sec-section__head">
              <p className="sec-eyebrow sec-reveal">How we know</p>
              <h2 id="opt-measure-title" className="sec-section__title sec-reveal">
                Measured, not guessed.
              </h2>
              <p className="sec-section__sub sec-reveal">
                You can’t improve what you don’t watch — so we watch, in production
                and in the pipeline.
              </p>
            </div>
            <ul className="sec-list sec-reveal">
              {MEASURE.map((m) => {
                const Icon = m.icon;
                return (
                  <li key={m.text}>
                    <span className="sec-list__icon">
                      <Icon aria-hidden="true" />
                    </span>
                    <span>{m.text}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        {/* ─── Advanced / proprietary ───────────────────────────────────── */}
        <section
          className="sec-section sec-section--hair"
          aria-labelledby="opt-advanced-title"
        >
          <div className="sec-shell">
            <div className="sec-section__head sec-section__head--center">
              <p className="sec-eyebrow sec-reveal">Under the hood</p>
              <h2 id="opt-advanced-title" className="sec-section__title sec-reveal">
                The clever bits.
              </h2>
              <p className="sec-section__sub sec-reveal">
                A few techniques we built ourselves because nothing off-the-shelf
                did quite what we needed.
              </p>
            </div>

            <div className="sec-features">
              {ADVANCED.map((a, i) => (
                <article
                  key={a.title}
                  className="sec-feature sec-reveal"
                  style={{ '--sec-delay': `${(i % 2) * 90}ms` } as CSSProperties}
                >
                  <span className="sec-feature__icon">
                    <Wand2 aria-hidden="true" />
                  </span>
                  <div>
                    <h3 className="sec-feature__title">{a.title}</h3>
                    <p className="sec-feature__body">{a.body}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ─── FAQ ──────────────────────────────────────────────────────── */}
        <section className="sec-section sec-section--hair" aria-labelledby="opt-faq-title">
          <div className="sec-shell">
            <div className="sec-section__head sec-section__head--center">
              <p className="sec-eyebrow sec-reveal">Questions, answered</p>
              <h2 id="opt-faq-title" className="sec-section__title sec-reveal">
                The things people ask.
              </h2>
            </div>
            <div className="sec-faq sec-reveal">
              {OPT_FAQ.map((f) => (
                <details className="sec-faq__item" key={f.q}>
                  <summary className="sec-faq__q">{f.q}</summary>
                  <p className="sec-faq__a">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ─── Closing ──────────────────────────────────────────────────── */}
        <section className="sec-section sec-section--hair" aria-labelledby="opt-closing-title">
          <div className="sec-shell">
            <div className="sec-disclosure sec-reveal">
              <div className="sec-disclosure__glow" aria-hidden="true" />
              <div className="sec-disclosure__inner">
                <p className="sec-eyebrow">Never finished</p>
                <h2 id="opt-closing-title" className="sec-disclosure__title">
                  The fastest version is the next one.
                </h2>
                <p className="sec-disclosure__body">
                  Performance isn’t a milestone we passed — it’s a habit. We keep
                  profiling, keep trimming, and keep the numbers honest. The bar
                  only moves one way.
                </p>
                <a className="sec-btn sec-btn--primary" href="/security">
                  How we keep you secure
                  <ArrowRight aria-hidden="true" />
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>

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
    </div>
  );
}

export default OptimizationPage;
