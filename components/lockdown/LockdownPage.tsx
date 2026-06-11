import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { AnimatePresence, motion, useMotionValue } from 'framer-motion';
import { CornerDownLeft, ChevronDown } from 'lucide-react';
import type { CameraTarget } from './BrainExplorer';
import './lockdown.css';

// Import is stored so the module (and its useGLTF.preload side-effects) start
// loading immediately at LockdownPage module-eval time, not deferred to first render.
const brainExplorerModule = import('./BrainExplorer');
const BrainExplorer = lazy(() =>
  brainExplorerModule.then((m) => ({ default: m.BrainExplorer }))
);

// ─── Types ────────────────────────────────────────────────────────────────────

type BrainRegion = {
  id: string;
  name: string;
  shortName: string;
  summary: string;
  link: string;
};

type TourStop = BrainRegion & {
  label: string;
  azimuth: number;
  polar: number;
};

// ─── All brain region data ────────────────────────────────────────────────────

const allRegions: BrainRegion[] = [
  {
    id: 'prefrontal',
    name: 'Prefrontal Cortex',
    shortName: 'PFC',
    summary: 'Executive intent, planning, restraint, and context switching.',
    link: 'RMHlink would prioritize high-bandwidth intent decoding here, turning deliberate goals into interface commands for software, robotics, and simulated worlds.',
  },
  {
    id: 'motor',
    name: 'Motor Cortex',
    shortName: 'Motor',
    summary: 'Voluntary movement plans before they become muscle action.',
    link: 'RMHlink would map imagined movement into precise controls, enabling full-body VR agency, prosthetic output, and low-latency digital embodiment.',
  },
  {
    id: 'somatosensory',
    name: 'Somatosensory Cortex',
    shortName: 'Touch',
    summary: 'Touch, pressure, body position, and surface perception.',
    link: 'RMHlink would close the loop with synthetic touch, making AR objects and VR environments feel physically present rather than merely visible.',
  },
  {
    id: 'visual',
    name: 'Visual Cortex',
    shortName: 'Vision',
    summary: 'Image formation, motion, edges, depth, and visual prediction.',
    link: 'RMHlink would align neural visual processing with rendered scenes for realistic VR/AR overlays, perceptual stabilization, and simulation fidelity.',
  },
  {
    id: 'temporal',
    name: 'Temporal Lobe',
    shortName: 'Memory',
    summary: 'Language, auditory meaning, memory association, and recognition.',
    link: 'RMHlink would use this region to anchor persistent virtual identities, spatial memories, voice interfaces, and context-aware recall.',
  },
  {
    id: 'cerebellum',
    name: 'Cerebellum',
    shortName: 'Timing',
    summary: 'Prediction, timing, balance, correction, and fluent control.',
    link: 'RMHlink would use cerebellar prediction to make avatars, robotics, and AR interaction feel smooth, immediate, and physically believable.',
  },
  {
    id: 'marlon',
    name: 'Marlon Jack',
    shortName: 'Marlon',
    summary: 'Lead scientist and developer of RMHlink.',
    link: 'Marlon Jack leads the scientific and engineering direction for RMHlink, bringing the BCI interface, simulation stack, and full-brain interaction roadmap into one system.',
  },
];

// ─── Scroll tour stops ────────────────────────────────────────────────────────
// Brain group has rotation.y = -0.38 rad, so world coords are offset from local.
// azimuth=0 → camera at world +Z (brain's back, visual cortex).
// To face a local region, camera azimuth = local_azimuth + (π - 0.38) for front-facing,
// or -0.38 for back-facing, etc.  polar = angle from +Y axis.

const tourStops: TourStop[] = [
  { ...allRegions[0], label: 'Intent & Command',     azimuth: Math.PI - 0.38,   polar: 1.45 },  // prefrontal: world front
  { ...allRegions[1], label: 'Movement & Control',   azimuth: Math.PI - 0.38,   polar: 0.95 },  // motor: top-front
  { ...allRegions[3], label: 'Perception & Reality', azimuth: -0.38,            polar: 1.42 },  // visual: world back
  { ...allRegions[4], label: 'Memory & Identity',    azimuth: 1.19,             polar: 1.42 },  // temporal: right side
  { ...allRegions[5], label: 'Timing & Prediction',  azimuth: -0.38,            polar: 1.72 },  // cerebellum: back-bottom
  { ...allRegions[6], label: 'The Architect',        azimuth: Math.PI - 0.38,   polar: 1.45 },  // marlon: front view
];

const TOUR_STOPS = tourStops.length;         // 6
const TOUR_VH    = TOUR_STOPS * 90;          // 540vh total scroll height

// ─── Component ───────────────────────────────────────────────────────────────

// Shortest signed angular delta, so the camera always takes the < 180° path
function shortAngleDelta(from: number, to: number): number {
  const d = ((to - from + Math.PI) % (2 * Math.PI)) - Math.PI;
  return d < -Math.PI ? d + 2 * Math.PI : d;
}

export function LockdownPage() {
  const pageRef         = useRef<HTMLDivElement>(null);
  const tourRef         = useRef<HTMLElement>(null);
  const cameraTargetRef = useRef<CameraTarget>({
    azimuth: tourStops[0].azimuth,
    polar:   tourStops[0].polar,
  });

  const [activeTourIdx, setActiveTourIdx] = useState(0);
  const [password,      setPassword]      = useState('');
  const [submitted,     setSubmitted]     = useState(false);
  const submitTimer = useRef<number | null>(null);

  // MotionValue drives the progress bar scaleX — zero re-renders
  const barScale = useMotionValue(0);

  // .ld-page is the scroll container (not window — see CSS comment).
  // Use its scrollTop + section.offsetTop for reliable progress tracking.
  useEffect(() => {
    const page    = pageRef.current;
    const section = tourRef.current;
    if (!page || !section) return;

    const onScroll = () => {
      const scrolled      = page.scrollTop - section.offsetTop;
      const totalScrollable = section.offsetHeight - page.clientHeight;
      if (totalScrollable <= 0) return;

      const progress = Math.max(0, Math.min(1, scrolled / totalScrollable));
      barScale.set(progress);

      const floatIdx = progress * (TOUR_STOPS - 1);
      const fromIdx  = Math.min(Math.floor(floatIdx), TOUR_STOPS - 2);
      const t        = floatIdx - fromIdx;

      const from = tourStops[fromIdx];
      const to   = tourStops[fromIdx + 1];

      const azimuth = from.azimuth + shortAngleDelta(from.azimuth, to.azimuth) * t;
      const polar   = from.polar   + (to.polar   - from.polar) * t;
      cameraTargetRef.current = { azimuth, polar };

      const snapIdx = Math.min(Math.round(floatIdx), TOUR_STOPS - 1);
      setActiveTourIdx((prev) => (prev !== snapIdx ? snapIdx : prev));
    };

    page.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => page.removeEventListener('scroll', onScroll);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submitPassword = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPassword('');
    setSubmitted(true);
    if (submitTimer.current !== null) window.clearTimeout(submitTimer.current);
    submitTimer.current = window.setTimeout(() => setSubmitted(false), 1800);
  };

  const scrollToTour = () => {
    if (!pageRef.current || !tourRef.current) return;
    pageRef.current.scrollTo({ top: tourRef.current.offsetTop, behavior: 'smooth' });
  };

  const activeStop = tourStops[activeTourIdx];

  return (
    <div className="ld-page" ref={pageRef}>

      {/* ── Nav ────────────────────────────────────────────────────────────── */}
      <nav className="ld-nav" aria-label="Site navigation">
        <div className="ld-nav__inner">
          <div className="ld-brand">
            <img src="/favicon.svg" alt="" aria-hidden="true" />
            <span>RMHStudios</span>
          </div>
        </div>
      </nav>

      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <section className="ld-hero" aria-labelledby="ld-hero-title">
        <img
          src="/images/elon-main.webp"
          alt="Elon Musk"
          className="ld-hero__img"
          loading="eager"
          decoding="async"
        />
        <div className="ld-hero__overlay" aria-hidden="true" />

        <div className="ld-hero__content">
          <div className="ld-hero__inner">
            <h1 id="ld-hero-title" className="ld-hero__title">
              The future<br />is neural.
            </h1>
            <p className="ld-hero__body">
              The boundary between mind and machine is dissolving. RMHLink builds
              the high-bandwidth neural interface that decodes human intent
              directly — enabling control of software, simulations, and digital
              worlds at the speed of thought.
            </p>
            <p className="ld-hero__tag">Something rmharkable is coming.</p>
          </div>
        </div>

        <button
          type="button"
          className="ld-scroll-cue"
          onClick={scrollToTour}
          aria-label="Scroll to explore"
        >
          <span>Explore</span>
          <ChevronDown size={13} strokeWidth={2.2} aria-hidden="true" />
        </button>
      </section>

      {/* ── Statement ──────────────────────────────────────────────────────── */}
      <section className="ld-statement" aria-label="Mission statement">
        <motion.h2
          className="ld-statement__title"
          initial={{ opacity: 0, y: 32 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.85, ease: [0.16, 1, 0.3, 1] }}
        >
          One interface.<br />Every thought.<br />Infinite possibility.
        </motion.h2>
        <motion.p
          className="ld-statement__sub"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.85, ease: [0.16, 1, 0.3, 1], delay: 0.18 }}
        >
          RMHLink maps the brain's own signals into a universal input layer —
          collapsing the gap between what you think and what you can do.
        </motion.p>
      </section>

      {/* ── Scroll Brain Tour ──────────────────────────────────────────────── */}
      <section
        ref={tourRef}
        aria-label="Interactive brain region tour"
        style={{ height: `${TOUR_VH}vh` }}
      >
        <div className="ld-tour__sticky">
          {/* Progress bar */}
          <div className="ld-tour__bar-wrap" aria-hidden="true">
            <motion.div className="ld-tour__bar" style={{ scaleX: barScale }} />
          </div>

          {/* Left: text slides */}
          <div className="ld-tour__text-pane">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTourIdx}
                initial={{ opacity: 0, y: 22 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -18 }}
                transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
              >
                <p className="ld-tour__slide-index">
                  {String(activeTourIdx + 1).padStart(2, '0')} / {String(TOUR_STOPS).padStart(2, '0')}
                </p>
                <p className="ld-tour__slide-label">{activeStop.label}</p>
                <h3 className="ld-tour__slide-name">{activeStop.name}</h3>
                <p className="ld-tour__slide-summary">{activeStop.summary}</p>
                <p className="ld-tour__slide-detail">{activeStop.link}</p>
              </motion.div>
            </AnimatePresence>

            {/* Dot progress */}
            <div className="ld-tour__progress" aria-hidden="true">
              {tourStops.map((_, i) => (
                <span
                  key={i}
                  className={`ld-tour__dot${
                    i === activeTourIdx ? ' is-active' : i < activeTourIdx ? ' is-past' : ''
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Right: sticky brain canvas */}
          <div className="ld-tour__brain-pane">
            <Suspense fallback={<div className="brain-animation-shell" />}>
              <BrainExplorer
                selectedRegion={activeStop}
                onSelect={() => {}}
                scrollDriven
                cameraTargetRef={cameraTargetRef}
              />
            </Suspense>
          </div>
        </div>
      </section>

      {/* ── Vision section ─────────────────────────────────────────────────── */}
      <section className="ld-vision" aria-labelledby="ld-vision-title">
        <div className="ld-vision__img-wrap" aria-hidden="true">
          <img
            src="/images/elon-right.webp"
            alt=""
            className="ld-vision__img"
            loading="lazy"
            decoding="async"
          />
          <div className="ld-vision__overlay" />
        </div>

        <div className="ld-vision__content">
          <motion.div
            className="ld-glass ld-vision__card"
            initial={{ opacity: 0, x: -28 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
          >
            <p className="ld-eyebrow">The Vision</p>
            <h2 id="ld-vision-title" className="ld-vision__title">
              Neural symbiosis<br />begins here.
            </h2>
            <p className="ld-vision__body">
              Elon Musk has described a future where the digital layer of
              civilisation and the biological layer of human intelligence merge
              into one. RMHLink is the engineering work that turns that vision
              into a real, operable system — built for the people who refuse to
              wait.
            </p>
          </motion.div>
        </div>
      </section>

      {/* ── Early access ────────────────────────────────────────────────────── */}
      <section className="ld-access" aria-labelledby="ld-access-title">
        <motion.h2
          id="ld-access-title"
          className="ld-access__title"
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        >
          Request early access.
        </motion.h2>
        <motion.p
          className="ld-access__sub"
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 0.12 }}
        >
          RMHLink is invitation-only at launch. Enter your access code below,
          or check back when we open to the public.
        </motion.p>

        <motion.div
          className="ld-access__form"
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 0.22 }}
        >
          <form onSubmit={submitPassword} aria-label="Early access">
            <div className="ld-dock__row" data-submitted={submitted}>
              <input
                id="ld-password"
                type="text"
                name="rmh-access-entry"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={submitted ? 'Coming soon' : 'Enter access code'}
                autoComplete="new-password"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                data-1p-ignore="true"
                data-lpignore="true"
                data-form-type="other"
                aria-label="Access password"
                className="ld-dock__input"
              />
              <button type="submit" className="ld-dock__submit" aria-label="Submit">
                <CornerDownLeft size={15} strokeWidth={2} aria-hidden="true" />
              </button>
            </div>
          </form>
        </motion.div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <footer className="ld-footer" role="contentinfo">
        <div className="ld-footer__inner">
          <div className="ld-footer__top">
            <div className="ld-footer__brand">
              <div className="ld-footer__brand-row">
                <img src="/favicon.svg" alt="" aria-hidden="true" />
                <span>RMHStudios</span>
              </div>
              <p className="ld-footer__tagline">
                Building the infrastructure for human-machine symbiosis.
              </p>
            </div>

            <nav className="ld-footer__links" aria-label="Legal">
              <a href="/terms" className="ld-footer__link">Terms of Use</a>
              <a href="/privacy" className="ld-footer__link">Privacy Policy</a>
              <a href="/cookies" className="ld-footer__link">Cookie Policy</a>
              <a href="/copyright" className="ld-footer__link">Copyright</a>
            </nav>
          </div>

          <div className="ld-footer__bottom">
            <p className="ld-footer__copy">
              Copyright &copy; {new Date().getFullYear()} RMHStudios. All rights reserved.
            </p>
            <p className="ld-footer__copy">
              RMHLink and RMHStudios are trademarks of RMHStudios.
            </p>
          </div>
        </div>
      </footer>

    </div>
  );
}
