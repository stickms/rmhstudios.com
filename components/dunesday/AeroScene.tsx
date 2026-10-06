'use client';

/**
 * The fixed backdrop: sky, sun and lens flare, drifting clouds, rising bubbles,
 * an Aero meadow that sinks as you scroll and the dunes of Arrakis that rise to
 * replace it. Purely decorative (`aria-hidden`), and paint-only — the parallax
 * is a CSS scroll timeline (see dunesday.css).
 *
 * Browsers without scroll timelines get a passive scroll listener that writes
 * `transform` on five layer elements — never a custom property on <html>, and
 * no animation-frame loop: it runs only when the page actually scrolls.
 */

import { useEffect, useRef } from 'react';
import { useReducedMotion } from '@/hooks/useReducedMotion';

const BUBBLES = [
  { left: '3%', size: 54, dur: 30, delay: -16 },
  { left: '31%', size: 60, dur: 34, delay: -25 },
  { left: '73%', size: 22, dur: 15, delay: -1 },
  { left: '6%', size: 26, dur: 19, delay: -2 },
  { left: '14%', size: 14, dur: 15, delay: -9 },
  { left: '23%', size: 40, dur: 24, delay: -14 },
  { left: '37%', size: 18, dur: 17, delay: -5 },
  { left: '48%', size: 30, dur: 22, delay: -18 },
  { left: '59%', size: 12, dur: 14, delay: -3 },
  { left: '68%', size: 36, dur: 26, delay: -11 },
  { left: '79%', size: 20, dur: 18, delay: -7 },
  { left: '88%', size: 44, dur: 28, delay: -20 },
  { left: '95%', size: 16, dur: 16, delay: -12 },
];

/** How far each layer travels (as a fraction of viewport height) over the full scroll. */
const FALLBACK = [
  { cls: 'ds-par-1', y: -0.06 },
  { cls: 'ds-par-2', y: -0.16 },
  { cls: 'ds-par-3', y: -0.3 },
  { cls: 'ds-par-hills', y: 0.4 },
  { cls: 'ds-par-dunes', y: 0 },
];

const SPARKLES = [
  { top: '14%', left: '18%', d: 0 },
  { top: '9%', left: '41%', d: 1.1 },
  { top: '22%', left: '72%', d: 2.3 },
  { top: '31%', left: '9%', d: 0.6 },
  { top: '17%', left: '86%', d: 1.7 },
  { top: '36%', left: '57%', d: 2.9 },
];

/**
 * @param progress 0–1 share of the marathon watched. The sun travels west and
 * the sky warms toward a desert sunset as it grows — it is re-rendered only
 * when the number changes, never per frame.
 */
export function AeroScene({ progress = 0 }: { progress?: number }) {
  const p = Math.max(0, Math.min(1, progress));
  const root = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) return;
    if (typeof CSS !== 'undefined' && CSS.supports?.('animation-timeline: scroll()')) return;
    const el = root.current;
    if (!el) return;
    const layers = FALLBACK.map((f) => ({
      ...f,
      node: el.querySelector<HTMLElement>(`.${f.cls}`),
    }));
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const p = max > 0 ? Math.min(1, window.scrollY / max) : 0;
      const vh = window.innerHeight;
      for (const layer of layers) {
        if (!layer.node) continue;
        if (layer.cls === 'ds-par-dunes') {
          layer.node.style.transform = `translate3d(0, ${(1 - p) * 0.3 * vh}px, 0)`;
          layer.node.style.opacity = String(p);
        } else {
          layer.node.style.transform = `translate3d(0, ${layer.y * p * vh}px, 0)`;
          if (layer.cls === 'ds-par-hills') layer.node.style.opacity = String(1 - p);
        }
      }
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [reduced]);

  return (
    <div ref={root} className="ds-scene" aria-hidden="true">
      <div className="ds-layer ds-par-1">
        <div className="ds-stars" />
        <div className="ds-aurora" />
        <div className="ds-sunset" style={{ opacity: p * 0.6 }} />
        <svg className="ds-swoosh" viewBox="0 0 1440 600" preserveAspectRatio="none">
          <defs>
            <linearGradient id="ds-swoosh-a" x1="0" x2="1">
              <stop offset="0" stopColor="#ffffff" stopOpacity="0" />
              <stop offset="0.5" stopColor="#ffffff" stopOpacity="0.55" />
              <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            className="ds-swoosh-1"
            d="M-100 420 C 300 260 700 520 1100 330 S 1500 250 1600 280"
            stroke="url(#ds-swoosh-a)"
            strokeWidth="26"
            fill="none"
          />
          <path
            className="ds-swoosh-2"
            d="M-100 470 C 350 330 760 560 1150 380 S 1500 330 1600 350"
            stroke="url(#ds-swoosh-a)"
            strokeWidth="8"
            fill="none"
          />
          <path
            className="ds-swoosh-3"
            d="M-100 380 C 260 300 640 440 1040 300 S 1480 220 1600 240"
            stroke="url(#ds-swoosh-a)"
            strokeWidth="3"
            fill="none"
          />
        </svg>
        {SPARKLES.map((sp) => (
          <span
            key={sp.left}
            className="ds-sparkle"
            style={{ top: sp.top, left: sp.left, animationDelay: `${sp.d}s` }}
          />
        ))}
        <div className="ds-sun" style={{ right: `${10 + p * 62}%`, top: `${6 + p * 34}%` }} />
        <div
          className="ds-flare"
          style={{ top: '30%', right: '30%', width: '9vmin', height: '9vmin' }}
        />
        <div
          className="ds-flare"
          style={{ top: '42%', right: '42%', width: '4vmin', height: '4vmin' }}
        />
        <div
          className="ds-flare"
          style={{ top: '55%', right: '55%', width: '14vmin', height: '14vmin', opacity: 0.6 }}
        />
      </div>
      <div className="ds-layer ds-par-2">
        <div className="ds-cloud ds-cloud--drift" style={{ top: '12%', left: '-6%' }} />
        <div
          className="ds-cloud ds-cloud--drift"
          style={{ top: '26%', left: '48%', transform: 'scale(0.7)' }}
        />
        <div
          className="ds-cloud"
          style={{ top: '6%', left: '62%', transform: 'scale(0.55)', opacity: 0.8 }}
        />
      </div>
      <div className="ds-layer ds-par-2 ds-butterflies">
        <span className="ds-butterfly ds-butterfly--1">
          <span />
        </span>
        <span className="ds-butterfly ds-butterfly--2">
          <span />
        </span>
      </div>
      <div className="ds-layer ds-par-3">
        {BUBBLES.map((b) => (
          <span
            key={b.left}
            className="ds-bubble"
            style={{
              left: b.left,
              width: b.size,
              height: b.size,
              animationDuration: `${b.dur}s`,
              animationDelay: `${b.delay}s`,
            }}
          />
        ))}
      </div>
      <div className="ds-hills ds-par-hills">
        <svg viewBox="0 0 1440 400" preserveAspectRatio="none">
          <defs>
            <linearGradient id="ds-hill-back" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="var(--ds-grass)" stopOpacity="0.75" />
              <stop offset="1" stopColor="var(--ds-grass-deep)" stopOpacity="0.85" />
            </linearGradient>
            <linearGradient id="ds-hill-front" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="var(--ds-grass)" />
              <stop offset="1" stopColor="var(--ds-grass-deep)" />
            </linearGradient>
            <linearGradient id="ds-hill-shine" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="#ffffff" stopOpacity="0.55" />
              <stop offset="0.25" stopColor="#ffffff" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            d="M0 210 C 220 120 420 150 620 190 S 1040 120 1240 160 S 1440 170 1440 170 L1440 400 L0 400 Z"
            fill="url(#ds-hill-back)"
          />
          <path
            d="M0 290 C 260 200 520 220 760 270 S 1180 220 1440 250 L1440 400 L0 400 Z"
            fill="url(#ds-hill-front)"
          />
          <path
            d="M0 290 C 260 200 520 220 760 270 S 1180 220 1440 250 L1440 400 L0 400 Z"
            fill="url(#ds-hill-shine)"
          />
        </svg>
      </div>
      <div className="ds-dunes ds-par-dunes">
        <svg viewBox="0 0 1440 400" preserveAspectRatio="none">
          <defs>
            <linearGradient id="ds-dune-back" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="var(--ds-sand)" stopOpacity="0.8" />
              <stop offset="1" stopColor="var(--ds-sand-deep)" />
            </linearGradient>
            <linearGradient id="ds-dune-front" x1="0" x2="1" y1="0" y2="1">
              <stop offset="0" stopColor="var(--ds-sand)" />
              <stop offset="1" stopColor="var(--ds-sand-deep)" />
            </linearGradient>
          </defs>
          <path
            d="M0 230 Q 180 150 360 220 T 720 200 T 1080 190 T 1440 210 L1440 400 L0 400 Z"
            fill="url(#ds-dune-back)"
          />
          {/* A sandworm breaching the far ridge. */}
          <path
            d="M1040 205 C 1050 120 1110 90 1150 120 C 1135 125 1120 140 1112 170 C 1105 190 1100 200 1098 210 Z"
            fill="var(--ds-sand-deep)"
            opacity="0.75"
          />
          <path
            d="M0 300 Q 240 230 520 290 T 1000 280 T 1440 300 L1440 400 L0 400 Z"
            fill="url(#ds-dune-front)"
          />
        </svg>
      </div>
    </div>
  );
}
