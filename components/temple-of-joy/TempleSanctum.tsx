/**
 * The sanctum — the temple you tap, and everything that happens around it.
 *
 * Drawn as one inline SVG rather than a 3D scene: it scales to any viewport
 * without a camera, costs nothing on a phone, and the whole thing is one
 * `<button>` with a real accessible name. The atmosphere — the halo of light,
 * the flames, the motes, the burst on every offering — is CSS on top, so it
 * all stops correctly under reduced motion instead of needing a parallel code
 * path.
 *
 * The halos and the Sinners live here too, because they are things you catch
 * and strike *in the room*, not entries in a list.
 */
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTempleStore } from '@/lib/temple-of-joy/store';
import { fmt, formatDuration } from '@/lib/temple-of-joy/numbers';
import { templeAudio } from '@/lib/temple-of-joy/audio';
import { computeCanAscend } from '@/lib/temple-of-joy/engine';
import { useTempleSnapshot, useTempleValue } from './hooks';
import { TempleButton, Glyph } from './ui';

/** "+N" floating up from where the player tapped. */
interface Burst {
  id: number;
  x: number;
  y: number;
  amount: string;
}

/** Bursts on screen at once. Beyond this a fast clicker is making litter. */
const MAX_BURSTS = 14;
/** Ambient motes. Few enough that a low-end phone does not notice. */
const MOTE_COUNT = 8;

export function TempleSanctum() {
  const { t } = useTranslation('c-temple-of-joy');
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [bursts, setBursts] = useState<Burst[]>([]);
  const [struck, setStruck] = useState(false);
  const burstId = useRef(0);
  const strikeTimer = useRef(0);

  const rapture = useTempleValue((s) => s.rapture);

  /* ── The offering ─────────────────────────────────────────────────────── */

  const tap = useCallback((clientX: number, clientY: number) => {
    const store = useTempleStore.getState();
    const gain = store.getTouch();
    store.touch();
    templeAudio.playClick();

    // The ring on the altar restarts on every tap. Toggling the attribute off
    // and on in the same frame would not re-trigger the animation, so it goes
    // off on a timer just longer than the animation itself.
    setStruck(true);
    window.clearTimeout(strikeTimer.current);
    strikeTimer.current = window.setTimeout(() => setStruck(false), 440);

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

  useEffect(() => () => window.clearTimeout(strikeTimer.current), []);

  // Bursts are removed on a single rolling sweep rather than a timer each, so
  // a hundred taps a second do not queue a hundred timeouts.
  useEffect(() => {
    if (bursts.length === 0) return;
    const id = window.setTimeout(() => setBursts((current) => current.slice(1)), 950);
    return () => window.clearTimeout(id);
  }, [bursts]);

  const onPointer = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      // Only primary presses; a right-click or a stylus barrel button should
      // not count as an offering.
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
    <div className="toj-sanctum" ref={surfaceRef} data-rapture={rapture || undefined}>
      <Motes />
      <Buffs />

      <button
        type="button"
        className="toj-altar"
        data-struck={struck ? 'true' : undefined}
        onPointerDown={onPointer}
        onKeyDown={onKey}
        aria-label={t('offer-joy', { defaultValue: 'Offer joy at the altar' })}
      >
        <AltarMark />
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

      <Halos />
      <Sinners />
      <Rites />
    </div>
  );
}

/* ─── Ambience ──────────────────────────────────────────────────────────── */

/**
 * Motes of light. Their offsets are fixed per index rather than random so that
 * server and client render the same markup — a random inline style is a
 * hydration mismatch waiting to happen.
 */
function Motes() {
  return (
    <>
      {Array.from({ length: MOTE_COUNT }, (_, i) => (
        <span
          key={i}
          className="toj-mote"
          aria-hidden
          style={
            {
              left: `${12 + i * 10}%`,
              animationDelay: `${i * 1.4}s`,
              animationDuration: `${10 + (i % 4) * 1.8}s`,
              '--toj-drift-x': `${(i % 2 ? 1 : -1) * (14 + i * 4)}px`,
            } as React.CSSProperties
          }
        />
      ))}
    </>
  );
}

/** The blessings currently on you, each with its own draining bar. */
function Buffs() {
  const buffs = useTempleSnapshot(
    (s) =>
      s.buffs.map((b) => ({
        id: b.id,
        name: b.name,
        icon: b.icon,
        left: Math.max(0, b.remaining / b.duration),
        seconds: Math.ceil(b.remaining),
        bad: b.jpsMultiplier < 1,
      })),
    200,
  );

  if (buffs.length === 0) return null;

  return (
    <div className="toj-buffs">
      {buffs.map((buff) => (
        <span
          key={buff.id}
          className="toj-buff"
          data-bad={buff.bad ? 'true' : undefined}
          style={{ '--toj-buff-left': buff.left } as React.CSSProperties}
        >
          <Glyph>{buff.icon}</Glyph>
          {buff.name} · {buff.seconds}s
        </span>
      ))}
    </div>
  );
}

/* ─── Halos ─────────────────────────────────────────────────────────────── */

/**
 * The golden-halo layer. Each halo is a real button with a real label, because
 * "click the thing that appeared" should not be a mouse-only mechanic.
 */
function Halos() {
  const { t } = useTranslation('c-temple-of-joy');
  const halos = useTempleSnapshot(
    (s) => s.halos.map((h) => `${h.id}:${h.kind}:${h.x.toFixed(3)}:${h.y.toFixed(3)}`),
    120,
  );

  // A halo appearing is announced, so it can be caught without staring.
  const previous = useRef(0);
  useEffect(() => {
    if (halos.length > previous.current) templeAudio.play('haloAppear');
    else if (halos.length < previous.current) {
      // Either caught (which plays its own, better sound) or missed.
      if (useTempleStore.getState().haloStreak === 0) templeAudio.play('haloMiss');
    }
    previous.current = halos.length;
  }, [halos.length]);

  const glyph: Record<string, string> = { gilded: '🌟', sable: '🌘', seraphic: '😇' };
  const name: Record<string, string> = {
    gilded: t('halo-gilded', { defaultValue: 'A halo of light' }),
    sable: t('halo-sable', { defaultValue: 'A halo of sackcloth' }),
    seraphic: t('halo-seraphic', { defaultValue: 'A seraphic halo' }),
  };

  return (
    <>
      {halos.map((packed) => {
        const [id, kind, x, y] = packed.split(':');
        return (
          <button
            key={id}
            type="button"
            className="toj-halo"
            data-kind={kind}
            style={{ left: `${Number(x) * 100}%`, top: `${Number(y) * 100}%` }}
            aria-label={name[kind!] ?? name.gilded}
            onClick={() => {
              templeAudio.play('halo');
              templeAudio.buzz(12);
              useTempleStore.getState().catchHalo(Number(id));
            }}
          >
            <Glyph>{glyph[kind!] ?? '🌟'}</Glyph>
          </button>
        );
      })}
    </>
  );
}

/* ─── Sinners ───────────────────────────────────────────────────────────── */

/**
 * They ring the altar, each one drinking a share of the rate and holding it.
 * Placed on a circle by angle, so a full house of twelve reads as a ring
 * closing in rather than as a pile.
 */
function Sinners() {
  const { t } = useTranslation('c-temple-of-joy');
  const sinners = useTempleSnapshot(
    (s) =>
      s.sinners.map(
        (sinner) =>
          `${sinner.id}:${sinner.angle.toFixed(0)}:${sinner.arrival.toFixed(2)}:${sinner.penitent ? 1 : 0}:${fmt(
            sinner.swallowed,
            s.numberFormat,
          )}`,
      ),
    350,
  );

  if (sinners.length === 0) return null;

  return (
    <div className="toj-sinners">
      {sinners.map((packed) => {
        const [id, angle, arrival, penitent, held] = packed.split(':');
        // Still arriving? Start further out and drift inward as they latch on.
        const radius = 46 - Number(arrival) * 8;
        const radians = (Number(angle) * Math.PI) / 180;
        const transform = `translate(-50%, -50%) translate(${
          Math.cos(radians) * radius
        }%, ${Math.sin(radians) * radius}%)`;

        return (
          <button
            key={id}
            type="button"
            className="toj-sinner"
            data-penitent={penitent === '1' ? 'true' : undefined}
            style={{
              transform,
              opacity: 0.35 + Number(arrival) * 0.65,
            }}
            aria-label={t('strike-sinner', {
              held,
              defaultValue: 'Strike this Sinner and reclaim {{held}} joy',
            })}
            onClick={() => {
              templeAudio.play('strike');
              templeAudio.buzz(18);
              useTempleStore.getState().strikeSinner(Number(id));
            }}
          >
            <Glyph>{penitent === '1' ? '😇' : '👤'}</Glyph>
          </button>
        );
      })}
    </div>
  );
}

/* ─── Standing actions ──────────────────────────────────────────────────── */

/** The two things you can do from the room rather than from a panel. */
function Rites() {
  const { t } = useTranslation('c-temple-of-joy');
  const state = useTempleSnapshot(
    (s) => ({
      sinners: s.sinners.length,
      canAscend: computeCanAscend(s),
      manna: s.manna.held,
    }),
    400,
  );

  return (
    <div className="toj-rites">
      {state.sinners > 0 && (
        <TempleButton
          variant="plain"
          tone={null}
          onClick={() => {
            templeAudio.play('strike');
            templeAudio.buzz([12, 30, 12]);
            useTempleStore.getState().strikeAllSinners();
          }}
        >
          <Glyph>👤</Glyph>
          {t('strike-all', {
            count: state.sinners,
            defaultValue: 'Strike all {{count}}',
          })}
        </TempleButton>
      )}

      {state.canAscend && (
        <TempleButton
          variant="gold"
          ready
          onClick={() => useTempleStore.getState().setShowAscendDialog(true)}
        >
          <Glyph>☁️</Glyph>
          {t('ascend', { defaultValue: 'Ascend' })}
        </TempleButton>
      )}
    </div>
  );
}

/* ─── The mark ──────────────────────────────────────────────────────────── */

/**
 * The altar: a sun disc, a stepped facade, five columns, a lit doorway, and
 * four flames on the bottom step. Pure geometry so it stays crisp at any size,
 * and every fill is a token so Vespers re-lights the whole thing.
 */
function AltarMark() {
  return (
    <svg viewBox="0 0 200 200" role="presentation" focusable="false">
      <defs>
        <linearGradient id="toj-face" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--toj-gold-bright)" />
          <stop offset="100%" stopColor="var(--toj-gold)" />
        </linearGradient>
        <linearGradient id="toj-side" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--toj-gold)" />
          <stop offset="100%" stopColor="var(--toj-gold-deep)" />
        </linearGradient>
        <radialGradient id="toj-sun" cx="50%" cy="50%">
          <stop offset="0%" stopColor="var(--toj-gold-bright)" stopOpacity="0.5" />
          <stop offset="62%" stopColor="var(--toj-gold)" stopOpacity="0.12" />
          <stop offset="100%" stopColor="var(--toj-gold)" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="toj-doorway" cx="50%" cy="15%">
          <stop offset="0%" stopColor="var(--toj-gold-bright)" />
          <stop offset="100%" stopColor="var(--toj-gold-deep)" stopOpacity="0.5" />
        </radialGradient>
      </defs>

      {/* The light the temple is built to face. */}
      <circle cx="100" cy="70" r="64" fill="url(#toj-sun)" />
      <circle
        cx="100"
        cy="70"
        r="34"
        fill="none"
        stroke="var(--toj-gold)"
        strokeOpacity="0.3"
        strokeWidth="0.75"
      />
      <circle
        cx="100"
        cy="70"
        r="46"
        fill="none"
        stroke="var(--toj-gold)"
        strokeOpacity="0.16"
        strokeWidth="0.75"
      />

      {/* Pediment and entablature. */}
      <path d="M100 26 L156 60 H44 Z" fill="url(#toj-face)" />
      <rect x="47" y="60" width="106" height="8" rx="1.5" fill="url(#toj-face)" />
      <rect x="42" y="68" width="116" height="6" rx="1.5" fill="url(#toj-side)" />

      {/* Columns. */}
      {[52, 72, 92, 112, 132].map((x) => (
        <g key={x}>
          <rect x={x} y="74" width="12" height="62" rx="2" fill="url(#toj-face)" />
          <rect
            x={x + 4.5}
            y="76"
            width="1.5"
            height="58"
            fill="var(--toj-gold-deep)"
            opacity="0.35"
          />
        </g>
      ))}

      {/* The doorway: the light inside. */}
      <path d="M88 136 V102 a12 12 0 0 1 24 0 v34 Z" fill="url(#toj-doorway)" />

      {/* Steps. */}
      <rect x="38" y="136" width="124" height="8" rx="1.5" fill="url(#toj-side)" />
      <rect x="30" y="144" width="140" height="8" rx="1.5" fill="url(#toj-side)" />
      <rect x="22" y="152" width="156" height="9" rx="2.5" fill="url(#toj-side)" />

      {/* Flames on the bottom step. Each burns at its own rate; four in
          lockstep read as a strobe rather than as fire. */}
      {[38, 62, 138, 162].map((x, i) => (
        <g key={x}>
          <rect
            x={x - 2}
            y="150"
            width="4"
            height="12"
            rx="1.2"
            fill="var(--toj-gold-deep)"
            opacity="0.7"
          />
          <ellipse
            className="toj-flame"
            cx={x}
            cy="146"
            rx="3"
            ry="5.5"
            fill="var(--toj-gold-bright)"
            style={{ animationDelay: `${-i * 0.63}s`, animationDuration: `${2.1 + i * 0.4}s` }}
          />
          <ellipse cx={x} cy="147.5" rx="1.3" ry="2.4" fill="var(--toj-gold)" opacity="0.9" />
        </g>
      ))}
    </svg>
  );
}

/** Re-exported so the vigil dialog can format the same way this file does. */
export { formatDuration };
