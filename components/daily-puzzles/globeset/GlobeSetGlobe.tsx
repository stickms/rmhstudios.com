'use client';

/**
 * The liquid globe, dealt.
 *
 * The seven cards in play are pinned to a glass sphere you turn with a finger.
 * Drag anywhere on the stage to spin it, let go and it coasts; a card on the
 * near face is a real button you tap to select, one on the far face is dimmed
 * and takes no input until you bring it round. Tabbing to a card **turns the
 * globe to it**, so the focus ring and the picture never disagree about which
 * card is being talked about.
 *
 * With the gyroscope on, the device's own rotation is composed on top of the
 * drag, which pins the sphere to the ROOM rather than to the screen: hold the
 * phone still and it sits there; walk around it and its far side comes to meet
 * you. That is the whole of "walk around the globe" — no AR session, no camera,
 * one quaternion from `useDeviceAttitude` multiplied into the view rotation.
 *
 * ## Why this is a hand-written frame loop
 *
 * Everything on screen is a function of one rotation that changes every frame
 * while a finger is down, and the work per frame is bounded and tiny: seven
 * cards of trig plus a stroked wireframe. Expressing it as React state would
 * re-render eight components sixty times a second to move them; instead the
 * loop writes `transform`/`opacity` straight onto the pins — compositor-only
 * properties — and skips the write entirely when the value has not changed.
 * The loop is cancelled on unmount and does not run while nothing is moving.
 * (Registered in `lib/__tests__/raf-loop-allowlist.test.ts`, §17.3.)
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';
import { useTranslation } from 'react-i18next';
import { DECELERATION, VelocityTracker, rubberBandClamp, smoothstep } from '@/lib/fluid';
import { conjugate, rotateVector, type Quat } from '@/lib/device-attitude';
import { colorParity, type Card } from '@/lib/globeset/cards';
import {
  GLOBE_PERSPECTIVE,
  PITCH_LIMIT,
  ROT_PER_PX,
  SLOT_DIRECTIONS,
  depthScale,
  faceFrontAngles,
  rotateToView,
  unrotateSphere,
  wrapDegrees,
} from '@/lib/globeset/globe';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { vibrate } from '@/lib/shared/platform';
import { GlobeSetCard } from './GlobeSetCard';

/** Rubber-band allowance past {@link PITCH_LIMIT}, in degrees. */
const PITCH_RUBBER = 22;
/** Below this the coast has stopped; the loop parks until something moves again. */
const REST_DEG_PER_S = 4;
/** Fraction of the remaining glide covered per frame when turning to a focused card. */
const GLIDE = 0.16;
/** The card's width as a fraction of the sphere's diameter. */
const CARD_FRACTION = 0.23;
/** Pointer travel, in CSS pixels, below which a gesture is still a tap. */
const TAP_SLOP = 8;
/**
 * How far a card lies back onto the sphere: half of the angle between the
 * screen and the card's own outward normal, capped.
 *
 * A card tangent to the surface is the truthful answer and the wrong one — at
 * the limb it turns edge-on, and on the far side it mirrors. Half the lean
 * reads unmistakably as "printed on the ball" while the dots stay square
 * enough to count, which is the only thing a player is doing with them.
 */
const TILT_FACTOR = 0.5;
const TILT_LIMIT = 52;

export interface GlobeSetGlobeProps {
  board: readonly Card[];
  selected: readonly Card[];
  hinted: readonly Card[];
  solving: readonly Card[];
  locked: boolean;
  shapes: boolean;
  /**
   * Live device rotation, as a REF rather than a value.
   *
   * The sensor emits once per animation frame; lifting that into React state
   * would re-render this component's whole parent sixty times a second to move
   * seven `transform`s. The frame loop reads the ref instead, and `gyroActive`
   * is the only part of it React needs to know about.
   */
  attitudeRef: RefObject<Quat | null>;
  /** Whether the sensor is currently driving the globe. */
  gyroActive: boolean;
  onToggle: (card: Card) => void;
  onClear: () => void;
}

export function GlobeSetGlobe({
  board,
  selected,
  hinted,
  solving,
  locked,
  shapes,
  attitudeRef,
  gyroActive,
  onToggle,
  onClear,
}: GlobeSetGlobeProps) {
  const { t } = useTranslation('c-daily-puzzles');
  const reduced = useReducedMotion();

  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pinRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [size, setSize] = useState(0);

  // ── Rotation, held in refs because it changes per frame ──────────────────
  const yawRef = useRef(0);
  const pitchRef = useRef(0);
  const velYawRef = useRef(0);
  const velPitchRef = useRef(0);
  /** Set while a card has keyboard focus: the globe glides until it faces front. */
  const glideRef = useRef<{ yaw: number; pitch: number } | null>(null);
  const draggingRef = useRef(false);
  /**
   * Whether the sensor is live, readable from inside the frame loop.
   *
   * The loop parks itself whenever nothing is moving, and the sensor writes
   * `attitudeRef` from its own frame callback — which is not a wake-up. Without
   * this the gyroscope updated a ref that nothing was reading, and the globe sat
   * perfectly still while the phone turned.
   */
  const gyroActiveRef = useRef(gyroActive);
  gyroActiveRef.current = gyroActive;
  /** The last rotation the sensor gave us, kept so switching it off can bake it in. */
  const lastAttitudeRef = useRef<Quat | null>(null);
  const frameRef = useRef(0);
  const lastPaintRef = useRef<{ transform: string; opacity: string; hit: boolean; z: number }[]>(
    [],
  );

  const boardRef = useRef(board);
  boardRef.current = board;

  /* ── Stage size ────────────────────────────────────────────────────────── */
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => setSize(el.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  /* ── The frame loop ────────────────────────────────────────────────────── */

  const wake = useCallback(() => {
    if (frameRef.current) return;
    frameRef.current = requestAnimationFrame(step);
    // `step` is hoisted below; the ref guard is what keeps this to one loop.
  }, []);

  const stepRef = useRef<(now: number) => void>(() => {});
  function step(now: number) {
    stepRef.current(now);
  }

  useEffect(() => {
    let last = performance.now();

    stepRef.current = (now: number) => {
      frameRef.current = 0;
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;

      let moving = draggingRef.current;

      // Glide toward a focused card, or coast on the throw. Never both — a
      // keyboard focus cancels the momentum it would otherwise fight.
      const glide = glideRef.current;
      if (glide) {
        const dy = wrapDegrees(glide.yaw - yawRef.current);
        const dp = glide.pitch - pitchRef.current;
        if (Math.abs(dy) < 0.05 && Math.abs(dp) < 0.05) {
          yawRef.current = glide.yaw;
          pitchRef.current = glide.pitch;
          glideRef.current = null;
        } else {
          const ease = reduced ? 1 : GLIDE;
          yawRef.current += dy * ease;
          pitchRef.current += dp * ease;
          moving = true;
        }
        velYawRef.current = 0;
        velPitchRef.current = 0;
      } else if (!draggingRef.current) {
        const speed = Math.hypot(velYawRef.current, velPitchRef.current);
        if (speed > REST_DEG_PER_S) {
          yawRef.current += velYawRef.current * dt;
          pitchRef.current += velPitchRef.current * dt;
          // Exponential decay at the scroll-view deceleration rate.
          const keep = Math.pow(DECELERATION.normal, dt * 1000);
          velYawRef.current *= keep;
          velPitchRef.current *= keep;
          moving = true;
        } else {
          velYawRef.current = 0;
          velPitchRef.current = 0;
        }
        // Release the rubber band: a pitch held past the limit springs back.
        const clamped = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, pitchRef.current));
        if (clamped !== pitchRef.current) {
          pitchRef.current += (clamped - pitchRef.current) * (reduced ? 1 : 0.2);
          if (Math.abs(clamped - pitchRef.current) < 0.02) pitchRef.current = clamped;
          moving = true;
        }
      }

      paint();
      // The sensor drives its own frames through `attitude`, so a live gyro
      // keeps the loop awake even when nothing else is moving.
      if (moving || gyroActiveRef.current) frameRef.current = requestAnimationFrame(step);
    };

    wake();
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      frameRef.current = 0;
    };
    // `paint` reads everything it needs from refs; re-arming per render would
    // restart the loop sixty times a second.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced, wake]);

  /* ── Painting ──────────────────────────────────────────────────────────── */

  const paint = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const radius = stage.clientWidth / 2;
    if (radius <= 0) return;

    const yaw = yawRef.current;
    const pitch = pitchRef.current;
    const att = attitudeRef.current;
    if (att) lastAttitudeRef.current = att;
    const count = boardRef.current.length;

    // Depth order first, so `z-index` expresses which card is in front of which
    // rather than a number that changes every frame.
    const views: { i: number; x: number; y: number; z: number }[] = [];
    for (let i = 0; i < count; i++) {
      const slot = SLOT_DIRECTIONS[i % SLOT_DIRECTIONS.length];
      let v = rotateToView(slot, yaw, pitch);
      if (att) {
        const [x, y, z] = rotateVector(att, [v.x, v.y, v.z]);
        v = { x, y, z };
      }
      views.push({ i, ...v });
    }
    const order = [...views].sort((a, b) => a.z - b.z);

    for (let rank = 0; rank < order.length; rank++) {
      const view = order[rank];
      const el = pinRefs.current[view.i];
      if (!el) continue;
      const last = (lastPaintRef.current[view.i] ??= {
        transform: '',
        opacity: '',
        hit: false,
        z: -1,
      });

      const k = depthScale(view.z, GLOBE_PERSPECTIVE);
      // Lie the card back onto the surface it is pinned to. The rotation that
      // carries the screen's forward axis onto this card's outward normal is
      // about (−y, x, 0) — the cross product of the two — by the angle between
      // them, damped so a card at the limb leans rather than going edge-on.
      const lean = Math.acos(Math.max(-1, Math.min(1, view.z)));
      const tilt = Math.min(lean * TILT_FACTOR, (TILT_LIMIT * Math.PI) / 180);
      const axisLength = Math.hypot(view.x, view.y) || 1;
      const transform =
        `translate3d(${(view.x * radius * k).toFixed(2)}px, ${(view.y * radius * k).toFixed(2)}px, 0)` +
        ` scale(${k.toFixed(3)})` +
        ` rotate3d(${(-view.y / axisLength).toFixed(4)}, ${(view.x / axisLength).toFixed(4)}, 0, ${tilt.toFixed(4)}rad)`;
      if (transform !== last.transform) {
        last.transform = transform;
        el.style.transform = transform;
      }

      // The far face stays faintly readable — it is what tells you there is more
      // globe to turn to — but it never takes a tap.
      const opacity = (0.18 + 0.82 * smoothstep(-0.7, 0.35, view.z)).toFixed(3);
      if (opacity !== last.opacity) {
        last.opacity = opacity;
        el.style.opacity = opacity;
      }
      if (rank !== last.z) {
        last.z = rank;
        el.style.zIndex = String(10 + rank);
      }
      const hit = view.z > 0.02;
      if (hit !== last.hit) {
        last.hit = hit;
        el.style.pointerEvents = hit ? 'auto' : 'none';
        // Keep the far face out of the tab order too, so tabbing walks the
        // cards you can actually see.
        const button = el.querySelector('button');
        if (button) button.tabIndex = hit ? 0 : -1;
      }
    }

    drawCage(canvasRef.current, yaw, pitch, att);
    // `attitudeRef` is a ref object: its identity never changes, so listing it
    // keeps the linter happy without ever re-creating this callback.
  }, [attitudeRef]);

  /* ── Drag ──────────────────────────────────────────────────────────────── */

  const trackerX = useRef(new VelocityTracker());
  const trackerY = useRef(new VelocityTracker());
  const lastPointer = useRef({ x: 0, y: 0 });
  const movedRef = useRef(0);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (locked) return;
      draggingRef.current = true;
      glideRef.current = null;
      velYawRef.current = 0;
      velPitchRef.current = 0;
      movedRef.current = 0;
      lastPointer.current = { x: event.clientX, y: event.clientY };
      trackerX.current = new VelocityTracker();
      trackerY.current = new VelocityTracker();
      trackerX.current.add(event.clientX, event.timeStamp);
      trackerY.current.add(event.clientY, event.timeStamp);
      wake();
    },
    [locked, wake],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current) return;
      const dx = event.clientX - lastPointer.current.x;
      const dy = event.clientY - lastPointer.current.y;
      lastPointer.current = { x: event.clientX, y: event.clientY };
      movedRef.current += Math.abs(dx) + Math.abs(dy);

      yawRef.current = wrapDegrees(yawRef.current + dx * ROT_PER_PX);
      // Screen-handed: dragging DOWN tips the front face downward, which is a
      // negative pitch (see `rotateToView`).
      pitchRef.current = rubberBandClamp(
        pitchRef.current - dy * ROT_PER_PX,
        -PITCH_LIMIT,
        PITCH_LIMIT,
        PITCH_RUBBER,
      );

      trackerX.current.add(event.clientX, event.timeStamp);
      trackerY.current.add(event.clientY, event.timeStamp);

      // Capture only once this is unmistakably a DRAG. Capturing on pointerdown
      // retargets the follow-up `click` to the stage, so every tap on a card
      // would be swallowed by the thing the card sits on.
      if (movedRef.current > TAP_SLOP && !event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.setPointerCapture(event.pointerId);
      }
      wake();
    },
    [wake],
  );

  const endDrag = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      if (reduced) return;
      // px/s at release × degrees-per-px = degrees per second. The decay in the
      // frame loop is what turns that into a coast.
      velYawRef.current = trackerX.current.get() * ROT_PER_PX;
      velPitchRef.current = -trackerY.current.get() * ROT_PER_PX;
      wake();
    },
    [reduced, wake],
  );

  /* ── Selecting ─────────────────────────────────────────────────────────── */

  const tap = useCallback(
    (card: Card) => {
      // A drag that happened to end on a card is a turn, not a tap.
      if (movedRef.current > TAP_SLOP) return;
      vibrate(6);
      onToggle(card);
    },
    [onToggle],
  );

  const focusSlot = useCallback(
    (index: number) => {
      const slot = SLOT_DIRECTIONS[index % SLOT_DIRECTIONS.length];
      const target = faceFrontAngles(slot);
      glideRef.current = { yaw: wrapDegrees(target.yaw), pitch: target.pitch };
      wake();
    },
    [wake],
  );

  /**
   * Switching the sensor off leaves the globe exactly where it was.
   *
   * The device rotation is composed ON TOP of the drag one, so simply dropping
   * it snaps the sphere back to whatever the finger last left it at — a quarter
   * turn, out of nowhere, as a reward for putting the phone down. Instead, work
   * out which point on the sphere is facing the viewer right now and set the
   * drag rotation to the one that puts that same point at the front.
   *
   * Roll is the one thing that cannot survive the transfer: the drag model has
   * two degrees of freedom and a device pose has three. Dropping roll is the
   * right loss — it is the axis a player never controls and never asks for.
   */
  const wasGyroRef = useRef(gyroActive);
  useEffect(() => {
    const was = wasGyroRef.current;
    wasGyroRef.current = gyroActive;
    const last = lastAttitudeRef.current;
    if (!was || gyroActive || !last) return;

    const [fx, fy, fz] = rotateVector(conjugate(last), [0, 0, 1]);
    const front = unrotateSphere({ x: fx, y: fy, z: fz }, yawRef.current, pitchRef.current);
    const angles = faceFrontAngles(front);
    yawRef.current = wrapDegrees(angles.yaw);
    pitchRef.current = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, angles.pitch));
    lastAttitudeRef.current = null;
    paint();
  }, [gyroActive, paint]);

  // Escape clears the selection, matching the flat board.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClear();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClear]);

  // Repaint immediately when the board, the selection or the sensor changes, so
  // a refilled card is placed before its first frame rather than at (0,0).
  useEffect(() => {
    lastPaintRef.current = [];
    paint();
    wake();
  }, [board, gyroActive, paint, wake]);

  const cardW = Math.max(48, size * CARD_FRACTION);
  const live = selected.filter((card) => board.includes(card));
  const parity = colorParity(live);

  return (
    <div>
      <div
        ref={stageRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className="relative mx-auto aspect-square w-full max-w-[min(30rem,80vw)] select-none"
        style={{ touchAction: 'none' }}
        role="group"
        aria-label={t('globeset-globe-label', {
          defaultValue: 'The globe — drag to turn it, tap a card to pick it',
        })}
      >
        <canvas
          ref={canvasRef}
          width={size * 2}
          height={size * 2}
          className="pointer-events-none absolute inset-0 h-full w-full text-site-text-muted"
          aria-hidden
        />
        <div
          className="absolute left-1/2 top-1/2 h-0 w-0"
          style={{
            perspective: size > 0 ? `${((size / 2) * GLOBE_PERSPECTIVE).toFixed(0)}px` : undefined,
            transformStyle: 'preserve-3d',
          }}
        >
          {board.map((card, index) => (
            <div
              key={card}
              ref={(el) => {
                pinRefs.current[index] = el;
              }}
              className="absolute will-change-transform"
              style={{
                width: cardW,
                height: cardW * 0.7,
                marginLeft: -cardW / 2,
                marginTop: -cardW * 0.35,
              }}
            >
              <GlobeSetCard
                card={card}
                position={index + 1}
                selected={selected.includes(card)}
                hinted={hinted.includes(card)}
                solving={solving.includes(card)}
                disabled={locked}
                shapes={shapes}
                onToggle={() => tap(card)}
                onFocus={() => focusSlot(index)}
              />
            </div>
          ))}
        </div>
      </div>

      <GlobeLedger parity={parity} picked={live.length} onClear={onClear} />
    </div>
  );
}

/* ── The wireframe cage ─────────────────────────────────────────────────────
   One canvas, stroked from the same rotation the cards are placed with, so the
   sphere the cards sit on is visibly the sphere they are turning with. Drawn at
   device scale (the canvas is 2×) and in the theme's own ink, sampled from the
   element rather than hardcoded so it tracks the palette. */

const LAT_LINES = 5;
const LON_LINES = 8;
const SAMPLES = 64;

function drawCage(
  canvas: HTMLCanvasElement | null,
  yaw: number,
  pitch: number,
  attitude: Quat | null,
): void {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx || canvas.width === 0) return;

  const w = canvas.width;
  const r = w / 2;
  ctx.clearRect(0, 0, w, w);
  ctx.lineWidth = 1.25;

  const ink = getComputedStyle(canvas).getPropertyValue('color') || 'rgba(120,120,140,1)';

  const put = (n: { x: number; y: number; z: number }) => {
    let v = rotateToView(n, yaw, pitch);
    if (attitude) {
      const [x, y, z] = rotateVector(attitude, [v.x, v.y, v.z]);
      v = { x, y, z };
    }
    const k = depthScale(v.z, GLOBE_PERSPECTIVE);
    return { x: r + v.x * r * k, y: r + v.y * r * k, z: v.z };
  };

  const stroke = (points: { x: number; y: number; z: number }[]) => {
    // Split at the limb so the far half can be drawn fainter than the near one
    // — the single cue that reads as "this is a ball, not a circle".
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1];
      const b = points[i];
      const depth = (a.z + b.z) / 2;
      ctx.strokeStyle = ink;
      ctx.globalAlpha = 0.14 + 0.44 * smoothstep(-1, 1, depth);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  };

  for (let i = 1; i <= LAT_LINES; i++) {
    const phi = (i / (LAT_LINES + 1)) * Math.PI;
    const y = Math.cos(phi);
    const ring = Math.sin(phi);
    const points = [];
    for (let s = 0; s <= SAMPLES; s++) {
      const th = (s / SAMPLES) * Math.PI * 2;
      points.push(put({ x: Math.cos(th) * ring, y, z: Math.sin(th) * ring }));
    }
    stroke(points);
  }

  for (let i = 0; i < LON_LINES; i++) {
    const lon = (i / LON_LINES) * Math.PI;
    const points = [];
    for (let s = 0; s <= SAMPLES; s++) {
      const th = (s / SAMPLES) * Math.PI * 2;
      points.push({
        x: Math.cos(lon) * Math.sin(th),
        y: Math.cos(th),
        z: Math.sin(lon) * Math.sin(th),
      });
    }
    stroke(points.map(put));
  }
  ctx.globalAlpha = 1;
}

/* ── The parity ledger, shared in spirit with the flat board ───────────── */

function GlobeLedger({
  parity,
  picked,
  onClear,
}: {
  parity: boolean[];
  picked: number;
  onClear: () => void;
}) {
  const { t } = useTranslation('c-daily-puzzles');
  return (
    <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
      <button
        type="button"
        onClick={onClear}
        disabled={picked === 0}
        className="rounded-full px-3 py-1 text-xs font-medium text-site-text-muted transition-colors hover:text-site-text disabled:opacity-40"
      >
        {t('globeset-clear', { defaultValue: 'Clear' })}
      </button>
      <span className="text-xs font-medium uppercase tracking-wide text-site-text-muted">
        {t('globeset-ledger-label', { defaultValue: 'Odd colours' })}
      </span>
      <ul className="flex items-center gap-2">
        {parity.map((odd, i) => (
          <li key={i}>
            <span
              className={
                odd
                  ? 'block h-4 w-4 rounded-full border-2 border-site-text'
                  : 'block h-4 w-4 rounded-full border-2 border-transparent opacity-25'
              }
              style={{ background: `var(${COLOR_TOKENS[i]})` }}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

const COLOR_TOKENS = [
  '--globeset-dot-red',
  '--globeset-dot-orange',
  '--globeset-dot-yellow',
  '--globeset-dot-green',
  '--globeset-dot-blue',
  '--globeset-dot-purple',
];
