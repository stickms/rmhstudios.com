/**
 * The whole song at a glance: one bar per second of the open difficulty, the
 * visible window outlined, lint errors ticked. Click, drag or the arrow keys seek.
 *
 * Drawn on a canvas only when its inputs change (the chart, the lint result, the
 * view). There is no frame loop here: at rest nothing runs.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { NPS_CEILING } from '@features/slice-it/engine/beatmap/lint';
import {
  clockText,
  densestStretches,
  densityBins,
  errorTimes,
  MINIMAP_STEP_SECONDS,
  timeAtFraction,
} from '@features/slice-it/engine/editor/overview';
import type { ScopedFinding } from '@features/slice-it/engine/editor/lint';
import { BASE_PIXELS_PER_SECOND, editorState, useEditorStore } from '@features/slice-it/engine/editor/store';
import { PLAYHEAD_FRACTION } from './Timeline';
import { readEditorTheme, type EditorTheme } from './theme';

const STRIP_HEIGHT = 40;
/** A bar reaches the top of the strip at this multiple of the tier's ceiling. */
const BAR_SCALE = 1.5;

export function DensityMinimap() {
  const { t } = useTranslation('chart-overview');
  const active = useEditorStore((s) => s.active);
  const notes = useEditorStore((s) => s.charts[s.active].notes);
  const duration = useEditorStore((s) => s.song?.duration ?? 0);
  // Whole seconds only: the label and the slider value change once a second, so
  // playback does not re-render this component per tick. The playhead line and the
  // visible-window box below move through refs.
  const playSecond = useEditorStore((s) => Math.floor(s.playhead));
  const lint = useEditorStore((s) => s.lint);
  const setPlayhead = useEditorStore((s) => s.setPlayhead);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const themeRef = useRef<EditorTheme | null>(null);
  const playheadLineRef = useRef<HTMLDivElement>(null);
  const windowBoxRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const [width, setWidth] = useState(0);

  const ceiling = NPS_CEILING[active];
  // O(n), recomputed only when the chart, the song or the tier changes.
  const bins = useMemo(
    () =>
      densityBins(
        notes.map((note) => note.time),
        duration,
        ceiling,
      ),
    [notes, duration, ceiling],
  );
  const ticks = useMemo(() => errorTimes(lint.findings as ScopedFinding[], active), [lint, active]);
  const stretches = useMemo(() => densestStretches(bins), [bins]);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const sync = () => setWidth(Math.floor(wrapper.getBoundingClientRect().width));
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || width <= 0) return;
    const theme = (themeRef.current ??= readEditorTheme(canvas));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (canvas.width !== Math.floor(width * dpr)) {
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(STRIP_HEIGHT * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, STRIP_HEIGHT);
    ctx.fillStyle = theme.shadowDark;
    ctx.fillRect(0, 0, width, STRIP_HEIGHT);
    if (duration <= 0 || bins.length === 0) return;

    const perSecond = width / duration;
    const barWidth = Math.max(1, perSecond - 1);
    const top = ceiling * BAR_SCALE;
    for (let i = 0; i < bins.length; i++) {
      const bin = bins[i];
      if (bin.count === 0) continue;
      const h = Math.max(2, Math.min(1, bin.count / top) * (STRIP_HEIGHT - 4));
      ctx.fillStyle = bin.over ? theme.danger : theme.primary;
      ctx.fillRect(i * perSecond, STRIP_HEIGHT - h, barWidth, h);
    }

    ctx.fillStyle = theme.danger;
    for (const time of ticks) ctx.fillRect(Math.max(0, Math.min(width - 2, time * perSecond - 1)), 0, 2, 6);
  }, [bins, ticks, width, duration, ceiling]);

  // The playhead line and the visible-window box are DOM elements moved by
  // transform from a store subscription: the canvas is never redrawn per tick,
  // and a resize or zoom touches two style strings, not the editor.
  useEffect(() => {
    if (width <= 0 || duration <= 0) return;
    const perSecond = width / duration;
    let lastLine = NaN;
    let lastBox = '';
    const place = () => {
      const { playhead, zoom, viewHeight } = editorState();
      const line = playheadLineRef.current;
      if (line) {
        const x = Math.round(Math.max(0, Math.min(width - 2, playhead * perSecond - 1)));
        if (x !== lastLine) {
          lastLine = x;
          line.style.transform = `translateX(${x}px)`;
        }
      }
      const box = windowBoxRef.current;
      if (box) {
        if (viewHeight <= 0) {
          if (lastBox !== 'hidden') {
            lastBox = 'hidden';
            box.style.display = 'none';
          }
          return;
        }
        const pps = BASE_PIXELS_PER_SECOND * zoom;
        const x0 = Math.round(Math.max(0, (playhead - (viewHeight * (1 - PLAYHEAD_FRACTION)) / pps) * perSecond));
        const x1 = Math.round(Math.min(width, (playhead + (viewHeight * PLAYHEAD_FRACTION) / pps) * perSecond));
        const key = `${x0}:${x1}`;
        if (key !== lastBox) {
          lastBox = key;
          box.style.display = '';
          box.style.width = `${Math.max(2, x1 - x0)}px`;
          box.style.transform = `translateX(${x0}px)`;
        }
      }
    };
    place();
    return useEditorStore.subscribe(place);
  }, [width, duration]);

  const seekTo = useCallback(
    (clientX: number) => {
      const wrapper = wrapperRef.current;
      if (!wrapper) return;
      const rect = wrapper.getBoundingClientRect();
      if (rect.width <= 0) return;
      setPlayhead(timeAtFraction((clientX - rect.left) / rect.width, duration));
    },
    [duration, setPlayhead],
  );

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    draggingRef.current = true;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    seekTo(event.clientX);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (draggingRef.current) seekTo(event.clientX);
  };
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    draggingRef.current = false;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const playhead = editorState().playhead;
    let next: number | null = null;
    if (event.key === 'ArrowLeft') next = playhead - MINIMAP_STEP_SECONDS;
    else if (event.key === 'ArrowRight') next = playhead + MINIMAP_STEP_SECONDS;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = duration;
    if (next === null) return;
    // The editor's own keyboard bus moves by beat; on this control the arrows are ours.
    event.preventDefault();
    event.stopPropagation();
    setPlayhead(next);
  };

  if (duration <= 0) return null;

  const second = Math.min(bins.length - 1, Math.max(0, playSecond));
  const valueText = t('minimap-value', {
    defaultValue: '{{time}} of {{total}}, {{nps}} notes per second',
    time: clockText(playSecond),
    total: clockText(duration),
    nps: bins[second]?.count ?? 0,
  });

  return (
    <>
      <div
        ref={wrapperRef}
        role="slider"
        tabIndex={0}
        aria-label={t('minimap-label', {
          defaultValue: 'Song overview',
        })}
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={playSecond}
        aria-valuetext={valueText}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
        className="relative hidden h-10 w-full cursor-pointer touch-none overflow-hidden rounded-site border border-[var(--slice-border)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--slice-text)] lg:block"
      >
        <canvas
          ref={canvasRef}
          className="block"
          style={{
            width: '100%',
            height: STRIP_HEIGHT,
          }}
          aria-hidden
        />
        <div
          ref={windowBoxRef}
          aria-hidden
          className="pointer-events-none absolute left-0 top-0 h-full border border-[var(--slice-text)]"
          style={{
            display: 'none',
          }}
        />
        <div
          ref={playheadLineRef}
          aria-hidden
          className="pointer-events-none absolute left-0 top-0 h-full w-0.5 bg-[var(--slice-text)]"
        />
      </div>
      <div className="sr-only">
        <h2>
          {t('minimap-summary-title', {
            defaultValue: 'Densest stretches',
          })}
        </h2>
        {stretches.length === 0 ? (
          <p>
            {t('minimap-summary-empty', {
              defaultValue: 'This difficulty has no notes yet.',
            })}
          </p>
        ) : (
          <ul>
            {stretches.map((stretch) => (
              <li key={stretch.start}>
                {t('minimap-summary-item', {
                  defaultValue: '{{from}} to {{to}}, {{notes}} notes',
                  from: clockText(stretch.start),
                  to: clockText(stretch.end),
                  notes: stretch.notes,
                })}
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
