'use client';

/**
 * The ledger in four dimensions.
 *
 * Every (month × category) bucket becomes a point in R⁴ whose four coordinates
 * are measures you choose. The cloud is rotated by genuine 4D rotations in all
 * six planes, projected R⁴ → R³ by a perspective divide on `w`, and then
 * projected R³ → screen the ordinary way. A tesseract is drawn through the same
 * pipeline as a rigid frame of reference, because a rotating fog of dots with no
 * structure in it is indistinguishable from a screensaver — you cannot see that
 * a rotation is happening in `xw` unless something whose shape you already know
 * is rotating with it.
 *
 * All of the geometry lives in `lib/kaikai-debt/hyper.ts` and is unit-tested.
 * This file owns the canvas, the controls and the hit test, and nothing else.
 *
 * ## What the controls actually do
 *
 * - **Six sliders**, one per rotation plane. `xy`/`xz`/`yz` behave like ordinary
 *   3D rotations. `xw`/`yw`/`zw` are the ones with no intuition attached: they
 *   exchange a visible axis for the invisible one, so the cloud appears to turn
 *   itself inside out while every distance in R⁴ is preserved.
 * - **Four axis pickers.** The same cloud under a different binding is a
 *   different question — bind `w` to *count* and the fourth dimension is "how
 *   many lines"; bind it to *accrued* and it is "what the interest did".
 *
 * Points nearer along `w` are drawn larger and brighter, exactly as depth is
 * handled in three dimensions. That is the only channel the fourth dimension has
 * when the projection is frozen, which is why the panel defaults to leaving the
 * three `w` planes slowly turning.
 */

import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Pause, Play } from 'lucide-react';
import { formatDebt } from '@/lib/kaikai-debt/debt';
import {
  CATEGORY_ORDER,
  buildGrid,
  formatCompactDebt,
  formatMonth,
  type GridCell,
} from '@/lib/kaikai-debt/stats';
import {
  DEFAULT_BINDING,
  DEFAULT_RATES,
  HYPER_MEASURES,
  ROTATION_PLANES,
  TESSERACT_EDGES,
  TESSERACT_VERTICES,
  advanceRotation,
  buildHyperData,
  edgeAxis,
  identityRotation,
  projectPoint,
  toVec4,
  type HyperMeasure,
  type Rotation4,
  type RotationPlane,
  type Vec4,
} from '@/lib/kaikai-debt/hyper';
import { Select } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import { ChartCard, ChartToggle, Readout, ReadoutRow, Swatch } from './chart-kit';
import { pointerOnStage, useCanvasStage, type StageFrame } from './canvas-stage';
import { categoryLabel } from './CompositionCharts';

const DEG = Math.PI / 180;

/** Measure names, translated — the same lookup-not-interpolation rule as elsewhere. */
function measureLabel(measure: HyperMeasure, t: TFunction): string {
  switch (measure) {
    case 'time':
      return t('stats.measure.time', { defaultValue: 'When' });
    case 'category':
      return t('stats.measure.category', { defaultValue: 'Category' });
    case 'count':
      return t('stats.measure.count', { defaultValue: 'Line count' });
    case 'principal':
      return t('stats.measure.principal', { defaultValue: 'Face value' });
    case 'accrued':
      return t('stats.measure.accrued', { defaultValue: 'Compounded value' });
    default:
      return t('stats.measure.average', { defaultValue: 'Average line' });
  }
}

/** Plane names. Not translated — `xw` is notation, and notation does not localise. */
function planeLabel(plane: RotationPlane): string {
  return plane.toUpperCase();
}

/** Where a projected point ended up, kept for the hit test. */
interface Plotted {
  index: number;
  sx: number;
  sy: number;
  depth: number;
  w: number;
  radius: number;
}

export function HyperCube4D({
  grid,
  nowMs,
  selected,
}: {
  grid: readonly GridCell[];
  nowMs: number;
  selected: ReadonlySet<string>;
}) {
  const { t } = useTranslation('c-kaikai-debt');

  const [rotation, setRotation] = useState<Rotation4>(() => identityRotation());
  const [spinning, setSpinning] = useState(true);
  const [binding, setBinding] = useState(DEFAULT_BINDING);
  const [showFrame, setShowFrame] = useState(true);
  const [hover, setHover] = useState(-1);

  const frame = useMemo(() => buildGrid(grid), [grid]);
  const data = useMemo(() => buildHyperData(frame, nowMs), [frame, nowMs]);
  const points = useMemo(() => data.map((datum) => toVec4(datum, binding)), [data, binding]);

  const rotationRef = useRef(rotation);
  rotationRef.current = rotation;
  const spinRef = useRef(spinning);
  spinRef.current = spinning;
  const pointsRef = useRef(points);
  pointsRef.current = points;
  const dataRef = useRef(data);
  dataRef.current = data;
  const showFrameRef = useRef(showFrame);
  showFrameRef.current = showFrame;
  const hoverRef = useRef(hover);
  hoverRef.current = hover;
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const plottedRef = useRef<Plotted[]>([]);

  /**
   * The rotation the loop is actually drawing.
   *
   * Held in a ref and mutated in place while spinning, then pushed back into
   * React only when the viewer stops it. Sixty state updates a second — each
   * re-rendering six sliders — is the exact cost this separation exists to
   * avoid, and the sliders would fight the animation for control anyway.
   */
  const liveRotationRef = useRef<Rotation4>(rotation);

  const scratch: Vec4 = useMemo(() => ({ x: 0, y: 0, z: 0, w: 0 }), []);

  const render = useCallback(
    (ctx: CanvasRenderingContext2D, stage: StageFrame) => {
      const live = spinRef.current
        ? (liveRotationRef.current = advanceRotation(
            liveRotationRef.current,
            DEFAULT_RATES,
            stage.dt,
          ))
        : (liveRotationRef.current = rotationRef.current);

      const radius = Math.min(stage.width, stage.height) * 0.34;

      /* --- The frame --------------------------------------------------- */
      if (showFrameRef.current) {
        const projected = TESSERACT_VERTICES.map((vertex) =>
          projectPoint(vertex, live, radius, scratch),
        );
        ctx.save();
        ctx.lineWidth = 1;
        for (const edge of TESSERACT_EDGES) {
          const a = projected[edge[0]]!;
          const b = projected[edge[1]]!;
          const axis = edgeAxis(edge);
          // The eight `w` edges are the ones that connect the "inner" cube to
          // the "outer" one. Drawn brighter, because they are the only part of
          // the figure that is *about* the fourth dimension — everything else
          // is a cube you have seen before.
          const isW = axis === 3;
          ctx.strokeStyle = isW ? stage.paint.categories[6]! : stage.paint.ink;
          // Depth fade, so the far half of the figure recedes instead of
          // tangling with the near half.
          const depth = (a.depth + b.depth) / 2;
          ctx.globalAlpha = (isW ? 0.5 : 0.22) * (0.45 + 0.55 * (1 - Math.min(1, Math.abs(depth))));
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
        ctx.restore();
      }

      /* --- The cloud ---------------------------------------------------- */
      const cloud = pointsRef.current;
      const meta = dataRef.current;
      const plotted: Plotted[] = [];
      for (let i = 0; i < cloud.length; i++) {
        const p = projectPoint(cloud[i]!, live, radius, scratch);
        plotted.push({
          index: i,
          sx: p.x,
          sy: p.y,
          depth: p.depth,
          w: p.w,
          // 8px is the minimum legible marker; the 4D scale multiplies it, so a
          // point near in `w` is genuinely bigger rather than merely brighter.
          radius: Math.max(2.5, Math.min(11, 4.2 * p.scale)),
        });
      }
      // Painter's algorithm again: far first.
      plotted.sort((a, b) => a.depth - b.depth);
      plottedRef.current = plotted;

      const filtering = selectedRef.current.size > 0;
      ctx.save();
      for (const point of plotted) {
        const datum = meta[point.index]!;
        const dimmed = filtering && !selectedRef.current.has(datum.label.category);
        const isHovered = hoverRef.current === point.index;
        // `w` runs about [-1.6, 1.6] after rotation; mapped to opacity so
        // "further out in the fourth dimension" reads as "further into the
        // haze", which is the only cue a still frame has.
        const near = Math.min(1, Math.max(0, (point.w + 1.6) / 3.2));
        ctx.globalAlpha = dimmed ? 0.1 : 0.32 + 0.62 * near;
        ctx.fillStyle = stage.paint.categories[datum.categoryIndex] ?? stage.paint.ink;
        ctx.beginPath();
        ctx.arc(point.sx, point.sy, point.radius, 0, Math.PI * 2);
        ctx.fill();
        if (isHovered) {
          ctx.globalAlpha = 1;
          ctx.strokeStyle = stage.paint.surface;
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }
      ctx.restore();
    },
    [scratch],
  );

  const { canvasRef, invalidate } = useCanvasStage(render, spinning);

  /* --- Interaction -------------------------------------------------------- */

  const dragRef = useRef({ active: false, id: -1, x: 0, y: 0 });

  const setPlane = useCallback(
    (plane: RotationPlane, degrees: number) => {
      setSpinning(false);
      setRotation((prev) => {
        const next = { ...prev, [plane]: degrees * DEG };
        liveRotationRef.current = next;
        return next;
      });
      invalidate();
    },
    [invalidate],
  );

  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    dragRef.current = { active: true, id: event.pointerId, x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (drag.active && drag.id === event.pointerId) {
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      drag.x = event.clientX;
      drag.y = event.clientY;
      // Dragging turns the two ORDINARY planes — the ones a viewer already has
      // a mental model for. The `w` planes stay on the sliders, because a drag
      // that turned the cloud inside out would be an unusable control.
      setSpinning(false);
      setRotation((prev) => {
        const next = {
          ...prev,
          xz: prev.xz + dx * 0.006,
          yz: prev.yz + dy * 0.006,
        };
        liveRotationRef.current = next;
        return next;
      });
      invalidate();
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const point = pointerOnStage(canvas, event.clientX, event.clientY);
    let best = -1;
    let bestDepth = -Infinity;
    for (const candidate of plottedRef.current) {
      const dx = candidate.sx - point.x;
      const dy = candidate.sy - point.y;
      // A hit target larger than the mark — the interaction rule. 10px past the
      // radius makes a 3px dot pickable without a steady hand.
      const reach = candidate.radius + 10;
      if (dx * dx + dy * dy > reach * reach) continue;
      if (candidate.depth > bestDepth) {
        bestDepth = candidate.depth;
        best = candidate.index;
      }
    }
    if (best !== hoverRef.current) {
      setHover(best);
      invalidate();
    }
  };

  const endDrag = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (dragRef.current.id === event.pointerId) dragRef.current.active = false;
  };

  const hovered = hover >= 0 ? data[hover] : null;
  const hoveredPlot = hover >= 0 ? plottedRef.current.find((p) => p.index === hover) : null;

  const axes: { key: 'x' | 'y' | 'z' | 'w'; label: string }[] = [
    { key: 'x', label: t('stats.hyper.axisX', { defaultValue: 'X (across)' }) },
    { key: 'y', label: t('stats.hyper.axisY', { defaultValue: 'Y (up)' }) },
    { key: 'z', label: t('stats.hyper.axisZ', { defaultValue: 'Z (depth)' }) },
    { key: 'w', label: t('stats.hyper.axisW', { defaultValue: 'W (the fourth)' }) },
  ];

  return (
    <ChartCard
      title={t('stats.hyper.title', { defaultValue: 'The ledger in four dimensions' })}
      hint={t('stats.hyper.hint', {
        defaultValue:
          'Each dot is one month of one category, placed in 4D by the four measures you pick, then projected twice to get here. Dots nearer along W are bigger and brighter. Drag to turn it in the ordinary planes; use the sliders for the three that have no ordinary equivalent.',
      })}
      controls={
        <>
          <ChartToggle pressed={spinning} onPressedChange={setSpinning}>
            {spinning ? <Pause className="size-3.5" aria-hidden /> : <Play className="size-3.5" aria-hidden />}
            {t('stats.hyper.spin', { defaultValue: 'Rotate through W' })}
          </ChartToggle>
          <ChartToggle pressed={showFrame} onPressedChange={setShowFrame}>
            {t('stats.hyper.frame', { defaultValue: 'Tesseract' })}
          </ChartToggle>
        </>
      }
      footer={
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {axes.map((axis) => (
              <label key={axis.key} className="flex flex-col gap-1 text-xs text-site-text-muted">
                {axis.label}
                <Select
                  controlSize="sm"
                  value={binding[axis.key]}
                  onChange={(event) => {
                    setBinding((prev) => ({
                      ...prev,
                      [axis.key]: event.target.value as HyperMeasure,
                    }));
                    invalidate();
                  }}
                >
                  {HYPER_MEASURES.map((measure) => (
                    <option key={measure} value={measure}>
                      {measureLabel(measure, t)}
                    </option>
                  ))}
                </Select>
              </label>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
            {ROTATION_PLANES.map((plane) => {
              const degrees = Math.round(
                (((liveRotationRef.current[plane] ?? 0) / DEG) % 360 + 360) % 360,
              );
              const isW = plane.includes('w');
              return (
                <div key={plane} className="flex items-center gap-2">
                  <span
                    className={cn(
                      'w-8 shrink-0 font-mono text-xs',
                      isW ? 'text-site-accent' : 'text-site-text-muted',
                    )}
                  >
                    {planeLabel(plane)}
                  </span>
                  <Slider
                    min={0}
                    max={360}
                    step={1}
                    value={[degrees]}
                    onValueChange={([next]) => setPlane(plane, next ?? 0)}
                    aria-label={t('stats.hyper.planeLabel', {
                      defaultValue: 'Rotation in the {{plane}} plane',
                      plane: planeLabel(plane),
                    })}
                  />
                  <span className="w-9 shrink-0 text-right text-xs text-site-text-muted tabular-nums">
                    {degrees}°
                  </span>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-site-text-muted">
            {t('stats.hyper.note', {
              defaultValue:
                'XY, XZ and YZ are the rotations you already know — they leave W alone. XW, YW and ZW trade a visible axis for the invisible one, which is why the shape appears to turn inside out without anything actually deforming.',
            })}
          </p>
        </div>
      }
    >
      <div className="kd-stage">
        <canvas
          ref={canvasRef}
          className="kd-canvas"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onPointerLeave={() => {
            setHover(-1);
            invalidate();
          }}
          role="img"
          aria-label={t('stats.hyper.desc', {
            defaultValue:
              'A four-dimensional scatter plot of the debt ledger, projected to the screen. The same figures are in the table below.',
          })}
        />
        {hovered && hoveredPlot && (
          <Readout x={0.5} y={0.08}>
            <p className="mb-1 flex items-center gap-1.5 font-medium text-site-text">
              <Swatch seriesIndex={hovered.categoryIndex} />
              {categoryLabel(CATEGORY_ORDER[hovered.categoryIndex]!, t)} ·{' '}
              {formatMonth(hovered.label.startMs)}
            </p>
            <ReadoutRow
              label={t('stats.readout.worthNow', { defaultValue: 'Worth now' })}
              value={formatDebt(hovered.label.accruedCents)}
            />
            <ReadoutRow
              label={t('stats.readout.faceValue', { defaultValue: 'Face value' })}
              value={formatCompactDebt(hovered.label.principalCents)}
            />
            <ReadoutRow
              label={t('stats.readout.lines', { defaultValue: 'Lines' })}
              value={hovered.label.count.toLocaleString('en-US')}
            />
            <ReadoutRow
              label={t('stats.hyper.wDepth', { defaultValue: 'Depth in W' })}
              value={hoveredPlot.w.toFixed(2)}
            />
          </Readout>
        )}
      </div>
    </ChartCard>
  );
}
