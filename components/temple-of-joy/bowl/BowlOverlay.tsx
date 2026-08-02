/**
 * The alley.
 *
 * A frame of bowling, once a day, for up to an hour at ×4 — and for that hour
 * the globes are down here rather than in the sanctum, so there is nothing to
 * tap. The whole design lives in `lib/temple-of-joy/bowling.ts`; this is the
 * room it happens in.
 *
 * ## Two ways to bowl, one set of numbers
 *
 * The aim, the power and the hook are three real `<input type="range">`s. They
 * are the model, they are labelled, they are arrow-key operable, and they are
 * announced — so the mechanic is fully playable with a keyboard and a screen
 * reader, not "playable in principle".
 *
 * On top of them sits a **swipe**: drag up the lane, sideways for the line,
 * with a flick at the end for the hook. That gesture writes into the same three
 * numbers and then rolls. So neither path is the accessible afterthought — they
 * are one control surface with two skins.
 *
 * The live values are held in a REF, not in state. The swipe moves at pointer
 * rate and the thing it is steering is a physics scene; sixty React renders a
 * second of that subtree, during the one gesture the alley exists for, is
 * exactly the wrong place to spend the frame budget. The sliders mirror the ref
 * into state at the human pace they are actually operated at, and the readouts
 * during a swipe are written straight to their own DOM nodes.
 */
'use client';

import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { supportsWebGL } from '@/lib/shared/platform';
import { motionCapableDevice, requestDeviceMotionAccess } from '@/lib/device-attitude';
import { VelocityTracker } from '@/lib/fluid';
import { useTempleStore } from '@/lib/temple-of-joy/store';
import { templeAudio } from '@/lib/temple-of-joy/audio';
import { formatDuration } from '@/lib/temple-of-joy/numbers';
import {
  BOWL_BALLS,
  BOWL_BOOST_SECONDS,
  BOWL_PINS,
  bowlMultiplier,
} from '@/lib/temple-of-joy/bowling';
import { createSwing, feedSwing, resetSwing } from '@/lib/temple-of-joy/swing';
import { useTempleValue } from '../hooks';
import { TempleButton, Glyph } from '../ui';
import type { LaneControls, LanePalette } from './BowlLane';

const BowlLane = lazy(() => import('./BowlLane'));

/** How far up the viewport a swipe must travel to count as a roll. */
const SWIPE_MIN = 0.14;
/** Swipe travel, as a share of the viewport's height, that is full power. */
const SWIPE_POWER_SPAN = 0.5;
/** Swipe travel, as a share of the viewport's width, that is full deflection. */
const SWIPE_AIM_SPAN = 0.34;
/** Horizontal pointer speed (px/s) at release that reads as a full hook. */
const SWIPE_SPIN_SPAN = 900;

type Phase = 'aim' | 'rolling' | 'between' | 'done';

const FULL_RACK: boolean[] = Array.from({ length: BOWL_PINS }, () => true);

export function BowlOverlay() {
  const open = useTempleValue((s) => s.showBowl);
  if (!open) return null;
  return <Alley />;
}

function Alley() {
  const { t } = useTranslation('c-temple-of-joy');
  const reducedMotion = useReducedMotion();
  const globes = useTempleValue((s) => s.globes);

  const [phase, setPhase] = useState<Phase>('aim');
  const [standing, setStanding] = useState<boolean[]>(FULL_RACK);
  const [ball, setBall] = useState(1);
  const [firstBall, setFirstBall] = useState(0);
  const [rollToken, setRollToken] = useState(0);
  /** Mirrors of the control ref, at the pace a human moves a slider. */
  const [aim, setAim] = useState(0);
  const [power, setPower] = useState(0.62);
  const [spin, setSpin] = useState(0);

  const controls = useRef<LaneControls>({ aim: 0, power: 0.62, spin: 0 });
  const rootRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const aimMarkRef = useRef<HTMLSpanElement>(null);
  const powerFillRef = useRef<HTMLSpanElement>(null);

  const webgl = useMemo(() => supportsWebGL(), []);

  /**
   * The frame's running total. It is derived from the rack rather than tracked,
   * which is what makes it impossible for the two to disagree: knocked pins are
   * removed from the rack between balls, so "how many are gone" IS the total,
   * across both rolls, with no accumulator to get out of step.
   */
  const down = BOWL_PINS - standing.filter(Boolean).length;

  /* ── Palette ──────────────────────────────────────────────────────────── */

  /**
   * The lane is painted in the temple's own tokens, read once from the DOM
   * rather than duplicated as hex in a TypeScript file — otherwise Vespers
   * would fall and the alley would stay lit for dawn.
   */
  const [palette, setPalette] = useState<LanePalette>(FALLBACK_PALETTE);
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const cs = getComputedStyle(el);
    const read = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
    setPalette({
      ground: read('--toj-ground-deep', FALLBACK_PALETTE.ground),
      board: read('--toj-gold-wash', FALLBACK_PALETTE.board),
      gutter: read('--toj-rule-strong', FALLBACK_PALETTE.gutter),
      pin: read('--toj-surface', FALLBACK_PALETTE.pin),
      gold: read('--toj-gold', FALLBACK_PALETTE.gold),
      goldBright: read('--toj-gold-bright', FALLBACK_PALETTE.goldBright),
    });
  }, []);

  /* ── Focus and escape ─────────────────────────────────────────────────── */

  useEffect(() => {
    // The alley is modal, so focus has to move into it — and it lands on the
    // close button rather than on the aim slider, because arriving with focus
    // already on a control that Left/Right will change is a trap for anyone
    // orienting themselves with the arrow keys.
    closeRef.current?.focus();
  }, []);

  const close = useCallback(() => {
    // Never mid-roll: the settle is what banks the frame, and closing over it
    // would spend the day's cooldown on nothing.
    if (useTempleStore.getState().showBowl) useTempleStore.getState().closeBowl();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (phase === 'rolling') return;
      event.preventDefault();
      close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close, phase]);

  /* ── Rolling ──────────────────────────────────────────────────────────── */

  const roll = useCallback(() => {
    if (controls.current.power < 0.05) return;
    setPhase('rolling');
    setRollToken((n) => n + 1);
  }, []);

  const onRolling = useCallback(() => {
    templeAudio.play('strike');
    templeAudio.buzz(14);
  }, []);

  const onSettled = useCallback(
    (next: boolean[]) => {
      const knocked = BOWL_PINS - next.filter(Boolean).length;
      setStanding(next);

      if (ball === 1) {
        setFirstBall(knocked);
        if (knocked >= BOWL_PINS) {
          // A strike ends the frame there and then, as it does in a real one.
          templeAudio.play('ascend');
          templeAudio.buzz([16, 40, 16, 40, 24]);
          setPhase('done');
          return;
        }
        templeAudio.play(knocked > 0 ? 'purchase' : 'refuse');
        setBall(2);
        setPhase('between');
        return;
      }

      templeAudio.play(knocked >= BOWL_PINS ? 'blessing' : knocked > 0 ? 'purchase' : 'refuse');
      setPhase('done');
    },
    [ball],
  );

  const bank = useCallback(() => {
    useTempleStore.getState().finishFrame(down, firstBall);
  }, [down, firstBall]);

  /* ── The swipe ────────────────────────────────────────────────────────── */

  /**
   * Live feedback without a render: the aim marker and the power meter are
   * written straight to their own nodes while the finger is down, and the
   * React state catches up once at the end of the gesture.
   */
  const paintControls = useCallback(() => {
    const { aim: a, power: p } = controls.current;
    aimMarkRef.current?.style.setProperty('--toj-aim', a.toFixed(3));
    powerFillRef.current?.style.setProperty('--toj-power', p.toFixed(3));
  }, []);

  /* ── The swing ────────────────────────────────────────────────────────────
     On a phone you can put the sliders down and actually bowl: set the line,
     press "Swing to bowl", then wind back and swing the phone like an arm. The
     detection is `lib/temple-of-joy/swing.ts` — peak acceleration is the power,
     the wrist turn at that peak is the hook.

     It is a third way in, never the only one. The sliders and the Roll button
     stay exactly where they are, so nothing here is load-bearing for anybody
     who cannot (or would rather not) swing a phone across a room. */

  const swingable = useMemo(() => motionCapableDevice(), []);
  const [swingArmed, setSwingArmed] = useState(false);
  const swing = useRef(createSwing());
  /** Set while a throw is being applied, so one swing cannot roll twice. */
  const swingSpent = useRef(false);

  const armSwing = useCallback(async () => {
    if (swingArmed) {
      setSwingArmed(false);
      return;
    }
    // Straight from the click, with nothing awaited first, or Safari stops
    // counting it as a user gesture and refuses the sensor.
    const granted = await requestDeviceMotionAccess();
    if (!granted) return;
    resetSwing(swing.current);
    swingSpent.current = false;
    setSwingArmed(true);
  }, [swingArmed]);

  useEffect(() => {
    // Only listen while there is a ball to throw. Between the frame ending and
    // the overlay closing, a phone put back in a pocket is a large acceleration.
    if (!swingArmed || (phase !== 'aim' && phase !== 'between')) return;

    resetSwing(swing.current);
    swingSpent.current = false;

    const onMotion = (event: DeviceMotionEvent) => {
      if (swingSpent.current) return;
      // `acceleration` is gravity-free where the platform provides it; where it
      // does not, the swing detector low-passes gravity out of the other one.
      const clean = event.acceleration;
      const raw = clean ?? event.accelerationIncludingGravity;
      if (!raw || raw.x == null || raw.y == null || raw.z == null) return;

      const thrown = feedSwing(swing.current, {
        x: raw.x,
        y: raw.y,
        z: raw.z,
        gravityFree: Boolean(clean && clean.x != null),
        twist: event.rotationRate?.alpha ?? 0,
        t: performance.now(),
      });
      if (!thrown) return;

      swingSpent.current = true;
      controls.current.power = thrown.power;
      controls.current.spin = thrown.spin;
      setPower(thrown.power);
      setSpin(thrown.spin);
      paintControls();
      templeAudio.buzz([12, 24, 40]);
      roll();
    };

    window.addEventListener('devicemotion', onMotion);
    return () => window.removeEventListener('devicemotion', onMotion);
  }, [swingArmed, phase, paintControls, roll]);

  // A ball that has left the hand re-arms the detector for the next one, rather
  // than making the player press the button again between the two rolls.
  useEffect(() => {
    if (phase === 'between' || phase === 'aim') swingSpent.current = false;
  }, [phase]);

  const swipe = useRef({ active: false, id: -1, x0: 0, y0: 0, w: 1, h: 1 });
  const velocity = useRef(new VelocityTracker());

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button > 0 || phase === 'rolling' || phase === 'done') return;
      const rect = event.currentTarget.getBoundingClientRect();
      swipe.current = {
        active: true,
        id: event.pointerId,
        x0: event.clientX,
        y0: event.clientY,
        w: rect.width || 1,
        h: rect.height || 1,
      };
      velocity.current.reset();
      velocity.current.add(event.clientX, performance.now());
      controls.current.power = 0;
      paintControls();
    },
    [paintControls, phase],
  );

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const s = swipe.current;
      if (!s.active || event.pointerId !== s.id) return;
      velocity.current.add(event.clientX, performance.now());
      controls.current.aim = clamp((event.clientX - s.x0) / (s.w * SWIPE_AIM_SPAN), -1, 1);
      // Up the lane is up the screen, so the power is how far the finger has
      // travelled AGAINST the y axis.
      controls.current.power = clamp((s.y0 - event.clientY) / (s.h * SWIPE_POWER_SPAN), 0, 1);
      paintControls();
    };

    const onUp = (event: PointerEvent) => {
      const s = swipe.current;
      if (!s.active || event.pointerId !== s.id) return;
      s.active = false;
      // The hook comes from how the hand was moving as it let go, which is what
      // it comes from in the real thing.
      controls.current.spin = clamp(velocity.current.get() / SWIPE_SPIN_SPAN, -1, 1);
      const thrown = controls.current.power >= SWIPE_MIN;
      if (!thrown) {
        // A tap or an abandoned swipe restores the settings rather than leaving
        // the meter at zero, so a mis-touch never costs the aim you had set.
        controls.current.aim = aim;
        controls.current.power = power;
        controls.current.spin = spin;
      }
      setAim(controls.current.aim);
      setPower(controls.current.power);
      setSpin(controls.current.spin);
      paintControls();
      if (thrown) roll();
    };

    const onCancel = (event: PointerEvent) => {
      const s = swipe.current;
      if (!s.active || event.pointerId !== s.id) return;
      s.active = false;
      controls.current.aim = aim;
      controls.current.power = power;
      controls.current.spin = spin;
      paintControls();
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
    };
  }, [aim, paintControls, power, roll, spin]);

  useEffect(paintControls, [paintControls, aim, power]);

  /* ── Copy ─────────────────────────────────────────────────────────────── */

  const multiplier = bowlMultiplier(down);
  const status =
    phase === 'rolling'
      ? t('bowl-status-rolling', { defaultValue: 'Rolling…' })
      : phase === 'between'
        ? t('bowl-status-between', {
            down: firstBall,
            standing: standing.filter(Boolean).length,
            defaultValue: 'Ball one: {{down}} down, {{standing}} standing. One ball left.',
          })
        : phase === 'done'
          ? down >= BOWL_PINS
            ? t('bowl-status-clean', {
                multiplier: multiplier.toFixed(2),
                defaultValue: 'All ten. Joy ×{{multiplier}} for the hour.',
              })
            : down > 0
              ? t('bowl-status-count', {
                  down,
                  multiplier: multiplier.toFixed(2),
                  defaultValue: '{{down}} down. Joy ×{{multiplier}} for the hour.',
                })
              : t('bowl-status-gutter', {
                  defaultValue: 'Nothing down. No boost — but your hands stay free.',
                })
          : swingArmed
            ? t('bowl-status-swing', {
                ball,
                balls: BOWL_BALLS,
                defaultValue: 'Ball {{ball}} of {{balls}}. Wind back and swing the phone.',
              })
            : t('bowl-status-aim', {
                ball,
                balls: BOWL_BALLS,
                defaultValue: 'Ball {{ball}} of {{balls}}. Set your line and roll.',
              });

  return (
    <div className="toj-bowl" ref={rootRef}>
      <div
        className="toj-bowl-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="toj-bowl-title"
        aria-describedby="toj-bowl-status"
      >
        <header className="toj-bowl-head">
          <div>
            <h2 className="toj-bowl-title" id="toj-bowl-title">
              {t('bowl-title', { defaultValue: 'The Lane' })}
            </h2>
            <p className="toj-bowl-sub">
              {t('bowl-sub', {
                minutes: Math.round(BOWL_BOOST_SECONDS / 60),
                defaultValue:
                  'One frame a day. Every pin is worth more rate for {{minutes}} minutes — and your hands are still until it ends.',
              })}
            </p>
          </div>
          <TempleButton
            ref={closeRef}
            variant="quiet"
            size="sm"
            onClick={close}
            disabled={phase === 'rolling'}
          >
            {t('bowl-leave', { defaultValue: 'Leave the lane' })}
          </TempleButton>
        </header>

        <div
          className="toj-bowl-view"
          data-phase={phase}
          onPointerDown={onPointerDown}
          // The swipe owns every gesture inside the viewport: the browser must
          // not pan, scroll or long-press-select while a ball is being thrown.
          style={{ touchAction: 'none' }}
        >
          {webgl ? (
            <Suspense
              fallback={
                <p className="toj-bowl-loading" role="status">
                  {t('bowl-loading', { defaultValue: 'Oiling the lane…' })}
                </p>
              }
            >
              <BowlLane
                controls={controls}
                globes={globes}
                standing={standing}
                rollToken={rollToken}
                palette={palette}
                reducedMotion={reducedMotion}
                onSettled={onSettled}
                onRolling={onRolling}
              />
            </Suspense>
          ) : (
            <p className="toj-bowl-loading" role="status">
              {t('bowl-no-webgl', {
                defaultValue:
                  'The lane needs 3D graphics, and this browser cannot open them. Everything else in the temple works as it always did.',
              })}
            </p>
          )}

          {/* The line you have set, drawn over the lane. Written to directly
              during a swipe — see `paintControls`. */}
          <span className="toj-bowl-aim" ref={aimMarkRef} aria-hidden />
          <span className="toj-bowl-power" aria-hidden>
            <span className="toj-bowl-power-fill" ref={powerFillRef} />
          </span>

          <p className="toj-bowl-hint" aria-hidden>
            {phase !== 'aim' && phase !== 'between'
              ? ''
              : swingArmed
                ? t('bowl-hint-swing', { defaultValue: 'Swing the phone to roll' })
                : t('bowl-hint', { defaultValue: 'Swipe up the lane to roll' })}
          </p>
        </div>

        <Rack standing={standing} />

        <p className="toj-bowl-status" id="toj-bowl-status" role="status" aria-live="polite">
          {status}
        </p>

        {phase === 'done' ? (
          <div className="toj-bowl-actions">
            <TempleButton variant="gold" ready onClick={bank}>
              <Glyph>🎳</Glyph>
              {down > 0
                ? t('bowl-take', {
                    multiplier: multiplier.toFixed(2),
                    defaultValue: 'Take the hour at ×{{multiplier}}',
                  })
                : t('bowl-take-none', { defaultValue: 'Rack them up and go home' })}
            </TempleButton>
            <p className="toj-bowl-note">
              {down > 0
                ? t('bowl-take-note', {
                    time: formatDuration(BOWL_BOOST_SECONDS),
                    defaultValue:
                      'For the next {{time}} the globes stay here. No offerings by hand — the rate does the work.',
                  })
                : t('bowl-none-note', {
                    defaultValue: 'The lane shuts for a day either way. Better luck tomorrow.',
                  })}
            </p>
          </div>
        ) : (
          <fieldset className="toj-bowl-controls" disabled={phase === 'rolling'}>
            <legend className="toj-sr">
              {t('bowl-controls', { defaultValue: 'Set the roll' })}
            </legend>

            <Dial
              label={t('bowl-aim', { defaultValue: 'Line' })}
              value={aim}
              min={-1}
              readout={
                Math.abs(aim) < 0.06
                  ? t('bowl-aim-centre', { defaultValue: 'Down the middle' })
                  : aim < 0
                    ? t('bowl-aim-left', {
                        percent: Math.round(-aim * 100),
                        defaultValue: '{{percent}}% left',
                      })
                    : t('bowl-aim-right', {
                        percent: Math.round(aim * 100),
                        defaultValue: '{{percent}}% right',
                      })
              }
              onChange={(v) => {
                setAim(v);
                controls.current.aim = v;
              }}
            />

            <Dial
              label={t('bowl-power', { defaultValue: 'Power' })}
              value={power}
              min={0}
              readout={`${Math.round(power * 100)}%`}
              onChange={(v) => {
                setPower(v);
                controls.current.power = v;
              }}
            />

            <Dial
              label={t('bowl-spin', { defaultValue: 'Hook' })}
              value={spin}
              min={-1}
              readout={
                Math.abs(spin) < 0.06
                  ? t('bowl-spin-none', { defaultValue: 'Straight' })
                  : spin < 0
                    ? t('bowl-spin-left', {
                        percent: Math.round(-spin * 100),
                        defaultValue: 'Curving left, {{percent}}%',
                      })
                    : t('bowl-spin-right', {
                        percent: Math.round(spin * 100),
                        defaultValue: 'Curving right, {{percent}}%',
                      })
              }
              onChange={(v) => {
                setSpin(v);
                controls.current.spin = v;
              }}
            />

            <div className="toj-bowl-throw">
              <TempleButton
                variant="gold"
                ready={phase !== 'rolling'}
                disabled={phase === 'rolling' || !webgl}
                onClick={roll}
              >
                {phase === 'between'
                  ? t('bowl-roll-again', { defaultValue: 'Roll the second ball' })
                  : t('bowl-roll', { defaultValue: 'Roll' })}
              </TempleButton>

              {/* Offered only where there is an accelerometer to swing. The
                  press is also the iOS permission prompt, which is why it is a
                  button and not a setting. */}
              {swingable && (
                <TempleButton
                  variant={swingArmed ? 'gold' : 'plain'}
                  aria-pressed={swingArmed}
                  disabled={phase === 'rolling' || !webgl}
                  onClick={() => {
                    void armSwing();
                  }}
                >
                  <Glyph>🤾</Glyph>
                  {swingArmed
                    ? t('bowl-swing-armed', { defaultValue: 'Swing now' })
                    : t('bowl-swing', { defaultValue: 'Swing to bowl' })}
                </TempleButton>
              )}
            </div>
          </fieldset>
        )}
      </div>
    </div>
  );
}

/**
 * One control. A real range input with a real label — the whole reason the
 * alley is playable without a pointer.
 */
function Dial({
  label,
  value,
  min,
  readout,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  readout: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="toj-bowl-dial">
      <span className="toj-bowl-dial-label">{label}</span>
      <input
        type="range"
        className="toj-slider"
        min={min}
        max={1}
        step={0.02}
        value={value}
        // The number a range input reports is a bare float; what a player needs
        // to hear is "40% left", so the text is supplied explicitly.
        aria-valuetext={readout}
        onChange={(event) => onChange(Number(event.target.value))}
        onPointerUp={() => templeAudio.play('tick')}
      />
      <span className="toj-bowl-dial-value">{readout}</span>
    </label>
  );
}

/** The rack, as ten dots — the count at a glance, and the count for a reader. */
function Rack({ standing }: { standing: readonly boolean[] }) {
  const { t } = useTranslation('c-temple-of-joy');
  // Drawn back-row-first, so it reads the way a rack looks from the approach.
  const rows = [[6, 7, 8, 9], [3, 4, 5], [1, 2], [0]];
  return (
    <div
      className="toj-bowl-rack"
      role="img"
      aria-label={t('bowl-rack', {
        standing: standing.filter(Boolean).length,
        defaultValue: '{{standing}} pins standing',
      })}
    >
      {rows.map((row, i) => (
        <span className="toj-bowl-row" key={i}>
          {row.map((index) => (
            <span
              key={index}
              className="toj-bowl-pin"
              data-down={standing[index] ? undefined : 'true'}
            />
          ))}
        </span>
      ))}
    </div>
  );
}

/** Dawn's tokens, for the frame before the real ones have been read off the DOM. */
const FALLBACK_PALETTE: LanePalette = {
  ground: '#f2eee3',
  board: '#f6efd9',
  gutter: '#d6cbb2',
  pin: '#ffffff',
  gold: '#b8912a',
  goldBright: '#e0bb54',
};

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
