/**
 * The sanctum — the temple you tap.
 *
 * Drawn as one inline SVG rather than a 3D scene: it scales to any viewport
 * without a camera, costs nothing on a phone, and the whole thing is one
 * `<button>` with a real accessible name. The atmosphere (halo, flames,
 * incense, click bursts) is CSS on top, so it all stops correctly under
 * reduced motion instead of needing a parallel code path.
 */
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTempleStore } from '@/lib/temple-of-joy/store';
import { fmt } from '@/lib/temple-of-joy/numbers';
import { templeAudio } from '@/lib/temple-of-joy/audio';
import { useRitualActive, useTempleSnapshot } from './hooks';
import { TempleButton, Glyph } from './ui';

/** A "+N" floating up from where the player tapped. */
interface Burst {
  id: number;
  x: number;
  y: number;
  amount: string;
}

/** Bursts on screen at once. Beyond this a fast clicker is just making litter. */
const MAX_BURSTS = 12;
/** Ambient incense motes. Few enough that a low-end phone doesn't notice. */
const INCENSE_COUNT = 7;

export function TempleSanctum() {
  const { t } = useTranslation('c-temple-of-joy');
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [bursts, setBursts] = useState<Burst[]>([]);
  const burstId = useRef(0);
  const ritual = useRitualActive();

  const rites = useTempleSnapshot(
    (s) => ({
      pilgrimageActive: s.pilgrimageActive,
      pilgrimageTimer: Math.ceil(s.pilgrimageTimer),
      pilgrimageCooldown: Math.ceil(s.pilgrimageCooldown),
      ritualCooldown: Math.ceil(s.ritualCooldown),
      canTranscend: s.getCanTranscend(),
    }),
    300,
  );

  const tap = useCallback((clientX: number, clientY: number) => {
    const store = useTempleStore.getState();
    const gain = store.getHPC();
    store.click();
    templeAudio.playClick();

    const surface = surfaceRef.current;
    if (!surface) return;
    const box = surface.getBoundingClientRect();

    setBursts((current) => {
      const next = [
        ...current,
        {
          id: ++burstId.current,
          x: clientX - box.left,
          y: clientY - box.top,
          amount: `+${fmt(gain, store.numberFormat)}`,
        },
      ];
      return next.length > MAX_BURSTS ? next.slice(-MAX_BURSTS) : next;
    });
  }, []);

  // Bursts are removed on a single sweep rather than a timer each, so a
  // hundred taps a second don't queue a hundred timeouts.
  useEffect(() => {
    if (bursts.length === 0) return;
    const id = window.setTimeout(() => {
      setBursts((current) => current.slice(1));
    }, 1000);
    return () => window.clearTimeout(id);
  }, [bursts]);

  const onPointer = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      // Only primary presses; a right-click or a stylus barrel button
      // shouldn't count as an offering.
      if (event.button !== 0) return;
      tap(event.clientX, event.clientY);
    },
    [tap],
  );

  const onKey = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      // Keyboard taps have no coordinates — burst from the centre of the mark.
      const box = event.currentTarget.getBoundingClientRect();
      tap(box.left + box.width / 2, box.top + box.height / 3);
    },
    [tap],
  );

  return (
    <div className="toj-sanctum" ref={surfaceRef} data-ritual={ritual ? 'true' : undefined}>
      <Incense />

      <button
        type="button"
        className="toj-temple"
        onPointerDown={onPointer}
        onKeyDown={onKey}
        aria-label={t('offer-joy', { defaultValue: 'Offer joy at the temple' })}
      >
        <TempleMark />
      </button>

      {bursts.map((burst) => (
        <span
          key={burst.id}
          className="toj-burst"
          style={{ left: burst.x, top: burst.y }}
          aria-hidden
        >
          {burst.amount}
        </span>
      ))}

      <div className="toj-rites">
        {rites.pilgrimageActive && (
          <p className="toj-rite-note">
            <Glyph>🕯️</Glyph>{' '}
            {t('pilgrimage-running', {
              seconds: rites.pilgrimageTimer,
              defaultValue: 'Pilgrimage · {{seconds}}s',
            })}
          </p>
        )}

        {!rites.pilgrimageActive && rites.ritualCooldown > 0 && (
          <p className="toj-rite-note">
            <Glyph>✨</Glyph>{' '}
            {t('ritual-running', {
              seconds: rites.ritualCooldown,
              defaultValue: 'Ritual · {{seconds}}s',
            })}
          </p>
        )}

        {!rites.pilgrimageActive && (
          <TempleButton
            variant="gold"
            ready={rites.pilgrimageCooldown === 0}
            disabled={rites.pilgrimageCooldown > 0}
            onClick={() => useTempleStore.getState().triggerPilgrimage()}
          >
            <Glyph>🕯️</Glyph>
            {rites.pilgrimageCooldown > 0
              ? t('pilgrimage-cooldown', {
                  seconds: rites.pilgrimageCooldown,
                  defaultValue: 'Pilgrimage in {{seconds}}s',
                })
              : t('make-pilgrimage', { defaultValue: 'Make pilgrimage' })}
          </TempleButton>
        )}

        {rites.canTranscend && (
          <TempleButton
            variant="stone"
            onClick={() => useTempleStore.getState().setShowTranscendenceModal(true)}
          >
            <Glyph>🌀</Glyph>
            {t('transcend', { defaultValue: 'Transcend' })}
          </TempleButton>
        )}
      </div>
    </div>
  );
}

/* ─── Ambience ──────────────────────────────────────────────────────────── */

/**
 * Incense motes. Their offsets are fixed per index rather than random so that
 * server and client render the same markup — a random inline style is a
 * hydration mismatch waiting to happen.
 */
function Incense() {
  return (
    <>
      {Array.from({ length: INCENSE_COUNT }, (_, i) => (
        <span
          key={i}
          className="toj-incense"
          aria-hidden
          style={
            {
              left: `${18 + i * 11}%`,
              animationDelay: `${i * 1.6}s`,
              animationDuration: `${9 + (i % 4) * 1.7}s`,
              '--toj-drift-x': `${(i % 2 ? 1 : -1) * (12 + i * 5)}px`,
            } as React.CSSProperties
          }
        />
      ))}
    </>
  );
}

/* ─── The mark ──────────────────────────────────────────────────────────── */

/**
 * The temple facade: steps, columns, entablature, a stepped roof, a sun disc
 * behind it, and four candles on the steps. Pure geometry so it stays crisp at
 * any size, and every fill is a token so the dawn theme re-lights it.
 */
function TempleMark() {
  return (
    <svg viewBox="0 0 200 200" role="presentation" focusable="false">
      <defs>
        <linearGradient id="toj-stone-face" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--toj-gold)" stopOpacity="0.95" />
          <stop offset="100%" stopColor="var(--toj-gold-deep)" stopOpacity="0.8" />
        </linearGradient>
        <linearGradient id="toj-stone-side" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--toj-gold-deep)" stopOpacity="0.85" />
          <stop offset="100%" stopColor="var(--toj-gold-deep)" stopOpacity="0.45" />
        </linearGradient>
        <radialGradient id="toj-sun" cx="50%" cy="50%">
          <stop offset="0%" stopColor="var(--toj-gold-bright)" stopOpacity="0.55" />
          <stop offset="60%" stopColor="var(--toj-gold)" stopOpacity="0.14" />
          <stop offset="100%" stopColor="var(--toj-gold)" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="toj-doorway" cx="50%" cy="20%">
          <stop offset="0%" stopColor="var(--toj-gold-bright)" stopOpacity="0.9" />
          <stop offset="100%" stopColor="var(--toj-ember)" stopOpacity="0.25" />
        </radialGradient>
      </defs>

      {/* The sun the temple is built to face. */}
      <circle cx="100" cy="72" r="62" fill="url(#toj-sun)" />
      <circle
        cx="100"
        cy="72"
        r="30"
        fill="none"
        stroke="var(--toj-gold-bright)"
        strokeOpacity="0.32"
        strokeWidth="1"
      />

      {/* Stepped roof. */}
      <path d="M100 28 L156 62 H44 Z" fill="url(#toj-stone-face)" />
      <rect x="48" y="62" width="104" height="9" rx="2" fill="url(#toj-stone-face)" />
      <rect x="42" y="71" width="116" height="7" rx="2" fill="url(#toj-stone-side)" />

      {/* Columns. */}
      {[52, 72, 92, 112, 132].map((x) => (
        <g key={x}>
          <rect x={x} y="78" width="12" height="60" rx="2.5" fill="url(#toj-stone-face)" />
          <rect x={x + 4} y="78" width="2" height="60" fill="var(--toj-gold-deep)" opacity="0.4" />
        </g>
      ))}

      {/* Doorway: the light inside. */}
      <path d="M88 138 V104 a12 12 0 0 1 24 0 v34 Z" fill="url(#toj-doorway)" />

      {/* Steps. */}
      <rect x="38" y="138" width="124" height="8" rx="2" fill="url(#toj-stone-side)" />
      <rect x="30" y="146" width="140" height="8" rx="2" fill="url(#toj-stone-side)" />
      <rect x="22" y="154" width="156" height="9" rx="3" fill="url(#toj-stone-side)" />

      {/* Candles on the bottom step. Each flame animates independently. */}
      {[38, 62, 138, 162].map((x, i) => (
        <g key={x}>
          <rect
            x={x - 2.5}
            y="150"
            width="5"
            height="13"
            rx="1.5"
            fill="var(--toj-ink-soft)"
            opacity="0.75"
          />
          <ellipse
            className="toj-flame"
            cx={x}
            cy="146"
            rx="3"
            ry="5.5"
            fill="var(--toj-gold-bright)"
            // Phase and rate differ per candle; four flames in lockstep read
            // as a strobe rather than as fire.
            style={{ animationDelay: `${-i * 0.63}s`, animationDuration: `${2.1 + i * 0.4}s` }}
          />
          <ellipse cx={x} cy="147.5" rx="1.4" ry="2.6" fill="var(--toj-ember)" opacity="0.9" />
        </g>
      ))}
    </svg>
  );
}
