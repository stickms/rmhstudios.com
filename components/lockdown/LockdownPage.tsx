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

const TOUR_STOPS     = tourStops.length;       // 6
const tourRegionIds  = tourStops.map((s) => s.id);
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
  const cameraTargetRef  = useRef<CameraTarget>({
    azimuth: tourStops[0].azimuth,
    polar:   tourStops[0].polar,
  });
  const tourProgressRef  = useRef(0);

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
      cameraTargetRef.current  = { azimuth, polar };
      tourProgressRef.current  = floatIdx;

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

      {/* ── Hero ────────────────────────────────────────────── */}
      <header className="ld-hero">
        <div className="ld-hero__bg">
          <Suspense fallback={null}>
            <BrainExplorer cameraTargetRef={cameraTargetRef} />
          </Suspense>
        </div>

        <div className="ld-hero__content">
          <motion.p
            className="ld-hero__subtitle"
            initial={{ opacity: 0, y: 32 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          >
            The next generation of human-computer interaction
          </motion.p>

          <motion.h1
            className="ld-hero__title"
            initial={{ opacity: 0, y: 32 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
          >
            <span className="ld-hero__title-line">RMHlink</span>
            <span className="ld-hero__title-line ld-hero__title-line--alt">
              Neural Interface
            </span>
          </motion.h1>

          <motion.p
            className="ld-hero__desc"
            initial={{ opacity: 0, y: 32 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.6, ease: [0.16, 1, 0.3, 1] }}
          >
            A high-bandwidth brain-computer interface that translates neural
            activity into digital action — seamlessly, intuitively, and in
            real time.
          </motion.p>

          <motion.div
            className="ld-hero__actions"
            initial={{ opacity: 0, y: 32 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.8, ease: [0.16, 1, 0.3, 1] }}
          >
            <button className="ld-btn ld-btn--primary" onClick={scrollToTour}>
              Explore the interface
            </button>
            <a
              href="https://rmhstudios.notion.site"
              target="_blank"
              rel="noopener noreferrer"
              className="ld-btn ld-btn--secondary"
            >
              Read the research
            </a>
          </motion.div>
        </div>

        <motion.button
          className="ld-hero__scroll-hint"
          onClick={scrollToTour}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.4, duration: 0.6 }}
          aria-label="Scroll to explore"
        >
          <span>Scroll to explore</span>
          <ChevronDown size={18} />
        </motion.button>
      </header>

      {/* ── Access gate ─────────────────────────────────────── */}
      <section className="ld-gate" id="access">
        <div className="ld-gate__inner">
          <AnimatePresence mode="wait">
            {submitted ? (
              <motion.div
                key="submitted"
                className="ld-gate__submitted"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              >
                <span className="ld-gate__check">&#10003;</span>
                <p>Access request submitted.</p>
              </motion.div>
            ) : (
              <motion.div
                key="form"
                className="ld-gate__form"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              >
                <h2 className="ld-gate__heading">Request Early Access</h2>
                <p className="ld-gate__sub">
                  Enter the access code to continue.
                </p>
                <form onSubmit={submitPassword}>
                  <div className="ld-gate__input-row">
                    <input
                      className="ld-gate__input"
                      type="password"
                      placeholder="Access code"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="off"
                      aria-label="Access code"
                    />
                    <button className="ld-gate__submit" type="submit" aria-label="Submit">
                      <CornerDownLeft size={20} />
                    </button>
                  </div>
                </form>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </section>

      {/* ── Tour ────────────────────────────────────────────── */}
      <section className="ld-tour" ref={tourRef} id="tour" style={{ height: `${TOUR_VH}vh` }}>
        {/* Progress bar */}
        <div className="ld-tour__progress">
          <motion.div className="ld-tour__progress-bar" style={{ scaleX: barScale }} />
        </div>

        {tourStops.map((stop, idx) => (
          <article
            key={stop.id}
            className="ld-tour__stop"
            data-active={idx === activeTourIdx || undefined}
            id={`stop-${stop.id}`}
          >
            <div className="ld-tour__stop-label">{stop.label}</div>
            <div className="ld-tour__stop-inner">
              <h2 className="ld-tour__stop-name">{stop.name}</h2>
              <p className="ld-tour__stop-summary">{stop.summary}</p>
              <p className="ld-tour__stop-link">{stop.link}</p>
            </div>
          </article>
        ))}
      </section>

      {/* ── Footer ────────────────────────────────────────────── */}
      <footer className="ld-footer">
        <div className="ld-footer__inner">
          <p className="ld-footer__text">
            Early access preview.
          </p>
          <p className="ld-footer__copy">
            &copy; {new Date().getFullYear()} RMHStudios. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
