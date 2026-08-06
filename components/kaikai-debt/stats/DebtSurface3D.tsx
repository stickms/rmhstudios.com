'use client';

/**
 * The debt terrain — the (month × category) grid as a 3D height field.
 *
 * Time runs left to right, the eight categories run into the screen, and the
 * height of each column is what that bucket is worth right now. It is the same
 * grid the 4D projection and the globe are built from, so a spike you find here
 * is findable there.
 *
 * ## Why it is a software renderer and not three.js
 *
 * This draws at most 384 boxes. A WebGL scene graph is the right tool at ten
 * thousand, and at 384 it is ~600KB of JavaScript, a second render loop with its
 * own lifecycle, and an OrbitControls implementation, in exchange for arithmetic
 * that is nine lines long. The nine lines are also *testable*, which the scene
 * graph would not have been: the projection lives in a pure module with its own
 * unit tests, and this file only draws.
 *
 * ## Shading without a colour model
 *
 * Each column is drawn as three faces — top, and the two sides facing the camera
 * — and the sides are shaded with `globalAlpha` rather than with a darkened
 * version of the category colour. That is not a shortcut: alpha blends toward
 * whatever is *behind* the face, so on a dark theme the sides darken and on a
 * light theme they lighten, which is the correct direction in both. A
 * pre-darkened palette would be right on one theme and muddy on the other, and
 * would need eight more colours nobody validated.
 */

import { useCallback, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { RotateCw } from 'lucide-react';
import { accrualFactor, formatDebt } from '@/lib/kaikai-debt/debt';
import {
  CATEGORY_ORDER,
  buildGrid,
  formatCompactDebt,
  formatMonth,
  valueNow,
  type GridCell,
} from '@/lib/kaikai-debt/stats';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import { ChartCard, ChartToggle, Readout, ReadoutRow, Swatch } from './chart-kit';
import { pointerOnStage, useCanvasStage, type StageFrame } from './canvas-stage';
import { categoryLabel } from './CompositionCharts';

/** Camera distance in world units. Far enough that the far row is not a smear. */
const CAMERA_DISTANCE = 3.6;
/** The terrain is drawn inside a box this wide and deep, in world units. */
const FIELD = 1.9;
/** Tallest a column can be, in world units. */
const MAX_HEIGHT = 1.15;
/** How far the whole field is dropped so the base sits below the middle. */
const BASE_Y = -0.42;

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/** One column, resolved for this frame. Reused across frames — never allocated in the loop. */
interface Column {
  cellIndex: number;
  categoryIndex: number;
  monthIndex: number;
  height: number;
  /** Projected centre of the top face, for the hit test and the readout. */
  sx: number;
  sy: number;
  depth: number;
}

interface DebtSurface3DProps {
  grid: readonly GridCell[];
  nowMs: number;
  selected: ReadonlySet<string>;
}

export function DebtSurface3D({ grid, nowMs, selected }: DebtSurface3DProps) {
  const { t } = useTranslation('c-kaikai-debt');

  const [yaw, setYaw] = useState(-32);
  const [pitch, setPitch] = useState(26);
  const [zoom, setZoom] = useState(1);
  const [spinning, setSpinning] = useState(false);
  const [byCount, setByCount] = useState(false);
  const [hover, setHover] = useState(-1);
  const [dragging, setDragging] = useState(false);

  const frame = useMemo(() => buildGrid(grid), [grid]);

  /**
   * Heights, normalised once per data/measure change rather than per frame.
   *
   * A square root, for the same reason the globe's lift uses one: the values
   * span orders of magnitude, and a linear height field is one spike and 383
   * flat squares.
   */
  const heights = useMemo(() => {
    // The tallest column is the tallest CELL, compounded to the same instant as
    // every other one — so the field's silhouette is stable while the whole
    // thing grows, rather than rescaling itself every two seconds.
    const max = byCount
      ? Math.max(1, frame.maxCount)
      : Math.max(1, frame.maxBasisCents * accrualFactor(nowMs));
    return frame.cells.map((cell) => {
      const value = byCount ? cell.count : valueNow(cell, nowMs);
      if (value <= 0) return 0;
      return Math.sqrt(value / max) * MAX_HEIGHT;
    });
  }, [frame, byCount, nowMs]);

  // Everything the frame loop reads lives in refs: the loop must not depend on a
  // React render to see a new camera angle, and a 60Hz render for a rotation
  // nothing in JSX reads would be the whole cost of this component.
  const cameraRef = useRef({ yaw, pitch, zoom });
  cameraRef.current = { yaw, pitch, zoom };
  const spinRef = useRef(spinning);
  spinRef.current = spinning;
  const hoverRef = useRef(hover);
  hoverRef.current = hover;
  const columnsRef = useRef<Column[]>([]);
  const heightsRef = useRef(heights);
  heightsRef.current = heights;
  const frameRef = useRef(frame);
  frameRef.current = frame;
  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  const render = useCallback(
    (ctx: CanvasRenderingContext2D, stage: StageFrame) => {
      const gridFrame = frameRef.current;
      const cellHeights = heightsRef.current;
      const camera = cameraRef.current;
      const filtering = selectedRef.current.size > 0;

      if (spinRef.current) {
        // 9°/s. Slow enough to read a label as it goes past; fast enough that
        // the shape reads as an object rather than as a photograph.
        const next = (camera.yaw + 9 * stage.dt) % 360;
        cameraRef.current.yaw = next;
      }

      const radius = Math.min(stage.width, stage.height) * 0.42 * camera.zoom;
      const cy = Math.cos((cameraRef.current.yaw * Math.PI) / 180);
      const sy = Math.sin((cameraRef.current.yaw * Math.PI) / 180);
      const cp = Math.cos((camera.pitch * Math.PI) / 180);
      const sp = Math.sin((camera.pitch * Math.PI) / 180);

      /** World → screen. Yaw about Y, pitch about X, then a perspective divide. */
      const project = (x: number, y: number, z: number) => {
        const x1 = x * cy - z * sy;
        const z1 = x * sy + z * cy;
        const y2 = y * cp - z1 * sp;
        const z2 = y * sp + z1 * cp;
        const k = CAMERA_DISTANCE / Math.max(0.6, CAMERA_DISTANCE - z2);
        // Screen y grows downward, world y grows up.
        return { x: x1 * k * radius, y: -y2 * k * radius, depth: z2 };
      };

      const months = Math.max(1, gridFrame.months.length);
      const categories = gridFrame.categories.length;
      const stepX = FIELD / months;
      const stepZ = FIELD / categories;
      // A gap between columns, so two neighbouring bars are two objects. Without
      // it the field reads as one lumpy sheet.
      const halfX = stepX * 0.36;
      const halfZ = stepZ * 0.36;

      const columns: Column[] = [];
      for (let i = 0; i < gridFrame.cells.length; i++) {
        const monthIndex = Math.floor(i / categories);
        const categoryIndex = i % categories;
        const height = cellHeights[i] ?? 0;
        const x = -FIELD / 2 + (monthIndex + 0.5) * stepX;
        const z = -FIELD / 2 + (categoryIndex + 0.5) * stepZ;
        const top = project(x, BASE_Y + height, z);
        columns.push({
          cellIndex: i,
          monthIndex,
          categoryIndex,
          height,
          sx: top.x,
          sy: top.y,
          depth: top.depth,
        });
      }
      // Painter's algorithm: far columns first, so a near one occludes it. With
      // opaque boxes and no depth buffer this IS the depth buffer.
      columns.sort((a, b) => a.depth - b.depth);
      columnsRef.current = columns;

      /* --- The floor grid ------------------------------------------------- */
      ctx.save();
      ctx.strokeStyle = stage.paint.ink;
      ctx.globalAlpha = 0.14;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let c = 0; c <= categories; c++) {
        const z = -FIELD / 2 + c * stepZ;
        const a = project(-FIELD / 2, BASE_Y, z);
        const b = project(FIELD / 2, BASE_Y, z);
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
      }
      for (let m = 0; m <= months; m += Math.max(1, Math.round(months / 12))) {
        const x = -FIELD / 2 + m * stepX;
        const a = project(x, BASE_Y, -FIELD / 2);
        const b = project(x, BASE_Y, FIELD / 2);
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
      }
      ctx.stroke();
      ctx.restore();

      /* --- The columns ---------------------------------------------------- */
      const hovered = hoverRef.current;
      for (const column of columns) {
        if (column.height <= 0) continue;
        const cell = gridFrame.cells[column.cellIndex]!;
        const dimmed = filtering && !selectedRef.current.has(cell.category);
        const colour = stage.paint.categories[column.categoryIndex] ?? stage.paint.ink;

        const x = -FIELD / 2 + (column.monthIndex + 0.5) * stepX;
        const z = -FIELD / 2 + (column.categoryIndex + 0.5) * stepZ;
        const y0 = BASE_Y;
        const y1 = BASE_Y + column.height;

        // Eight corners, projected. Named by (x−/x+, z−/z+) at top and bottom.
        const tA = project(x - halfX, y1, z - halfZ);
        const tB = project(x + halfX, y1, z - halfZ);
        const tC = project(x + halfX, y1, z + halfZ);
        const tD = project(x - halfX, y1, z + halfZ);
        const bB = project(x + halfX, y0, z - halfZ);
        const bC = project(x + halfX, y0, z + halfZ);
        const bD = project(x - halfX, y0, z + halfZ);

        const isHovered = hovered === column.cellIndex;
        ctx.fillStyle = colour;

        const face = (
          p1: { x: number; y: number },
          p2: { x: number; y: number },
          p3: { x: number; y: number },
          p4: { x: number; y: number },
          alpha: number,
        ) => {
          ctx.globalAlpha = dimmed ? alpha * 0.25 : alpha;
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.lineTo(p3.x, p3.y);
          ctx.lineTo(p4.x, p4.y);
          ctx.closePath();
          ctx.fill();
        };

        // Only the two sides facing the camera are drawn — the other two are
        // behind the box and would only ever be overdrawn.
        // Which of the two visible sides is nearer decides which gets the
        // brighter shade — the near face catches more light than the far one.
        const rightIsNear = tB.depth >= tC.depth;
        face(tA, tB, tC, tD, isHovered ? 1 : 0.95);
        face(tD, tC, bC, bD, rightIsNear ? 0.58 : 0.72);
        face(tB, tC, bC, bB, rightIsNear ? 0.72 : 0.58);

        if (isHovered) {
          ctx.globalAlpha = 1;
          ctx.strokeStyle = stage.paint.surface;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(tA.x, tA.y);
          ctx.lineTo(tB.x, tB.y);
          ctx.lineTo(tC.x, tC.y);
          ctx.lineTo(tD.x, tD.y);
          ctx.closePath();
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;

      /* --- Axis labels ---------------------------------------------------- */
      ctx.save();
      ctx.fillStyle = stage.paint.ink;
      ctx.globalAlpha = 0.62;
      ctx.font = '11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      // Time, at each end of the field — a label per month would be a wall.
      if (gridFrame.months.length > 0) {
        // Placed OUTSIDE the field on both axes (past the last category row and
        // below the floor), not at z = 0: a label at the centre of the depth
        // axis lands in the middle of the bars and is read as belonging to one
        // of them.
        const edge = FIELD / 2 + stepZ * 0.9;
        const first = project(-FIELD / 2, BASE_Y - 0.1, edge);
        const last = project(FIELD / 2, BASE_Y - 0.1, edge);
        ctx.fillText(formatMonth(gridFrame.months[0]!), first.x, first.y);
        ctx.fillText(formatMonth(gridFrame.months[gridFrame.months.length - 1]!), last.x, last.y);
      }
      ctx.restore();
    },
    [],
  );

  const { canvasRef, invalidate } = useCanvasStage(render, spinning);

  /* --- Interaction -------------------------------------------------------- */

  const dragRef = useRef({ active: false, id: -1, x: 0, y: 0, moved: 0 });

  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    dragRef.current = { active: true, id: event.pointerId, x: event.clientX, y: event.clientY, moved: 0 };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (drag.active && drag.id === event.pointerId) {
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      drag.x = event.clientX;
      drag.y = event.clientY;
      drag.moved += Math.abs(dx) + Math.abs(dy);
      setYaw((value) => value + dx * 0.4);
      // Clamped rather than free: past ~78° the field is seen from directly
      // above and the height — the entire encoding — becomes invisible.
      setPitch((value) => clamp(value + dy * 0.3, 4, 78));
      invalidate();
      return;
    }

    // Hover picking. Nearest projected top centre inside a generous radius,
    // preferring the NEAREST column when two overlap — which is the one the
    // viewer can actually see.
    const canvas = canvasRef.current;
    if (!canvas) return;
    const point = pointerOnStage(canvas, event.clientX, event.clientY);
    let best = -1;
    let bestDepth = -Infinity;
    const reach = 18;
    for (const column of columnsRef.current) {
      if (column.height <= 0) continue;
      const dx = column.sx - point.x;
      const dy = column.sy - point.y;
      if (dx * dx + dy * dy > reach * reach) continue;
      if (column.depth > bestDepth) {
        bestDepth = column.depth;
        best = column.cellIndex;
      }
    }
    if (best !== hoverRef.current) {
      setHover(best);
      invalidate();
    }
  };

  const endDrag = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (dragRef.current.id === event.pointerId) {
      dragRef.current.active = false;
      setDragging(false);
    }
  };

  const hoveredCell = hover >= 0 ? frame.cells[hover] : null;
  const hoveredColumn = hover >= 0 ? columnsRef.current.find((c) => c.cellIndex === hover) : null;

  return (
    <ChartCard
      title={t('stats.terrain.title', { defaultValue: 'The debt terrain (3D)' })}
      hint={t('stats.terrain.hint', {
        defaultValue:
          'Time runs left to right, the eight categories run back into the screen, and every column’s height is what that month of that category is worth right now. Drag to orbit it.',
      })}
      controls={
        <>
          <ChartToggle pressed={byCount} onPressedChange={setByCount}>
            {byCount
              ? t('stats.control.byCount', { defaultValue: 'By line count' })
              : t('stats.control.byValue', { defaultValue: 'By value' })}
          </ChartToggle>
          <ChartToggle
            pressed={spinning}
            onPressedChange={setSpinning}
            title={t('stats.control.spin', { defaultValue: 'Auto-rotate' })}
          >
            <RotateCw className="size-3.5" aria-hidden />
            {t('stats.control.spin', { defaultValue: 'Auto-rotate' })}
          </ChartToggle>
        </>
      }
      footer={
        <div className="flex items-center gap-3">
          <label
            className="shrink-0 text-xs text-site-text-muted"
            htmlFor="kd-terrain-zoom"
          >
            {t('stats.control.zoom', { defaultValue: 'Zoom' })}
          </label>
          {/* A slider rather than the wheel: hijacking scroll over a section in
              the middle of a very long page traps the reader on it. */}
          <Slider
            id="kd-terrain-zoom"
            min={60}
            max={220}
            step={1}
            value={[zoom * 100]}
            onValueChange={([next]) => {
              setZoom((next ?? 100) / 100);
              invalidate();
            }}
            aria-label={t('stats.control.zoom', { defaultValue: 'Zoom' })}
            className="max-w-56"
          />
          <button
            type="button"
            onClick={() => {
              setYaw(-32);
              setPitch(26);
              setZoom(1);
              invalidate();
            }}
            className="ml-auto shrink-0 rounded-site-sm border border-site-border px-2 py-1 text-xs text-site-text-muted transition-colors hover:text-site-text"
          >
            {t('stats.control.reset', { defaultValue: 'Reset view' })}
          </button>
        </div>
      }
    >
      <div className="kd-stage">
        <canvas
          ref={canvasRef}
          className={cn('kd-canvas', dragging && 'kd-canvas--dragging')}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onPointerLeave={() => {
            setHover(-1);
            invalidate();
          }}
          role="img"
          aria-label={t('stats.terrain.desc', {
            defaultValue:
              'A three-dimensional bar field of the debt by month and category. The same figures are in the table below.',
          })}
        />
        {hoveredCell && hoveredColumn && (
          <Readout x={0.5} y={0.08}>
            <p className="mb-1 flex items-center gap-1.5 font-medium text-site-text">
              <Swatch seriesIndex={CATEGORY_ORDER.indexOf(hoveredCell.category)} />
              {categoryLabel(hoveredCell.category, t)} · {formatMonth(hoveredCell.startMs)}
            </p>
            <ReadoutRow
              label={t('stats.readout.worthNow', { defaultValue: 'Worth now' })}
              value={formatDebt(valueNow(hoveredCell, nowMs))}
            />
            <ReadoutRow
              label={t('stats.readout.faceValue', { defaultValue: 'Face value' })}
              value={formatCompactDebt(hoveredCell.principalCents)}
            />
            <ReadoutRow
              label={t('stats.readout.lines', { defaultValue: 'Lines' })}
              value={hoveredCell.count.toLocaleString('en-US')}
            />
          </Readout>
        )}
      </div>
    </ChartCard>
  );
}
