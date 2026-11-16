/**
 * RMH PMC — shared primitives for "the sight" design system (rmh-pmc.css).
 *
 * Chrome of the site: the glass command capsule, the left document spine, the
 * Zulu clock, the decrypt helper, the transmission log, the brand mark and the
 * footer. Plus the small typed helpers that scenes and pages are written with:
 * `Words`, `Arrow`, `Reticle`, `Hud`, `Scene`/`Step`/`SceneDots`, `PageHead`,
 * `SecHead`, `CtaBand`, `MetaLine`.
 *
 * Motion is CSS. The scripts are `useVerticalNav`, `Decrypt` and `ZuluClock`
 * here, and the pointer and scene-focus hooks in Layout.tsx.
 */
import { useEffect, useState } from 'react';
import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useVerticalNav } from '@/hooks/useVerticalNav';

/** A CSS custom property in a `style` prop, without a cast at every call site. */
export function cssVars(vars: Record<`--${string}`, string | number>, base?: CSSProperties): CSSProperties {
  return { ...base, ...vars } as CSSProperties;
}

/* ── marks and icons ─────────────────────────────────────────────────────── */

/* Reticle-in-hex mark, drawn in chrome stops. The hex keeps lineage with the
   RMH holding mark; the crosshair and chevron make it PMC. */
export function BrandMark() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <linearGradient id="rmhp-mark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--st-1)' }} />
          <stop offset="0.5" style={{ stopColor: 'var(--st-2)' }} />
          <stop offset="0.52" style={{ stopColor: 'var(--st-3)' }} />
          <stop offset="1" style={{ stopColor: 'var(--st-4)' }} />
        </linearGradient>
      </defs>
      <polygon points="50,5 89,27 89,73 50,95 11,73 11,27" fill="none" stroke="url(#rmhp-mark)" strokeWidth="7" strokeLinejoin="round" />
      <g style={{ stroke: 'var(--ink)' }} strokeWidth="3" strokeLinecap="round">
        <line x1="50" y1="19" x2="50" y2="29" /><line x1="50" y1="71" x2="50" y2="81" />
        <line x1="22" y1="50" x2="32" y2="50" /><line x1="68" y1="50" x2="78" y2="50" />
      </g>
      <path d="M37 43 L50 56 L63 43" fill="none" stroke="url(#rmhp-mark)" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="50" cy="50" r="4" style={{ fill: 'var(--ink)' }} />
    </svg>
  );
}

/** An arrow that flips in RTL (the CSS mirrors `.arw`). */
export function Arrow({ className = 'arw' }: { className?: string }) {
  return <ArrowRight className={className} aria-hidden="true" strokeWidth={1.8} />;
}

/**
 * Decrypt — a string that scrambles through monospace glyphs on mount before
 * settling into its real text. Renders the final text on the server and when
 * reduced motion is requested, so it's accessible and SEO-safe. Use sparingly.
 */
const GLYPHS = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789/#%<>*·';
export function Decrypt({ text, className }: { text: string; className?: string }) {
  const [out, setOut] = useState(text);
  useEffect(() => {
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

/* ── headline and page primitives ────────────────────────────────────────── */

/**
 * A headline whose words rise out of masks, one after another, on load.
 * Pass the translated string; it stays ordinary text for a screen reader.
 * `delay` (seconds) is when the first word starts, `start` offsets the stagger
 * so several `Words` in one heading continue each other, and `steel` lists the
 * word indices set in chrome lettering (use for ONE emphasised word).
 */
export function Words({
  text,
  delay,
  start = 0,
  steel,
}: {
  text: string;
  delay?: number;
  start?: number;
  steel?: number[];
}) {
  const words = text.split(' ');
  return (
    <span className="words" style={delay === undefined ? undefined : cssVars({ '--d': `${delay}s` })}>
      {words.map((word, i) => (
        <span key={i}>
          <span className="w">
            <span className={steel?.includes(i) ? 'steel' : undefined} style={cssVars({ '--i': start + i })}>
              {word}
            </span>
          </span>
          {i < words.length - 1 ? ' ' : null}
        </span>
      ))}
    </span>
  );
}

/** File / Class / Status line. Labels are translated, values print as written. */
export function MetaLine({
  file,
  cls,
  status,
  decrypt = true,
}: {
  file: string;
  cls: string;
  status: string;
  decrypt?: boolean;
}) {
  const { t } = useTranslation('c-rmh-pmc');
  const v = (s: string) => (decrypt ? <Decrypt text={s} /> : s);
  return (
    <div className="metaline">
      <span className="field">
        <b>{t('meta-file-label', { defaultValue: 'File' })}</b> ▸ <span className="v">{v(file)}</span>
      </span>
      <span className="field">
        <b>{t('meta-class-label', { defaultValue: 'Class' })}</b> ▸ <span className="v">{v(cls)}</span>
      </span>
      <span className="field">
        <b>{t('meta-status-label', { defaultValue: 'Status' })}</b> ▸ <span className="v">{v(status)}</span>
      </span>
    </div>
  );
}

/**
 * The signature instrument: three counter-rotatable rings, tick marks, a
 * crosshair and a ball-bearing hub. Decorative. `size` is any CSS length; rotate
 * the rings from a page sheet with `--rot1`…`--rot4` (or `.rv-lock`).
 */
export function Reticle({
  size,
  className = '',
  style,
  hub = true,
  live = false,
}: {
  size?: string | number;
  className?: string;
  style?: CSSProperties;
  hub?: boolean;
  /** Let the pointer move the reflection (`data-chrome-live`). */
  live?: boolean;
}) {
  return (
    <div
      className={`obj-reticle ${className}`.trim()}
      style={size === undefined ? style : cssVars({ '--size': typeof size === 'number' ? `${size}px` : size }, style)}
      data-chrome-live={live ? '' : undefined}
      aria-hidden="true"
    >
      <span className="rt-ring rt-r1" />
      <span className="rt-ticks" />
      <span className="rt-ring rt-r2" />
      <span className="rt-ring rt-r3" />
      <span className="rt-cross" />
      {hub ? <span className="rt-hub" /> : null}
    </div>
  );
}

/**
 * The heads-up-display frame of a stage: corner crosshairs, a ranging scale and
 * four glass telemetry readouts (bearing, range, grid, step). Decoration, so
 * `aria-hidden`; the values are CSS counters driven by `--p`. Pass `steps` in a
 * scene to show the live step; without it the fourth readout shows elevation.
 */
export function Hud({ steps, cross = false }: { steps?: number; cross?: boolean }) {
  const { t } = useTranslation('c-rmh-pmc');
  return (
    <div className="hud" aria-hidden="true">
      <i className="hud-tick tl" />
      <i className="hud-tick tr" />
      <i className="hud-tick bl" />
      <i className="hud-tick br" />
      {cross ? <i className="hud-cross" /> : null}
      <i className="hud-scale" />
      <span className="hud-readout glass glass--pill tl">
        <b>{t('hud-brg', { defaultValue: 'BRG' })}</b>
        <i className="hud-v hud-v--3" style={cssVars({ '--mul': 312, '--add': 24 })} />°
      </span>
      <span className="hud-readout glass glass--pill tr">
        <b>{t('hud-rng', { defaultValue: 'RNG' })}</b>
        <i className="hud-v" style={cssVars({ '--mul': 3600, '--add': 1200 })} /> m
      </span>
      <span className="hud-readout glass glass--pill bl">
        <b>{t('hud-grid', { defaultValue: 'GRID' })}</b>
        <i className="hud-v hud-v--3" style={cssVars({ '--mul': 87, '--add': 410 })} />
      </span>
      <span className="hud-readout glass glass--pill br">
        {steps ? (
          <>
            <b>{t('hud-step', { defaultValue: 'STEP' })}</b>
            <i className="hud-v hud-v--step" />/{String(steps).padStart(2, '0')}
          </>
        ) : (
          <>
            <b>{t('hud-elev', { defaultValue: 'ELEV' })}</b>
            <i className="hud-v" style={cssVars({ '--mul': 44, '--add': 3 })} />°
          </>
        )}
      </span>
    </div>
  );
}

/* ── scenes ──────────────────────────────────────────────────────────────── */

/** Spacing `s` of n steps over the pinned span, and the fade window `w` (= 4s/3). */
export function sceneGeometry(n: number) {
  const s = 100 / (n + 1 / 3);
  return { s, w: (s * 4) / 3, w2: (s * 2) / 3 };
}
const r2 = (x: number) => Math.round(x * 100) / 100;
/** `--a`/`--b` (percent of the pin) for step `i` of `n`. */
export function stepWindow(i: number, n: number) {
  const { s, w } = sceneGeometry(n);
  return { a: r2(i * s), b: r2(i * s + w) };
}

/**
 * A pinned scene. `len` is the scroll length in viewports, `steps` the number of
 * steps (it feeds the HUD step readout and the step windows). Add `stage` to the
 * className to play it on the dark stage. `pinClassName` styles the sticky frame.
 */
export function Scene({
  len,
  steps = 1,
  className = '',
  pinClassName = '',
  id,
  children,
  ...rest
}: {
  len: number;
  steps?: number;
  className?: string;
  pinClassName?: string;
  id?: string;
  children: ReactNode;
} & Omit<HTMLAttributes<HTMLElement>, 'className' | 'children' | 'id'>) {
  const g = sceneGeometry(steps);
  return (
    <section
      id={id}
      className={`scene ${className}`.trim()}
      style={cssVars({ '--len': len, '--n': steps, '--s': r2(g.s), '--w2': r2(g.w2) })}
      {...rest}
    >
      <div className={`scene-pin ${pinClassName}`.trim()}>{children}</div>
    </section>
  );
}

/** One step of a scene (`.sc-step`, marked `data-step` for keyboard focus). */
export function Step({
  index,
  count,
  className = '',
  children,
  ...rest
}: {
  index: number;
  count: number;
  className?: string;
  children: ReactNode;
} & Omit<HTMLAttributes<HTMLDivElement>, 'className' | 'children'>) {
  const { a, b } = stepWindow(index, count);
  const pos = index === 0 ? ' is-first' : index === count - 1 ? ' is-last' : '';
  return (
    <div className={`sc-step${pos} ${className}`.trim()} data-step="" style={cssVars({ '--a': a, '--b': b })} {...rest}>
      {children}
    </div>
  );
}

/** Progress dots: one per step, lit while that step is live. */
export function SceneDots({ count, className = '' }: { count: number; className?: string }) {
  return (
    <div className={`scene-dots ${className}`.trim()} aria-hidden="true">
      {Array.from({ length: count }, (_, i) => {
        const { a, b } = stepWindow(i, count);
        const pos = i === 0 ? ' is-first' : i === count - 1 ? ' is-last' : '';
        return <i key={i} className={`sc-dot${pos}`} style={cssVars({ '--a': a, '--b': b })} />;
      })}
    </div>
  );
}

/* ── page structure ──────────────────────────────────────────────────────── */

/**
 * The stage that opens every interior page: meta line, designator, a heavy
 * centred headline, a lede, then `children` (actions). `object` replaces the
 * default reticle rising from the foot of the stage.
 */
export function PageHead({
  file,
  cls,
  status,
  desig,
  title,
  lede,
  children,
  object,
}: {
  file?: string;
  cls?: string;
  status?: string;
  desig?: string;
  title: string;
  lede?: string;
  children?: ReactNode;
  object?: ReactNode;
}) {
  return (
    <section className="pagehead stage">
      <Hud />
      <div className="pagehead-obj" aria-hidden="true">
        {object ?? <Reticle size="min(150vw, 1000px)" style={{ translate: '0 62%' }} />}
      </div>
      <div className="wrap">
        {file && cls && status ? <MetaLine file={file} cls={cls} status={status} /> : null}
        {desig ? <span className="desig">{desig}</span> : null}
        <h1 className="display">
          <Words text={title} />
        </h1>
        {lede ? <p className="lede ld">{lede}</p> : null}
        {children ? <div className="actions ld" style={cssVars({ '--i': 1 })}>{children}</div> : null}
      </div>
    </section>
  );
}

/** A centred section header: designator, h2, optional lede. `left` hangs it left. */
export function SecHead({
  desig,
  title,
  lede,
  left = false,
  className = '',
}: {
  desig: string;
  title: ReactNode;
  lede?: ReactNode;
  left?: boolean;
  className?: string;
}) {
  return (
    <header className={`sechead${left ? ' sechead--left' : ''} ${className}`.trim()}>
      <span className="desig">{desig}</span>
      <h2 className="h2">{title}</h2>
      {lede ? <p className="lede">{lede}</p> : null}
    </header>
  );
}

/**
 * The closing call to action: a stage with the reticle locking on. `children`
 * are the actions (one `.btn`, optionally a `.btn-glass`).
 */
export function CtaBand({
  desig,
  title,
  body,
  children,
}: {
  desig: string;
  title: ReactNode;
  body?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="cta-band stage">
      <Hud />
      <div className="cta-obj rv-lock" aria-hidden="true">
        <Reticle size="clamp(900px, 150vw, 1500px)" hub={false} />
      </div>
      <div className="wrap">
        <span className="desig">{desig}</span>
        <h2 className="h2">{title}</h2>
        {body ? <p className="body">{body}</p> : null}
        <div className="actions">{children}</div>
      </div>
    </section>
  );
}

/* ── the site's chrome ───────────────────────────────────────────────────── */

export function CommandBar() {
  const { t } = useTranslation("c-rmh-pmc");
  const NAV = [
    { to: '/rmh-pmc/command', label: t('nav-command', { defaultValue: 'Command' }) },
    { to: '/rmh-pmc/capabilities', label: t('nav-capabilities', { defaultValue: 'Capabilities' }) },
    { to: '/rmh-pmc/intelligence', label: t('nav-intelligence', { defaultValue: 'Intelligence' }) },
    { to: '/rmh-pmc/operators', label: t('nav-operators', { defaultValue: 'Operators' }) },
    { to: '/rmh-pmc/contact', label: t('nav-contact', { defaultValue: 'Contact' }) },
  ];
  // Shared with RMH Capital's TopNav — see `hooks/useVerticalNav.ts`.
  const { toggleMenu, closeMenu, current } = useVerticalNav({
    rootClass: 'rmhp-root',
    barClass: 'cmdbar',
  });

  return (
    <header className="cmdbar">
      <div className="cmdbar-inner glass glass--pill" data-chrome-live="">
        <div className="cmdbar-left">
          <a className="backlink" href="/" aria-label={t("back-to-rmh-studios", { defaultValue: "Back to RMH Studios" })}>
            <span aria-hidden="true">←</span>
            <span className="backlink-label">RMH Studios</span>
          </a>
          <Link className="brand" to="/rmh-pmc" aria-label={t("rmh-pmc-home", { defaultValue: "RMH PMC home" })}>
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
          <Link className="btn nav-cta" to="/rmh-pmc/contact">
            {t("request-briefing", { defaultValue: "Request a briefing" })}
          </Link>
          <button className="nav-toggle" aria-label={t("open-menu", { defaultValue: "Open menu" })} aria-expanded="false" aria-controls="m-menu" onClick={toggleMenu}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <line x1="4" y1="8" x2="20" y2="8" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="16" x2="20" y2="16" />
            </svg>
          </button>
        </div>
      </div>
      <nav className="mobile-menu glass" id="m-menu" aria-label={t("nav-mobile-label", { defaultValue: "Mobile" })}>
        {NAV.map((item, i) => (
          <Link key={item.to} to={item.to} style={cssVars({ '--i': i })} aria-current={current(item.to)} onClick={closeMenu}>
            {item.label}
          </Link>
        ))}
        <Link className="btn mm-cta" to="/rmh-pmc/contact" onClick={closeMenu}>
          {t("request-briefing", { defaultValue: "Request a briefing" })}
        </Link>
      </nav>
    </header>
  );
}

/** Fixed left document spine — classification, file code, scroll progress (a root scroll timeline in CSS). Decorative. */
export function Gutter() {
  return (
    <aside className="gutter" aria-hidden="true">
      <span className="g-class">Restricted</span>
      <div className="g-tick" />
      <div className="g-prog" />
      <div className="g-tick" />
      <span className="g-code">DOC·RMH-PMC·2026</span>
    </aside>
  );
}

/* Deployment-status transmission log: glass readouts riding a chrome rail. Its
   track travels horizontally with scroll (CSS view timeline); with motion off it
   wraps as a static grid. */
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
      <div className="wrap">
        <div className="transmit-stage">
          <span className="obj-rail transmit-rail" />
          <div className="transmit-tag glass glass--pill">
            <span className="led" /> LIVE
          </div>
          <div className="sx transmit-sx">
            <div className="sx-track transmit-track">
              {rows.map(([k, label, val, hold], i) => (
                <span className="transmit-item glass glass--pill" key={i}>
                  <em className={hold ? 'led hold' : 'led'} />
                  <b>{k}: {label}</b>
                  <i className={hold ? 'hold' : undefined}>{val}</i>
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function SiteFooter() {
  const { t } = useTranslation("c-rmh-pmc");
  return (
    <footer className="footer">
      <div className="wrap">
        <div className="footer-top">
          <div className="footer-brand">
            <Link className="brand" to="/rmh-pmc" aria-label={t("rmh-pmc-home", { defaultValue: "RMH PMC home" })}>
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
          <span className="copy">{t("copyright", { defaultValue: "© 2026 RMH PMC LLC · An RMH Studios company" })}</span>
          <div className="footer-legal">
            <a href="#">{t("footer-vetting", { defaultValue: "Vetting" })}</a>
            <a href="#">{t("footer-compliance", { defaultValue: "Compliance" })}</a>
            <a href="#">{t("footer-rules-of-engagement", { defaultValue: "Rules of Engagement" })}</a>
            <a href="#">{t("footer-accessibility", { defaultValue: "Accessibility" })}</a>
          </div>
          <div className="footer-social">
            <a className="glass glass--pill" href="#" aria-label={t("linkedin", { defaultValue: "LinkedIn" })}>
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM3 9h4v12H3zM9 9h3.8v1.7h.05c.53-1 1.83-2.05 3.77-2.05 4.03 0 4.78 2.65 4.78 6.1V21H21.4v-5.3c0-1.27-.02-2.9-1.77-2.9s-2.04 1.38-2.04 2.8V21H13.8z" /></svg>
            </a>
            <a className="glass glass--pill" href="#" aria-label={t("x", { defaultValue: "X" })}>
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.9 2H22l-7.5 8.6L23 22h-6.8l-5-6.6L5.3 22H2l8-9.2L1.5 2h7l4.5 6zM17 20h1.7L7.1 3.8H5.3z" /></svg>
            </a>
            <a className="glass glass--pill" href="#" aria-label={t("youtube", { defaultValue: "YouTube" })}>
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
