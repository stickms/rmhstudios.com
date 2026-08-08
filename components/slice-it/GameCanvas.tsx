'use client';

import { laneColor, resolvePalette } from '@/lib/slice-it/palettes';
import { approachEnergy, comboEnergy } from '@/lib/slice-it/presentation';
import { resolveSkin, type NoteShape } from '@/lib/slice-it/skins';
import { clampLinePosition } from '@/lib/slice-it/constants';
import { rumble } from '@/lib/shared/platform';
import { laneForKey } from '@/lib/slice-it/input';
import { useEffect, useRef, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { fadeRise, popIn } from '@/lib/motion';
import { useTranslation } from 'react-i18next';
import { COMBO_MILESTONES, GameEngine } from '@/lib/slice-it/engine';
import { requestScreenWakeLock } from '@/lib/shared/platform';
import { useSliceItStore, approachSeconds, reactionWindowMs } from '@/lib/slice-it/store';
import { visibilityAlpha } from '@/lib/slice-it/modifiers';
import { AudioManager } from '@/lib/audio/AudioManager';
import { longestHoldSeconds, visibleSliceRange } from '@/lib/slice-it/visible-window';
import { HUD } from './HUD';
import { GameOver } from './GameOver';
import { MainMenu } from './MainMenu';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { RotateCcw, Settings, SkipForward, X } from 'lucide-react';
import { MultiplayerSidebar } from './MultiplayerSidebar';
import { MatchResults } from './MatchResults';
import { addMatchListener, leaveLobby } from '@/lib/slice-it/net/client';
import type { PausePayload } from '@/lib/slice-it/net/events';
import { toast } from 'sonner';
import { canvasGlowEnabled } from '@/lib/render/canvas2d-fx';
import { gameSurfaceDpr } from '@/lib/display-scale';
import {
  COMBO_BREAK_FEEDBACK_MS,
  HIT_WINDOWS,
  JUDGEMENT_COLORS,
  QUANT_COLORS,
  MAX_LANE_COVER,
  MIN_LANE_COVER,
} from '@/lib/slice-it/constants';
import { judge } from '@/lib/slice-it/scoring';

// Neumorphic Palette (dark-mode-aware colors are read from CSS vars at render time)
const COLORS = {
  lane1: '#3b82f6', // Blue
  lane2: '#f472b6', // Pink
  grid: '#cbd5e0',
  bomb: '#ef4444',
  slice: {
    SPEED: '#a78bfa',
    MOVING: '#facc15',
    SILENT: '#94a3b8',
    BOMB: '#ef4444',
    DEFAULT: 'var(--slice-shadow-light)',
  },
};

// Helper to interpolate between two hex colors
function interpolateHex(hex1: string, hex2: string, ratio: number): string {
  const r1 = parseInt(hex1.slice(1, 3), 16);
  const g1 = parseInt(hex1.slice(3, 5), 16);
  const b1 = parseInt(hex1.slice(5, 7), 16);

  const r2 = parseInt(hex2.slice(1, 3), 16);
  const g2 = parseInt(hex2.slice(3, 5), 16);
  const b2 = parseInt(hex2.slice(5, 7), 16);

  const r = Math.round(r1 + (r2 - r1) * ratio);
  const g = Math.round(g1 + (g2 - g1) * ratio);
  const b = Math.round(b1 + (b2 - b1) * ratio);

  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/**
 * M1 — Mirror, applied at the render/input boundary rather than to the chart.
 *
 * `render` below draws the engine's own prepared slices (`engine.getSlices()`),
 * which `prepareChart` deliberately leaves un-mirrored — see `chart.ts`'s
 * `applyMirror` for why rewriting the judged chart isn't reachable this wave,
 * and for the reference transform this is the visual equivalent of. Flipping
 * BOTH what a note is drawn at (`mirrorLane` applied to `slice.lane` in
 * `render`) and which engine lane a keypress targets (`mirrorLane` applied in
 * `handleInput`) is the same involution applied twice, so composing them
 * reproduces exactly what swapping the chart itself would look like: a note
 * that started life in lane 0 is drawn in, and only hittable from, the visual
 * position for lane 1.
 *
 * A no-op under One Track — there is only one lane to mirror into, and
 * mirroring it anyway would send every keypress to a lane nothing is ever
 * queued on.
 */
function mirrorLane(lane: number): number {
  const state = useSliceItStore.getState();
  return state.mirror && !state.modifiers.oneTrack ? 1 - lane : lane;
}

/**
 * How long a tick stays on the hit-error bar, ms.
 *
 * Long enough to read a cloud out of, short enough that the cloud describes what
 * you are doing now rather than what you did at the start of the song — which is
 * the difference between a feedback loop and a statistic.
 */
const ERROR_BAR_FADE_MS = 2000;

/**
 * H6 — how long the restart key must be held, ms.
 *
 * HOLD, not press. A tap-to-restart bound near the lane keys costs someone a
 * 300-combo run the first time they fat-finger it, and they will not come
 * back to find out whether it was their fault.
 */
const RESTART_HOLD_MS = 600;

/** H6 — a lead-in shorter than this is not worth a skip button for. */
const SKIPPABLE_LEAD_IN_SEC = 5;

/** H6 — a skip always lands this far before the first note, never into it. */
const SKIP_TARGET_LEAD_SEC = 2;

/**
 * V5 — how long a combo-milestone crossing stays on screen, ms. Longer than a
 * judgement popup (it is a rarer, bigger event) but still gone well before
 * the next one could plausibly land, even on a dense Expert 1000-combo chart.
 */
const COMBO_MILESTONE_FEEDBACK_MS = 1100;

/** V5 — one colour per tier, escalating with `COMBO_MILESTONES`' own order. */
const MILESTONE_COLORS = ['#38bdf8', '#a78bfa', '#f472b6', '#facc15', '#fb7185'];

/**
 * How long the hit ring takes to leave the receptor, ms.
 *
 * Short. This is an impact, and an impact that outlives the next note stops
 * being feedback about a note and becomes ambient motion — on a dense chart
 * notes land ~120 ms apart, so anything longer would be permanently on screen.
 */
const HIT_PULSE_MS = 260;

/**
 * Trace an eight-pointed spiked disc, centred on `(cx, cy)`.
 *
 * The bomb's shape. Leaves the path open so the caller can fill it, stroke it,
 * or both, and allocates nothing — the alternative (a cached `Path2D` per
 * radius) would have to be invalidated on every resize for no measurable gain
 * over sixteen `lineTo`s.
 */
function drawSpikedDisc(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  outer: number,
  inner: number,
): void {
  const points = 8;
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const radius = i % 2 === 0 ? outer : inner;
    const angle = (i * Math.PI) / points - Math.PI / 2;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

/**
 * Draw the stem and flags of a notation notehead.
 *
 * The stem rises from the head's right side, as it does on a notehead whose
 * pitch sits below the middle line — the direction is fixed rather than derived
 * from the lane, because a stem that flips between lanes reads as two different
 * note kinds instead of one note in two places.
 *
 * Flat, not extruded: these are 2-3 px wide and the neumorphic shadow pair that
 * makes the head sit up off the trough would turn them into a smear.
 */
function drawNoteStem(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  flags: number,
  triplet: boolean,
  color: string,
): void {
  const stemW = Math.max(2, size * 0.11);
  const stemH = size * 1.5;
  const stemX = cx + size * 0.5 - stemW / 2;
  const top = cy - size * 0.2 - stemH;

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(stemX, top, stemW, stemH, stemW / 2);
  ctx.fill();

  // Flags hang off the stem top, each below the last, curved the way an
  // engraved flag is rather than drawn as a triangle.
  for (let i = 0; i < flags; i++) {
    const y = top + i * size * 0.34;
    ctx.beginPath();
    ctx.moveTo(stemX + stemW, y);
    ctx.quadraticCurveTo(stemX + size * 0.95, y + size * 0.2, stemX + size * 0.5, y + size * 0.62);
    ctx.quadraticCurveTo(stemX + size * 0.78, y + size * 0.22, stemX + stemW, y + size * 0.26);
    ctx.closePath();
    ctx.fill();
  }

  if (triplet) {
    ctx.font = `bold ${Math.round(size * 0.44)}px ui-monospace, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('3', stemX + size * 0.62, top - size * 0.18);
    ctx.textBaseline = 'alphabetic';
  }
}

/**
 * Trace one half of a rounded square's outline — the lit half or the shaded
 * half of a neumorphic surface.
 *
 * `topLeft` runs from the bottom-left corner up around the top-left and along
 * to the top-right; `bottomRight` is the complement. Split at the two corners
 * the light source does NOT favour, so neither stroke ends in the middle of an
 * edge where the join would show.
 *
 * Inset by the caller's `lineWidth` is not needed: the stroke straddles the
 * path and the extrusion beneath is the same shape, so the outer half lands on
 * the note's own edge.
 */
function traceCornerArc(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  radius: number,
  half: 'topLeft' | 'bottomRight',
): void {
  const r = Math.min(radius, size / 2);
  ctx.beginPath();
  if (half === 'topLeft') {
    ctx.moveTo(x, y + size - r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.lineTo(x + size - r, y);
  } else {
    ctx.moveTo(x + size, y + r);
    ctx.lineTo(x + size, y + size - r);
    ctx.arcTo(x + size, y + size, x + size - r, y + size, r);
    ctx.lineTo(x + r, y + size);
  }
}

/**
 * Trace a tap note's BODY for a given skin shape, centred on `(cx, cy)`.
 *
 * Only the body — the notation skin's stem and flags are drawn separately,
 * because they must not take the neumorphic extrusion (a stem two pixels wide
 * with a six-pixel shadow pair is a smudge, not a stem).
 *
 * Every shape is the same nominal size and centred on the same point, so the
 * hit target a player learns does not move when they change skin. That is the
 * one thing a cosmetic may never do.
 */
function traceNoteBody(
  ctx: CanvasRenderingContext2D,
  shape: NoteShape,
  cx: number,
  cy: number,
  size: number,
  vertical: boolean,
): void {
  const half = size / 2;
  ctx.beginPath();
  switch (shape) {
    case 'notation':
      // The head: an ellipse tilted the way an engraved notehead is, so it
      // reads as notation rather than as a circle that happens to be squashed.
      ctx.ellipse(cx, cy, size * 0.58, size * 0.42, -0.36, 0, Math.PI * 2);
      break;
    case 'circle':
      ctx.arc(cx, cy, half, 0, Math.PI * 2);
      break;
    case 'bar':
      // Across the lane, not along it: a bar along the travel axis is
      // indistinguishable from a hold tail at speed.
      if (vertical) ctx.roundRect(cx - size * 0.7, cy - size * 0.22, size * 1.4, size * 0.44, 3);
      else ctx.roundRect(cx - size * 0.22, cy - size * 0.7, size * 0.44, size * 1.4, 3);
      break;
    case 'arrow': {
      // Points the way it travels, which is the only direction an arrow here
      // could honestly mean.
      const t = size * 0.62;
      if (vertical) {
        ctx.moveTo(cx, cy + t);
        ctx.lineTo(cx - t, cy - t * 0.55);
        ctx.lineTo(cx, cy - t * 0.15);
        ctx.lineTo(cx + t, cy - t * 0.55);
      } else {
        ctx.moveTo(cx - t, cy);
        ctx.lineTo(cx + t * 0.55, cy - t);
        ctx.lineTo(cx + t * 0.15, cy);
        ctx.lineTo(cx + t * 0.55, cy + t);
      }
      ctx.closePath();
      break;
    }
    case 'pill':
    default:
      ctx.roundRect(cx - half, cy - half, size, size, 9);
      break;
  }
}

/**
 * How many flags a notehead carries for a subdivision, or `null` when the chart
 * does not say.
 *
 * `Slice.quant` is the denominator the note snapped to: 1 = on the beat,
 * 2 = eighth, 3 = triplet, 4 = sixteenth. Flags follow notation — a quarter has
 * none, an eighth one, a sixteenth two — and a triplet is drawn as an eighth
 * (which is what a triplet's members are) with the 3 that says so.
 *
 * `null` rather than 0 for an unknown quant, and the caller draws a bare head
 * for it. A chart with no rhythm data must not be able to CLAIM everything is a
 * quarter note; that is the same "missing is not on-beat" contract `Slice.quant`
 * documents, and drawing a stem would break it.
 */
function flagsForQuant(quant: number | undefined): { flags: number; triplet: boolean } | null {
  switch (quant) {
    case 1:
      return { flags: 0, triplet: false };
    case 2:
      return { flags: 1, triplet: false };
    case 3:
      return { flags: 1, triplet: true };
    case 4:
      return { flags: 2, triplet: false };
    default:
      return null;
  }
}

/** A note body's bevel and under-edge, derived from its own colour. */
interface NoteShades {
  bevel: string;
  shade: string;
}

/**
 * The two derived tones for a note colour, memoised by colour.
 *
 * `interpolateHex` builds strings, and the draw loop touches every visible note
 * every frame. The set of note colours is tiny and fixed (two lane colours, the
 * type colours, the bomb) so a `Map` converges after one frame and the hot path
 * is a lookup. Not an LRU on purpose: an unbounded cache over a bounded key
 * space is just a table.
 */
function noteShades(cache: Map<string, NoteShades>, color: string): NoteShades {
  const hit = cache.get(color);
  if (hit) return hit;
  const shades: NoteShades = {
    bevel: interpolateHex(color, '#ffffff', 0.45),
    shade: interpolateHex(color, '#000000', 0.45),
  };
  cache.set(color, shades);
  return shades;
}

/**
 * `#rrggbb` → `"r, g, b"`, for composing `rgba()` at a runtime alpha.
 *
 * Called once per theme change (it lives in the `themeRef` cache), never per
 * frame. Anything it cannot parse falls back rather than throwing: a malformed
 * custom property should cost a vignette, not the run.
 */
function rgbTriplet(color: string, fallback: string): string {
  const hex = color.trim();
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(hex);
  const long = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (long) {
    return `${parseInt(long[1], 16)}, ${parseInt(long[2], 16)}, ${parseInt(long[3], 16)}`;
  }
  if (short) {
    return [short[1], short[2], short[3]].map((c) => parseInt(c + c, 16)).join(', ');
  }
  return fallback;
}

/**
 * The early/late hit-error bar.
 *
 * A tick per recent hit at its signed offset, fading out, plus a marker at the
 * run's mean error. The engine has computed the signed offset since input
 * judging moved onto the event's own `timeStamp` — this only draws it.
 *
 * The bar spans ±BAD, the widest window, so a tick's distance from the centre is
 * directly comparable to the judgement it produced. Scaling to ±GREAT would look
 * livelier and would clip every GOOD to the edge, which teaches nothing.
 *
 * The mean marker is the actionable half: the tick cloud tells you your spread,
 * the marker tells you which way to move your audio offset — and it is the same
 * number the results screen offers to apply for you.
 */
function drawErrorBar(
  ctx: CanvasRenderingContext2D,
  engine: GameEngine,
  w: number,
  y: number,
  glow: number,
  markerColor: string,
): void {
  const timing = engine.getTimingStats();
  if (timing.samples === 0) return;

  const { offsets, times } = engine.getRecentOffsets();
  const scale = engine.getTimingScale();
  const halfWidth = Math.min(w * 0.18, 180);
  const pxPerSecond = halfWidth / (HIT_WINDOWS.BAD * scale);
  const now = performance.now();

  ctx.save();
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  // The track, and a centre notch for "exactly on time".
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = markerColor;
  ctx.fillRect(w / 2 - halfWidth, y - 1, halfWidth * 2, 2);
  ctx.globalAlpha = 0.6;
  ctx.fillRect(w / 2 - 1, y - 7, 2, 14);

  for (let i = 0; i < offsets.length; i++) {
    const at = times[i];
    if (at === 0) continue;
    const age = (now - at) / ERROR_BAR_FADE_MS;
    if (age < 0 || age >= 1) continue;

    const offset = offsets[i];
    const x = w / 2 + Math.max(-halfWidth, Math.min(halfWidth, offset * pxPerSecond));
    ctx.globalAlpha = 0.15 + 0.75 * (1 - age);
    ctx.fillStyle = JUDGEMENT_COLORS[judge(offset, scale)];
    ctx.fillRect(x - 1, y - 6, 2, 12);
  }

  ctx.globalAlpha = 1;
  ctx.fillStyle = markerColor;
  if (glow) {
    ctx.shadowColor = markerColor;
    ctx.shadowBlur = glow * 4;
  }
  const meanX =
    w / 2 + Math.max(-halfWidth, Math.min(halfWidth, (timing.meanMs / 1000) * pxPerSecond));
  ctx.fillRect(meanX - 1, y - 10, 2, 20);
  ctx.restore();
  ctx.globalAlpha = 1;
}

// Gamepad button indices (Standard Gamepad mapping)
const GAMEPAD_LANE0_BUTTONS = [2, 3, 4, 6, 12, 14]; // X, Y, LB, LT, D-Up, D-Left
const GAMEPAD_LANE1_BUTTONS = [0, 1, 5, 7, 13, 15]; // A, B, RB, RT, D-Down, D-Right
const GAMEPAD_PAUSE_BUTTON = 9; // Start/Menu

export function GameCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  /** Device-pixel ratio the drawing buffer was last sized with. */
  const dprRef = useRef(1);
  const [engine, setEngine] = useState<GameEngine | null>(null);
  const rafRef = useRef<number | null>(null);

  /**
   * Theme colours the renderer needs, resolved once per theme change instead of
   * per frame.
   *
   * `getComputedStyle()` flushes pending style/layout, so calling it inside the
   * draw loop costs a full style recalculation every time. This used to happen
   * once per frame for `--slice-bg` *and once per visible LONG note* for
   * `--slice-hold-trail` — i.e. several forced recalcs per frame on a busy
   * chart, on the one screen in the app where frame timing is the gameplay.
   *
   * Resolved against the canvas, not `<html>`: the `--slice-*` palette is scoped
   * to `.slice-theme` (a wrapper div, see app/routes/slice-it.tsx), so reading it
   * off `document.documentElement` returned "" and silently fell back to the
   * hard-coded light-mode trail colour in both themes.
   */
  const themeRef = useRef<ReturnType<typeof readTheme> | null>(null);

  const readTheme = (canvas: HTMLCanvasElement) => {
    const cs = getComputedStyle(canvas);
    const v = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
    const holdTrail = v('--slice-hold-trail', 'rgba(255, 255, 255, 0.5)');
    return {
      // Blurred shadows are this renderer's dominant cost — the canvas-2D probe
      // measured ~10 `shadowBlur` activations per frame against ~15 rasterising
      // ops, i.e. most of what it draws goes through a blur. Resolved here so the
      // decision is made once per theme/class change rather than per frame; the
      // MutationObserver below re-reads it when `perf-lite` is toggled.
      glow: canvasGlowEnabled(),
      bg: v('--slice-bg', '#e0e5ec'),
      shadowDark: v('--slice-shadow-dark', '#a3b1c6'),
      shadowLight: v('--slice-shadow-light', '#ffffff'),
      textColor: v('--slice-text-muted', '#64748b'),
      textShadowColor: v('--slice-text-shadow', 'rgba(0,0,0,0.3)'),
      rail: v('--slice-rail', '#cbd5e0'),
      noteShadow: v('--slice-note-shadow', 'rgba(163, 177, 198, 0.6)'),
      // As `r, g, b` so the vignette gradient can build a matching fully
      // transparent stop. Interpolating to the `transparent` keyword instead
      // fades toward transparent BLACK, which tints the mid-stops on any
      // theme whose vignette colour is not already black.
      vignetteRgb: rgbTriplet(v('--slice-vignette', '#64748b'), '100, 116, 139'),
      holdTrail,
      // The held-note variant is a fixed transform of the same colour — compute
      // it with the cache rather than re-running the regex per note per frame.
      holdTrailHeld: holdTrail.replace(/,\s*[\d.]+\)$/, ', 0.9)'),
    };
  };

  // DarkModeWrapper toggles `.dark` on <html>, which is what re-resolves the
  // scoped `--slice-*` values. Drop the cache when that happens (and on unmount).
  useEffect(() => {
    const observer = new MutationObserver(() => {
      themeRef.current = null;
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'style'],
    });
    return () => observer.disconnect();
  }, []);
  const [showMobileButtons, setShowMobileButtons] = useState(false);
  const [isPortrait, setIsPortrait] = useState(false);

  // Input device detection
  // Assume keyboard exists on non-touch devices to avoid a flash of "no input" warning
  const [hasKeyboard, setHasKeyboard] = useState(() => {
    if (typeof window === 'undefined') return true;
    return !window.matchMedia('(hover: none) and (pointer: coarse)').matches;
  });
  const [hasGamepad, setHasGamepad] = useState(false);
  const [hasTouch, setHasTouch] = useState(false);

  const { t } = useTranslation('c-game');
  const { t: ts } = useTranslation('r-slice-it');
  const {
    status,
    keybinds,
    extraBinds,
    isPaused,
    setIsPaused,
    isLoadingSong,
    loadingProgress,
    loadingProgressText,
    countdown,
    setCountdown,
    isMultiplayer,
    volume,
    setVolume,
    audioOffset,
    setAudioOffset,
    setKeybinds,
    laneCoverHeight,
    setLaneCoverHeight,
  } = useSliceItStore();

  // Per-player chart-load progress, from the server's `slice:loading` tick.
  const loadingPlayers = useSliceItStore((s) => s.loadingPlayers);
  // Non-null while the room is held for a player who dropped mid-song.
  const pause = useSliceItStore((s) => s.pause);

  const keybindsRef = useRef(keybinds);
  useEffect(() => {
    keybindsRef.current = keybinds;
  }, [keybinds]);

  // Settings overlay state (multiplayer: non-pausing settings panel)
  const [showSettings, setShowSettings] = useState(false);
  // Which lane's keybind is being re-mapped (null = not listening)
  const [listeningForKey, setListeningForKey] = useState<null | 'lane1' | 'lane2'>(null);
  const listeningForKeyRef = useRef<null | 'lane1' | 'lane2'>(null);
  const justAssignedKeyRef = useRef(false);
  useEffect(() => {
    listeningForKeyRef.current = listeningForKey;
  }, [listeningForKey]);

  // Sync volume store value → AudioManager
  useEffect(() => {
    AudioManager.getInstance().setVolume(volume / 100);
  }, [volume]);

  // ── Resize canvas to fill its wrapper ──────────────────────────────────────
  useEffect(() => {
    const wrapper = wrapperRef.current;
    const canvas = canvasRef.current;
    if (!wrapper || !canvas) return;

    // Clamped, and remembered, for two separate reasons. Clamped because this is
    // a full-screen surface redrawn every frame and fill rate goes with the
    // SQUARE of the ratio — a 3x phone was being asked for nine times the pixels
    // of a 1x screen, sixty times a second, on the hardware least able to give
    // them. Remembered because `render()` needs the SAME number: sizing the
    // buffer from a clamped ratio while drawing at the raw one scales the whole
    // playfield.
    const sync = () => {
      const { width, height } = wrapper.getBoundingClientRect();
      if (width > 0 && height > 0) {
        const dpr = gameSurfaceDpr(window);
        dprRef.current = dpr;
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
      }
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(wrapper);
    // Page zoom and a move to a different-density monitor both change the ratio
    // without resizing the wrapper, so the ResizeObserver alone would leave the
    // buffer at the old resolution.
    const ratioQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
    ratioQuery.addEventListener('change', sync);
    return () => {
      ro.disconnect();
      ratioQuery.removeEventListener('change', sync);
    };
  }, []);

  // ── Detect portrait orientation ─────────────────────────────────────────────
  useEffect(() => {
    const checkPortrait = () => setIsPortrait(window.innerHeight > window.innerWidth * 1.1);
    checkPortrait();
    window.addEventListener('resize', checkPortrait);
    return () => window.removeEventListener('resize', checkPortrait);
  }, []);

  // ── Detect touch device ────────────────────────────────────────────────────
  useEffect(() => {
    const check = () => {
      const isTouchDevice = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
      setShowMobileButtons(isTouchDevice);
      if (isTouchDevice) setHasTouch(true);
    };
    check();
    window.addEventListener(
      'touchstart',
      () => {
        setShowMobileButtons(true);
        setHasTouch(true);
      },
      { once: true },
    );
  }, []);

  // ── Detect keyboard ────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = () => {
      setHasKeyboard(true);
    };
    window.addEventListener('keydown', onKey, { once: true });
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ── Detect gamepad ─────────────────────────────────────────────────────────
  useEffect(() => {
    // Check if any gamepads are already connected
    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const gp of gamepads) {
      if (gp) {
        setHasGamepad(true);
        break;
      }
    }

    const onConnect = () => setHasGamepad(true);
    const onDisconnect = () => {
      const remaining = navigator.getGamepads ? navigator.getGamepads() : [];
      const anyLeft = Array.from(remaining).some((gp) => gp !== null);
      setHasGamepad(anyLeft);
    };

    window.addEventListener('gamepadconnected', onConnect);
    window.addEventListener('gamepaddisconnected', onDisconnect);
    return () => {
      window.removeEventListener('gamepadconnected', onConnect);
      window.removeEventListener('gamepaddisconnected', onDisconnect);
    };
  }, []);

  // ── Input ──────────────────────────────────────────────────────────────────
  /**
   * @param pressTime  The originating event's `timeStamp` — when the input
   *   actually happened, as opposed to when this handler got to run. On a busy
   *   frame those differ by 5-15 ms, and 15 ms is the whole MARVELOUS window,
   *   so without it the engine charges main-thread latency to the player.
   */
  const handleInput = useCallback(
    (lane: number, pressTime?: number) => {
      if (!engine) return;
      // Block input during countdown
      if (useSliceItStore.getState().countdown > 0) return;
      const audio = AudioManager.getInstance();
      if (audio.getContext()?.state === 'suspended') {
        audio.getContext()?.resume();
        engine.start();
      } else if (audio.getCurrentTime() === 0) {
        engine.start();
      }
      engine.submitInput(mirrorLane(lane), pressTime);
    },
    [engine],
  );

  const handleInputRelease = useCallback(
    (lane: number) => {
      if (!engine) return;
      engine.submitRelease(mirrorLane(lane));
    },
    [engine],
  );

  // ── Gamepad polling for in-game input ───────────────────────────────────────
  const gamepadPrevRef = useRef<Record<number, Set<number>>>({});
  useEffect(() => {
    if (!hasGamepad) return;

    let animId: number;
    const poll = () => {
      const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
      const store = useSliceItStore.getState();

      for (const gp of gamepads) {
        if (!gp) continue;
        const prev = gamepadPrevRef.current[gp.index] || new Set<number>();
        const curr = new Set<number>();

        gp.buttons.forEach((btn, i) => {
          if (btn.pressed) curr.add(i);
        });

        // Only fire on newly-pressed buttons (edge detection)
        curr.forEach((btnIdx) => {
          if (prev.has(btnIdx)) return; // already held

          // Handle pause toggle (Start button)
          if (btnIdx === GAMEPAD_PAUSE_BUTTON && store.status === 'PLAYING') {
            if (store.isMultiplayer) {
              setShowSettings((p) => !p);
            } else {
              if (store.isPaused) engine?.resume();
              else engine?.pause();
            }
            return;
          }

          // Gameplay input
          if (store.status !== 'PLAYING') return;
          if (store.isPaused) return;
          if (store.countdown > 0) return;

          // No press timestamp here, and there cannot be one: the Gamepad API
          // is polled rather than evented, so a press is only observable on the
          // next frame and `gamepad.timestamp` is neither in `performance.now()`
          // units nor consistent across browsers. Pad players pay up to one
          // frame; keyboard and touch do not.
          // I2 — the pad that pressed gets the feedback. Short and fixed
          // rather than judgement-scaled: the judgement is not known until the
          // engine resolves, and waiting for it would put the rumble a frame
          // after the press, which reads as lag rather than as confirmation.
          if (GAMEPAD_LANE0_BUTTONS.includes(btnIdx) || GAMEPAD_LANE1_BUTTONS.includes(btnIdx)) {
            rumble(gp, 8);
          }
          if (GAMEPAD_LANE0_BUTTONS.includes(btnIdx)) handleInput(0);
          else if (GAMEPAD_LANE1_BUTTONS.includes(btnIdx)) handleInput(1);
        });

        // Detect releases
        prev.forEach((btnIdx) => {
          if (curr.has(btnIdx)) return; // still held

          if (store.status !== 'PLAYING') return;
          if (store.isPaused) return;

          if (GAMEPAD_LANE0_BUTTONS.includes(btnIdx)) handleInputRelease(0);
          else if (GAMEPAD_LANE1_BUTTONS.includes(btnIdx)) handleInputRelease(1);
        });

        gamepadPrevRef.current[gp.index] = curr;
      }

      animId = requestAnimationFrame(poll);
    };
    animId = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(animId);
  }, [hasGamepad, engine, handleInput]);

  // ── Game engine init ───────────────────────────────────────────────────────
  const [debugInfo, setDebugInfo] = useState({ frames: 0, error: 'None' });
  const frameRef = useRef(0);

  // ── Game engine init ───────────────────────────────────────────────────────
  useEffect(() => {
    const newEngine = new GameEngine();
    setEngine(newEngine);

    const loop = () => {
      frameRef.current++;
      // Update debug info every 60 frames to avoid render thrashing
      if (frameRef.current % 60 === 0) {
        setDebugInfo((prev) => ({ ...prev, frames: frameRef.current }));
      }

      try {
        const canvas = canvasRef.current;
        if (!canvas) return; // Gracefully exit loop if component unmounted

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Update first, then render what it produced. The other order showed a
        // frame of stale state — a note that had just expired still drawn as
        // live — and the `update()` call was duplicated below it, so everything
        // in the engine that accumulates over time ran twice per frame.
        newEngine.update();
        render(ctx, newEngine, keybindsRef.current);
      } catch (e: any) {
        console.error('GameCanvas Render Error:', e);
        setDebugInfo((prev) => ({ ...prev, error: e.message || 'Unknown Error' }));
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    // Pause audio when tab is hidden, resume when visible again
    const handleVisibilityChange = () => {
      const audio = AudioManager.getInstance();
      const store = useSliceItStore.getState();
      if (document.hidden) {
        if (store.status === 'PLAYING' && !store.isPaused && !store.isMultiplayer) {
          newEngine.pause();
        } else if (store.status === 'PLAYING') {
          // In multiplayer or if game is running, just stop audio without pausing game state
          audio.pause();
        }
      } else {
        if (store.status === 'PLAYING' && store.isPaused && !store.isMultiplayer) {
          // Don't auto-resume — let the player decide
        } else if (store.status === 'PLAYING' && !store.isPaused) {
          audio.play();
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      AudioManager.getInstance().stop();
      useSliceItStore.getState().resetRun();
    };
  }, []);

  // ── Multiplayer match wiring ───────────────────────────────────────────────
  //
  // The server owns the match clock: the countdown, the pause when someone
  // drops, and the resume after they return. Everything below renders that
  // decision rather than making one — including the pause, which used to have
  // no client-side representation at all because the protocol had no way to
  // express it.
  useEffect(() => {
    if (!engine) return;

    const beep = (frequency: number, gain: number) => {
      const sfxVolume = useSliceItStore.getState().sfxVolume / 100;
      AudioManager.getInstance().playSfX(frequency, 'sine', 0.12, sfxVolume * gain);
    };

    /**
     * Count down to a server timestamp, then run `onZero`.
     *
     * Against the server's clock, not a local `setInterval` chain: two clients
     * whose clocks differ by a second would otherwise start a second apart,
     * having each counted "3, 2, 1" perfectly.
     */
    const countTo = (startsAt: number, onZero: () => void) => {
      let lastSecond = -1;
      const tick = () => {
        const remaining = Math.max(0, Math.ceil((startsAt - Date.now()) / 1000));
        if (remaining !== lastSecond) {
          lastSecond = remaining;
          useSliceItStore.getState().setCountdown(remaining);
          if (remaining > 0) beep(660, 0.6);
        }
        if (Date.now() >= startsAt) {
          clearInterval(timer);
          useSliceItStore.getState().setCountdown(0);
          beep(880, 0.8);
          onZero();
        }
      };
      const timer = setInterval(tick, 100);
      tick();
      return () => clearInterval(timer);
    };

    let cancelCountdown: (() => void) | null = null;

    const unsubscribe = addMatchListener({
      onCountdown: ({ startsAt }) => {
        cancelCountdown?.();
        const store = useSliceItStore.getState();
        store.setIsLoadingSong(false);
        cancelCountdown = countTo(startsAt, () => {
          useSliceItStore.getState().setIsPaused(false);
          engine.start();
        });
      },

      onPause: () => {
        cancelCountdown?.();
        cancelCountdown = null;
        engine.pause();
      },

      onResume: ({ resumeAt }) => {
        cancelCountdown?.();
        cancelCountdown = countTo(resumeAt, () => {
          useSliceItStore.getState().setIsPaused(false);
          engine.resume();
        });
      },

      onKicked: (reason) => {
        cancelCountdown?.();
        toast.error(
          reason === 'removed_by_host'
            ? t('kicked-by-host', { defaultValue: 'The host removed you from the lobby.' })
            : t('kicked-generic', { defaultValue: 'You left the lobby.' }),
        );
        const store = useSliceItStore.getState();
        store.setStatus('MENU');
        engine.reset();
      },
    });

    return () => {
      unsubscribe();
      cancelCountdown?.();
    };
  }, [engine, t]);

  // Returning to the lobby after results: the server flips the lobby back to
  // `waiting`, which is the cue to tear the run down and show the menu again.
  const lobbyState = useSliceItStore((s) => s.lobby?.state ?? null);
  useEffect(() => {
    if (lobbyState !== 'waiting' || !engine) return;
    const store = useSliceItStore.getState();
    if (store.status === 'MENU') return;
    store.setMatchResults(null);
    store.setStatus('MENU');
    engine.reset();
  }, [lobbyState, engine]);

  // ── I10: session guards ─────────────────────────────────────────────────
  //
  // Wake lock, acquired at run start and released on finish. `PLAYING` covers
  // a pause too — a paused run is still "a run sitting in a browser tab",
  // which is the situation this exists for. `requestScreenWakeLock` already
  // re-acquires itself on `visibilitychange` (see `lib/shared/platform.ts`):
  // the browser drops the lock the instant the tab is hidden and does not
  // restore it, so a run that only acquired once would keep the screen awake
  // until the first notification banner and never again after.
  useEffect(() => {
    if (status !== 'PLAYING') return;
    return requestScreenWakeLock();
  }, [status]);

  // Guard navigation during a run — the browser-level half of the same care
  // the multiplayer pause handler already takes about not losing someone's
  // run. This only reaches actual browser navigation (refresh, close tab, an
  // outbound link); an in-app router guard would need to live wherever
  // `app/routes/**` is owned this wave — see
  // `docs/_handoff/presentation-requests.md`.
  useEffect(() => {
    if (status !== 'PLAYING' || countdown > 0) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [status, countdown]);

  // ── H6: hold-to-restart ──────────────────────────────────────────────────
  //
  // Disabled in multiplayer — restarting is a solo notion; the match clock is
  // the server's. `e.code` rather than `e.key`: every other keybind in this
  // file is compared by `code` (see `keybinds`), and `key` is what a dead-key
  // layout or a Shift held for another reason would rewrite.
  const [restartHolding, setRestartHolding] = useState(false);
  useEffect(() => {
    if (isMultiplayer || status !== 'PLAYING' || !engine) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const down = (e: KeyboardEvent) => {
      if (e.code !== 'Backquote' || timer !== undefined) return;
      if (useSliceItStore.getState().isPaused) return;
      setRestartHolding(true);
      timer = setTimeout(() => {
        timer = undefined;
        setRestartHolding(false);
        engine.reset();
        engine.start();
      }, RESTART_HOLD_MS);
    };
    const up = (e: KeyboardEvent) => {
      if (e.code !== 'Backquote') return;
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
      setRestartHolding(false);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [engine, isMultiplayer, status]);

  // ── H6: lead-in skip ─────────────────────────────────────────────────────
  //
  // Only offered while there is still a skip left to take: past
  // `leadIn - SKIP_TARGET_LEAD_SEC` the button would either do nothing or jump
  // backwards, neither of which is a skip. Polled on a plain interval rather
  // than `requestAnimationFrame` — a button's visibility does not need frame
  // precision, and a `setInterval` that clears itself the moment the window
  // closes never becomes a loop this screen has to justify keeping.
  const [canSkipLeadIn, setCanSkipLeadIn] = useState(false);
  useEffect(() => {
    setCanSkipLeadIn(false);
    if (isMultiplayer || status !== 'PLAYING' || !engine) return;

    // The engine's prepared slices, for the same reason `render` uses them: on
    // a per-difficulty chart `map.slices` is a record, `Array.isArray` is false,
    // and this quietly decided every song had no lead-in to skip.
    const first = engine.getSlices()[0];
    const leadIn = first?.time ?? 0;
    if (leadIn <= SKIPPABLE_LEAD_IN_SEC) return;

    const id = window.setInterval(() => {
      const store = useSliceItStore.getState();
      const stillSkippable =
        !store.isPaused &&
        store.countdown === 0 &&
        AudioManager.getInstance().getCurrentTime() < leadIn - SKIP_TARGET_LEAD_SEC;
      setCanSkipLeadIn(stillSkippable);
      // Settle: nothing in a song ever makes the window valid again once it
      // has closed, so the interval has no more work to do.
      if (!stillSkippable) window.clearInterval(id);
    }, 200);
    return () => window.clearInterval(id);
  }, [engine, isMultiplayer, status]);

  const skipLeadIn = useCallback(() => {
    if (!engine) return;
    const first = engine.getSlices()[0];
    if (!first) return;
    engine.seek(Math.max(0, first.time - SKIP_TARGET_LEAD_SEC));
    setCanSkipLeadIn(false);
  }, [engine]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // If waiting for a keybind assignment, capture any key (ESC cancels)
      if (listeningForKeyRef.current) {
        e.preventDefault();
        if (e.code !== 'Escape') {
          setKeybinds({ ...keybindsRef.current, [listeningForKeyRef.current]: e.code });
        }
        setListeningForKey(null);
        justAssignedKeyRef.current = true;
        setTimeout(() => (justAssignedKeyRef.current = false), 100);
        return;
      }

      if (e.code === 'Escape') {
        e.preventDefault();
        if (status === 'PLAYING') {
          if (isMultiplayer) {
            // Multiplayer: toggle settings overlay without pausing
            setShowSettings((prev) => !prev);
          } else {
            // Singleplayer: toggle pause
            const store = useSliceItStore.getState();
            if (store.isPaused) engine?.resume();
            else engine?.pause();
          }
        }
        return;
      }
      if (useSliceItStore.getState().isPaused) return;
      if (status !== 'PLAYING') return;
      if (useSliceItStore.getState().countdown > 0) return;
      if (e.repeat) return; // Block held-key repeats: one press = one note
      // I1 — a lane can carry more than one key. Alternating two keys on one
      // lane is how a fast jack is played, and one-binding-per-lane made that
      // physically impossible.
      const pressedLane = laneForKey(keybinds, extraBinds, e.code);
      if (pressedLane !== null) handleInput(pressedLane, e.timeStamp);
      if (e.code === 'Space') e.preventDefault();
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (useSliceItStore.getState().isPaused) return;
      if (status !== 'PLAYING') return;
      const releasedLane = laneForKey(keybinds, extraBinds, e.code);
      if (releasedLane !== null) handleInputRelease(releasedLane);
    };

    let lastTouchTime = 0;
    const handleGlobalClick = (e: MouseEvent | TouchEvent) => {
      if (e.type === 'touchstart') {
        lastTouchTime = performance.now();
      } else if (e.type === 'mousedown') {
        // Prevent double-fire on touch devices
        if (performance.now() - lastTouchTime < 500) return;

        // If rebinding, capture this mouse button as the new keybind
        if (listeningForKeyRef.current) {
          const btnCode = `Mouse${(e as MouseEvent).button}`;
          setKeybinds({ ...keybindsRef.current, [listeningForKeyRef.current]: btnCode });
          setListeningForKey(null);
          justAssignedKeyRef.current = true;
          setTimeout(() => (justAssignedKeyRef.current = false), 100);
          return;
        }

        // Only process if this button is mapped to a lane
        const btnCode = `Mouse${(e as MouseEvent).button}`;
        const kb = keybindsRef.current;
        if (btnCode !== kb.lane1 && btnCode !== kb.lane2) return;
      }

      if ((e.target as HTMLElement).closest('[data-mobile-btn]')) return;
      if ((e.target as HTMLElement).tagName === 'BUTTON') return;
      if ((e.target as HTMLElement).closest('[data-settings-panel]')) return;
      if (useSliceItStore.getState().isPaused) return;
      if (isMultiplayer && showSettings) return;
      if (status !== 'PLAYING') return;
      if (useSliceItStore.getState().countdown > 0) return;

      if (e instanceof MouseEvent) {
        // Use keybind mapping to determine lane
        const btnCode = `Mouse${(e as MouseEvent).button}`;
        const kb = keybindsRef.current;
        if (btnCode === kb.lane1) handleInput(0, e.timeStamp);
        else if (btnCode === kb.lane2) handleInput(1, e.timeStamp);
        return;
      }

      // Touch: detect lane by position
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const touch = (e as TouchEvent).touches[0];
      // Mobile vertical: left/right halves = lane 0/1
      // Desktop/landscape: top/bottom halves = lane 0/1
      const isMobileV = rect.height > rect.width;
      const lane = isMobileV
        ? touch.clientX - rect.left < rect.width / 2
          ? 0
          : 1
        : touch.clientY - rect.top < rect.height / 2
          ? 0
          : 1;
      handleInput(lane, e.timeStamp);
    };

    const handleGlobalRelease = (e: MouseEvent | TouchEvent) => {
      if (e.type === 'mouseup') {
        const btnCode = `Mouse${(e as MouseEvent).button}`;
        const kb = keybindsRef.current;
        if (btnCode !== kb.lane1 && btnCode !== kb.lane2) return;
      }
      if (useSliceItStore.getState().isPaused) return;
      if (status !== 'PLAYING') return;

      if (e instanceof MouseEvent) {
        const btnCode = `Mouse${(e as MouseEvent).button}`;
        const kb = keybindsRef.current;
        if (btnCode === kb.lane1) handleInputRelease(0);
        else if (btnCode === kb.lane2) handleInputRelease(1);
        return;
      }

      if (!(e as TouchEvent).changedTouches?.length) return;
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const touch = (e as TouchEvent).changedTouches[0];
      const isMobileV = rect.height > rect.width;
      const lane = isMobileV
        ? touch.clientX - rect.left < rect.width / 2
          ? 0
          : 1
        : touch.clientY - rect.top < rect.height / 2
          ? 0
          : 1;
      handleInputRelease(lane);
    };

    // Disable context menu during gameplay
    const handleContextMenu = (e: MouseEvent) => {
      if (status === 'PLAYING') e.preventDefault();
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('mousedown', handleGlobalClick);
    window.addEventListener('mouseup', handleGlobalRelease);
    window.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('touchstart', handleGlobalClick, { passive: true });
    window.addEventListener('touchend', handleGlobalRelease, { passive: true });
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('mousedown', handleGlobalClick);
      window.removeEventListener('mouseup', handleGlobalRelease);
      window.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('touchstart', handleGlobalClick);
      window.removeEventListener('touchend', handleGlobalRelease);
    };
  }, [engine, keybinds, status, handleInput, handleInputRelease, isMultiplayer, setKeybinds]);

  useEffect(() => {
    if (status === 'MENU' && engine) {
      useSliceItStore.getState().setIsMultiplayer(false);
      engine.setMultiplayer(false);
      engine.reset();
    }
  }, [status, engine]);

  // ── Render ─────────────────────────────────────────────────────────────────
  // ── Particle System ────────────────────────────────────────────────────────
  const particlesRef = useRef<
    { x: number; y: number; vx: number; vy: number; life: number; color: string; size: number }[]
  >([]);
  const lastHitTimeRef = useRef(0);

  const spawnParticles = (x: number, y: number, color: string, hitResult: string = 'GOOD') => {
    // Particle intensity scales with hit accuracy
    const configs: Record<
      string,
      { count: number; minSpeed: number; maxSpeed: number; minSize: number; maxSize: number }
    > = {
      MARVELOUS: { count: 18, minSpeed: 4, maxSpeed: 11, minSize: 4, maxSize: 9 },
      PERFECT: { count: 13, minSpeed: 3, maxSpeed: 8, minSize: 3, maxSize: 7 },
      GREAT: { count: 9, minSpeed: 2, maxSpeed: 6, minSize: 2, maxSize: 5 },
      GOOD: { count: 5, minSpeed: 1.5, maxSpeed: 4, minSize: 1, maxSize: 4 },
      'HOLD OK': { count: 10, minSpeed: 2, maxSpeed: 6, minSize: 2, maxSize: 5 },
    };
    const cfg = configs[hitResult] ?? configs['GOOD'];
    for (let i = 0; i < cfg.count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * (cfg.maxSpeed - cfg.minSpeed) + cfg.minSpeed;
      particlesRef.current.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1.0,
        color,
        size: Math.random() * (cfg.maxSize - cfg.minSize) + cfg.minSize,
      });
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  /** Wall-clock seconds since the previous rendered frame. See `lastFrameAt`. */
  const lastFrameAt = useRef(0);

  /**
   * V13 — the smoothed playfield energy, 0–1. See `comboEnergy` in
   * `lib/slice-it/presentation.ts` for what it means and why it is a curve.
   *
   * A ref rather than state: it changes every frame and nothing in the DOM
   * reads it, so putting it in `useState` would re-render the component tree
   * sixty times a second to draw on a canvas.
   */
  const energyRef = useRef(0);

  /**
   * The vignette gradient, and the canvas size it was built for.
   *
   * `createRadialGradient` allocates, and the draw loop cannot afford one per
   * frame. Keyed on size alone: the energy rides on `globalAlpha` at fill time
   * rather than being baked into the colour stops, so the gradient itself is
   * the same object for the whole run and this is rebuilt only on resize.
   */
  const energyCacheRef = useRef<{
    w: number;
    h: number;
    vignette: CanvasGradient | null;
  }>({ w: 0, h: 0, vignette: null });

  /** Derived note tones, keyed by note colour. See `noteShades`. */
  const noteShadesRef = useRef<Map<string, NoteShades>>(new Map());

  const render = (
    ctx: CanvasRenderingContext2D,
    engine: GameEngine,
    currentKeybinds: { lane1: string; lane2: string },
  ) => {
    // Anything that integrates over time uses this rather than assuming a
    // frame is 1/60 s. Clamped so a tab that was backgrounded for a minute does
    // not teleport every particle off screen on the frame it comes back.
    const nowMs = performance.now();
    const frameDelta = lastFrameAt.current
      ? Math.min(0.1, (nowMs - lastFrameAt.current) / 1000)
      : 1 / 60;
    lastFrameAt.current = nowMs;

    const W = ctx.canvas.width;
    const H = ctx.canvas.height;
    // The same ratio the drawing buffer was sized with — see `sync()` above.
    const dpr = dprRef.current;

    // Reset & Clear — theme colours come from the per-theme cache, never from a
    // per-frame getComputedStyle (see themeRef).
    const theme = (themeRef.current ??= readTheme(ctx.canvas));
    const bgColor = theme.bg;
    // Multiplier applied to every shadowBlur below: 0 collapses the blur to a
    // no-op (offsets are always 0 here, so nothing is drawn) on low-end devices
    // and under reduced motion, while capable devices keep the neumorphic look.
    const glow = theme.glow ? 1 : 0;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, W, H);

    // Setup Scale
    ctx.save();
    ctx.scale(dpr, dpr);
    const w = W / dpr;
    const h = H / dpr;

    // Spin modifier: slowly slowly rotate counter-clockwise based on song time
    const isSpinMod = useSliceItStore.getState().modifiers.spin;
    if (isSpinMod) {
      const t = AudioManager.getInstance().getCurrentTime();
      // Slow counter-clockwise rotation based on seconds
      const rotation = -t * 0.25;

      // Dynamic scale: shrink just enough so the rotated rectangle fits in the viewport
      // For a WxH rect rotated by θ, bounding box is:
      //   bw = |W·cosθ| + |H·sinθ|, bh = |W·sinθ| + |H·cosθ|
      const abscos = Math.abs(Math.cos(rotation));
      const absSin = Math.abs(Math.sin(rotation));
      const boundW = w * abscos + h * absSin;
      const boundH = w * absSin + h * abscos;
      const spinScale = Math.min(w / boundW, h / boundH);

      // No translations, just rotation anchored exactly at the center
      ctx.translate(w / 2, h / 2);
      ctx.scale(spinScale, spinScale);
      ctx.rotate(rotation);
      ctx.translate(-w / 2, -h / 2);
    }

    // Constants - SCALING UPDATE
    // G9: the approach distance used to be a hard-coded ~3 seconds at 1.0x
    // speed. `approachSeconds` reproduces that exactly at the setting's
    // default (`scrollSpeed: 1.0`, `scrollMode: 'constant'`) and generalises
    // it into the player-tunable "green number" — see `store.ts`.
    const runState = useSliceItStore.getState();
    const speedMod = runState.modifiers.speed || 1.0;
    const isOneTrack = runState.modifiers.oneTrack;
    const quantColorsOn = runState.quantColors;
    // A3 — the lane palette. Resolved per frame from the store rather than
    // captured, so switching palettes in settings takes effect without a reload.
    const palette = resolvePalette(runState.lanePalette);
    // V1 — the note/playfield skin. Resolved per frame from the store for the
    // same reason the palette is: changing it in settings takes effect without
    // a reload. Note that `skin.palette` is deliberately NOT applied — the
    // player's own `lanePalette` is a colour-vision setting and a cosmetic does
    // not get to overrule one.
    const skin = resolveSkin(runState.noteSkin);
    const laneA = laneColor(palette, 0);
    const laneB = laneColor(palette, 1);
    // A2 — photosensitivity. Distinct from `canvasGlowEnabled()`, which is the
    // PERFORMANCE tier: a fast machine still gets every flash without this.
    const flashOff = runState.reducedFlash;
    const fx = runState.effectIntensity; // A7
    const mirrorOn = runState.mirror && !isOneTrack;

    // V13 — playfield energy. One scalar, tracking the combo curve, driving
    // every "the run is going well" treatment below (lane rails, the vignette,
    // note trails, the receptor glow) so they all move together and none of
    // them fires on a threshold.
    //
    // Gated exactly like the combo-break wash and the milestone label: `glow`
    // (which folds in reduced motion and `perf-lite`), `flashOff` (A2's
    // photosensitivity mode) and `fx` (A7's intensity dial). When any of them
    // says no the TARGET goes to zero and the field drains to the calm look
    // rather than snapping to it — degrading to calm, not to broken.
    const energyTarget = glow && !flashOff ? comboEnergy(engine.getCombo()) : 0;
    energyRef.current = approachEnergy(energyRef.current, energyTarget, frameDelta);
    const energy = energyRef.current * fx;

    const isMobileV = h > w; // portrait canvas = mobile vertical mode
    const currentTime = AudioManager.getInstance().getCurrentTime();
    const activeBpm = engine.getActiveMap()?.bpm || 120;
    const approachSec = approachSeconds(activeBpm, runState.scrollSpeed, runState.scrollMode);

    // In mobile vertical mode, notes scroll top-to-bottom with lanes left/right.
    // In desktop mode, notes scroll right-to-left with lanes top/bottom.
    const PPS = isMobileV ? (h / approachSec) * speedMod : (w / approachSec) * speedMod;
    // G11 — the judgement line's position, as runway left AFTER the line.
    //
    // The shipped values were 0.85 down a portrait canvas and 0.15 across a
    // landscape one; both are "15% of the axis remains", so one setting
    // expresses both orientations and the default reproduces each exactly.
    //
    // Cosmetic only: `approachSec` (G9) decides how LONG a note is on screen,
    // and this decides where that time is spent — moving the line does not
    // give or take reading time, which is why it carries no score implication.
    const linePos = clampLinePosition(runState.linePosition);
    const CURSOR_MAIN = isMobileV ? h * (1 - linePos) : w * linePos;
    const LANE_POS = isMobileV
      ? isOneTrack
        ? [w * 0.5]
        : [w * 0.3, w * 0.7]
      : isOneTrack
        ? [h * 0.5]
        : [h * 0.3, h * 0.7];
    const BAR_H = isMobileV ? Math.max(15, w * 0.06) : Math.max(15, h * 0.04);
    const CURSOR_R = isMobileV ? Math.max(10, h * 0.008) : Math.max(10, w * 0.008);

    // Helper: convert scroll-axis + lane-axis to canvas (x, y)
    const toCanvas = (scrollVal: number, laneVal: number) =>
      isMobileV ? { x: laneVal, y: scrollVal } : { x: scrollVal, y: laneVal };

    // Helper: compute scroll position from time delta
    const scrollPos = (timeDelta: number) =>
      isMobileV ? CURSOR_MAIN - timeDelta * PPS : CURSOR_MAIN + timeDelta * PPS;

    // 0. V13 — the vignette, tightening with energy.
    //
    // UNDER the notes, deliberately. Drawn on top it would darken the edge the
    // notes arrive from, which costs reading time at exactly the combo where
    // the player has the most to lose — an "energy" effect that makes the game
    // harder the better you are doing is a bug with a nice gradient on it. Down
    // here it only deepens the background, and the field reads as closing in
    // around the lanes without a single note losing contrast.
    //
    // The gradient depends only on the canvas size, so it survives across
    // frames and energy rides on `globalAlpha` instead of being baked into the
    // colour stops. Rebuilt on resize alone.
    if (energy > 0.01) {
      const cache = energyCacheRef.current;
      if (!cache.vignette || cache.w !== w || cache.h !== h) {
        const radius = Math.hypot(w, h) / 2;
        const gradient = ctx.createRadialGradient(w / 2, h / 2, radius * 0.42, w / 2, h / 2, radius);
        gradient.addColorStop(0, `rgba(${theme.vignetteRgb}, 0)`);
        gradient.addColorStop(1, `rgba(${theme.vignetteRgb}, 1)`);
        cache.vignette = gradient;
        cache.w = w;
        cache.h = h;
      }
      ctx.save();
      ctx.globalAlpha = 0.6 * energy;
      ctx.fillStyle = cache.vignette;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }

    // 1. Draw Tracks (Neumorphic Trough)
    const { shadowDark, shadowLight } = theme;
    LANE_POS.forEach((laneVal, i) => {
      const trackThickness = BAR_H * 1.5;
      // V13 — the rail's own colour, which is what saturates with combo. The
      // lane palette rather than a new colour of its own: `palettes.ts` is the
      // thing that keeps this game legible to a colour-blind player, and a
      // decoration that introduces a hue outside it would be the one part of
      // the playfield that ignores the setting.
      const railColor = isOneTrack ? laneA : laneColor(palette, i);

      // The trough's offsets are gated on `glow` alongside its blur, for the
      // same reason the notes' are: `shadowBlur: 0` with a live offset still
      // paints a hard-edged copy, so on `perf-lite` and under reduced motion
      // each lane was drawing two crisp duplicate bars 6px apart instead of
      // one flat trough. The comment on `glow` above claimed "offsets are
      // always 0 here" — this is the code that made that untrue.
      const troughLift = glow * 3;
      if (isMobileV) {
        // Vertical tracks running top-to-bottom
        ctx.shadowColor = shadowDark;
        ctx.shadowBlur = glow * 10;
        ctx.shadowOffsetX = troughLift;
        ctx.shadowOffsetY = troughLift;
        ctx.fillStyle = bgColor;
        ctx.fillRect(laneVal - trackThickness / 2, 0, trackThickness, h);
        ctx.shadowColor = shadowLight;
        ctx.shadowBlur = glow * 10;
        ctx.shadowOffsetX = -troughLift;
        ctx.shadowOffsetY = -troughLift;
        ctx.fillRect(laneVal - trackThickness / 2, 0, trackThickness, h);
      } else {
        // Horizontal tracks running left-to-right (desktop)
        ctx.shadowColor = shadowDark;
        ctx.shadowBlur = glow * 10;
        ctx.shadowOffsetX = troughLift;
        ctx.shadowOffsetY = troughLift;
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, laneVal - trackThickness / 2, w, trackThickness);
        ctx.shadowColor = shadowLight;
        ctx.shadowBlur = glow * 10;
        ctx.shadowOffsetX = -troughLift;
        ctx.shadowOffsetY = -troughLift;
        ctx.fillRect(0, laneVal - trackThickness / 2, w, trackThickness);
      }

      // The rail line, and V13's glow along it.
      //
      // One code path for both orientations now. The two branches above used
      // to carry a stroke each that differed only in which axis the line ran
      // along, and keeping two copies of it is how a `#cbd5e0` literal — a
      // LIGHT-theme grey — ended up being the single brightest thing on the
      // dark playfield, in both of them.
      ctx.shadowColor = 'transparent';
      const railX0 = isMobileV ? laneVal : 0;
      const railY0 = isMobileV ? 0 : laneVal;
      const railX1 = isMobileV ? laneVal : w;
      const railY1 = isMobileV ? h : laneVal;

      ctx.strokeStyle = theme.rail;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(railX0, railY0);
      ctx.lineTo(railX1, railY1);
      ctx.stroke();

      if (energy > 0.01) {
        // The same line again in the lane's own colour, widening and
        // brightening with the streak. A second stroke rather than lerping the
        // first one's colour: a rail that only brightens loses its edge against
        // the trough at high energy, and the edge is what the eye tracks.
        ctx.save();
        ctx.globalAlpha = Math.min(1, 0.12 + 0.5 * energy);
        ctx.strokeStyle = railColor;
        ctx.lineWidth = 2 + 2.5 * energy;
        ctx.shadowColor = railColor;
        ctx.shadowBlur = glow * 14 * energy;
        ctx.beginPath();
        ctx.moveTo(railX0, railY0);
        ctx.lineTo(railX1, railY1);
        ctx.stroke();
        ctx.restore();
      }
    });

    // 2. Render Check & Spawn Particles
    // We check processed slices to trigger effects.
    // A better way is to check the `feedbackQueue` for new hits.
    // But for visual sync, let's look at `feedbackQueue`.
    const latestFeedback = engine.feedbackQueue[engine.feedbackQueue.length - 1];
    if (latestFeedback && latestFeedback.time > lastHitTimeRef.current) {
      lastHitTimeRef.current = latestFeedback.time;
      if (
        latestFeedback.text !== 'MISS' &&
        latestFeedback.text !== 'BAD' &&
        latestFeedback.text !== 'RELEASED'
      ) {
        const rawParticleLane = mirrorOn ? 1 - latestFeedback.lane : latestFeedback.lane;
        const particleLaneIdx = Math.max(0, Math.min(rawParticleLane, LANE_POS.length - 1));
        const particleLaneVal = isOneTrack ? LANE_POS[0] : LANE_POS[particleLaneIdx];

        // Offset particle emission based on timing offset
        const offsetPixels = (latestFeedback.offset || 0) * PPS;
        const particleScroll = isMobileV
          ? CURSOR_MAIN + offsetPixels // late = below cursor in vertical
          : CURSOR_MAIN - offsetPixels; // late = left of cursor in horizontal
        const { x: particleX, y: particleY } = toCanvas(particleScroll, particleLaneVal);

        // V1 — `hitBurst` decides which half of the hit feedback plays: this
        // burst, the ring that leaves the receptor (section 5), or neither.
        if (skin.hitBurst === 'particles') {
          spawnParticles(particleX, particleY, latestFeedback.color, latestFeedback.text);
        }
      }
    }

    // 3. Slices
    const map = engine.getActiveMap();
    if (map) {
      // Shadow for floating notes
      ctx.shadowColor = theme.noteShadow;
      ctx.shadowBlur = glow * 8;
      ctx.shadowOffsetX = 4;
      ctx.shadowOffsetY = 4;

      // Determine the targeted (next hittable) note per lane for glow.
      // Two ids, compared a few thousand times a frame — string equality beats
      // allocating a Set per frame to hold them.
      const targeted0 = engine.getTargetedSlice(0)?.id;
      const targeted1 = engine.getTargetedSlice(1)?.id;

      // ── What gets drawn ───────────────────────────────────────────────────
      //
      // The ENGINE's slices, not `map.slices`. This used to be
      // `map.slices as Slice[]`, and that cast was a lie in three ways:
      //
      //  1. `BeatMap.slices` is `Slice[] | Record<Difficulty, Slice[]>`. For
      //     every chart stored in the record form — which is every chart the
      //     current charter writes, and every response `trimToDifficulty`
      //     touches (`O7` keys its trim by difficulty) — the cast handed a
      //     plain OBJECT to the binary search below. `slices.length` is then
      //     `undefined`, `lowerBoundByTime` returns 0 for both bounds, and the
      //     loop draws NOTHING. The engine meanwhile resolved the chart
      //     correctly and went on judging it, so the song played, the audio
      //     ran and the misses counted while the playfield stayed empty.
      //  2. `prepareChart` hands back fresh copies (`{...slice}`), so the
      //     objects in `map.slices` are never the ones the engine marks `hit`.
      //     The hit fade and the held-LONG clamp below read a flag that could
      //     not change.
      //  3. Modifiers ADD notes — `applyChartModifiers` converts taps to bombs
      //     and switches. Those exist only in the prepared array, so a bomb the
      //     engine would punish you for hitting was never drawn.
      //
      // `getSlices()` is the array `loadMap` prepared and the array the engine
      // judges: difficulty already resolved, modifiers already applied, and the
      // same object identities it mutates. Draw what is being judged.
      //
      // Mirror is unaffected: `prepareChart` deliberately does not apply it
      // (see `applyMirror`'s note), so these lanes are raw and `mirrorLane`
      // below is still the whole of M1.
      //
      // ── Visible window ────────────────────────────────────────────────────
      //
      // The loop below walked EVERY note in the chart on EVERY frame and let
      // each one cull itself. An expert chart is ~2000 notes, so that was
      // ~120 000 scroll-position computations a second to draw the twenty that
      // are actually on screen — paid on the weakest device running the game.
      //
      // `slices` is sorted by time (`loadMap` sorts the prepared array), so the
      // visible span is a contiguous range and binary search finds it. The
      // bounds come from the same thresholds the per-note cull uses, widened by
      // the longest hold in the chart and a second of slack — a note wrongly
      // skipped is a note that does not render, so the window errs outward and
      // the per-note culls still decide.
      const slices = engine.getSlices();
      const { from, to } = visibleSliceRange(slices, currentTime, {
        pixelsPerSecond: PPS,
        axisLength: isMobileV ? h : w,
        cursorPosition: CURSOR_MAIN,
        vertical: isMobileV,
        longestHold: longestHoldSeconds(slices),
      });

      for (let si = from; si < to; si++) {
        const slice = slices[si];
        // M1 — Mirror: the lane this note is DRAWN in and hittable from. Every
        // downstream read of "which lane" (position, colour, switch/arrow
        // direction) uses this instead of the raw `slice.lane` so the whole
        // note stays self-consistent under the flip — see `mirrorLane` above.
        const laneIdx = mirrorOn ? 1 - slice.lane : slice.lane;
        ctx.globalAlpha = 1;

        // Compute scroll position along the movement axis
        const timeDelta = slice.time - currentTime;
        let scrollVal = scrollPos(timeDelta);
        // If this is a LONG note that has been hit and is active, clamp to cursor
        const isHeldActive =
          slice.hit &&
          slice.type === 'LONG' &&
          currentTime >= slice.time &&
          currentTime <= slice.time + (slice.duration || 0);
        if (isHeldActive) {
          scrollVal = CURSOR_MAIN;
        }

        // Fade out on hit (50ms) or spatially behind the reticle
        let noteAlpha = 1.0;
        if (slice.hit && slice.type !== 'LONG') {
          const elapsed = performance.now() - (slice.hitTime ?? 0);
          noteAlpha = Math.max(0, 1 - elapsed / 50);
          if (noteAlpha <= 0) continue; // Fully faded
        } else {
          // Check if note is behind the cursor
          const distBehind = isMobileV
            ? scrollVal - CURSOR_MAIN // past notes are below cursor in vertical
            : CURSOR_MAIN - scrollVal; // past notes are left of cursor in horizontal
          if (distBehind > 0 && !isHeldActive) {
            const fadeDist = (isMobileV ? h : w) * 0.08;
            noteAlpha *= Math.max(0, 1 - distBehind / fadeDist);
            if (noteAlpha <= 0) continue;
          }
        }

        // Cull off-screen in the "future" direction
        if (isMobileV) {
          if (scrollVal < -100) continue; // above screen
        } else {
          if (scrollVal > w + 100) continue; // right of screen
        }

        // Compute effective lane (SWITCH notes flip lanes near the hit line)
        let effectiveLane = laneIdx;
        let switchProgress = 0; // 0 = original lane, 1 = switched lane
        if (slice.type === 'SWITCH') {
          const switchLeadTime = 0.8 / speedMod;
          const switchTime = slice.time - switchLeadTime;
          const timeUntilSwitch = switchTime - currentTime;
          const animDuration = 0.15 / speedMod;
          if (currentTime >= switchTime) {
            switchProgress = 1;
            effectiveLane = laneIdx === 0 ? 1 : 0;
          } else if (timeUntilSwitch < animDuration) {
            switchProgress = 1 - timeUntilSwitch / animDuration;
            effectiveLane = laneIdx;
          }
        }

        // Interpolate lane position for switch animation
        const origLane = isOneTrack ? LANE_POS[0] : LANE_POS[laneIdx];
        const destLane = isOneTrack ? LANE_POS[0] : LANE_POS[laneIdx === 0 ? 1 : 0];
        const laneVal =
          slice.type === 'SWITCH' && !isOneTrack
            ? origLane + (destLane - origLane) * switchProgress
            : isOneTrack
              ? LANE_POS[0]
              : LANE_POS[laneIdx];

        // Convert to canvas coordinates
        const { x: nx, y: ny } = toCanvas(scrollVal, laneVal);

        // M3 — the visibility family. `modifiers.invisible` still just gates
        // whether ANY of the four effects plays (same field, same score
        // weight as before the split); `visibilityMode` picks which one.
        // Bombs always render — hiding the one note you must NOT hit is not
        // a reading test, it is a trap.
        const isInvisibleMod = runState.modifiers.invisible;
        if (isInvisibleMod && slice.type !== 'BOMB') {
          const timeUntilHit = slice.time - currentTime; // audio-seconds until hit
          const visibleWindow = approachSec / speedMod; // total visible window, audio-seconds
          const travelRatio = timeUntilHit / visibleWindow; // 1.0 = just spawned, 0.0 = at hit line
          const alpha = visibilityAlpha(
            travelRatio,
            runState.visibilityMode,
            runState.laneCoverHeight,
          );
          if (alpha <= 0) {
            ctx.globalAlpha = 0;
            continue; // Skip rendering entirely
          }
          ctx.globalAlpha = noteAlpha * alpha;
        } else {
          ctx.globalAlpha = noteAlpha;
        }

        // ── Colour mapping ──────────────────────────────────────────────────
        //
        // The bomb takes the PALETTE's bomb colour, not a `#ef4444` literal.
        // `palettes.ts` exists because red bombs against pink notes collapse to
        // one muddy hue under deuteranopia, and it answers that by giving three
        // of the four palettes a black bomb — none of which ever reached the
        // canvas, because this line hard-coded the red the palettes were
        // written to get rid of.
        let color = COLORS.slice.SILENT;
        if (slice.type === 'BOMB') color = palette.bomb;
        // Hold notes and standard notes match their lane color
        else if (slice.type === 'LONG') color = laneIdx === 0 ? laneA : laneB;
        else if (slice.type === 'SWITCH') {
          const startCol = laneIdx === 0 ? laneA : laneB;
          const endCol = laneIdx === 0 ? laneB : laneA;
          color = interpolateHex(startCol, endCol, switchProgress);
        }
        // @ts-expect-error — COLORS.slice is typed loosely
        else if (COLORS.slice[slice.type]) color = COLORS.slice[slice.type];
        else if (laneIdx === 0) color = laneA;
        else color = laneB;

        // Quantisation, as an ACCENT on the note rather than the note's colour.
        //
        // It used to replace the body colour outright, which had two costs that
        // only show up on a real chart. `QUANT_COLORS[1]` is `#ef4444` — the
        // bomb's exact colour — so every downbeat, the most common note there
        // is, was drawn in the one colour reserved for the object that ends
        // your run. And because a quantised chart colours every tap by rhythm,
        // the two LANES became the same colour as each other, which is the
        // readability the lane palettes are for. Drawn as a stripe instead,
        // both signals fit: the body still says which lane, the stripe says
        // which subdivision.
        //
        // Suppressed entirely on the accessibility palettes: someone who has
        // chosen Okabe-Ito or monochrome has told us which hues they can
        // separate, and `QUANT_COLORS` is not one of the sets they picked.
        const quantColor =
          quantColorsOn && palette.id === 'default' && slice.type === 'STANDARD' && slice.quant
            ? (QUANT_COLORS[slice.quant] ?? null)
            : null;
        // The downbeat keeps its conventional red on the NOTATION skin, where a
        // quarter note is unmistakably a different shape from a bomb, and loses
        // it on the outline skins, where a bomb-red ring around a pill is the
        // collision this whole paragraph is about.
        const quantAccent =
          quantColor && (skin.noteShape === 'notation' || (slice.quant ?? 0) > 1)
            ? quantColor
            : null;

        ctx.fillStyle = color;

        // Soft glow around the targeted (next hittable) note per lane
        const isTargeted = slice.id === targeted0 || slice.id === targeted1;
        if (isTargeted && slice.type !== 'BOMB') {
          ctx.save();
          ctx.shadowColor = color;
          ctx.shadowBlur = glow * 18;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 0;
          // Draw a transparent filled shape at the note position to produce the glow
          ctx.globalAlpha = (ctx.globalAlpha || 1) * 0.45 * (slice.hit ? 0.3 : 1.0); // Reduce glow if hit
          ctx.beginPath();
          if (slice.type === 'LONG') {
            const len = (slice.duration || 0.5) * PPS;
            if (isMobileV) {
              ctx.roundRect(nx - BAR_H / 2 - 2, ny - len - 2, BAR_H + 4, len + 4, 12);
            } else {
              ctx.roundRect(nx - 2, ny - BAR_H / 2 - 2, len + 4, BAR_H + 4, 12);
            }
          } else if (slice.type === 'SWITCH') {
            ctx.arc(nx, ny, BAR_H * 0.7, 0, Math.PI * 2);
          } else {
            ctx.arc(nx, ny, BAR_H * 0.7, 0, Math.PI * 2);
          }
          ctx.fill();
          ctx.restore();
          // Re-set fillStyle after restore — the glow pass consumed it
          ctx.fillStyle = color;
          // Restore the normal note shadow
          ctx.shadowColor = theme.noteShadow;
          ctx.shadowBlur = glow * 8;
          ctx.shadowOffsetX = 4;
          ctx.shadowOffsetY = 4;
        }

        if (slice.type === 'BOMB') {
          // A SPIKED polygon, not a disc.
          //
          // `palettes.ts` already documents this shape as the reason a palette
          // is "a reinforcement, not the signal" — WCAG 1.4.1 applied to a
          // canvas: the one object you must never misread cannot be
          // distinguished by colour alone. The renderer drew a plain circle,
          // so that guarantee was a comment. It is the geometry now.
          //
          // The outline is the theme's text colour rather than the bomb's own:
          // three of the four palettes specify a BLACK bomb, which on the dark
          // theme's near-black playfield is an invisible object that ends runs.
          // Raised out of the trough on the same pair of shadows as a tap, so
          // the one note you must not touch sits in the same world as the ones
          // you must.
          const bombLift = glow ? Math.max(2, CURSOR_R * 0.22) : 0;
          ctx.save();
          drawSpikedDisc(ctx, nx, ny, CURSOR_R * 1.35, CURSOR_R * 0.62);
          ctx.shadowColor = shadowDark;
          ctx.shadowBlur = glow * 9;
          ctx.shadowOffsetX = bombLift;
          ctx.shadowOffsetY = bombLift;
          ctx.fill();
          ctx.shadowColor = shadowLight;
          ctx.shadowOffsetX = -bombLift;
          ctx.shadowOffsetY = -bombLift;
          ctx.fill();
          ctx.shadowColor = 'transparent';
          ctx.strokeStyle = theme.textColor;
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.restore();

          if (isTargeted) {
            ctx.save();
            ctx.strokeStyle = theme.textColor;
            ctx.lineWidth = 3;
            ctx.shadowColor = color;
            ctx.shadowBlur = glow * 12;
            ctx.beginPath();
            ctx.arc(nx, ny, CURSOR_R + 8, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();

            ctx.shadowColor = theme.noteShadow;
            ctx.shadowBlur = glow * 8;
            ctx.shadowOffsetX = 4;
            ctx.shadowOffsetY = 4;
          }

          ctx.fillStyle = theme.textColor;
          ctx.font = `bold ${Math.round(CURSOR_R * 1.3)}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('!', nx, ny);
          ctx.textBaseline = 'alphabetic';
        } else if (slice.type === 'LONG') {
          // Long note: tail extends in the "future" direction from the head
          let remainingDuration = slice.duration || 0.5;
          if (isHeldActive) {
            remainingDuration = slice.time + (slice.duration || 0) - currentTime;
          }

          if (remainingDuration > 0) {
            const len = remainingDuration * PPS;
            ctx.fillStyle = isHeldActive ? theme.holdTrailHeld : theme.holdTrail;
            ctx.globalAlpha = noteAlpha;
            ctx.beginPath();
            if (isMobileV) {
              // Tail extends upward from head
              ctx.roundRect(nx - BAR_H * 0.3, ny - len, BAR_H * 0.6, len, 4);
            } else {
              // Tail extends rightward from head
              ctx.roundRect(nx, ny - BAR_H * 0.3, len, BAR_H * 0.6, 4);
            }
            ctx.fill();

            // Head of the hold note
            ctx.fillStyle = color;
            ctx.globalAlpha = noteAlpha;
            let headW: number, headH: number;
            if (isMobileV) {
              // Horizontal bar head for vertical mode
              headW = BAR_H * 1.4;
              headH = Math.max(8, BAR_H * 0.4);
            } else {
              // Tall narrow head for horizontal mode
              headW = Math.max(8, BAR_H * 0.4);
              headH = BAR_H * 1.4;
            }

            if (isHeldActive) {
              ctx.save();
              ctx.shadowColor = color;
              ctx.shadowBlur = glow * 10;
              ctx.beginPath();
              ctx.roundRect(nx - headW / 2, ny - headH / 2, headW, headH, 4);
              ctx.fill();
              ctx.restore();
            } else {
              ctx.beginPath();
              ctx.roundRect(nx - headW / 2, ny - headH / 2, headW, headH, 4);
              ctx.fill();
            }
          }
        } else if (slice.type === 'SWITCH') {
          // Switch Note — diamond shape with arrow indicator
          const size = BAR_H;
          ctx.save();
          ctx.translate(nx, ny);
          ctx.rotate(Math.PI / 4);
          ctx.beginPath();
          ctx.roundRect(-size / 2, -size / 2, size, size, 4);
          ctx.fill();
          ctx.restore();
          ctx.fillStyle = 'rgba(255,255,255,0.85)';
          ctx.font = `bold ${Math.round(size * 0.55)}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          const arrow =
            switchProgress < 1
              ? isMobileV
                ? laneIdx === 0
                  ? '→'
                  : '←' // mobile: lanes are left/right
                : laneIdx === 0
                  ? '↓'
                  : '↑' // desktop: lanes are top/bottom
              : '⇄';
          ctx.fillText(arrow, nx, ny);
          ctx.textBaseline = 'alphabetic';
        } else {
          // ── Standard note ────────────────────────────────────────────────
          //
          // Was a flat rounded square with a white dot pasted at its top-left.
          // The dot read as a highlight from a light source that nothing else
          // on the playfield shared, and at speed it just made the note look
          // smudged. What replaces it is a solid three-part read — a shaded
          // under-edge, the body, a bevel along the leading edge — which is
          // the same neumorphic language as the trough the note travels in.
          //
          // Deliberately all opaque fills. A gradient would say this better and
          // would mean a `createLinearGradient` per note per frame, which is
          // the one allocation the draw loop cannot have.
          const size = BAR_H;
          const half = size / 2;
          const shades = noteShades(noteShadesRef.current, color);

          // V13 — the energy trail. Behind the note, in the direction it came
          // from, lengthening with the streak. This is the note-level half of
          // the same continuous curve the rails and vignette ride: nothing here
          // triggers, it just gets longer while the run stays alive.
          if (energy > 0.02) {
            const trail = size * (0.4 + 1.9 * energy);
            const halfThick = size * 0.3;
            ctx.save();
            ctx.shadowColor = 'transparent';
            ctx.globalAlpha = ctx.globalAlpha * 0.34 * energy;
            ctx.fillStyle = color;
            // Tapered to a point rather than a capsule: a constant-width stub
            // reads as a second object stuck to the note, a wedge reads as the
            // note having come from somewhere.
            ctx.beginPath();
            if (isMobileV) {
              // Notes fall downward, so "behind" is up the screen.
              ctx.moveTo(nx - halfThick, ny);
              ctx.lineTo(nx + halfThick, ny);
              ctx.lineTo(nx, ny - trail);
            } else {
              // Notes travel leftward, so "behind" is to the right.
              ctx.moveTo(nx, ny - halfThick);
              ctx.lineTo(nx, ny + halfThick);
              ctx.lineTo(nx + trail, ny);
            }
            ctx.closePath();
            ctx.fill();
            ctx.restore();
          }

          // ── The neumorphic extrusion ─────────────────────────────────────
          //
          // The note is RAISED out of the trough it travels in, in the same
          // language the trough and the receptors already speak: one light
          // source at the top-left, a light shadow on that side and a dark one
          // opposite. `.neumorphic` in slice-it.css is the same pair of offsets.
          //
          // A single drop shadow — what this had before the restyle — reads as
          // a sticker lying ON the playfield rather than an object standing out
          // of it, and it was the one thing on screen lit from a different
          // direction than everything around it.
          //
          // `skin.neumorphic` can turn it off, and that is a stated flat look
          // rather than a broken one — which is exactly why `Skin` carries the
          // flag instead of the renderer guessing from the shape.
          //
          // The offset is gated on `glow` as well as the blur. A canvas shadow
          // with `shadowBlur: 0` and a NON-zero offset still draws — as a hard
          // edged copy of the shape. Zeroing only the blur (which is what the
          // rest of this renderer does) would hand `perf-lite` and reduced
          // motion two crisp duplicates per note instead of one calm note.
          const lift = glow && skin.neumorphic ? Math.max(2, size * 0.1) : 0;
          ctx.save();
          ctx.fillStyle = color;
          traceNoteBody(ctx, skin.noteShape, nx, ny, size, isMobileV);
          if (lift > 0) {
            ctx.shadowColor = shadowDark;
            ctx.shadowBlur = glow * 9;
            ctx.shadowOffsetX = lift;
            ctx.shadowOffsetY = lift;
            ctx.fill();
            // Same path, opposite side. Neumorphism is the PAIR — either shadow
            // alone is just a bevel.
            ctx.shadowColor = shadowLight;
            ctx.shadowOffsetX = -lift;
            ctx.shadowOffsetY = -lift;
          }
          ctx.fill();
          ctx.restore();

          // The soft inner lip that makes the surface read as moulded rather
          // than cut: lit along the top-left arc, shaded along the bottom-right
          // one. Same light source as the extrusion above, which is the whole
          // reason it works — no gradient, no allocation.
          //
          // The square-cornered version is only correct for the `pill` body;
          // every other shape gets the lip by stroking its own outline with a
          // clip, which costs one extra path and keeps one light source across
          // all five skins.
          if (skin.neumorphic) {
            ctx.save();
            ctx.shadowColor = 'transparent';
            ctx.lineWidth = Math.max(1.5, size * 0.09);
            ctx.globalAlpha = ctx.globalAlpha * 0.85;
            if (skin.noteShape === 'pill') {
              ctx.strokeStyle = shades.bevel;
              traceCornerArc(ctx, nx - half, ny - half, size, 9, 'topLeft');
              ctx.stroke();
              ctx.strokeStyle = shades.shade;
              traceCornerArc(ctx, nx - half, ny - half, size, 9, 'bottomRight');
              ctx.stroke();
            } else {
              // Clip to the body, then stroke it twice offset along the light
              // axis: the half that survives the clip on each pass is exactly
              // the lit arc and the shaded arc.
              traceNoteBody(ctx, skin.noteShape, nx, ny, size, isMobileV);
              ctx.clip();
              const nudge = Math.max(1, size * 0.06);
              ctx.lineWidth = Math.max(2, size * 0.14);
              ctx.strokeStyle = shades.bevel;
              traceNoteBody(ctx, skin.noteShape, nx + nudge, ny + nudge, size, isMobileV);
              ctx.stroke();
              ctx.strokeStyle = shades.shade;
              traceNoteBody(ctx, skin.noteShape, nx - nudge, ny - nudge, size, isMobileV);
              ctx.stroke();
            }
            ctx.restore();
          }

          // ── The rhythm ───────────────────────────────────────────────────
          //
          // On the notation skin the subdivision is the note's own SHAPE: a
          // stem and a flag per subdivision, straight off `Slice.quant`. That
          // is the whole reason it is the default — the head never changes size
          // or position, so the hit target is constant, and the rhythm rides on
          // a channel that is not colour. It was hue-only before, which is the
          // thing `palettes.ts` exists to stop being the only channel.
          //
          // Flat and un-extruded (see `drawNoteStem`), and drawn in the quant
          // colour where there is one so shape and hue agree, falling back to
          // the note's own colour on the accessibility palettes.
          const notation = skin.noteShape === 'notation' ? flagsForQuant(slice.quant) : null;
          if (notation) {
            ctx.save();
            ctx.shadowColor = 'transparent';
            drawNoteStem(
              ctx,
              nx,
              ny,
              size,
              notation.flags,
              notation.triplet,
              quantAccent ?? shades.bevel,
            );
            ctx.restore();
          } else if (quantAccent) {
            // Every other skin keeps the rhythm as the note's OUTLINE. A stripe
            // across the body was the first attempt and it looked like a flag:
            // bevel, body and stripe read as three equal bands and the note
            // stopped being an object. An outline sits at the boundary the eye
            // already uses to find the note.
            ctx.save();
            ctx.shadowColor = 'transparent';
            ctx.strokeStyle = quantAccent;
            ctx.lineWidth = Math.max(1.5, size * 0.07);
            traceNoteBody(ctx, skin.noteShape, nx, ny, size, isMobileV);
            ctx.stroke();
            ctx.restore();
          }
        }
      }
      ctx.shadowColor = 'transparent'; // Reset
    }

    // 3b. Combo break — the colour drains out of the playfield.
    //
    // A grey wash rather than `ctx.filter = 'saturate(…)'`, which is what the
    // effect literally wants: setting `ctx.filter` makes the browser rasterise
    // every subsequent draw to a scratch surface and composite it, on the one
    // screen in the app where frame timing IS the gameplay. This is one
    // `fillRect` and reads the same way — the field goes flat for a moment.
    //
    // Gated on `theme.glow`, which is false under reduced motion and on
    // `perf-lite` devices: a screen-wide tint appearing on a miss is exactly the
    // kind of thing that preference is asking not to happen.
    const comboBreak = glow && !flashOff ? engine.getComboBreak() : null;
    if (comboBreak) {
      const age = (nowMs - comboBreak.at) / COMBO_BREAK_FEEDBACK_MS;
      if (age >= 0 && age < 1) {
        ctx.save();
        ctx.globalAlpha = 0.2 * comboBreak.magnitude * (1 - age) * fx;
        ctx.fillStyle = theme.shadowDark;
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
      }
    }

    // 3c. V5 — combo milestones: an escalating flash + label at 50/100/250/
    // 500/1000. Gated on `glow` exactly like the combo-break wash above — a
    // screen flash tied to hitting a number is precisely what A2's
    // photosensitivity mode (and reduced motion / perf-lite, which fold into
    // the same flag) turns off.
    const milestone = glow && !flashOff ? engine.getComboMilestone() : null;
    if (milestone) {
      const age = (nowMs - milestone.at) / COMBO_MILESTONE_FEEDBACK_MS;
      if (age >= 0 && age < 1) {
        const tier = Math.max(
          0,
          COMBO_MILESTONES.indexOf(milestone.value as (typeof COMBO_MILESTONES)[number]),
        );
        const tierColor = MILESTONE_COLORS[tier] ?? MILESTONE_COLORS[MILESTONE_COLORS.length - 1];

        // No full-screen wash. This used to paint the whole canvas in the tier
        // colour at 10-26% alpha every time a combo crossed 50/100/250/500/
        // 1000 — a strobe over the playfield at exactly the moment the player
        // is reading notes, and the most-complained-about thing in the game.
        // The label below says the same thing without touching the lanes.
        ctx.save();
        ctx.globalAlpha = 1 - age;
        ctx.textAlign = 'center';
        ctx.fillStyle = tierColor;
        ctx.font = `900 ${26 + tier * 5}px sans-serif`;
        ctx.shadowColor = tierColor;
        ctx.shadowBlur = glow * (6 + tier * 3);
        ctx.fillText(
          ts('combo-milestone', { defaultValue: '{{n}} COMBO', n: milestone.value }),
          w / 2,
          h * 0.32,
        );
        ctx.restore();
      }
    }

    // 4. Update & Draw Particles
    //
    // Integrated against wall-clock time, not frames. `p.x += p.vx` per frame
    // means the burst falls 2.4x faster on a 144 Hz display than on a 60 Hz one
    // and in slow motion on a device that is struggling — the velocities below
    // are per-60Hz-frame, so `step` converts them without changing the tuning.
    const step = frameDelta * 60;
    for (let i = particlesRef.current.length - 1; i >= 0; i--) {
      const p = particlesRef.current[i];
      p.x += p.vx * step;
      p.y += p.vy * step;
      // Drag before gravity. Constant-velocity dots under gravity alone arc
      // like thrown confetti, which is a slow, heavy read for what is supposed
      // to be a note being struck; bleeding the speed off makes the burst leave
      // fast and stop, which is what a spark does.
      p.vx *= Math.pow(0.9, step);
      p.vy *= Math.pow(0.9, step);
      p.vy += 0.14 * step;
      p.life -= 0.05 * step;

      if (p.life <= 0) {
        particlesRef.current.splice(i, 1);
      } else {
        // Shrink as it fades, rather than a constant disc that just gets
        // fainter — a spark loses its body before it loses its light.
        ctx.globalAlpha = p.life * p.life;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.35 + 0.65 * p.life), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    // Feedback / Judgment Text
    if (latestFeedback && performance.now() - latestFeedback.time < 1000) {
      const timeDiff = performance.now() - latestFeedback.time;
      const alpha = 1 - Math.pow(timeDiff / 1000, 3); // Fade out

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.textAlign = 'center';

      // Position feedback: above hit line on mobile, centered on desktop
      const feedbackX = w / 2;
      const feedbackY = isMobileV
        ? CURSOR_MAIN - BAR_H * 2 - 50
        : isOneTrack
          ? LANE_POS[0] - BAR_H * 1.5 - 40
          : h * 0.5;

      ctx.fillStyle = latestFeedback.color;
      ctx.font = `900 ${isMobileV ? 28 : 32}px sans-serif`;
      ctx.shadowColor = latestFeedback.color;
      ctx.shadowBlur = glow * 6;
      ctx.fillText(latestFeedback.text, feedbackX, feedbackY);

      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;

      if (latestFeedback.offset !== undefined) {
        const ms = Math.round(latestFeedback.offset * 1000);
        const sign = ms > 0 ? '+' : '';
        const offsetText = `${sign}${ms}ms`;

        ctx.font = 'bold 16px monospace';
        ctx.fillStyle = Math.abs(ms) < 20 ? '#334155' : '#64748b';
        ctx.fillText(offsetText, feedbackX, feedbackY + 30);
      }

      ctx.restore();
    }

    // 5. Cursors (Receptors)
    const { textColor, textShadowColor } = theme;

    const drawCursor = (cx: number, cy: number, color: string, label?: string) => {
      // V13 — the receptor picks up the streak's glow before anything is drawn
      // on top of it, so the ring reads as lit from within rather than outlined
      // twice. Same continuous curve as the rails; no pulse, no period.
      if (energy > 0.01) {
        ctx.save();
        ctx.shadowColor = color;
        ctx.shadowBlur = glow * 22 * energy;
        ctx.globalAlpha = 0.35 + 0.5 * energy;
        ctx.strokeStyle = color;
        ctx.lineWidth = 2 + 2 * energy;
        ctx.beginPath();
        ctx.arc(cx, cy, CURSOR_R * 1.5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // The hit pulse: a ring expanding out of the receptor the note landed on.
      //
      // This is the feedback a hit was missing. A judgement word appears in the
      // middle of the screen, which is not where the player is looking — the
      // eye is on the judgement line, and until now the line itself did not
      // react to being hit at all. Driven off `latestFeedback`, so it inherits
      // the engine's own idea of when and how well a note was struck.
      //
      // On the flash budget: this is the one effect here that repeats at note
      // rate, which on a dense chart is faster than 3 Hz. It stays inside the
      // rule because the rule is about *area* — WCAG 2.3.1 counts a flash that
      // covers more than a quarter of the central visual field, and this is a
      // ~60 px ring on a 1360 px playfield, drawn at partial alpha, in the one
      // place the player is already looking. It is also behind `flashOff` like
      // everything else, so the setting that exists for this turns it off.
      // Nothing else added by V13 repeats at all.
      //
      // Not on a MISS: nothing was struck, so a ring leaving the receptor would
      // be the playfield reacting to an input that never happened.
      if (
        latestFeedback &&
        latestFeedback.text !== 'MISS' &&
        skin.hitBurst !== 'none' &&
        glow &&
        !flashOff
      ) {
        const pulseAge = (nowMs - latestFeedback.time) / HIT_PULSE_MS;
        const pulseLane = mirrorOn ? 1 - latestFeedback.lane : latestFeedback.lane;
        const pulseVal = isOneTrack ? LANE_POS[0] : LANE_POS[Math.max(0, Math.min(pulseLane, LANE_POS.length - 1))];
        const onThisCursor = isMobileV ? Math.abs(cx - pulseVal) < 1 : Math.abs(cy - pulseVal) < 1;
        if (pulseAge >= 0 && pulseAge < 1 && onThisCursor) {
          ctx.save();
          ctx.shadowColor = 'transparent';
          // Eased out, so it leaves fast and settles — a linear ring reads as
          // a slow expanding hoop, which is a UI animation, not an impact.
          const eased = 1 - Math.pow(1 - pulseAge, 3);
          ctx.globalAlpha = (1 - pulseAge) * 0.75 * fx;
          ctx.strokeStyle = latestFeedback.color;
          ctx.lineWidth = 3 * (1 - pulseAge) + 1;
          ctx.beginPath();
          ctx.arc(cx, cy, CURSOR_R * (1.5 + 2.2 * eased), 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
      }

      // V1 — `judgementLine`. `inset` is the neumorphic receptor the game
      // shipped with (a ring pressed INTO the trough, drawn as the same shadow
      // pair the trough uses); `glow` trades that for a lit halo; `solid` is a
      // bare ring for the flat skins. The offsets ride `glow` for the reason
      // spelled out on the note extrusion — a zero blur with a live offset
      // still paints a hard duplicate.
      if (skin.judgementLine === 'inset') {
        const seat = glow * 2;
        ctx.shadowColor = shadowLight;
        ctx.shadowBlur = glow * 5;
        ctx.shadowOffsetX = -seat;
        ctx.shadowOffsetY = -seat;
        ctx.strokeStyle = bgColor;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(cx, cy, CURSOR_R * 1.5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowColor = shadowDark;
        ctx.shadowBlur = glow * 5;
        ctx.shadowOffsetX = seat;
        ctx.shadowOffsetY = seat;
        ctx.stroke();
      } else if (skin.judgementLine === 'glow') {
        ctx.shadowColor = color;
        ctx.shadowBlur = glow * 12;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        ctx.strokeStyle = color;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(cx, cy, CURSOR_R * 1.5, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.shadowColor = 'transparent';
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, CURSOR_R * 1.5, 0, Math.PI * 2);
      ctx.stroke();
      if (label) {
        ctx.fillStyle = textColor;
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.shadowColor = textShadowColor;
        ctx.shadowBlur = glow * 2;
        ctx.shadowOffsetX = 1;
        ctx.shadowOffsetY = 1;
        ctx.fillText(label, cx, cy + 4);
        ctx.shadowColor = 'transparent';
      }
    };

    const formatBind = (b: string) =>
      b
        .replace('Mouse0', 'LMB')
        .replace('Mouse1', 'MMB')
        .replace('Mouse2', 'RMB')
        .replace('ArrowUp', '↑')
        .replace('ArrowDown', '↓')
        .replace('ArrowLeft', '←')
        .replace('ArrowRight', '→')
        .replace('Key', '');

    if (isOneTrack) {
      const { x: cx, y: cy } = toCanvas(CURSOR_MAIN, LANE_POS[0]);
      const label = isMobileV
        ? undefined
        : `${formatBind(currentKeybinds.lane1)}/${formatBind(currentKeybinds.lane2)}`;
      drawCursor(cx, cy, shadowLight, label);
    } else {
      LANE_POS.forEach((laneVal, i) => {
        const { x: cx, y: cy } = toCanvas(CURSOR_MAIN, laneVal);
        const color = i === 0 ? COLORS.lane1 : COLORS.lane2;
        const label = isMobileV
          ? undefined
          : formatBind(i === 0 ? currentKeybinds.lane1 : currentKeybinds.lane2);
        drawCursor(cx, cy, color, label);
      });
    }

    // 6. Hit-error bar
    //
    // Drawn below the playfield rather than on the judgement line: the eye that
    // is reading notes must not have to also read a moving tick cloud in the
    // same place, and the bar is for glancing at between phrases.
    drawErrorBar(ctx, engine, w, isMobileV ? h * 0.955 : h * 0.93, glow, theme.textColor);

    ctx.restore();
  };

  // V10 — the "green number": how long a note is visible before it must be
  // hit, given the current song's tempo and every setting that touches the
  // approach window. Recomputed every render this component is part of,
  // which is exactly when it needs to be current — the player is dragging
  // the lane-cover slider below while this is on screen.
  const reactionMs = (() => {
    const st = useSliceItStore.getState();
    const bpm = engine?.getActiveMap()?.bpm || 120;
    const approach =
      approachSeconds(bpm, st.scrollSpeed, st.scrollMode) / (st.modifiers.speed || 1);
    return reactionWindowMs(approach, laneCoverHeight);
  })();

  return (
    // Column below `lg` so the opponent board can sit as a strip ABOVE the
    // playfield; a row above it so the board is the familiar right-hand column.
    // As a row at every width, that 288px column was most of a 360px phone.
    <div className="flex flex-col lg:flex-row w-full h-full bg-slice-bg">
      {/* Game Area Container - Flex Grow.
          Landscape used `aspect-video` capped at `min(1400px, (100vh - 6rem) * 16/9)`
          — a hand-derived fit with two problems. `100vh` on a phone is the
          LARGEST viewport (the height the page only has once the toolbars have
          scrolled away), so the cap was computed against space that is not on
          screen and the 16:9 box overran the visible area; and the `6rem` was a
          guess at this container's own chrome that no longer had to match it.
          `.app-stage-fit` measures the real box instead, and the 1400px ceiling
          moves to the container so it can't clamp one axis of the ratio.

          `w-full` is load-bearing, not decoration. Below `lg` the parent is a
          COLUMN, so `flex-1` sizes the height and the width would come from
          `align-items: stretch` — except `mx-auto` is an auto margin on the
          cross axis, and an auto cross margin cancels stretch. The item then
          takes its fit-content width, and `container-type: size` means size
          containment, so its contents contribute NOTHING to that: the stage
          measured 32px (its own `p-4`) and `100cqw` was 0, collapsing the
          playfield and the whole menu inside it to zero on any landscape phone.
          In row mode `flex-1`'s `flex-basis: 0%` wins over `width`, so this is
          inert there. */}
      <div
        className={`w-full min-w-0 flex-1 bg-slice-shadow-dark/30 ${
          isPortrait
            ? 'flex items-center justify-center p-1'
            : 'app-stage-fit mx-auto max-w-[1400px] p-4'
        }`}
      >
        <div
          ref={wrapperRef}
          className={`relative bg-slice-bg overflow-hidden border-4 border-slice-shadow-light/40 shadow-[20px_20px_60px_var(--slice-shadow-dark),-20px_-20px_60px_var(--slice-shadow-light)] ${isPortrait ? 'h-full w-full rounded-2xl' : 'app-stage rounded-[2rem]'}`}
        >
          <canvas ref={canvasRef} className="w-full h-full cursor-pointer block" />

          {/* Mobile Buttons — left/right split for portrait, top/bottom for landscape */}
          {showMobileButtons && status === 'PLAYING' && !isPaused && countdown === 0 && (
            <div data-mobile-btn className="absolute inset-0 pointer-events-none flex flex-row">
              <button
                data-mobile-btn
                className="pointer-events-auto flex-1 h-full flex items-end justify-center pb-4 opacity-0 active:opacity-30 transition-opacity"
                onTouchStart={(e) => {
                  e.preventDefault();
                  handleInput(0, e.timeStamp);
                }}
                onTouchEnd={(e) => {
                  e.preventDefault();
                  handleInputRelease(0);
                }}
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleInput(0, e.timeStamp);
                }}
                onMouseUp={(e) => {
                  e.preventDefault();
                  handleInputRelease(0);
                }}
                onMouseLeave={(e) => {
                  e.preventDefault();
                  handleInputRelease(0);
                }}
              >
                <div className="w-12 h-12 rounded-full bg-blue-500/20 border-2 border-blue-500 flex items-center justify-center text-blue-500 text-lg font-black">
                  L
                </div>
              </button>
              <button
                data-mobile-btn
                className="pointer-events-auto flex-1 h-full flex items-end justify-center pb-4 opacity-0 active:opacity-30 transition-opacity"
                onTouchStart={(e) => {
                  e.preventDefault();
                  handleInput(1, e.timeStamp);
                }}
                onTouchEnd={(e) => {
                  e.preventDefault();
                  handleInputRelease(1);
                }}
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleInput(1, e.timeStamp);
                }}
                onMouseUp={(e) => {
                  e.preventDefault();
                  handleInputRelease(1);
                }}
                onMouseLeave={(e) => {
                  e.preventDefault();
                  handleInputRelease(1);
                }}
              >
                <div className="w-12 h-12 rounded-full bg-pink-500/20 border-2 border-pink-500 flex items-center justify-center text-pink-500 text-lg font-black">
                  R
                </div>
              </button>
            </div>
          )}

          {/* Gear icon button — always visible during gameplay */}
          {status === 'PLAYING' && !isLoadingSong && countdown === 0 && (
            <button
              className="absolute top-3 right-3 z-50 w-9 h-9 rounded-full bg-slice-bg shadow-[4px_4px_8px_var(--slice-shadow-dark),-4px_-4px_8px_var(--slice-shadow-light)] flex items-center justify-center text-slice-text-muted hover:text-slice-text transition-colors active:shadow-[inset_4px_4px_8px_var(--slice-shadow-dark),inset_-4px_-4px_8px_var(--slice-shadow-light)]"
              data-mobile-btn
              onClick={() => {
                if (isMultiplayer) {
                  setShowSettings((prev) => !prev);
                } else {
                  const store = useSliceItStore.getState();
                  // Never pause in multiplayer — only toggle settings panel
                  if (store.isPaused) engine?.resume();
                  else engine?.pause();
                }
              }}
            >
              <Settings className="w-4 h-4" />
            </button>
          )}

          {/* H6 — skip a long lead-in, straight to 2s before the first note.
              Disabled in multiplayer: the clock and the countdown both belong
              to the server there. */}
          {canSkipLeadIn && (
            <button
              className="absolute top-14 right-3 z-50 h-8 px-3 rounded-full bg-slice-bg shadow-[4px_4px_8px_var(--slice-shadow-dark),-4px_-4px_8px_var(--slice-shadow-light)] flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wide text-slice-text-muted hover:text-slice-text transition-colors active:shadow-[inset_4px_4px_8px_var(--slice-shadow-dark),inset_-4px_-4px_8px_var(--slice-shadow-light)]"
              data-mobile-btn
              onClick={skipLeadIn}
            >
              <SkipForward className="w-3.5 h-3.5" aria-hidden />
              {ts('skip-intro', { defaultValue: 'Skip' })}
            </button>
          )}

          {/* H6 — hold-to-restart feedback. Shown only while the key is
              actually held, so it never competes with the HUD during
              ordinary play; a tap alone never reaches this, only a hold past
              `RESTART_HOLD_MS`. */}
          {restartHolding && (
            <div
              className="absolute top-3 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-slice-bg rounded-full px-4 py-2 shadow-[4px_4px_8px_var(--slice-shadow-dark),-4px_-4px_8px_var(--slice-shadow-light)]"
              role="status"
              aria-live="polite"
            >
              <RotateCcw className="w-3.5 h-3.5 text-amber-500 animate-spin" aria-hidden />
              <span className="text-xs font-black uppercase tracking-wide text-slice-text">
                {ts('restarting', { defaultValue: 'Restarting…' })}
              </span>
            </div>
          )}

          {/* Singleplayer Pause Overlay (with settings) */}
          {isPaused && status === 'PLAYING' && !isMultiplayer && (
            <div className="absolute inset-0 z-50 bg-black/20 backdrop-blur-sm flex items-center-safe justify-center-safe overflow-y-auto">
              <div className="bg-slice-bg p-6 rounded-[30px] shadow-[9px_9px_16px_var(--slice-shadow-dark),-9px_-9px_16px_var(--slice-shadow-light)] flex flex-col gap-4 items-center w-full max-w-sm mx-4 my-4">
                <h2 className="text-3xl font-black text-slice-text">
                  {t('paused', { defaultValue: 'PAUSED' })}
                </h2>

                {/* Settings section */}
                <div className="w-full bg-slice-shadow-dark/30 rounded-2xl p-4 shadow-[inset_3px_3px_6px_var(--slice-shadow-dark),inset_-3px_-3px_6px_var(--slice-shadow-light)] flex flex-col gap-4">
                  {/* Volume */}
                  <div className="flex flex-col gap-1.5">
                    <div className="flex justify-between items-center">
                      <span className="text-[11px] font-black text-slice-text-muted uppercase tracking-wider">
                        {t('volume', { defaultValue: 'Volume' })}
                      </span>
                      <span className="text-sm font-bold text-blue-500">{volume}%</span>
                    </div>
                    <Slider
                      value={[volume]}
                      min={0}
                      max={100}
                      step={1}
                      onValueChange={([v]) => setVolume(v)}
                      className="w-full"
                    />
                  </div>

                  {/* SFX Volume */}
                  <div className="flex flex-col gap-1.5">
                    <div className="flex justify-between items-center">
                      <span className="text-[11px] font-black text-slice-text-muted uppercase tracking-wider">
                        {t('effects', { defaultValue: 'Effects' })}
                      </span>
                      <span className="text-sm font-bold text-blue-500">
                        {useSliceItStore.getState().sfxVolume}%
                      </span>
                    </div>
                    <Slider
                      value={[useSliceItStore.getState().sfxVolume]}
                      min={0}
                      max={100}
                      step={1}
                      onValueChange={([v]) => useSliceItStore.getState().setSfxVolume(v)}
                      className="w-full"
                    />
                  </div>

                  {/* Audio Offset */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-black text-slice-text-muted uppercase tracking-wider">
                      {t('audio-offset', { defaultValue: 'Audio Offset' })}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        className="w-7 h-7 rounded-lg bg-slice-bg shadow-[3px_3px_6px_var(--slice-shadow-dark),-3px_-3px_6px_var(--slice-shadow-light)] text-slice-text-darker font-bold text-sm flex items-center justify-center active:shadow-[inset_3px_3px_6px_var(--slice-shadow-dark),inset_-3px_-3px_6px_var(--slice-shadow-light)]"
                        onClick={() => setAudioOffset(audioOffset - 5)}
                      >
                        −
                      </button>
                      <span className="text-sm font-bold text-slice-text-darker w-16 text-center font-mono">
                        {audioOffset > 0 ? '+' : ''}
                        {audioOffset}ms
                      </span>
                      <button
                        className="w-7 h-7 rounded-lg bg-slice-bg shadow-[3px_3px_6px_var(--slice-shadow-dark),-3px_-3px_6px_var(--slice-shadow-light)] text-slice-text-darker font-bold text-sm flex items-center justify-center active:shadow-[inset_3px_3px_6px_var(--slice-shadow-dark),inset_-3px_-3px_6px_var(--slice-shadow-light)]"
                        onClick={() => setAudioOffset(audioOffset + 5)}
                      >
                        +
                      </button>
                    </div>
                  </div>

                  {/* Lane Cover (V10) — the readout is the point: IIDX players
                      tune the "green number" (the reaction window in ms), not
                      a percentage they cannot feel. */}
                  <div className="flex flex-col gap-1.5">
                    <div className="flex justify-between items-center">
                      <span className="text-[11px] font-black text-slice-text-muted uppercase tracking-wider">
                        {ts('lane-cover', { defaultValue: 'Lane Cover' })}
                      </span>
                      <span className="text-sm font-bold text-blue-500 font-mono">
                        {ts('lane-cover-reaction', {
                          defaultValue: '{{ms}}ms',
                          ms: reactionMs,
                        })}
                      </span>
                    </div>
                    <Slider
                      value={[laneCoverHeight]}
                      min={MIN_LANE_COVER}
                      max={MAX_LANE_COVER}
                      step={0.01}
                      onValueChange={([v]) => setLaneCoverHeight(v)}
                      className="w-full"
                    />
                  </div>

                  {/* Keybinds */}
                  <div className="flex flex-col gap-2">
                    <span className="text-[11px] font-black text-slice-text-muted uppercase tracking-wider">
                      {t('keybinds', { defaultValue: 'Keybinds' })}
                    </span>
                    {(['lane1', 'lane2'] as const).map((lane, i) => (
                      <div key={lane} className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slice-text-muted">
                          {t('lane-n', { defaultValue: 'Lane {{n}}', n: i + 1 })}
                        </span>
                        <button
                          className={`px-3 py-1.5 rounded-lg text-xs font-black font-mono transition-colors ${
                            listeningForKey === lane
                              ? 'bg-blue-500 text-white shadow-[inset_3px_3px_6px_rgba(0,0,0,0.2)] animate-pulse'
                              : 'bg-slice-bg text-slice-text shadow-[3px_3px_6px_var(--slice-shadow-dark),-3px_-3px_6px_var(--slice-shadow-light)]'
                          }`}
                          onClick={() => {
                            if (justAssignedKeyRef.current) return;
                            setListeningForKey(listeningForKey === lane ? null : lane);
                          }}
                        >
                          {listeningForKey === lane
                            ? t('press-key-btn', { defaultValue: 'press key / btn...' })
                            : keybinds[lane]
                                .replace('Mouse0', 'LMB')
                                .replace('Mouse1', 'MMB')
                                .replace('Mouse2', 'RMB')
                                .replace('ArrowUp', '↑')
                                .replace('ArrowDown', '↓')
                                .replace('ArrowLeft', '←')
                                .replace('ArrowRight', '→')
                                .replace('Key', '')}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <Button
                  size="lg"
                  className="w-full shadow-[5px_5px_10px_var(--slice-shadow-dark),-5px_-5px_10px_var(--slice-shadow-light)] bg-slice-bg text-slice-text hover:bg-slice-shadow-dark/20 border-none active:shadow-[inset_5px_5px_10px_var(--slice-shadow-dark),inset_-5px_-5px_10px_var(--slice-shadow-light)]"
                  onClick={() => {
                    setListeningForKey(null);
                    engine?.resume();
                  }}
                >
                  {t('resume', { defaultValue: 'RESUME' })}
                </Button>
                <Button
                  size="lg"
                  variant="ghost"
                  className="w-full text-slice-text-muted hover:text-slice-text hover:bg-transparent shadow-[5px_5px_10px_var(--slice-shadow-dark),-5px_-5px_10px_var(--slice-shadow-light)] active:shadow-[inset_5px_5px_10px_var(--slice-shadow-dark),inset_-5px_-5px_10px_var(--slice-shadow-light)]"
                  onClick={() => {
                    setListeningForKey(null);
                    engine?.reset();
                    engine?.start();
                    setIsPaused(false);
                  }}
                >
                  {t('retry', { defaultValue: 'RETRY' })}
                </Button>
                <Button
                  size="lg"
                  variant="ghost"
                  className="w-full text-red-400 hover:text-red-500 hover:bg-transparent"
                  onClick={() => {
                    setListeningForKey(null);
                    useSliceItStore.getState().setStatus('MENU');
                    useSliceItStore.getState().setIsMultiplayer(false);
                    setIsPaused(false);
                    engine?.setMultiplayer(false);
                    engine?.reset();
                    leaveLobby();
                  }}
                >
                  {t('quit', { defaultValue: 'QUIT' })}
                </Button>
              </div>
            </div>
          )}

          {/* Multiplayer Settings Panel — slides in from top-right, no blur, game fully runs behind */}
          {showSettings && status === 'PLAYING' && isMultiplayer && (
            <div
              data-settings-panel
              className="absolute top-14 right-3 z-50 w-[min(18rem,calc(100vw-1.5rem))] bg-slice-bg rounded-[20px] shadow-[9px_9px_16px_var(--slice-shadow-dark),-9px_-9px_16px_var(--slice-shadow-light)] flex flex-col gap-3 p-4 duration-200"
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-black text-slice-text-darker uppercase tracking-widest">
                  {t('settings', { defaultValue: 'Settings' })}
                </h2>
                <button
                  className="w-7 h-7 rounded-full bg-slice-bg shadow-[3px_3px_6px_var(--slice-shadow-dark),-3px_-3px_6px_var(--slice-shadow-light)] flex items-center justify-center text-slice-text-muted hover:text-slice-text active:shadow-[inset_3px_3px_6px_var(--slice-shadow-dark),inset_-3px_-3px_6px_var(--slice-shadow-light)]"
                  onClick={() => setShowSettings(false)}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="bg-slice-shadow-dark/30 rounded-xl p-3 shadow-[inset_3px_3px_6px_var(--slice-shadow-dark),inset_-3px_-3px_6px_var(--slice-shadow-light)] flex flex-col gap-3">
                {/* Volume */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-black text-slice-text-muted uppercase tracking-wider">
                      {t('volume', { defaultValue: 'Volume' })}
                    </span>
                    <span className="text-xs font-bold text-blue-500">{volume}%</span>
                  </div>
                  <Slider
                    value={[volume]}
                    min={0}
                    max={100}
                    step={1}
                    onValueChange={([v]) => setVolume(v)}
                    className="w-full"
                  />
                </div>

                {/* Audio Offset */}
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-black text-slice-text-muted uppercase tracking-wider">
                    {t('audio-offset', { defaultValue: 'Audio Offset' })}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      className="w-6 h-6 rounded-md bg-slice-bg shadow-[3px_3px_6px_var(--slice-shadow-dark),-3px_-3px_6px_var(--slice-shadow-light)] text-slice-text-darker font-bold text-xs flex items-center justify-center active:shadow-[inset_3px_3px_6px_var(--slice-shadow-dark),inset_-3px_-3px_6px_var(--slice-shadow-light)]"
                      onClick={() => setAudioOffset(audioOffset - 5)}
                    >
                      −
                    </button>
                    <span className="text-xs font-bold text-slice-text-darker w-14 text-center font-mono">
                      {audioOffset > 0 ? '+' : ''}
                      {audioOffset}ms
                    </span>
                    <button
                      className="w-6 h-6 rounded-md bg-slice-bg shadow-[3px_3px_6px_var(--slice-shadow-dark),-3px_-3px_6px_var(--slice-shadow-light)] text-slice-text-darker font-bold text-xs flex items-center justify-center active:shadow-[inset_3px_3px_6px_var(--slice-shadow-dark),inset_-3px_-3px_6px_var(--slice-shadow-light)]"
                      onClick={() => setAudioOffset(audioOffset + 5)}
                    >
                      +
                    </button>
                  </div>
                </div>

                {/* Lane Cover (V10) */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-black text-slice-text-muted uppercase tracking-wider">
                      {ts('lane-cover', { defaultValue: 'Lane Cover' })}
                    </span>
                    <span className="text-xs font-bold text-blue-500 font-mono">
                      {ts('lane-cover-reaction', { defaultValue: '{{ms}}ms', ms: reactionMs })}
                    </span>
                  </div>
                  <Slider
                    value={[laneCoverHeight]}
                    min={MIN_LANE_COVER}
                    max={MAX_LANE_COVER}
                    step={0.01}
                    onValueChange={([v]) => setLaneCoverHeight(v)}
                    className="w-full"
                  />
                </div>

                {/* Keybinds */}
                <div className="flex flex-col gap-1.5">
                  <span className="text-[10px] font-black text-slice-text-muted uppercase tracking-wider">
                    {t('keybinds', { defaultValue: 'Keybinds' })}
                  </span>
                  {(['lane1', 'lane2'] as const).map((lane, i) => {
                    let displayBind = t('press-key-btn', { defaultValue: 'press key / btn...' });
                    if (listeningForKey !== lane) {
                      displayBind = keybinds[lane]
                        .replace('Mouse0', 'LMB')
                        .replace('Mouse1', 'MMB')
                        .replace('Mouse2', 'RMB')
                        .replace('ArrowUp', '↑')
                        .replace('ArrowDown', '↓')
                        .replace('ArrowLeft', '←')
                        .replace('ArrowRight', '→')
                        .replace('Key', '');
                    }

                    return (
                      <div key={lane} className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-slice-text-muted">
                          {t('lane-n', { defaultValue: 'Lane {{n}}', n: i + 1 })}
                        </span>
                        <button
                          className={`px-2 py-1 rounded-md text-[10px] font-black font-mono transition-colors ${
                            listeningForKey === lane
                              ? 'bg-blue-500 text-white shadow-[inset_3px_3px_6px_rgba(0,0,0,0.2)] animate-pulse'
                              : 'bg-slice-bg text-slice-text shadow-[3px_3px_6px_var(--slice-shadow-dark),-3px_-3px_6px_var(--slice-shadow-light)]'
                          }`}
                          onClick={() => {
                            if (justAssignedKeyRef.current) return;
                            setListeningForKey(listeningForKey === lane ? null : lane);
                          }}
                        >
                          {displayBind}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              <Button
                size="sm"
                variant="ghost"
                className="w-full text-red-400 hover:text-red-500 hover:bg-transparent text-xs font-black"
                onClick={() => {
                  setShowSettings(false);
                  useSliceItStore.getState().setStatus('MENU');
                  useSliceItStore.getState().setIsMultiplayer(false);
                  engine?.setMultiplayer(false);
                  engine?.reset();
                  leaveLobby();
                }}
              >
                {t('exit-game', { defaultValue: 'EXIT GAME' })}
              </Button>
            </div>
          )}

          {status === 'PLAYING' && <HUD engine={engine} />}

          {/* Synchronized Loading Overlay */}
          {status === 'PLAYING' && isLoadingSong && (
            <div className="absolute inset-0 z-60 bg-slice-bg/90 backdrop-blur-md flex flex-col items-center justify-center p-10">
              <div className="w-full max-w-md space-y-4">
                <div className="flex justify-between items-end mb-1">
                  <span className="text-sm font-black text-slice-text-muted uppercase tracking-widest">
                    {loadingProgressText || t('loading-assets', { defaultValue: 'Loading Assets' })}
                  </span>
                  <span className="text-2xl font-black text-blue-500">
                    {Math.round(loadingProgress)}%
                  </span>
                </div>
                <div className="h-4 bg-slice-bg rounded-full shadow-[inset_4px_4px_8px_var(--slice-shadow-dark),inset_-4px_-4px_8px_var(--slice-shadow-light)] p-1">
                  <div
                    className="h-full bg-linear-to-r from-blue-500 to-pink-500 w-full origin-left transition-transform duration-300 shadow-[0_0_15px_rgba(59,130,246,0.5)]"
                    style={{ transform: `scaleX(${loadingProgress / 100})` }}
                  />
                </div>

                {/* Multiplayer: per-player loading status */}
                {isMultiplayer && loadingPlayers.length > 0 && (
                  <div className="space-y-2 pt-2">
                    <p className="text-[11px] font-black text-slice-text-light uppercase tracking-widest text-center">
                      {t('waiting-for-players', { defaultValue: 'Waiting for players...' })}
                    </p>
                    {/* Overall bar: X / total loaded */}
                    <div className="h-2 bg-slice-bg rounded-full shadow-[inset_3px_3px_6px_var(--slice-shadow-dark),inset_-3px_-3px_6px_var(--slice-shadow-light)] overflow-hidden">
                      <div
                        className="h-full bg-green-400 w-full origin-left transition-transform duration-500"
                        style={{
                          transform: `scaleX(${(loadingPlayers.length === 0 ? 0 : (loadingPlayers.filter((p) => p.loaded).length / loadingPlayers.length) * 100) / 100})`,
                        }}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      {loadingPlayers.map((p) => (
                        <div
                          key={p.socketId}
                          className="flex items-center justify-between bg-slice-bg px-3 py-2 rounded-xl shadow-[inset_2px_2px_4px_var(--slice-shadow-dark),inset_-2px_-2px_4px_var(--slice-shadow-light)]"
                        >
                          <span className="text-xs font-bold text-slice-text-darker truncate">
                            {p.name}
                          </span>
                          {p.loaded ? (
                            <span className="text-[11px] font-black text-green-500 uppercase tracking-wide">
                              {t('player-ready', { defaultValue: 'Ready ✓' })}
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-[11px] font-bold text-slice-text-light">
                              <span className="w-3 h-3 border-2 border-slate-400 border-t-blue-500 rounded-full animate-spin inline-block" />
                              {t('loading', { defaultValue: 'Loading' })}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {!isMultiplayer && (
                  <p className="text-center text-xs text-slice-text-light font-bold uppercase tracking-tighter animate-pulse">
                    {t('synchronizing', { defaultValue: 'Synchronizing with group...' })}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Countdown Overlay */}
          {status === 'PLAYING' && countdown > 0 && (
            <div className="absolute inset-0 z-70 flex items-center justify-center pointer-events-none">
              <motion.div key={countdown} variants={popIn} initial="initial" animate="animate">
                <span className="text-[7rem] sm:text-[12rem] font-black italic text-slice-text soft-glow-text drop-shadow-[0_10px_30px_rgba(0,0,0,0.2)]">
                  {countdown}
                </span>
              </motion.div>
            </div>
          )}

          {/*
            Someone dropped mid-song and the room is holding for them. The
            countdown is rendered against the server's `kickAt`, so every player
            sees the same number — including the one reconnecting, whose client
            is retrying continuously behind this overlay.
          */}
          {status === 'PLAYING' && pause && <PauseOverlay pause={pause} />}

          {status === 'FINISHED' && isMultiplayer && (
            <MatchResults
              engine={engine}
              onBack={() => {
                const store = useSliceItStore.getState();
                store.setMatchResults(null);
                store.setStatus('MENU');
                engine?.setMultiplayer(false);
                engine?.reset();
                leaveLobby();
              }}
            />
          )}

          {status === 'FINISHED' && !isMultiplayer && (
            <GameOver
              engine={engine}
              onRetry={() => {
                if (!engine) return;
                engine.reset();
                setCountdown(3);
                setTimeout(() => {
                  if (useSliceItStore.getState().status === 'FINISHED') setCountdown(2);
                }, 1000);
                setTimeout(() => {
                  if (useSliceItStore.getState().status === 'FINISHED') setCountdown(1);
                }, 2000);
                setTimeout(() => {
                  setCountdown(0);
                  if (useSliceItStore.getState().status === 'FINISHED') {
                    useSliceItStore.getState().setStatus('PLAYING');
                    engine.start();
                  }
                }, 3000);
              }}
            />
          )}

          {status === 'MENU' && <MainMenu engine={engine} />}

          {/* No input device warning */}
          {!hasKeyboard && !hasGamepad && !hasTouch && (
            <motion.div
              className="absolute bottom-4 left-1/2 -translate-x-1/2 z-90 max-w-md w-[90%]"
              variants={fadeRise}
              initial="initial"
              animate="animate"
            >
              <div className="bg-amber-50 border-2 border-amber-400 rounded-2xl px-5 py-4 shadow-lg flex items-start gap-3">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-amber-500 shrink-0 mt-0.5"
                >
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                <div>
                  <p className="text-sm font-black text-amber-800 uppercase tracking-wide">
                    {t('no-input-device', { defaultValue: 'No Input Device Detected' })}
                  </p>
                  <p className="text-xs text-amber-700 mt-1 leading-relaxed">
                    {t('no-input-device-desc', {
                      defaultValue:
                        'Connect a keyboard or controller to play. The game requires physical input to hit notes.',
                    })}
                  </p>
                </div>
              </div>
            </motion.div>
          )}

          {/* Gamepad connected indicator (brief) */}
          {hasGamepad && !hasKeyboard && !hasTouch && status === 'MENU' && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-90 duration-500">
              <div className="bg-green-50 border-2 border-green-400 rounded-2xl px-5 py-3 shadow-lg flex items-center gap-3">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-green-600 shrink-0"
                >
                  <path d="M6 12h4m-2-2v4m5-3h.01M17 10h.01" />
                  <path d="M2 15.24V7.5A2.5 2.5 0 0 1 4.5 5h15A2.5 2.5 0 0 1 22 7.5v7.74a2.5 2.5 0 0 1-1.26 2.17l-5.5 3.17a2.5 2.5 0 0 1-2.49 0H11.24a2.5 2.5 0 0 1-2.49 0l-5.5-3.17A2.5 2.5 0 0 1 2 15.24Z" />
                </svg>
                <p className="text-sm font-black text-green-800 uppercase tracking-wide">
                  {t('controller-connected', { defaultValue: 'Controller Connected' })}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Sidebar for Multiplayer Opponents — only shown in multiplayer */}
      {(status === 'PLAYING' || (status === 'FINISHED' && isMultiplayer)) && isMultiplayer && (
        <MultiplayerSidebar />
      )}
    </div>
  );
}

/**
 * "Waiting for <name> — 27s".
 *
 * The countdown is derived from the server's `kickAt` timestamp on every tick
 * rather than from a local `setInterval` started at pause time: two clients
 * whose clocks differ, or one whose tab was throttled while backgrounded, would
 * otherwise show numbers that disagree with each other and with the moment the
 * server actually gives up.
 */
function PauseOverlay({ pause }: { pause: PausePayload }) {
  const { t } = useTranslation('c-game');
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, Math.ceil((pause.kickAt - Date.now()) / 1000)),
  );

  useEffect(() => {
    const tick = () => setRemaining(Math.max(0, Math.ceil((pause.kickAt - Date.now()) / 1000)));
    tick();
    const timer = setInterval(tick, 250);
    return () => clearInterval(timer);
  }, [pause.kickAt]);

  const names = pause.peers.map((peer) => peer.userName).join(', ');

  return (
    <div
      className="absolute inset-0 z-80 flex items-center-safe justify-center-safe bg-slice-bg/85 backdrop-blur-sm p-6"
      role="status"
      aria-live="polite"
    >
      <div className="text-center max-w-sm">
        <p className="text-xs font-black uppercase tracking-[0.3em] text-amber-500 mb-3">
          {t('match-paused', { defaultValue: 'Match Paused' })}
        </p>
        <h2 className="text-2xl font-black text-slice-text-darker mb-2">
          {t('waiting-for-player', {
            defaultValue: 'Waiting for {{names}} to reconnect',
            names: names || t('a-player', { defaultValue: 'a player' }),
          })}
        </h2>
        <p className="text-4xl sm:text-5xl font-black font-mono text-slice-text tabular-nums">
          {remaining}s
        </p>
        <p className="text-xs text-slice-text-muted mt-4">
          {t('pause-resume-hint', {
            defaultValue: 'The match resumes as soon as they are back, or when the timer runs out.',
          })}
        </p>
        {pause.pausesLeft <= 1 && (
          <p className="text-[10px] font-bold uppercase tracking-widest text-orange-400 mt-3">
            {pause.pausesLeft === 0
              ? t('pauses-exhausted', { defaultValue: 'No pauses left after this one' })
              : t('pauses-left', { defaultValue: '1 pause left' })}
          </p>
        )}
      </div>
    </div>
  );
}
