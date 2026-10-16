'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CANVAS_PALETTE, type CanvasBatch, type CanvasEventView } from '@/lib/canvas/shared';

export interface Cell {
  x: number;
  y: number;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 48;

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const RGB = CANVAS_PALETTE.map(hexToRgb);

/**
 * One <canvas> for the whole board (no per-pixel DOM). Pan with drag, zoom with
 * wheel / buttons / +/-, click to select a pixel, arrow keys move the selection.
 * While the event is live, an SSE stream paints other members' pixels in.
 */
export default function CanvasBoard({
  event,
  selected,
  onSelect,
  paintRef,
}: {
  event: CanvasEventView;
  selected: Cell | null;
  onSelect: (c: Cell) => void;
  paintRef: React.MutableRefObject<((x: number, y: number, c: number) => void) | null>;
}) {
  const { t } = useTranslation('f-canvas');
  const { width, height } = event;
  const live = event.phase === 'live';
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ x: 0, y: 0, z: 4 });
  const drag = useRef<{ px: number; py: number; vx: number; vy: number; moved: boolean } | null>(
    null,
  );

  const paint = useCallback((x: number, y: number, c: number) => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx || !CANVAS_PALETTE[c]) return;
    ctx.fillStyle = CANVAS_PALETTE[c];
    ctx.fillRect(x, y, 1, 1);
  }, []);
  useEffect(() => {
    paintRef.current = paint;
    return () => {
      paintRef.current = null;
    };
  }, [paint, paintRef]);

  // Fit the board to the viewport once per event.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const z = Math.max(
      MIN_ZOOM,
      Math.floor(Math.min(el.clientWidth / width, el.clientHeight / height)),
    );
    setView({ z, x: (el.clientWidth - width * z) / 2, y: (el.clientHeight - height * z) / 2 });
  }, [event.id, width, height]);

  // Snapshot + live stream. Every (re)connect reloads the snapshot so a dropped
  // connection can never leave the board stale.
  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    let alive = true;
    let loading = false;
    let queue: CanvasBatch[] = [];
    const apply = (b: CanvasBatch) => b.pixels.forEach(([x, y, c]) => paint(x, y, c));
    const load = async () => {
      loading = true;
      try {
        const res = await fetch(`/api/canvas/state?id=${encodeURIComponent(event.id)}`);
        if (!res.ok || !alive) return;
        const bytes = new Uint8Array(await res.arrayBuffer());
        const img = ctx.createImageData(width, height);
        for (let i = 0; i < width * height; i++) {
          const [r, g, b] = RGB[bytes[i]] ?? RGB[0];
          img.data[i * 4] = r;
          img.data[i * 4 + 1] = g;
          img.data[i * 4 + 2] = b;
          img.data[i * 4 + 3] = 255;
        }
        ctx.putImageData(img, 0, 0);
      } finally {
        loading = false;
        const q = queue;
        queue = [];
        if (alive) q.forEach(apply);
      }
    };
    void load();
    if (!live) return () => void (alive = false);
    const es = new EventSource(`/api/canvas/stream?id=${encodeURIComponent(event.id)}`);
    let first = true;
    es.addEventListener('connected', () => {
      if (first) first = false;
      else void load();
    });
    es.addEventListener('pixels', (e) => {
      const batch = JSON.parse((e as MessageEvent<string>).data) as CanvasBatch;
      if (loading) queue.push(batch);
      else apply(batch);
    });
    return () => {
      alive = false;
      es.close();
    };
  }, [event.id, live, width, height, paint]);

  const zoomAt = useCallback((factor: number, px?: number, py?: number) => {
    const el = viewportRef.current;
    if (!el) return;
    setView((v) => {
      const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.z * factor));
      const cx = px ?? el.clientWidth / 2;
      const cy = py ?? el.clientHeight / 2;
      return { z, x: cx - (cx - v.x) * (z / v.z), y: cy - (cy - v.y) * (z / v.z) };
    });
  }, []);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(e.deltaY < 0 ? 1.25 : 0.8, e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  const onPointerDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { px: e.clientX, py: e.clientY, vx: view.x, vy: view.y, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.px;
    const dy = e.clientY - d.py;
    if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true;
    if (d.moved) setView((v) => ({ ...v, x: d.vx + dx, y: d.vy + dy }));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.moved) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = Math.floor((e.clientX - r.left - view.x) / view.z);
    const y = Math.floor((e.clientY - r.top - view.y) / view.z);
    if (x >= 0 && y >= 0 && x < width && y < height) onSelect({ x, y });
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    const s = selected ?? { x: Math.floor(width / 2), y: Math.floor(height / 2) };
    const move = (dx: number, dy: number) => {
      e.preventDefault();
      onSelect({
        x: Math.min(width - 1, Math.max(0, s.x + dx)),
        y: Math.min(height - 1, Math.max(0, s.y + dy)),
      });
    };
    if (e.key === 'ArrowLeft') move(-1, 0);
    else if (e.key === 'ArrowRight') move(1, 0);
    else if (e.key === 'ArrowUp') move(0, -1);
    else if (e.key === 'ArrowDown') move(0, 1);
    else if (e.key === '+' || e.key === '=') zoomAt(1.25);
    else if (e.key === '-') zoomAt(0.8);
  };

  return (
    <div className="relative">
      <div
        ref={viewportRef}
        tabIndex={0}
        role="application"
        aria-label={t('board-label', {
          defaultValue: 'Pixel canvas. Drag to pan, scroll to zoom, arrow keys to pick a pixel.',
        })}
        className="glass-inset relative h-[60vh] min-h-72 touch-none overflow-hidden rounded-site"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onKeyDown={onKeyDown}
      >
        <div
          className="absolute top-0 left-0 origin-top-left"
          style={{
            width,
            height,
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})`,
          }}
        >
          <canvas
            ref={canvasRef}
            width={width}
            height={height}
            className="block size-full"
            style={{ imageRendering: 'pixelated' }}
          />
          {selected && (
            <div
              aria-hidden
              className="pointer-events-none absolute"
              style={{
                left: selected.x,
                top: selected.y,
                width: 1,
                height: 1,
                outline: `${2 / view.z}px solid var(--site-accent)`,
              }}
            />
          )}
        </div>
      </div>
      <div className="absolute right-2 bottom-2 flex gap-1">
        <Button
          variant="secondary"
          size="icon-sm"
          aria-label={t('zoom-out', { defaultValue: 'Zoom out' })}
          onClick={() => zoomAt(0.8)}
        >
          <Minus />
        </Button>
        <Button
          variant="secondary"
          size="icon-sm"
          aria-label={t('zoom-in', { defaultValue: 'Zoom in' })}
          onClick={() => zoomAt(1.25)}
        >
          <Plus />
        </Button>
      </div>
    </div>
  );
}
