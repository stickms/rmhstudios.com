/**
 * Temple of Joy — the title screen.
 *
 * The first thing anyone sees after the doors open, and drawn to look like the
 * game's own poster: a sunburst of gold paper, the smiling Veracruz figure cut
 * out like a sticker and standing on a stack of coins inside its rings, smileys
 * drifting about, and a ticket — ADMIT ONE — that is also the menu. Every layer
 * is DOM, CSS or SVG over two images (the logo and the cut-out figure), and every
 * moving part is transform or opacity only.
 *
 * What it does is small on purpose:
 *
 * - **Enter the Temple** (or **Continue**, when a save exists) tears the stub
 *   off the ticket and hands over to the game. It starts the game exactly as the
 *   gate always did; the save is the gate's business, not this screen's.
 * - **Quit** is the only way this game links out to the games list.
 *
 * Arrow keys move between the two, Enter selects, Escape jumps to Quit (it does
 * not leave — a stray Escape should never be a goodbye).
 */

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight, LogOut } from 'lucide-react';
import { useQuitGame } from '@/hooks/useQuitGame';
import { fmt, formatDuration } from '@/lib/temple-of-joy/numbers';
import type { SaveData } from '@/lib/temple-of-joy/types';

/** How long the stub takes to leave before the game opens. */
const TEAR_MS = 520;

/** Bar thicknesses for the stub's barcode, top to bottom. Arbitrary, but fixed. */
const BARS = [3, 1, 2, 1, 4, 1, 1, 3, 2, 1, 3, 1, 2, 2, 1, 4, 1, 2, 1, 3, 1, 1, 2, 3, 1, 2, 4, 1, 1, 2];

/** Where the drifting smileys sit on the ground, as a share of the screen. */
const SMILEYS: Array<{ x: number; y: number; size: number; delay: number; dur: number }> = [
  { x: 3, y: 21, size: 2.6, delay: 0, dur: 7.2 },
  { x: 8, y: 58, size: 1.5, delay: -2.4, dur: 6.1 },
  { x: 4, y: 86, size: 1.9, delay: -4.1, dur: 8.3 },
  { x: 24, y: 90, size: 2.4, delay: -1.2, dur: 7.7 },
  { x: 38, y: 3, size: 1.4, delay: -3.3, dur: 6.6 },
  { x: 47, y: 94, size: 1.7, delay: -5.2, dur: 9 },
  { x: 93, y: 30, size: 2.3, delay: -1.9, dur: 7 },
  { x: 96, y: 64, size: 1.6, delay: -3.8, dur: 6.4 },
  { x: 83, y: 92, size: 2.1, delay: -0.6, dur: 8.1 },
];

/** Smileys that ride on the medallion itself, in percent of its box. */
const FIG_SMILEYS: Array<{ x: number; y: number; size: number; delay: number; dur: number }> = [
  { x: 8, y: 14, size: 0.13, delay: -1, dur: 6.8 },
  { x: 86, y: 8, size: 0.1, delay: -3.2, dur: 7.4 },
  { x: 95, y: 58, size: 0.085, delay: -2.1, dur: 6.2 },
  { x: 2, y: 66, size: 0.075, delay: -4.6, dur: 8 },
];

/** Four-point glints on the coins, the crown and the disc. */
const GLINTS: Array<{ x: number; y: number; size: number; delay: number }> = [
  { x: 24, y: 84, size: 0.07, delay: 0 },
  { x: 71, y: 88, size: 0.055, delay: -1.3 },
  { x: 43, y: 80, size: 0.045, delay: -2.1 },
  { x: 36, y: 10, size: 0.06, delay: -0.7 },
  { x: 76, y: 28, size: 0.05, delay: -2.6 },
  { x: 20, y: 40, size: 0.04, delay: -1.8 },
];

function Smiley() {
  return (
    <svg className="toj-menu-smiley" viewBox="0 0 40 40" aria-hidden="true" focusable="false">
      <circle className="toj-menu-smiley-face" cx="20" cy="20" r="17.5" />
      <circle className="toj-menu-smiley-eye" cx="14" cy="16.2" r="2.1" />
      <circle className="toj-menu-smiley-eye" cx="26" cy="16.2" r="2.1" />
      <path className="toj-menu-smiley-mouth" d="M11.5 23.2 Q20 31.8 28.5 23.2" />
    </svg>
  );
}

function Glint() {
  return (
    <svg className="toj-menu-glint-star" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M10 0 C10.8 6 14 9.2 20 10 C14 10.8 10.8 14 10 20 C9.2 14 6 10.8 0 10 C6 9.2 9.2 6 10 0Z" />
    </svg>
  );
}

/** A number that climbs to its value once, writing its own text node. */
function CountUp({ value, format }: { value: number; format: 'named' | 'scientific' }) {
  const ref = useRef<HTMLSpanElement>(null);
  const safe = Number.isFinite(value) ? Math.max(0, value) : 0;

  // A short interval rather than a frame loop: thirty steps over a second is a
  // count a person can follow, and it ends by itself.
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const begin = performance.now() + 650;
    const length = 1200;
    node.textContent = fmt(0, format);
    const timer = window.setInterval(() => {
      const p = Math.min(1, Math.max(0, (performance.now() - begin) / length));
      node.textContent = fmt(safe * (1 - Math.pow(1 - p, 3)), format);
      if (p >= 1) window.clearInterval(timer);
    }, 40);
    return () => window.clearInterval(timer);
  }, [safe, format]);

  return <span ref={ref}>{fmt(safe, format)}</span>;
}

export interface TempleMenuProps {
  /** The save the temple would open with, or `null` for a fresh one. */
  save: SaveData | null;
  /** Open the game. */
  onEnter: () => void;
}

export function TempleMenu({ save, onEnter }: TempleMenuProps) {
  const { t } = useTranslation('c-temple-of-joy');
  const quitGame = useQuitGame();

  const [aim, setAim] = useState<'enter' | 'quit' | null>(null);
  const [phase, setPhase] = useState<'idle' | 'tearing'>('idle');
  const enterRef = useRef<HTMLButtonElement>(null);
  const quitRef = useRef<HTMLButtonElement>(null);
  const timer = useRef(0);

  const played = Boolean(save && (save.lifetimeJoy > 0 || save.totalTouches > 0 || save.playtime > 0));
  const format = save?.numberFormat === 'scientific' ? 'scientific' : 'named';

  useEffect(() => () => window.clearTimeout(timer.current), []);

  // Focus lands on the way in, so Enter alone opens the temple.
  useEffect(() => {
    enterRef.current?.focus({ preventScroll: true });
    // Landing on Enter is the starting selection, not the player reaching for
    // it, so the figure and the stub stay at rest until they actually do.
    setAim(null);
  }, []);

  // Arrows, Home/End and Escape work wherever focus is, including nowhere.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const buttons = [enterRef.current, quitRef.current];
      const at = buttons.findIndex((b) => b && b === document.activeElement);
      let next: number;
      switch (event.key) {
        case 'ArrowDown':
        case 'ArrowRight':
          next = at < 0 ? 0 : Math.min(buttons.length - 1, at + 1);
          break;
        case 'ArrowUp':
        case 'ArrowLeft':
          next = at < 0 ? 0 : Math.max(0, at - 1);
          break;
        case 'Home':
          next = 0;
          break;
        case 'End':
          next = buttons.length - 1;
          break;
        case 'Escape':
          next = buttons.length - 1;
          break;
        default:
          return;
      }
      event.preventDefault();
      buttons[next]?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const enter = () => {
    if (phase !== 'idle') return;
    setPhase('tearing');
    timer.current = window.setTimeout(onEnter, TEAR_MS);
  };

  const enterLabel = played
    ? t('menu-continue', { defaultValue: 'Continue' })
    : t('menu-enter', { defaultValue: 'Enter the Temple' });
  const quitLabel = t('quit', { defaultValue: 'Quit' });

  return (
    <div
      className="toj toj-title"
      data-theme="dawn"
      data-flourish={save?.reducedFlourish ? 'off' : undefined}
      data-no-twemoji
    >
      <div className="toj-menu-ground" aria-hidden="true">
        <div className="toj-menu-burst" />
        <div className="toj-menu-glow" />
        <div className="toj-menu-halftone" />
        <div className="toj-menu-grain" />
        {SMILEYS.map((s, i) => (
          <span
            key={i}
            className="toj-menu-drift"
            style={
              {
                left: `${s.x}%`,
                top: `${s.y}%`,
                width: `${s.size}rem`,
                '--tm-delay': `${s.delay}s`,
                '--tm-dur': `${s.dur}s`,
              } as CSSProperties
            }
          >
            <Smiley />
          </span>
        ))}
      </div>

      <main
        className="toj-menu app-screen"
        data-aim={aim ?? undefined}
        data-phase={phase}
        aria-labelledby="toj-menu-title"
      >
        <div className="toj-menu-wrap">
          <div className="toj-menu-top" aria-hidden="true">
            <span>{t('menu-catalogue', { defaultValue: 'RMH Studios / Catalogue No. 080' })}</span>
            <span className="toj-menu-top-tags">
              {t('menu-tags', { defaultValue: 'Idle · Clicker · Prestige' })}
            </span>
          </div>

          {/* ── The figure ─────────────────────────────────────────────── */}
          <div className="toj-menu-art" aria-hidden="true">
            <svg className="toj-menu-rings" viewBox="0 0 100 100" focusable="false">
              <circle className="toj-menu-ring toj-menu-ring-a" cx="50" cy="46" r="48" />
              <circle className="toj-menu-ring toj-menu-ring-b" cx="50" cy="46" r="44.5" />
              <circle className="toj-menu-ring toj-menu-ring-c" cx="50" cy="46" r="41" />
            </svg>
            <div className="toj-menu-halo" />
            <div className="toj-menu-disc" />

            {FIG_SMILEYS.map((s, i) => (
              <span
                key={i}
                className="toj-menu-drift toj-menu-drift-fig"
                style={
                  {
                    left: `${s.x}%`,
                    top: `${s.y}%`,
                    width: `calc(var(--fig) * ${s.size})`,
                    '--tm-delay': `${s.delay}s`,
                    '--tm-dur': `${s.dur}s`,
                  } as CSSProperties
                }
              >
                <Smiley />
              </span>
            ))}

            <div className="toj-menu-coins">
              <span className="toj-menu-coin toj-menu-coin-lo" />
              <span className="toj-menu-coin toj-menu-coin-hi" />
            </div>

            <div className="toj-menu-figure">
              <div className="toj-menu-figure-bob">
                <img
                  className="toj-menu-figure-img"
                  src="/images/temple-of-joy/figure.webp"
                  alt=""
                  width={720}
                  height={938}
                  draggable={false}
                  decoding="async"
                  fetchPriority="high"
                />
              </div>
            </div>

            {GLINTS.map((g, i) => (
              <span
                key={i}
                className="toj-menu-glint"
                style={
                  {
                    left: `${g.x}%`,
                    top: `${g.y}%`,
                    width: `calc(var(--fig) * ${g.size})`,
                    '--tm-delay': `${g.delay}s`,
                  } as CSSProperties
                }
              >
                <Glint />
              </span>
            ))}

            <svg className="toj-menu-stamp" viewBox="0 0 120 120" focusable="false">
              <defs>
                <path id="toj-stamp-ring" d="M60 60 m-43 0 a43 43 0 1 1 86 0 a43 43 0 1 1 -86 0" />
              </defs>
              <circle className="toj-menu-stamp-line" cx="60" cy="60" r="55" />
              <circle className="toj-menu-stamp-line toj-menu-stamp-inner" cx="60" cy="60" r="33" />
              <text className="toj-menu-stamp-text">
                <textPath href="#toj-stamp-ring" startOffset="0">
                  ADMIT ONE · ADMIT ONE · ADMIT ONE ·
                </textPath>
              </text>
              <circle className="toj-menu-stamp-dot" cx="49" cy="52" r="3" />
              <circle className="toj-menu-stamp-dot" cx="71" cy="52" r="3" />
              <path className="toj-menu-stamp-mouth" d="M46 68 Q60 77 76 66" />
            </svg>
          </div>

          <p className="toj-menu-caption" aria-hidden="true">
            {t('menu-figure-caption', {
              defaultValue: 'Fig. 1 — Smiling figure (Sonriente), Veracruz, 600–1000 CE',
            })}
          </p>

          {/* ── The title and the ticket ───────────────────────────────── */}
          <div className="toj-menu-side">
            <h1 id="toj-menu-title" className="toj-menu-title">
              <img
                className="toj-menu-logo"
                src="/images/games/logos/temple-of-joy.svg"
                alt="Temple of Joy"
                width={1120}
                height={471}
                draggable={false}
                decoding="async"
                fetchPriority="high"
              />
            </h1>
            <p className="toj-menu-tagline">
              {t('menu-tagline', { defaultValue: 'An unreasonable amount of gladness.' })}
            </p>

            <section className="toj-ticket" data-phase={phase}>
              <div className="toj-ticket-main">
                <header className="toj-ticket-head">
                  <span className="toj-ticket-admit">
                    {t('menu-admit', { defaultValue: 'Admit one' })}
                  </span>
                  <span className="toj-ticket-no">
                    {t('menu-ticket-no', { defaultValue: 'No. 080 · Row J' })}
                  </span>
                </header>

                {played && save ? (
                  <dl className="toj-ticket-stats">
                    <div className="toj-ticket-joy">
                      <dt>{t('menu-saved-joy', { defaultValue: 'Saved joy' })}</dt>
                      <dd>
                        <CountUp value={save.joy} format={format} />
                      </dd>
                    </div>
                    <div>
                      <dt>{t('ascensions', { defaultValue: 'Ascensions' })}</dt>
                      <dd>{save.ascensions}</dd>
                    </div>
                    <div>
                      <dt>{t('save-playtime', { defaultValue: 'Time in the temple' })}</dt>
                      <dd>{formatDuration(save.playtime)}</dd>
                    </div>
                  </dl>
                ) : (
                  <p className="toj-ticket-fresh">
                    {t('menu-fresh', { defaultValue: 'A fresh temple is waiting for its first joy.' })}
                  </p>
                )}

                <nav className="toj-menu-nav" aria-label={t('menu-label', { defaultValue: 'Main menu' })}>
                  <button
                    ref={enterRef}
                    type="button"
                    className="toj-menu-btn toj-menu-btn-enter"
                    onClick={enter}
                    onPointerEnter={() => setAim('enter')}
                    onPointerLeave={() => setAim(null)}
                    onFocus={() => setAim('enter')}
                    onBlur={() => setAim(null)}
                  >
                    <span>{enterLabel}</span>
                    <ArrowRight className="toj-menu-btn-icon" aria-hidden="true" />
                  </button>
                  <button
                    ref={quitRef}
                    type="button"
                    className="toj-menu-btn toj-menu-btn-quit"
                    onClick={quitGame}
                    onPointerEnter={() => setAim('quit')}
                    onPointerLeave={() => setAim(null)}
                    onFocus={() => setAim('quit')}
                    onBlur={() => setAim(null)}
                  >
                    <span>{quitLabel}</span>
                    <LogOut className="toj-menu-btn-icon" aria-hidden="true" />
                  </button>
                </nav>

                <p className="toj-ticket-foot" aria-hidden="true">
                  {t('menu-footnote', { defaultValue: 'Gladness is non-refundable' })}
                </p>
              </div>

              <div className="toj-ticket-stub" aria-hidden="true">
                <svg className="toj-ticket-bars" viewBox="0 0 40 100" preserveAspectRatio="none" focusable="false">
                  {BARS.map((h, i) => {
                    const y = BARS.slice(0, i).reduce((sum, b) => sum + b + 1.35, 0);
                    return <rect key={i} x="0" y={y} width="40" height={h * 0.9} />;
                  })}
                </svg>
                <span className="toj-ticket-serial">NO. 000080</span>
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
