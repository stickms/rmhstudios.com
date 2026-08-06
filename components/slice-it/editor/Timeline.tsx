'use client';

/**
 * The timeline — a vertical scrolling canvas. Time runs bottom (now) to top
 * (later), matching the game's own note approach so an author reads the editor
 * the way they read the playfield.
 *
 * Design doc: `docs/slice-it-chart-editor.md` §4.
 *
 * Canvas, for the same reason `GameCanvas.tsx` is: a four-minute Expert chart is
 * ~1200 notes and a DOM node per note is a layout pass per frame. Three rules
 * this file lives by, each of which was a measured cost in the 07-30 audit:
 *
 *  1. **Theme colours are resolved once per theme change, never per frame** —
 *     see `theme.ts`.
 *  2. **Only the visible window is drawn.** The note list is kept in
 *     `compareNotes` order, so the window is a contiguous range and binary
 *     search finds it.
 *  3. **Nothing outside the canvas moves on pointer input.** Hover and drag live
 *     in refs and repaint the canvas; no CSS custom property is written to a DOM
 *     node per frame (`components/CLAUDE.md`, "nothing reacts to pointer
 *     position").
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { gameSurfaceDpr } from '@/lib/display-scale';
import { nestedDelete, nestedMove, nestedPlace } from '@/lib/slice-it/editor/nesting';
import { barBeatAt, gridLines, quantizationOf, snapTime } from '@/lib/slice-it/editor/snap';
import { BASE_PIXELS_PER_SECOND, editorState, useEditorStore } from '@/lib/slice-it/editor/store';
import type { EditorNote, TimingPoint } from '@/lib/slice-it/editor/types';
import { newNoteId } from '@/lib/slice-it/editor/uuid';
import { envelopePeak } from '@/lib/slice-it/beatmap/envelope';
import type { EditorArtefacts, GhostOnset } from '@/lib/slice-it/editor/artefacts';
import { activePlaytest } from '@/lib/slice-it/editor/playtest';
import type { DifficultyPlan } from '@/lib/slice-it/editor/generate';
import { QUANT_COLORS, readEditorTheme, type EditorTheme } from './theme';

/** Left gutter, in CSS pixels, holding the bar/beat ruler (§4.2). */
const GUTTER = 58;
/**
 * Width of the waveform strip between the ruler and the lanes (§6).
 *
 * Drawn INSIDE this canvas rather than as the separate element §6 sketches: a
 * second canvas beside this one is a second surface to size, a second device
 * pixel ratio to clamp, and — the part that actually bites — a second draw loop
 * that has to stay in lockstep with this one's scroll or the waveform lags the
 * notes by a frame while dragging. One canvas, one loop, one scroll position.
 */
const WAVE_W = 30;
/** Left edge of the playable lanes. */
const LANES_X = GUTTER + WAVE_W;
/** Where the playhead sits vertically, as a fraction of the canvas height. */
const PLAYHEAD_FRACTION = 0.78;
/** Note body height in CSS pixels. Constant — zoom changes spacing, not size. */
const NOTE_H = 15;
/** Pointer slop for hit-testing a note, in CSS pixels. */
const HIT_SLOP = 9;
/** A drag has to travel this far before it stops being a click. */
const DRAG_THRESHOLD = 4;
/**
 * How close a charted note has to be for an onset to count as already charted,
 * seconds. 30 ms is the onset detector's own minimum gap — closer than that and
 * the two were never distinguishable as separate events in the first place.
 */
const GHOST_MATCH_S = 0.03;

interface ViewWindow {
  width: number;
  height: number;
  playheadY: number;
  /** Pixels per second. */
  pps: number;
  playhead: number;
  startTime: number;
  endTime: number;
  keys: number;
}

function buildView(width: number, height: number, playhead: number, zoom: number, keys: number) {
  const pps = BASE_PIXELS_PER_SECOND * zoom;
  const playheadY = height * PLAYHEAD_FRACTION;
  return {
    width,
    height,
    playheadY,
    pps,
    playhead,
    startTime: playhead - (height - playheadY) / pps,
    endTime: playhead + playheadY / pps,
    keys,
  } satisfies ViewWindow;
}

const yOf = (view: ViewWindow, time: number) => view.playheadY - (time - view.playhead) * view.pps;
const timeOf = (view: ViewWindow, y: number) => view.playhead + (view.playheadY - y) / view.pps;
const laneWidth = (view: ViewWindow) => (view.width - LANES_X) / Math.max(1, view.keys);
const laneCenterX = (view: ViewWindow, lane: number) => LANES_X + laneWidth(view) * (lane + 0.5);
const laneOf = (view: ViewWindow, x: number) =>
  Math.max(0, Math.min(view.keys - 1, Math.floor((x - LANES_X) / laneWidth(view))));

/** Index range of notes inside `[startTime, endTime]`, widened for hold tails. */
function visibleRange(notes: readonly EditorNote[], start: number, end: number) {
  const lower = (time: number) => {
    let lo = 0;
    let hi = notes.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (notes[mid].time < time) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  // Back off by 60s so a LONG note whose head is off the bottom still draws its
  // tail. Cheap: it is an index walk, not a scan of the notes it skips.
  return { from: lower(start - 60), to: lower(end + 0.001) };
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/**
 * The CSS `.neumorphic` pair, in canvas terms (§12.3).
 *
 * Under the degradation tier (`canvasGlowEnabled()` false — low-end devices and
 * reduced motion) it is a flat fill with the same geometry, because blurred
 * shadows were this renderer's dominant cost in the 07-30 probe.
 */
function neumorphicFill(ctx: CanvasRenderingContext2D, draw: () => void, theme: EditorTheme) {
  if (!theme.glow) {
    draw();
    return;
  }
  ctx.save();
  ctx.shadowColor = theme.shadowDark;
  ctx.shadowBlur = 6;
  ctx.shadowOffsetX = 2;
  ctx.shadowOffsetY = 2;
  draw();
  ctx.restore();
}

/**
 * Note shape by type.
 *
 * §14: colour is never the only channel. The quantisation colour says WHEN a
 * note is; the shape says WHAT it is, so the two are still separable in every
 * colour-vision mode.
 */
function noteShape(
  ctx: CanvasRenderingContext2D,
  note: EditorNote,
  cx: number,
  cy: number,
  w: number,
) {
  const half = w / 2;
  switch (note.type) {
    case 'BOMB':
      ctx.beginPath();
      ctx.arc(cx, cy, NOTE_H * 0.72, 0, Math.PI * 2);
      break;
    case 'SWITCH':
      ctx.beginPath();
      ctx.moveTo(cx, cy - NOTE_H * 0.85);
      ctx.lineTo(cx + half * 0.5, cy);
      ctx.lineTo(cx, cy + NOTE_H * 0.85);
      ctx.lineTo(cx - half * 0.5, cy);
      ctx.closePath();
      break;
    case 'SPEED':
      ctx.beginPath();
      ctx.moveTo(cx - half * 0.6, cy + NOTE_H * 0.7);
      ctx.lineTo(cx + half * 0.6, cy + NOTE_H * 0.7);
      ctx.lineTo(cx, cy - NOTE_H * 0.8);
      ctx.closePath();
      break;
    default:
      roundRect(ctx, cx - half, cy - NOTE_H / 2, w, NOTE_H, NOTE_H / 2);
  }
}

interface DragState {
  kind: 'move' | 'box' | 'erase';
  startX: number;
  startY: number;
  x: number;
  y: number;
  moved: boolean;
  /** `move` only: the last delta already committed, so each frame sends the step. */
  lastTime: number;
  lastLane: number;
}

export function Timeline() {
  const { t } = useTranslation('r-slice-it');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const themeRef = useRef<EditorTheme | null>(null);
  const dprRef = useRef(1);
  const dirtyRef = useRef(true);
  const hoverRef = useRef<{ x: number; y: number } | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const sizeRef = useRef({ width: 0, height: 0 });
  // Mirrored into state as well as a ref: the draw loop reads the ref (no
  // re-render per frame), while the accessible note list below is React output
  // and has to re-derive its window when the canvas resizes.
  const [size, setSize] = useState({ width: 0, height: 0 });

  const active = useEditorStore((s) => s.active);
  const notes = useEditorStore((s) => s.charts[s.active].notes);
  const keys = useEditorStore((s) => s.keys);
  const playhead = useEditorStore((s) => s.playhead);
  const zoom = useEditorStore((s) => s.zoom);
  const timingPoints = useEditorStore((s) => s.timingPoints);
  const snap = useEditorStore((s) => s.snap);
  const tool = useEditorStore((s) => s.tool);
  const preview = useEditorStore((s) => s.preview);
  const playtesting = useEditorStore((s) => s.playtesting);
  const artefacts = useEditorStore((s) => s.artefacts);
  const showGhosts = useEditorStore((s) => s.showGhosts);

  /* ── Sizing ───────────────────────────────────────────────────────────── */
  useEffect(() => {
    const wrapper = wrapperRef.current;
    const canvas = canvasRef.current;
    if (!wrapper || !canvas) return;

    const sync = () => {
      const { width, height } = wrapper.getBoundingClientRect();
      if (width <= 0 || height <= 0) return;
      // Clamped, and remembered, for the reason `GameCanvas` documents: fill
      // rate goes with the SQUARE of the ratio, and the draw code needs the same
      // number the buffer was sized with or the whole surface scales.
      const dpr = gameSurfaceDpr(window);
      dprRef.current = dpr;
      sizeRef.current = { width, height };
      setSize((previous) =>
        previous.width === width && previous.height === height ? previous : { width, height },
      );
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      dirtyRef.current = true;
    };
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, []);

  /* ── Theme cache ──────────────────────────────────────────────────────── */
  useEffect(() => {
    const observer = new MutationObserver(() => {
      themeRef.current = null;
      dirtyRef.current = true;
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'style'],
    });
    return () => observer.disconnect();
  }, []);

  /* ── Repaint on any state the drawing depends on ──────────────────────── */
  useEffect(() => {
    dirtyRef.current = true;
  }, [
    active,
    notes,
    keys,
    playhead,
    zoom,
    timingPoints,
    snap,
    tool,
    preview,
    playtesting,
    artefacts,
    showGhosts,
  ]);

  /* ── Draw loop ────────────────────────────────────────────────────────── */
  useEffect(() => {
    let frame = 0;
    const loop = () => {
      frame = requestAnimationFrame(loop);
      if (!dirtyRef.current) return;
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) return;
      dirtyRef.current = false;

      const theme = (themeRef.current ??= readEditorTheme(canvas));
      const { width, height } = sizeRef.current;
      if (width <= 0 || height <= 0) return;

      const dpr = dprRef.current;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.scale(dpr, dpr);

      const state = editorState();
      const view = buildView(width, height, state.playhead, state.zoom, state.keys);
      draw(ctx, view, state.charts[state.active].notes, state.timingPoints, theme, {
        snap: state.snap,
        hover: hoverRef.current,
        drag: dragRef.current,
        duration: state.song?.duration ?? 0,
        preview: state.preview?.byDifficulty[state.active] ?? null,
        loop: state.loop,
        artefacts: state.artefacts,
        showGhosts: state.showGhosts,
      });

      // A running playtest moves the world every frame: the playhead is written
      // by the transport's own loop, and the hit marks it draws fade on wall
      // time, so this canvas is never clean while one is playing.
      if (state.playtesting) dirtyRef.current = true;
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, []);

  /* ── Hit testing ──────────────────────────────────────────────────────── */
  const noteAt = useCallback((view: ViewWindow, x: number, y: number): EditorNote | null => {
    const state = editorState();
    const list = state.charts[state.active].notes;
    const { from, to } = visibleRange(list, view.startTime, view.endTime);
    const halfW = Math.min(48, laneWidth(view) * 0.42);
    let best: EditorNote | null = null;
    let bestDistance = Infinity;
    for (let i = from; i < to; i++) {
      const note = list[i];
      const cx = laneCenterX(view, note.lane);
      const cy = yOf(view, note.time);
      if (Math.abs(x - cx) > halfW + HIT_SLOP) continue;
      const dy = Math.abs(y - cy);
      if (dy > NOTE_H / 2 + HIT_SLOP) continue;
      if (dy < bestDistance) {
        bestDistance = dy;
        best = note;
      }
    }
    return best;
  }, []);

  /**
   * The ghost under the pointer, if any (§6).
   *
   * Deliberately checked only where no note was hit: a ghost sitting under a
   * charted note must never win the click, or an author trying to select a note
   * would place a duplicate on top of it.
   */
  const ghostAt = useCallback((view: ViewWindow, x: number, y: number): GhostOnset | null => {
    const state = editorState();
    const ghosts = state.artefacts?.ghosts;
    if (!ghosts || ghosts.length === 0 || !state.showGhosts) return null;

    const notes = state.charts[state.active].notes;
    const time = timeOf(view, y);
    const lane = laneOf(view, x);
    const tolerance = (NOTE_H / 2 + HIT_SLOP) / view.pps;

    let best: GhostOnset | null = null;
    let bestDistance = tolerance;
    for (const ghost of ghosts) {
      if (ghost.time < time - tolerance) continue;
      if (ghost.time > time + tolerance) break;
      if (hasNoteNear(notes, ghost.time)) continue;
      // Lane is a suggestion, so a click in the wrong lane still promotes — it
      // just promotes onto the lane the author clicked, which is what they meant.
      const distance = Math.abs(ghost.time - time);
      if (distance <= bestDistance) {
        bestDistance = distance;
        best = { ...ghost, lane };
      }
    }
    return best;
  }, []);

  const viewNow = useCallback(() => {
    const state = editorState();
    const { width, height } = sizeRef.current;
    return buildView(width, height, state.playhead, state.zoom, state.keys);
  }, []);

  const localPoint = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  /* ── Pointer ──────────────────────────────────────────────────────────── */
  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0 && event.button !== 2) return;
    const view = viewNow();
    const { x, y } = localPoint(event);
    if (x < LANES_X) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.focus();

    const state = editorState();
    const hit = noteAt(view, x, y);
    const rawTime = timeOf(view, y);
    const time = state.snapEnabled ? snapTime(rawTime, state.snap, state.timingPoints) : rawTime;
    const lane = laneOf(view, x);

    // Right-click always erases, whatever the tool — §5.2.
    const erasing = event.button === 2 || state.tool === 'erase';

    if (erasing) {
      if (hit) {
        state.apply(nestedDelete(state.nestingMode, state.charts, state.active, [hit]));
      }
      dragRef.current = {
        kind: 'erase',
        startX: x,
        startY: y,
        x,
        y,
        moved: false,
        lastTime: 0,
        lastLane: 0,
      };
      dirtyRef.current = true;
      return;
    }

    /* Promote an onset ghost (§6) — one click turns "the generator missed the
     * snare in bar 2" into a note. Placed at the onset's OWN time, not the
     * snapped one: the whole point of a rejected candidate is that the music
     * put it off the grid, and rounding it back onto the grid would place it
     * where the generator already decided nothing was happening. The linter
     * flags it as off-grid, which is the honest description of what it is. */
    if (!hit && (state.tool === 'select' || state.tool === 'place')) {
      const ghost = ghostAt(view, x, y);
      if (ghost) {
        const note: EditorNote = {
          id: newNoteId(),
          time: Math.max(0, ghost.time),
          lane: ghost.lane,
          type: state.tool === 'place' ? state.placeType : 'STANDARD',
          auto: false,
          selected: true,
        };
        state.apply(nestedPlace(state.nestingMode, state.charts, state.active, note));
        state.setSelection([note.id], 'replace');
        dirtyRef.current = true;
        return;
      }
    }

    if (state.tool === 'place' || state.tool === 'hold') {
      const note: EditorNote = {
        id: newNoteId(),
        time: Math.max(0, time),
        lane,
        type: state.tool === 'hold' ? 'LONG' : state.placeType,
        auto: false,
        selected: true,
        ...(state.tool === 'hold' ? { duration: 0.25 } : {}),
      };
      state.apply(nestedPlace(state.nestingMode, state.charts, state.active, note));
      state.setSelection([note.id], 'replace');
      dirtyRef.current = true;
      return;
    }

    // Select tool.
    if (hit) {
      const mode = event.shiftKey ? 'add' : event.ctrlKey || event.metaKey ? 'toggle' : null;
      if (mode) {
        state.setSelection([hit.id], mode);
      } else if (!hit.selected) {
        state.setSelection([hit.id], 'replace');
      }
      dragRef.current = {
        kind: 'move',
        startX: x,
        startY: y,
        x,
        y,
        moved: false,
        lastTime: 0,
        lastLane: 0,
      };
    } else {
      if (!event.shiftKey && !event.ctrlKey && !event.metaKey) state.clearSelection();
      dragRef.current = {
        kind: 'box',
        startX: x,
        startY: y,
        x,
        y,
        moved: false,
        lastTime: 0,
        lastLane: 0,
      };
    }
    dirtyRef.current = true;
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const { x, y } = localPoint(event);
    hoverRef.current = { x, y };
    dirtyRef.current = true;

    const drag = dragRef.current;
    if (!drag) return;
    drag.x = x;
    drag.y = y;
    if (!drag.moved && Math.hypot(x - drag.startX, y - drag.startY) > DRAG_THRESHOLD) {
      drag.moved = true;
    }
    if (!drag.moved) return;

    const state = editorState();
    const view = viewNow();

    if (drag.kind === 'erase') {
      const hit = noteAt(view, x, y);
      if (hit) state.apply(nestedDelete(state.nestingMode, state.charts, state.active, [hit]));
      return;
    }

    if (drag.kind !== 'move') return;

    // The delta is measured from the gesture's ORIGIN and committed as the step
    // since the last frame, so the merged command in the undo stack describes
    // the whole gesture (see `moveNotes.mergeWith`).
    const originTime = timeOf(view, drag.startY);
    const currentTime = timeOf(view, y);
    const rawDelta = currentTime - originTime;
    const selected = state.charts[state.active].notes.filter((note) => note.selected);
    if (selected.length === 0) return;

    let totalTime = rawDelta;
    if (state.snapEnabled) {
      // Snap the anchor note's destination rather than the raw delta, so a
      // selection keeps its internal spacing and lands on the grid.
      const anchor = selected[0];
      const snapped = snapTime(anchor.time + rawDelta, state.snap, state.timingPoints);
      totalTime = snapped - anchor.time;
    }
    const totalLane = laneOf(view, x) - laneOf(view, drag.startX);

    const stepTime = totalTime - drag.lastTime;
    const stepLane = totalLane - drag.lastLane;
    if (stepTime === 0 && stepLane === 0) return;
    drag.lastTime = totalTime;
    drag.lastLane = totalLane;

    state.apply(
      nestedMove(
        state.nestingMode,
        state.charts,
        state.active,
        selected,
        stepTime,
        stepLane,
        state.keys,
      ),
      { merge: true },
    );
  };

  const onPointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    dirtyRef.current = true;
    if (!drag) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (drag.kind !== 'box' || !drag.moved) return;

    const state = editorState();
    const view = viewNow();
    const t0 = Math.min(timeOf(view, drag.startY), timeOf(view, drag.y));
    const t1 = Math.max(timeOf(view, drag.startY), timeOf(view, drag.y));
    const x0 = Math.min(drag.startX, drag.x);
    const x1 = Math.max(drag.startX, drag.x);
    const inBox = state.charts[state.active].notes.filter((note) => {
      if (note.time < t0 || note.time > t1) return false;
      const cx = laneCenterX(view, note.lane);
      return cx >= x0 - HIT_SLOP && cx <= x1 + HIT_SLOP;
    });
    state.setSelection(
      inBox.map((note) => note.id),
      event.shiftKey ? 'add' : 'replace',
    );
  };

  const onWheel = useCallback((event: WheelEvent) => {
    const state = editorState();
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      state.setZoom(state.zoom * (event.deltaY > 0 ? 0.9 : 1.1));
      return;
    }
    event.preventDefault();
    state.setPlayhead(state.playhead - event.deltaY / (BASE_PIXELS_PER_SECOND * state.zoom));
  }, []);

  // Attached imperatively: React's onWheel is passive, so `preventDefault()`
  // inside it is ignored and the page scrolls behind the editor.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [onWheel]);

  /* ── The accessible mirror (§14) ──────────────────────────────────────── */
  //
  // The canvas is opaque to a screen reader, so the notes currently on screen
  // are also a list. Bounded to the visible window rather than the whole chart:
  // a 1200-option listbox is not navigable, and the window is what the canvas is
  // showing anyway.
  const visibleNotes = useMemo(() => {
    if (size.width <= 0) return [] as EditorNote[];
    const view = buildView(size.width, size.height, playhead, zoom, keys);
    const { from, to } = visibleRange(notes, view.startTime, view.endTime);
    return notes.slice(from, Math.min(to, from + 60));
  }, [notes, playhead, zoom, keys, size]);

  const position = barBeatAt(playhead, timingPoints);

  return (
    <div ref={wrapperRef} className="editor-timeline relative h-full w-full overflow-hidden">
      <canvas
        ref={canvasRef}
        tabIndex={0}
        role="application"
        aria-label={t('editor-timeline-label', {
          defaultValue: 'Chart timeline. Bar {{bar}}, beat {{beat}}.',
          bar: position.bar,
          beat: position.beat,
        })}
        className="h-full w-full touch-none outline-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={() => {
          hoverRef.current = null;
          dirtyRef.current = true;
        }}
        onContextMenu={(event) => event.preventDefault()}
      />
      <ul
        role="listbox"
        aria-label={t('editor-note-list-label', { defaultValue: 'Notes in view' })}
        aria-multiselectable
        className="sr-only"
      >
        {visibleNotes.map((note) => {
          const at = barBeatAt(note.time, timingPoints);
          return (
            <li key={note.id} role="option" aria-selected={Boolean(note.selected)}>
              {t('editor-note-option', {
                defaultValue: '{{type}} note, lane {{lane}}, bar {{bar}} beat {{beat}}',
                type: note.type,
                lane: note.lane + 1,
                bar: at.bar,
                beat: at.beat,
              })}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ── Drawing ────────────────────────────────────────────────────────────── */

interface DrawOptions {
  snap: number;
  hover: { x: number; y: number } | null;
  drag: DragState | null;
  duration: number;
  /** The uncommitted regenerate for this difficulty, if one is being previewed. */
  preview: DifficultyPlan | null;
  loop: { start: number; end: number } | null;
  /** Waveform, ghosts and sections (§6). Null for a song with no stored artefacts. */
  artefacts: EditorArtefacts | null;
  showGhosts: boolean;
}

/** Preview colours. Fixed, like the quantisation palette, and for the same reason. */
const PREVIEW_ADDED = '#22c55e';
const PREVIEW_REMOVED = '#ef4444';
/** Hit highlights (§4.4a): the game's own judgement colours, hit and miss. */
const HIT_COLOR = '#22d3ee';
const MISS_COLOR = '#ef4444';
/** How long a hit mark stays on the timeline, ms. */
const HIT_FADE_MS = 900;

function draw(
  ctx: CanvasRenderingContext2D,
  view: ViewWindow,
  notes: readonly EditorNote[],
  points: readonly TimingPoint[],
  theme: EditorTheme,
  options: DrawOptions,
) {
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, view.width, view.height);

  drawLanes(ctx, view, theme);
  drawWaveform(ctx, view, theme, options.artefacts);
  drawSections(ctx, view, theme, options.artefacts);
  drawLoop(ctx, view, theme, options.loop);
  drawBeatGrid(ctx, view, points, theme, options.snap);
  // Ghosts UNDER the notes: a rejected candidate that has since been charted
  // must never draw on top of the note that supersedes it.
  if (options.showGhosts) drawGhosts(ctx, view, theme, options.artefacts, notes);
  // Removals draw UNDER the chart: a struck-through note is still a note the
  // author can see in place, with a line through it, rather than a gap they have
  // to infer.
  drawPreview(ctx, view, options.preview);
  drawNotes(ctx, view, notes, points, theme, options.hover);
  drawHitMarks(ctx, view, notes);
  drawSelectionBox(ctx, theme, options.drag);
  drawPlayhead(ctx, view, theme);

  // TODO(phase 8 — §4.4b): the aggregate miss-rate heat tint, once O1 exists.
}

/**
 * The waveform strip (§6).
 *
 * One column per device-independent pixel, each the PEAK over the time that
 * column covers — not the envelope sample nearest it. Nearest-sampling a
 * 48 000-point envelope into 900 columns aliases, and the transient the author
 * is scrolling to find blinks in and out as the view moves. Taking the max is
 * both cheaper to reason about and stable under scroll.
 */
function drawWaveform(
  ctx: CanvasRenderingContext2D,
  view: ViewWindow,
  theme: EditorTheme,
  artefacts: EditorArtefacts | null,
) {
  const bytes = artefacts?.envelope.bytes;
  const rate = artefacts?.envelope.rate ?? 0;
  if (!bytes || bytes.length === 0 || rate <= 0) return;

  const centre = GUTTER + WAVE_W / 2;
  const secondsPerPixel = 1 / view.pps;

  ctx.save();
  ctx.fillStyle = theme.primary;
  ctx.globalAlpha = 0.5;
  for (let y = 0; y < view.height; y++) {
    const time = timeOf(view, y);
    if (time < 0) continue;
    const peak = envelopePeak(bytes, rate, time - secondsPerPixel, time);
    if (peak <= 0) continue;
    const half = (peak * (WAVE_W - 6)) / 2;
    ctx.fillRect(centre - half, y, half * 2, 1);
  }
  ctx.restore();
}

/**
 * Section boundaries and their labels (C5).
 *
 * A line across the whole surface, not a marker in the gutter: the boundary is
 * a fact about the music at that instant, and the author is looking at the
 * notes, not at the ruler. The label sits in the waveform strip where there is
 * room for it and nothing to overlap.
 */
function drawSections(
  ctx: CanvasRenderingContext2D,
  view: ViewWindow,
  theme: EditorTheme,
  artefacts: EditorArtefacts | null,
) {
  const sections = artefacts?.sections;
  if (!sections || sections.length === 0) return;

  ctx.save();
  ctx.setLineDash([2, 6]);
  ctx.strokeStyle = theme.accent;
  ctx.lineWidth = 1;
  ctx.font = '600 10px ui-monospace, monospace';
  ctx.textBaseline = 'top';

  for (const section of sections) {
    if (section.start < view.startTime || section.start > view.endTime) continue;
    const y = Math.round(yOf(view, section.start)) + 0.5;
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.moveTo(GUTTER, y);
    ctx.lineTo(view.width, y);
    ctx.stroke();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = theme.accent;
    ctx.fillText(section.label, GUTTER + 3, y + 2);
  }
  ctx.restore();
}

/**
 * Onset ghosts (§6) — the highest-value part of this phase.
 *
 * Every onset the analyser detected that this difficulty does not chart, drawn
 * as a faint outline at its time and its suggested lane. Most of them are the
 * candidates the 55 ms quantisation filter REJECTED, which is exactly the
 * information a human editor wants and the one thing they cannot re-derive:
 * these are the notes the generator considered and turned down.
 *
 * Opacity tracks detection strength, so a strong rejected transient (a missed
 * snare) is visibly different from the weak ones the generator was right about.
 */
function drawGhosts(
  ctx: CanvasRenderingContext2D,
  view: ViewWindow,
  theme: EditorTheme,
  artefacts: EditorArtefacts | null,
  notes: readonly EditorNote[],
) {
  const ghosts = artefacts?.ghosts;
  if (!ghosts || ghosts.length === 0) return;

  const width = Math.min(96, laneWidth(view) * 0.72);
  ctx.save();
  ctx.strokeStyle = theme.textMuted;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([3, 3]);

  for (const ghost of ghosts) {
    if (ghost.time < view.startTime || ghost.time > view.endTime) continue;
    // Already charted here? Then it is not a ghost, it is a note — and the note
    // is drawn a few functions later, on top of where this would have been.
    if (hasNoteNear(notes, ghost.time)) continue;
    const cy = yOf(view, ghost.time);
    const cx = laneCenterX(view, Math.min(view.keys - 1, ghost.lane));
    ctx.globalAlpha = 0.18 + 0.35 * Math.min(1, ghost.strength);
    roundRect(ctx, cx - width / 2, cy - NOTE_H / 2, width, NOTE_H, NOTE_H / 2);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Is this moment already charted?
 *
 * Its own binary search rather than `visibleRange`, which deliberately backs off
 * 60 seconds so hold tails still draw — harmless for one call per frame, and a
 * full scan of the chart per ghost per frame if it were reused here.
 */
function hasNoteNear(notes: readonly EditorNote[], time: number): boolean {
  let lo = 0;
  let hi = notes.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (notes[mid].time < time - GHOST_MATCH_S) lo = mid + 1;
    else hi = mid;
  }
  for (let i = lo; i < notes.length && notes[i].time <= time + GHOST_MATCH_S; i++) {
    return true;
  }
  return false;
}

/**
 * The uncommitted regenerate (§8.3).
 *
 * Added notes in green, removed notes struck through — and both drawn in outline
 * rather than filled, so a preview can never be mistaken for the chart. Nothing
 * on this canvas is the document until Apply.
 */
function drawPreview(ctx: CanvasRenderingContext2D, view: ViewWindow, plan: DifficultyPlan | null) {
  if (!plan) return;
  const width = Math.min(96, laneWidth(view) * 0.72);

  ctx.save();
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 3]);
  ctx.strokeStyle = PREVIEW_ADDED;
  for (const note of plan.added) {
    const cy = yOf(view, note.time);
    if (cy < -NOTE_H || cy > view.height + NOTE_H) continue;
    noteShape(ctx, note, laneCenterX(view, note.lane), cy, width + 6);
    ctx.stroke();
  }
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = PREVIEW_REMOVED;
  ctx.lineWidth = 2;
  for (const note of plan.removed) {
    const cy = yOf(view, note.time);
    if (cy < -NOTE_H || cy > view.height + NOTE_H) continue;
    const cx = laneCenterX(view, note.lane);
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.moveTo(cx - width / 2 - 4, cy);
    ctx.lineTo(cx + width / 2 + 4, cy);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Playtest hit highlights (§4.4a).
 *
 * Read straight off the engine's resolved slices — `hit` and `hitTime` are
 * already written there by `resolve()` and the miss sweep — so the ring an author
 * sees is the judgement that was actually made, not a second opinion computed
 * from note positions. That is the whole loop this feature exists for: place a
 * note, play the bar, see the judgement land on it, adjust.
 */
function drawHitMarks(
  ctx: CanvasRenderingContext2D,
  view: ViewWindow,
  notes: readonly EditorNote[],
) {
  const session = activePlaytest();
  if (!session) return;
  const { from, to } = visibleRange(notes, view.startTime, view.endTime);
  const width = Math.min(96, laneWidth(view) * 0.72);
  const now = performance.now();

  ctx.save();
  ctx.lineWidth = 3;
  for (let i = from; i < to; i++) {
    const note = notes[i];
    const mark = session.hitOf(note.id);
    if (!mark) continue;
    const age = now - mark.at;
    if (age > HIT_FADE_MS) continue;
    const cy = yOf(view, note.time);
    if (cy < -NOTE_H || cy > view.height + NOTE_H) continue;
    ctx.globalAlpha = 1 - age / HIT_FADE_MS;
    ctx.strokeStyle = mark.hit ? HIT_COLOR : MISS_COLOR;
    noteShape(ctx, note, laneCenterX(view, note.lane), cy, width + 14);
    ctx.stroke();
  }
  ctx.restore();
}

/** The A/B loop range Ctrl+Space plays (§10). */
function drawLoop(
  ctx: CanvasRenderingContext2D,
  view: ViewWindow,
  theme: EditorTheme,
  loop: { start: number; end: number } | null,
) {
  if (!loop) return;
  const top = yOf(view, loop.end);
  const bottom = yOf(view, loop.start);
  if (bottom < 0 || top > view.height) return;
  ctx.save();
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = theme.accent;
  ctx.fillRect(LANES_X, top, view.width - LANES_X, bottom - top);
  ctx.restore();
}

function drawLanes(ctx: CanvasRenderingContext2D, view: ViewWindow, theme: EditorTheme) {
  const w = laneWidth(view);
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = theme.shadowDark;
  ctx.lineWidth = 1;
  for (let lane = 0; lane <= view.keys; lane++) {
    const x = Math.round(LANES_X + w * lane) + 0.5;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, view.height);
    ctx.stroke();
  }
  ctx.restore();
}

function drawBeatGrid(
  ctx: CanvasRenderingContext2D,
  view: ViewWindow,
  points: readonly TimingPoint[],
  theme: EditorTheme,
  snap: number,
) {
  const lines = gridLines(
    Math.max(0, view.startTime),
    view.endTime,
    snap as 1 | 2 | 3 | 4 | 6 | 8 | 12 | 16 | 24 | 32,
    points,
  );
  ctx.save();
  ctx.font = '11px "Outfit", sans-serif';
  ctx.textBaseline = 'middle';
  for (const line of lines) {
    const y = Math.round(yOf(view, line.time)) + 0.5;
    if (y < -1 || y > view.height + 1) continue;
    ctx.globalAlpha = line.weight === 'measure' ? 0.85 : line.weight === 'beat' ? 0.45 : 0.18;
    ctx.strokeStyle = line.weight === 'measure' ? theme.textMuted : theme.shadowDark;
    ctx.lineWidth = line.weight === 'measure' ? 1.5 : 1;
    ctx.beginPath();
    ctx.moveTo(line.weight === 'sub' ? LANES_X + 8 : GUTTER, y);
    ctx.lineTo(view.width, y);
    ctx.stroke();

    if (line.weight === 'measure') {
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = theme.textMuted;
      const bar = barBeatAt(line.time, points);
      ctx.fillText(String(bar.bar), 10, y);
      ctx.globalAlpha = 0.55;
      ctx.fillText(formatTime(line.time), 10, y + 13);
    }
  }
  ctx.restore();
}

function drawNotes(
  ctx: CanvasRenderingContext2D,
  view: ViewWindow,
  notes: readonly EditorNote[],
  points: readonly TimingPoint[],
  theme: EditorTheme,
  hover: { x: number; y: number } | null,
) {
  const { from, to } = visibleRange(notes, view.startTime, view.endTime);
  const width = Math.min(96, laneWidth(view) * 0.72);
  const hoveredTime = hover ? nearestNoteTime(notes, view, hover) : null;

  for (let i = from; i < to; i++) {
    const note = notes[i];
    const cx = laneCenterX(view, note.lane);
    const cy = yOf(view, note.time);

    // LONG notes draw their tail first so the head sits on top of it.
    if (note.type === 'LONG' && note.duration) {
      const tailTop = yOf(view, note.time + note.duration);
      ctx.save();
      ctx.globalAlpha = note.auto ? 0.35 : 0.6;
      ctx.fillStyle = theme.holdTrail;
      roundRect(ctx, cx - 8, tailTop, 16, cy - tailTop, 6);
      ctx.fill();
      ctx.restore();
    }

    if (cy < -NOTE_H || cy > view.height + NOTE_H) continue;

    const color = QUANT_COLORS[quantizationOf(note.time, points)] ?? theme.textMuted;
    ctx.save();
    // Generated-and-untouched notes are tinted back (§7.3), so an author can see
    // at a glance what they have reviewed and what the machine still owns.
    ctx.globalAlpha = note.auto ? 0.55 : 1;
    ctx.fillStyle = color;
    neumorphicFill(
      ctx,
      () => {
        noteShape(ctx, note, cx, cy, width);
        if (note.type === 'SILENT') {
          ctx.globalAlpha *= 0.5;
          ctx.strokeStyle = color;
          ctx.lineWidth = 2;
          ctx.stroke();
        } else {
          ctx.fill();
        }
      },
      theme,
    );
    ctx.restore();

    // Proximity highlight (§4.4c): every note at the hovered timestamp lifts
    // with it, so an author editing one half of a chord sees the other half.
    if (hoveredTime !== null && Math.abs(note.time - hoveredTime) < 0.002) {
      ctx.save();
      ctx.strokeStyle = theme.primary;
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 2;
      noteShape(ctx, note, cx, cy, width + 8);
      ctx.stroke();
      ctx.restore();
    }

    if (note.selected) {
      ctx.save();
      ctx.strokeStyle = theme.primary;
      ctx.lineWidth = 2.5;
      noteShape(ctx, note, cx, cy, width + 12);
      ctx.stroke();
      ctx.restore();
    }

    // TODO(phase 7 — §9): `note.issues` draws a severity ring plus an icon here.
  }
}

function nearestNoteTime(
  notes: readonly EditorNote[],
  view: ViewWindow,
  hover: { x: number; y: number },
): number | null {
  const { from, to } = visibleRange(notes, view.startTime, view.endTime);
  let best: number | null = null;
  let bestDistance = Infinity;
  for (let i = from; i < to; i++) {
    const note = notes[i];
    const cy = yOf(view, note.time);
    const cx = laneCenterX(view, note.lane);
    if (Math.abs(hover.x - cx) > laneWidth(view) * 0.5) continue;
    const dy = Math.abs(hover.y - cy);
    if (dy < bestDistance && dy < NOTE_H) {
      bestDistance = dy;
      best = note.time;
    }
  }
  return best;
}

function drawSelectionBox(
  ctx: CanvasRenderingContext2D,
  theme: EditorTheme,
  drag: DragState | null,
) {
  if (!drag || drag.kind !== 'box' || !drag.moved) return;
  const x = Math.min(drag.startX, drag.x);
  const y = Math.min(drag.startY, drag.y);
  const w = Math.abs(drag.x - drag.startX);
  const h = Math.abs(drag.y - drag.startY);
  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = theme.primary;
  ctx.fillRect(x, y, w, h);
  ctx.globalAlpha = 0.8;
  ctx.strokeStyle = theme.primary;
  ctx.lineWidth = 1;
  ctx.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, w, h);
  ctx.restore();
}

function drawPlayhead(ctx: CanvasRenderingContext2D, view: ViewWindow, theme: EditorTheme) {
  const y = Math.round(view.playheadY) + 0.5;
  ctx.save();
  ctx.strokeStyle = theme.accent;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(GUTTER - 6, y);
  ctx.lineTo(view.width, y);
  ctx.stroke();
  ctx.restore();
}

export function formatTime(seconds: number): string {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const rest = safe - minutes * 60;
  return `${minutes}:${rest.toFixed(2).padStart(5, '0')}`;
}
