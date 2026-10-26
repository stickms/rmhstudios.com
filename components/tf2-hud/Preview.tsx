/**
 * Preview — the live canvas.
 *
 * The scene is laid out at the chosen game resolution, then painted scaled to
 * fit (or at a fixed zoom). Everything is drawn into one canvas; panels are
 * picked by hit-testing the scene, not the DOM, and dragging a panel or its
 * handles writes the new numbers straight back into the `.res` source, so the
 * preview and the code never disagree.
 */
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { syncCustomFonts } from '@/lib/tf2-hud/assets/font-sync';
import { ImageStore } from '@/lib/tf2-hud/assets/images';
import { kvSet } from '@/lib/tf2-hud/kv/edit';
import { propsOf } from '@/lib/tf2-hud/kv/props';
import { parseCached, hitTest } from '@/lib/tf2-hud/scene/build';
import { hitHandle, paintOverlay, paintScene, type HandleId } from '@/lib/tf2-hud/scene/paint';
import { growSize, shiftPosition } from '@/lib/tf2-hud/layout/inverse';
import { kvAt } from '@/lib/tf2-hud/kv/query';
import { COND_ENVS } from '@/lib/tf2-hud/scheme/cond';
import type { PanelNode } from '@/lib/tf2-hud/scene/types';
import { beginGesture, endGesture, useEditor } from '@/lib/tf2-hud/store';
import { useSceneContext as useScene } from './scene-context';
import { cn } from '@/lib/utils';

const MAX_BACKING = 4096;

interface DragState {
  mode: 'move' | HandleId;
  node: PanelNode;
  startX: number;
  startY: number;
  originalText: string;
}

const KEYS = { x: 'xpos', y: 'ypos', w: 'wide', h: 'tall' } as const;

export default function Preview({ readOnly = false }: { readOnly?: boolean }) {
  const { t } = useTranslation('c-tf2-hud');
  const { scene, scheme, page, loading } = useScene();
  const view = useEditor((s) => s.view);
  const selectedId = useEditor((s) => s.selectedId);
  const hoverId = useEditor((s) => s.hoverId);
  const select = useEditor((s) => s.select);
  const hover = useEditor((s) => s.hover);
  const readBytes = useEditor((s) => s.readBytes);
  const readText = useEditor((s) => s.readText);
  const writeText = useEditor((s) => s.writeText);
  const overlay = useEditor((s) => s.overlay);
  const tfVersion = useEditor((s) => s.tfVersion);
  const baseVersion = useEditor((s) => s.baseVersion);

  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const rafRef = useRef(0);
  const [box, setBox] = useState({ w: 800, h: 450 });
  const [tick, setTick] = useState(0);
  const redraw = useCallback(() => setTick((n) => n + 1), []);

  const images = useMemo(() => new ImageStore(() => undefined, redraw), [redraw]);
  useEffect(() => () => images.dispose(), [images]);
  useEffect(() => {
    images.setLookup((p) => readBytes(p));
    images.invalidate();
    redraw();
    // Textures change when project files, the base or imported game files do.
  }, [images, readBytes, overlay, tfVersion, baseVersion, redraw]);

  // Fonts shipped by the HUD (or the imported install) answer to their scheme names.
  useEffect(() => {
    const files = new Map<string, Uint8Array>();
    for (const p of useEditor.getState().paths()) {
      if (/\.(ttf|otf)$/i.test(p)) {
        const b = readBytes(p);
        if (b) files.set(p, b);
      }
    }
    for (const [p, b] of useEditor.getState().tfAssets) {
      if (/\.(ttf|otf)$/i.test(p)) files.set(p, b);
    }
    void syncCustomFonts(files, scheme).then((changed) => changed && redraw());
  }, [overlay, tfVersion, scheme, readBytes, redraw]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setBox({ w: Math.max(80, width), h: Math.max(80, height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const sw = scene?.screen.w ?? 1920;
  const sh = scene?.screen.h ?? 1080;
  const fit = Math.min((box.w - 24) / sw, (box.h - 24) / sh);
  const zoom = view.zoom === 'fit' ? Math.max(0.05, fit) : view.zoom;
  const cssW = Math.round(sw * zoom);
  const cssH = Math.round(sh * zoom);

  const selected = useMemo(
    () => scene?.nodes.find((n) => n.id === selectedId),
    [scene, selectedId],
  );
  const hovered = useMemo(() => scene?.nodes.find((n) => n.id === hoverId), [scene, hoverId]);

  /* ── painting ── */
  useEffect(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const k = Math.min(dpr * zoom, MAX_BACKING / Math.max(sw, sh)); // backing px per scene px
      canvas.width = Math.max(1, Math.round(sw * k));
      canvas.height = Math.max(1, Math.round(sh * k));
      const g = canvas.getContext('2d');
      if (!g) return;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, canvas.width, canvas.height);
      if (!scene) return;
      g.setTransform(k, 0, 0, k, 0, 0);
      g.globalAlpha = view.hudOpacity;
      paintScene(g, scene, { images, showBounds: view.showBounds });
      g.globalAlpha = 1;
      paintOverlay(g, { selected, hover: hovered, pxPerCss: 1 / zoom });
    });
    return () => cancelAnimationFrame(rafRef.current);
  }, [scene, zoom, sw, sh, view.hudOpacity, view.showBounds, images, selected, hovered, tick]);

  /* ── pointer interaction ── */
  const toScene = useCallback(
    (e: { clientX: number; clientY: number }) => {
      const r = canvasRef.current!.getBoundingClientRect();
      return { x: ((e.clientX - r.left) / r.width) * sw, y: ((e.clientY - r.top) / r.height) * sh };
    },
    [sw, sh],
  );

  const applyDrag = useCallback(
    (d: DragState, dx: number, dy: number) => {
      const scale = sh / 480;
      const dxv = dx / scale;
      const dyv = dy / scale;
      const doc = parseCached(d.originalText);
      const node = kvAt(doc, d.node.keyPath);
      if (!node) return;
      const env = COND_ENVS[view.env];
      const props = propsOf(node, { env, minmode: view.minmode });
      // Edit the `_minmode` variant when that is the one being previewed.
      const keyFor = (base: string) =>
        view.minmode && props.has(`${base}_minmode`) ? `${base}_minmode` : base;

      let x = 0;
      let y = 0;
      let w = 0;
      let h = 0;
      if (d.mode === 'move') {
        x = dxv;
        y = dyv;
      } else {
        if (d.mode.includes('e')) w = dxv;
        if (d.mode.includes('w')) {
          x = dxv;
          w = -dxv;
        }
        if (d.mode.includes('s')) h = dyv;
        if (d.mode.includes('n')) {
          y = dyv;
          h = -dyv;
        }
      }
      let text = d.originalText;
      const set = (base: string, value: string) => {
        text = kvSet(text, [...d.node.keyPath, keyFor(base)], value, { env });
      };
      if (x) set(KEYS.x, shiftPosition(props.get(keyFor(KEYS.x)), x));
      if (y) set(KEYS.y, shiftPosition(props.get(keyFor(KEYS.y)), y));
      if (w) set(KEYS.w, growSize(props.get(keyFor(KEYS.w)), w));
      if (h) set(KEYS.h, growSize(props.get(keyFor(KEYS.h)), h));
      writeText(d.node.file, text, `drag:${d.node.id}`);
    },
    [sh, view.env, view.minmode, writeText],
  );

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!scene || e.button !== 0) return;
    const p = toScene(e);
    const pxPerCss = 1 / zoom;
    if (readOnly) {
      select(hitTest(scene, p.x, p.y)?.id ?? null);
      return;
    }
    if (selected) {
      const handle = hitHandle(selected.rect, p.x, p.y, pxPerCss);
      const text = readText(selected.file);
      if (handle && text !== undefined) {
        dragRef.current = {
          mode: handle,
          node: selected,
          startX: p.x,
          startY: p.y,
          originalText: text,
        };
        e.currentTarget.setPointerCapture(e.pointerId);
        return;
      }
    }
    const hit = hitTest(scene, p.x, p.y);
    select(hit?.id ?? null);
    const text = hit ? readText(hit.file) : undefined;
    if (hit && text !== undefined) {
      dragRef.current = { mode: 'move', node: hit, startX: p.x, startY: p.y, originalText: text };
      e.currentTarget.setPointerCapture(e.pointerId);
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!scene) return;
    const p = toScene(e);
    const d = dragRef.current;
    if (d) {
      const dx = p.x - d.startX;
      const dy = p.y - d.startY;
      if (Math.abs(dx) + Math.abs(dy) > 2 / zoom) {
        beginGesture(`drag:${d.node.id}`);
        applyDrag(d, dx, dy);
      }
      return;
    }
    if (selected) {
      const h = hitHandle(selected.rect, p.x, p.y, 1 / zoom);
      e.currentTarget.style.cursor = h
        ? h === 'n' || h === 's'
          ? 'ns-resize'
          : h === 'e' || h === 'w'
            ? 'ew-resize'
            : h === 'nw' || h === 'se'
              ? 'nwse-resize'
              : 'nesw-resize'
        : 'default';
    }
    hover(hitTest(scene, p.x, p.y)?.id ?? null);
  };

  const endDrag = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (dragRef.current) {
      dragRef.current = null;
      endGesture();
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  /** Arrow keys nudge the selection by 1 virtual unit (10 with Shift). */
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!selected || readOnly) return;
    const dirs: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const dir = dirs[e.key];
    if (e.key === 'Escape') {
      select(null);
      return;
    }
    if (!dir) return;
    e.preventDefault();
    const text = readText(selected.file);
    if (text === undefined) return;
    const step = (e.shiftKey ? 10 : 1) * (sh / 480);
    applyDrag(
      { mode: 'move', node: selected, startX: 0, startY: 0, originalText: text },
      dir[0] * step,
      dir[1] * step,
    );
  };

  const backdropClass =
    view.backdrop === 'checker'
      ? 'tf2hud-checker'
      : view.backdrop === 'game' || (view.backdrop === 'auto' && page?.backdrop === 'game')
        ? 'tf2hud-backdrop-game'
        : view.backdrop === 'menu' || view.backdrop === 'auto'
          ? 'tf2hud-backdrop-menu'
          : 'tf2hud-checker';

  return (
    <div ref={wrapRef} className="relative min-h-0 flex-1 overflow-auto bg-(--app-bg) p-3">
      <div className="mx-auto flex min-h-full w-fit min-w-full items-center justify-center">
        <div
          className={cn(
            'relative shrink-0 overflow-hidden border border-(--app-border-bright)',
            backdropClass,
          )}
          style={{ width: cssW, height: cssH }}
        >
          {view.backdrop === 'image' && view.backdropImage ? (
            // The author's own screenshot, behind the HUD.
            <img
              src={view.backdropImage}
              alt=""
              className="absolute inset-0 size-full object-fill"
              draggable={false}
            />
          ) : null}
          <canvas
            ref={canvasRef}
            className="tf2hud-canvas absolute inset-0 size-full"
            tabIndex={0}
            role="application"
            aria-label={t('preview-label', {
              defaultValue: 'HUD preview: {{page}} at {{w}} by {{h}}',
              page: page?.label ?? '',
              w: sw,
              h: sh,
            })}
            onKeyDown={onKeyDown}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onPointerLeave={() => hover(null)}
          />
          {view.compareOpacity > 0 && view.backdropImage ? (
            <img
              src={view.backdropImage}
              alt=""
              className="pointer-events-none absolute inset-0 size-full object-fill"
              style={{ opacity: view.compareOpacity }}
              draggable={false}
            />
          ) : null}
          {loading ? (
            <p className="absolute inset-x-0 top-2 text-center text-xs text-(--app-text-muted)">
              {t('loading-files', { defaultValue: 'Loading HUD files…' })}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
