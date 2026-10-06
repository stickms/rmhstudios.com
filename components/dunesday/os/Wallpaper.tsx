'use client';

/**
 * The desktop background. Four wallpapers in the Frutiger Aero / Windows 7
 * spirit — an Aero meadow, the dunes of Arrakis, an aurora night, and
 * "Harmony", the swooshing blue of the Windows 7 default — each built from
 * depth layers that drift against the cursor (or a finger on a touch screen),
 * so the desktop feels like glass with sky behind it.
 *
 * The parallax writes `transform` on four layer elements at most once a
 * frame (`rafThrottle`) and only when the pointer actually moved. Under
 * reduced motion it never starts. As the marathon progresses the sun sinks
 * west and the sky warms toward sunset.
 */

import { useEffect, useRef } from 'react';
import { prefersReducedMotion } from '@/hooks/useReducedMotion';
import { rafThrottle } from './frame';
import type { Wallpaper as WallpaperId } from './store';

export function Wallpaper({
  variant,
  progress,
  night,
}: {
  variant: WallpaperId;
  progress: number;
  night: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  const p = Math.max(0, Math.min(1, progress));

  useEffect(() => {
    const el = root.current;
    if (!el || prefersReducedMotion()) return;
    const layers = [...el.querySelectorAll<HTMLElement>('[data-depth]')].map((node) => ({
      node,
      depth: Number(node.dataset.depth) || 0,
    }));
    let nx = 0;
    let ny = 0;
    const apply = rafThrottle(() => {
      for (const l of layers) {
        l.node.style.transform = `translate3d(${(-nx * l.depth * 26).toFixed(1)}px, ${(-ny * l.depth * 16).toFixed(1)}px, 0)`;
      }
    });
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' && e.buttons === 0) return;
      nx = (e.clientX / window.innerWidth - 0.5) * 2;
      ny = (e.clientY / window.innerHeight - 0.5) * 2;
      apply.schedule();
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      apply.cancel();
    };
  }, []);

  const v = night && variant === 'meadow' ? 'aurora' : variant;

  return (
    <div ref={root} className={`ds-wall ds-wall--${v}`} aria-hidden="true">
      <div className="ds-wall-sky" />
      <div className="ds-wall-layer" data-depth="0.15">
        <div className="ds-wall-stars" />
        <div className="ds-wall-aurora" />
        <div
          className="ds-wall-sunset"
          style={{ opacity: v === 'aurora' || v === 'harmony' ? 0 : p * 0.6 }}
        />
        <div className="ds-wall-sun" style={{ right: `${10 + p * 62}%`, top: `${6 + p * 34}%` }} />
        <div
          className="ds-wall-flare"
          style={{ top: '30%', right: '30%', width: '9vmin', height: '9vmin' }}
        />
        <div
          className="ds-wall-flare"
          style={{ top: '46%', right: '46%', width: '4vmin', height: '4vmin' }}
        />
      </div>
      <div className="ds-wall-layer" data-depth="0.35">
        <svg className="ds-wall-swoosh" viewBox="0 0 1440 900" preserveAspectRatio="none">
          <defs>
            <linearGradient id="ds-wall-sw" x1="0" x2="1">
              <stop offset="0" stopColor="#fff" stopOpacity="0" />
              <stop offset="0.5" stopColor="#fff" stopOpacity="0.6" />
              <stop offset="1" stopColor="#fff" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            d="M-100 560 C 300 380 720 700 1100 450 S 1500 340 1600 380"
            stroke="url(#ds-wall-sw)"
            strokeWidth="40"
            fill="none"
          />
          <path
            d="M-100 620 C 340 460 760 740 1150 500 S 1500 420 1600 450"
            stroke="url(#ds-wall-sw)"
            strokeWidth="10"
            fill="none"
          />
          <path
            d="M-100 500 C 260 400 640 580 1040 400 S 1480 300 1600 320"
            stroke="url(#ds-wall-sw)"
            strokeWidth="4"
            fill="none"
          />
        </svg>
        <div className="ds-wall-cloud" style={{ top: '10%', left: '-6%' }} />
        <div className="ds-wall-cloud" style={{ top: '24%', left: '46%', scale: '0.7' }} />
      </div>
      <div className="ds-wall-layer" data-depth="0.6">
        <span className="ds-butterfly ds-butterfly--1">
          <span />
        </span>
        <span className="ds-butterfly ds-butterfly--2">
          <span />
        </span>
        {[
          ['14%', '18%', 0],
          ['9%', '41%', 1.1],
          ['22%', '72%', 2.3],
          ['31%', '9%', 0.6],
          ['17%', '86%', 1.7],
        ].map(([top, left, d]) => (
          <span
            key={String(left)}
            className="ds-sparkle"
            style={{ top: String(top), left: String(left), animationDelay: `${d}s` }}
          />
        ))}
      </div>
      <div className="ds-wall-layer ds-wall-ground" data-depth="1">
        {v === 'arrakis' ? (
          <svg viewBox="0 0 1440 400" preserveAspectRatio="none">
            <path
              d="M0 230 Q 180 150 360 220 T 720 200 T 1080 190 T 1440 210 L1440 400 L0 400 Z"
              fill="#e0a95a"
            />
            <path
              d="M1040 205 C 1050 120 1110 90 1150 120 C 1135 125 1120 140 1112 170 C 1105 190 1100 200 1098 210 Z"
              fill="#a86b25"
              opacity="0.8"
            />
            <path
              d="M0 300 Q 240 230 520 290 T 1000 280 T 1440 300 L1440 400 L0 400 Z"
              fill="#c98b37"
            />
          </svg>
        ) : v === 'harmony' ? (
          <svg viewBox="0 0 1440 400" preserveAspectRatio="none">
            <path
              d="M0 260 C 400 160 900 340 1440 180 L1440 400 L0 400 Z"
              fill="#0a3a7a"
              opacity="0.6"
            />
            <path
              d="M0 320 C 500 230 900 380 1440 260 L1440 400 L0 400 Z"
              fill="#06244f"
              opacity="0.8"
            />
          </svg>
        ) : (
          <svg viewBox="0 0 1440 400" preserveAspectRatio="none">
            <defs>
              <linearGradient id="ds-wall-hill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor={v === 'aurora' ? '#2f8a64' : '#6fd04a'} />
                <stop offset="1" stopColor={v === 'aurora' ? '#145a44' : '#2f9a2a'} />
              </linearGradient>
              <linearGradient id="ds-wall-shine" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor="#fff" stopOpacity="0.5" />
                <stop offset="0.25" stopColor="#fff" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path
              d="M0 210 C 220 120 420 150 620 190 S 1040 120 1240 160 S 1440 170 1440 170 L1440 400 L0 400 Z"
              fill="url(#ds-wall-hill)"
              opacity="0.8"
            />
            <path
              d="M0 290 C 260 200 520 220 760 270 S 1180 220 1440 250 L1440 400 L0 400 Z"
              fill="url(#ds-wall-hill)"
            />
            <path
              d="M0 290 C 260 200 520 220 760 270 S 1180 220 1440 250 L1440 400 L0 400 Z"
              fill="url(#ds-wall-shine)"
            />
          </svg>
        )}
      </div>
    </div>
  );
}
