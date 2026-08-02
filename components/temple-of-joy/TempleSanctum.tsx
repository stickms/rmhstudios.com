/**
 * The sanctum — the globes you strike, and everything that happens around them.
 *
 * The room used to hold a temple: an SVG facade with columns and a doorway, and
 * you tapped it. It holds a **field of liquid globes** now
 * (`TempleGlobes.tsx`), with every source you own orbiting them as pins — so
 * the thing you tap and the thing you have been buying are finally the same
 * object, and a purchase changes the room instead of a number.
 *
 * Everything else in here is unchanged in kind: the halo you catch, the Sinners
 * you strike, the motes, the "+N" that rises from a strike, and the two
 * standing actions. They are things you do *in the room* rather than entries in
 * a list, which is why they live beside the globes rather than in a panel.
 */
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTempleStore } from '@/lib/temple-of-joy/store';
import { fmt, formatDuration } from '@/lib/temple-of-joy/numbers';
import { templeAudio } from '@/lib/temple-of-joy/audio';
import { computeBowlReady, computeCanAscend } from '@/lib/temple-of-joy/engine';
import { useTempleSnapshot, useTempleValue } from './hooks';
import { TempleButton, Glyph } from './ui';
import { TempleGlobes } from './TempleGlobes';

/** "+N" floating up from where the player struck. */
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
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [bursts, setBursts] = useState<Burst[]>([]);
  const burstId = useRef(0);

  const rapture = useTempleValue((s) => s.rapture);

  /* ── The offering ─────────────────────────────────────────────────────── */

  const strike = useCallback((clientX: number, clientY: number) => {
    const store = useTempleStore.getState();
    // Asked BEFORE the offering lands, so the "+N" is what this strike was
    // worth rather than what the next one will be.
    const gain = store.getTouch();
    const before = store.totalTouches;
    store.touch();
    // The store refuses an offering while the globes are at the lane, and the
    // refusal is silent by design — so the burst and the sound are gated on the
    // action having actually happened, not on the component's idea of whether
    // it should have.
    if (useTempleStore.getState().totalTouches === before) return;
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

  // Bursts are removed on a single rolling sweep rather than a timer each, so
  // a hundred taps a second do not queue a hundred timeouts.
  useEffect(() => {
    if (bursts.length === 0) return;
    const id = window.setTimeout(() => setBursts((current) => current.slice(1)), 950);
    return () => window.clearTimeout(id);
  }, [bursts]);

  return (
    <div className="toj-sanctum" ref={surfaceRef} data-rapture={rapture || undefined}>
      <Motes />
      <Buffs />

      <TempleGlobes onStrike={strike}>
        <Sinners />
      </TempleGlobes>

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
 * They ring the field, each one drinking a share of the rate and holding it.
 *
 * Placed on a circle by angle with `left`/`top`, which resolve against the
 * square globe stage this renders inside. They used to be placed by a
 * PERCENTAGE TRANSLATE — and a percentage in a transform resolves against the
 * element's OWN box, so a "46% out" ring was 46% of one 2.4rem Sinner, i.e.
 * seventeen pixels: a full house of twelve stacked in a pile on the middle of
 * the altar rather than closing in around it.
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
        const radius = 56 - Number(arrival) * 8;
        const radians = (Number(angle) * Math.PI) / 180;

        return (
          <button
            key={id}
            type="button"
            className="toj-sinner"
            data-penitent={penitent === '1' ? 'true' : undefined}
            style={{
              left: `${50 + Math.cos(radians) * radius}%`,
              top: `${50 + Math.sin(radians) * radius}%`,
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

/** The things you can do from the room rather than from a panel. */
function Rites() {
  const { t } = useTranslation('c-temple-of-joy');
  const state = useTempleSnapshot(
    (s) => ({
      sinners: s.sinners.length,
      canAscend: computeCanAscend(s),
      canBowl: computeBowlReady(s),
      boost: s.bowl.remaining > 0 ? s.bowl.multiplier : 0,
      boostLeft: Math.ceil(s.bowl.remaining),
    }),
    400,
  );

  return (
    <div className="toj-rites">
      {state.boost > 0 && (
        <p className="toj-rite-note" data-kind="bowl">
          <Glyph>🎳</Glyph>
          {t('bowl-running', {
            multiplier: state.boost.toFixed(2),
            time: formatDuration(state.boostLeft),
            defaultValue: 'Joy ×{{multiplier}} · {{time}} left · hands still',
          })}
        </p>
      )}

      {state.canBowl && (
        <TempleButton
          variant="plain"
          tone="tab"
          onClick={() => useTempleStore.getState().openBowl()}
        >
          <Glyph>🎳</Glyph>
          {t('bowl-open', { defaultValue: 'Bowl a globe' })}
        </TempleButton>
      )}

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

/** Re-exported so the vigil dialog can format the same way this file does. */
export { formatDuration };
