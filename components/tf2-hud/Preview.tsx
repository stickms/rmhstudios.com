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
import { toast } from 'sonner';
import { syncCustomFonts } from '@/lib/tf2-hud/assets/font-sync';
import { ensureBundledFonts } from '@/lib/tf2-hud/assets/fonts';
import { ImageStore, materialsChanged } from '@/lib/tf2-hud/assets/images';
import { kvSet } from '@/lib/tf2-hud/kv/edit';
import { propsOf } from '@/lib/tf2-hud/kv/props';
import { parseCached, hitTest, kindOf } from '@/lib/tf2-hud/scene/build';
import { interpretCommand } from '@/lib/tf2-hud/play/commands';
import { clearPlayTimers, playKey, runAction } from '@/lib/tf2-hud/play/run';
import { tick as simTick } from '@/lib/tf2-hud/play/sim';
import { hitHandle, paintOverlay, paintScene, type HandleId } from '@/lib/tf2-hud/scene/paint';
import { growSize, shiftPosition } from '@/lib/tf2-hud/layout/inverse';
import { kvAt } from '@/lib/tf2-hud/kv/query';
import { COND_ENVS } from '@/lib/tf2-hud/scheme/cond';
import type { PanelNode } from '@/lib/tf2-hud/scene/types';
import { blockOfNode, moveNodes, nodesOfBlock, useBlocksDoc } from '@/lib/tf2-hud/blocks/actions';
import { beginGesture, endGesture, useEditor } from '@/lib/tf2-hud/store';
import { useSceneContext as useScene } from './scene-context';
import { cn } from '@/lib/utils';
import { isModelPanel } from '@/lib/tf2-hud/scene/model-panels';
import ModelLayer from './ModelLayer';
import PlayBar from './PlayBar';

const MAX_BACKING = 4096;

interface DragState {
  mode: 'move' | HandleId;
  node: PanelNode;
  startX: number;
  startY: number;
  originalText: string;
  /** Moving several panels at once (a multi-selection, or a block with Alt): every panel and the files as they were. */
  group?: { nodes: PanelNode[]; snapshot: Map<string, string> };
}

interface Marquee {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const KEYS = { x: 'xpos', y: 'ypos', w: 'wide', h: 'tall' } as const;

export default function Preview({ readOnly = false }: { readOnly?: boolean }) {
  const { t } = useTranslation('c-tf2-hud');
  const { scene, scheme, page, loading } = useScene();
  const view = useEditor((s) => s.view);
  const selectedId = useEditor((s) => s.selectedId);
  const selectedIds = useEditor((s) => s.selectedIds);
  const focusedBlockId = useEditor((s) => s.focusedBlockId);
  const toggleSelect = useEditor((s) => s.toggleSelect);
  const selectMany = useEditor((s) => s.selectMany);
  const blocksDoc = useBlocksDoc();
  const hoverId = useEditor((s) => s.hoverId);
  const focusProp = useEditor((s) => s.focusProp);
  const select = useEditor((s) => s.select);
  const hover = useEditor((s) => s.hover);
  const play = view.play;
  const setPlay = useEditor((s) => s.setPlay);
  const setPlayHover = useEditor((s) => s.setPlayHover);
  const readBytes = useEditor((s) => s.readBytes);
  const readText = useEditor((s) => s.readText);
  const writeText = useEditor((s) => s.writeText);
  const overlay = useEditor((s) => s.overlay);
  const tfVersion = useEditor((s) => s.tfVersion);

  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [marquee, setMarquee] = useState<Marquee | null>(null);
  const marqueeRef = useRef<Marquee | null>(null);
  const rafRef = useRef(0);
  const [box, setBox] = useState({ w: 800, h: 450 });
  const [tick, setTick] = useState(0);
  const redraw = useCallback(() => setTick((n) => n + 1), []);

  const ensureBytes = useEditor((s) => s.ensureBytes);
  const images = useMemo(
    () =>
      new ImageStore(
        () => undefined,
        redraw,
        (p) => ensureBytes(p),
      ),
    [redraw, ensureBytes],
  );
  useEffect(() => () => images.dispose(), [images]);
  // Textures change only when a material/texture file in the project, or the imported game files, do —
  // not on every keystroke in a panel file.
  const lastOverlay = useRef(overlay);
  const lastTf = useRef(tfVersion);
  useEffect(() => {
    images.setLookup((p) => readBytes(p));
    if (materialsChanged(lastOverlay.current, overlay) || lastTf.current !== tfVersion) {
      images.invalidate();
    }
    lastOverlay.current = overlay;
    lastTf.current = tfVersion;
    redraw();
  }, [images, readBytes, overlay, tfVersion, redraw]);

  // The bundled TF2 faces must be loaded before the canvas paints with them.
  useEffect(() => {
    void ensureBundledFonts().then(redraw);
  }, [redraw]);

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
  const alsoSelected = useMemo(
    () => scene?.nodes.filter((n) => selectedIds.has(n.id) && n.id !== selectedId) ?? [],
    [scene, selectedIds, selectedId],
  );
  const blockMembers = useMemo(() => {
    const b = blocksDoc.blocks.find((x) => x.id === focusedBlockId);
    return b ? nodesOfBlock(b, scene ?? null) : [];
  }, [blocksDoc, focusedBlockId, scene]);
  const marqueeRect = useMemo(
    () =>
      marquee
        ? {
            x: Math.min(marquee.x0, marquee.x1),
            y: Math.min(marquee.y0, marquee.y1),
            w: Math.abs(marquee.x1 - marquee.x0),
            h: Math.abs(marquee.y1 - marquee.y0),
          }
        : undefined,
    [marquee],
  );
  // The measurement for the layout property being edited in the inspector.
  const guide = useMemo(() => {
    if (!scene || !focusProp) return undefined;
    const node = scene.nodes.find((n) => n.id === focusProp.nodeId);
    if (!node) return undefined;
    const parent = (node.parentId && scene.nodes.find((n) => n.id === node.parentId)?.rect) || {
      x: 0,
      y: 0,
      w: scene.screen.w,
      h: scene.screen.h,
    };
    const text = readText(node.file);
    const entry = text === undefined ? undefined : kvAt(parseCached(text), node.keyPath);
    const raw = entry
      ? propsOf(entry, { env: COND_ENVS[view.env], minmode: view.minmode }).get(focusProp.key)
      : undefined;
    const prefix = (raw ?? '').trim()[0]?.toLowerCase();
    const align = prefix === 'r' ? 'end' : prefix === 'c' ? 'center' : 'start';
    return { node, parent, key: focusProp.key, align } as const;
  }, [scene, focusProp, readText, view.env, view.minmode]);

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
      paintScene(g, scene, {
        images,
        showBounds: view.showBounds,
        // The 3D layer draws these panels' contents; without it they are labelled boxes.
        skipDynamic: view.models3d ? (n) => isModelPanel(n.control) : undefined,
      });
      g.globalAlpha = 1;
      paintOverlay(g, {
        selected: play ? undefined : selected,
        alsoSelected: play ? undefined : alsoSelected,
        blockMembers: play ? undefined : blockMembers,
        marquee: marqueeRect,
        hover: play ? undefined : hovered,
        guide: play ? undefined : guide,
        pxPerCss: 1 / zoom,
      });
    });
    return () => cancelAnimationFrame(rafRef.current);
  }, [
    scene,
    zoom,
    sw,
    sh,
    view.hudOpacity,
    view.showBounds,
    view.models3d,
    images,
    selected,
    alsoSelected,
    blockMembers,
    play,
    marqueeRect,
    hovered,
    guide,
    tick,
  ]);

  /* ── Play mode: a match clock, and focus on the canvas so keys reach it ── */
  const inGame = page?.backdrop === 'game';
  useEffect(() => {
    if (!play) {
      clearPlayTimers();
      return undefined;
    }
    canvasRef.current?.focus();
    if (!inGame) return undefined;
    const id = setInterval(() => {
      const st = useEditor.getState();
      const patch = simTick(st.test, 1);
      if (patch) st.setTest(patch);
    }, 1000);
    return () => clearInterval(id);
  }, [play, inGame]);

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

  /** Panels to move together for a gesture on `hit`: a block (Alt) or the multi-selection. */
  const groupFor = (hit: PanelNode, alt: boolean): PanelNode[] | undefined => {
    if (!scene) return undefined;
    if (alt) {
      const found = blockOfNode(blocksDoc, hit);
      const nodes = found ? nodesOfBlock(found.block, scene) : [];
      if (nodes.length > 1) return nodes;
    }
    if (selectedIds.size > 1 && selectedIds.has(hit.id)) {
      return scene.nodes.filter((n) => selectedIds.has(n.id));
    }
    return undefined;
  };

  /** The topmost button under a point, with the command it runs. */
  const buttonAt = (x: number, y: number) => {
    if (!scene) return undefined;
    for (let i = scene.nodes.length - 1; i >= 0; i--) {
      const n = scene.nodes[i];
      if (!n.shown || kindOf(n.control) !== 'button') continue;
      const r = n.rect;
      if (x < r.x || y < r.y || x >= r.x + r.w || y >= r.y + r.h) continue;
      const text = readText(n.file);
      const entry = text === undefined ? undefined : kvAt(parseCached(text), n.keyPath);
      const command = entry
        ? propsOf(entry, { env: COND_ENVS[view.env], minmode: view.minmode }).get('command')
        : undefined;
      return { node: n, command };
    }
    return undefined;
  };

  const onPlayDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!scene || e.button !== 0) return;
    const p = toScene(e);
    const button = buttonAt(p.x, p.y);
    if (button) {
      const unknown = runAction(interpretCommand(button.command));
      if (unknown !== null) {
        toast.info(
          t('play-command', {
            defaultValue: 'This button runs “{{command}}”, which Play mode does not simulate.',
            command: unknown || button.node.name,
          }),
        );
      }
      return;
    }
    // Anywhere else on the in-game HUD is a shot.
    if (page?.backdrop === 'game') playKey('fire');
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (play) {
      onPlayDown(e);
      return;
    }
    if (!scene || e.button !== 0) return;
    const p = toScene(e);
    const pxPerCss = 1 / zoom;
    if (readOnly) {
      select(hitTest(scene, p.x, p.y)?.id ?? null);
      return;
    }
    // Shift (or Ctrl/Cmd) builds a selection: click adds or removes a panel, dragging boxes some in.
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      const hit = hitTest(scene, p.x, p.y);
      if (hit) {
        toggleSelect(hit.id);
      } else {
        const m = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
        marqueeRef.current = m;
        setMarquee(m);
        e.currentTarget.setPointerCapture(e.pointerId);
      }
      return;
    }
    if (selected && selectedIds.size <= 1) {
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
    const group = hit ? groupFor(hit, e.altKey) : undefined;
    // Pressing a panel that is already part of a multi-selection keeps the selection, so it can be dragged as one.
    if (!(hit && selectedIds.size > 1 && selectedIds.has(hit.id)) || e.altKey) {
      if (group && e.altKey) selectMany(group.map((n) => n.id));
      else select(hit?.id ?? null);
    }
    const text = hit ? readText(hit.file) : undefined;
    if (hit && text !== undefined) {
      const snapshot = new Map<string, string>();
      if (group) {
        for (const n of group) {
          const t = readText(n.file);
          if (t !== undefined) snapshot.set(n.file, t);
        }
      }
      dragRef.current = {
        mode: 'move',
        node: hit,
        startX: p.x,
        startY: p.y,
        originalText: text,
        group: group ? { nodes: group, snapshot } : undefined,
      };
      e.currentTarget.setPointerCapture(e.pointerId);
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!scene) return;
    const p = toScene(e);
    if (play) {
      const button = buttonAt(p.x, p.y);
      setPlayHover(
        button
          ? { file: button.node.file, name: button.node.keyPath[button.node.keyPath.length - 1] }
          : null,
      );
      e.currentTarget.style.cursor = button ? 'pointer' : 'default';
      return;
    }
    if (marqueeRef.current) {
      const m = { ...marqueeRef.current, x1: p.x, y1: p.y };
      marqueeRef.current = m;
      setMarquee(m);
      return;
    }
    const d = dragRef.current;
    if (d) {
      const dx = p.x - d.startX;
      const dy = p.y - d.startY;
      if (Math.abs(dx) + Math.abs(dy) > 2 / zoom) {
        if (d.group) {
          beginGesture('drag:group');
          moveNodes(d.group.nodes, scene, dx, dy, {
            snapshot: d.group.snapshot,
            coalesceKey: 'drag:group',
          });
        } else {
          beginGesture(`drag:${d.node.id}`);
          applyDrag(d, dx, dy);
        }
      }
      return;
    }
    if (selected && selectedIds.size <= 1) {
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
    const m = marqueeRef.current;
    if (m && scene) {
      marqueeRef.current = null;
      setMarquee(null);
      e.currentTarget.releasePointerCapture(e.pointerId);
      const x0 = Math.min(m.x0, m.x1);
      const y0 = Math.min(m.y0, m.y1);
      const x1 = Math.max(m.x0, m.x1);
      const y1 = Math.max(m.y0, m.y1);
      if (x1 - x0 + (y1 - y0) > 4 / zoom) {
        const inside = scene.nodes.filter(
          (n) =>
            n.shown &&
            !(n.isFrame && n.rect.w >= scene.screen.w - 1 && n.rect.h >= scene.screen.h - 1) &&
            n.rect.x < x1 &&
            n.rect.x + n.rect.w > x0 &&
            n.rect.y < y1 &&
            n.rect.y + n.rect.h > y0,
        );
        // Shift-drag adds to what is already selected.
        selectMany([...selectedIds, ...inside.map((n) => n.id)]);
      }
      return;
    }
    if (dragRef.current) {
      dragRef.current = null;
      endGesture();
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  /** Arrow keys nudge the selection by 1 virtual unit (10 with Shift). */
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (play) {
      if (e.key === 'Escape') setPlay(false);
      else if (!e.ctrlKey && !e.metaKey && !e.altKey && playKey(e.key)) e.preventDefault();
      return;
    }
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
    // A multi-selection (or, with Alt, the whole block) nudges together.
    const group = scene ? groupFor(selected, e.altKey) : undefined;
    if (group && scene) {
      moveNodes(group, scene, dir[0] * step, dir[1] * step, { coalesceKey: 'nudge:group' });
      return;
    }
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
      {play ? <PlayBar inGame={inGame} /> : null}
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
          <ModelLayer scene={scene} zoom={cssW / sw} front={false} />
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
            onPointerLeave={() => (play ? setPlayHover(null) : hover(null))}
          />
          <ModelLayer scene={scene} zoom={cssW / sw} front />
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
