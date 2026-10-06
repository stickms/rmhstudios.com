'use client';

/**
 * Paint for the Dunesday 7 sandbox — Windows 7 Paint, ribbon-lite.
 *
 * One Home ribbon (tools, shapes, size, colours, undo/redo/clear) and the blue
 * File button (New, Open, Save, Save as). Pictures are PNG data URLs kept in
 * the sandboxed file system (`lib/dunesday/vfs.ts`), saved to Pictures by
 * default. Drawing is synchronous inside the pointer handlers (no animation
 * loop): freehand tools paint straight onto the canvas, shape tools preview on
 * an overlay canvas and commit on release. Right button paints with colour 2.
 */

import {
  Brush,
  Circle,
  Eraser,
  FilePlus,
  FolderOpen,
  PaintBucket,
  Pencil,
  Pipette,
  Redo2,
  Save,
  Slash,
  Square,
  Trash2,
  Undo2,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as RPointerEvent,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  PICTURES,
  RECYCLE,
  VfsError,
  create,
  extOf,
  pathOf,
  validateName,
  writeContent,
} from '@/lib/dunesday/vfs';
import { cn } from '@/lib/utils';
import { sfx } from '../../sound';
import { isImage, showMessage } from '../actions';
import type { AppProps } from '../apps';
import { Icon } from '../icons';
import { PopupMenu, type MenuItem } from '../Menu';
import { useOs } from '../store';

type Tool = 'pencil' | 'brush' | 'eraser' | 'fill' | 'picker' | 'line' | 'rect' | 'ellipse';
type Pt = { x: number; y: number };

const DEFAULT_W = 640;
const DEFAULT_H = 400;
const MAX_SIDE = 1600;
const MAX_HISTORY = 30;
const SIZES = [1, 3, 5, 8] as const;

/** The Windows 7 Paint palette, two rows of ten. */
const PALETTE = [
  '#000000',
  '#7f7f7f',
  '#880015',
  '#ed1c24',
  '#ff7f27',
  '#fff200',
  '#22b14c',
  '#00a2e8',
  '#3f48cc',
  '#a349a4',
  '#ffffff',
  '#c3c3c3',
  '#b97a57',
  '#ffaec9',
  '#ffc90e',
  '#efe4b0',
  '#b5e61d',
  '#99d9ea',
  '#7092be',
  '#c8bfe7',
];

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

/** Scanline flood fill over device pixels, with a small tolerance for anti-aliased edges. */
function floodFill(
  ctx: CanvasRenderingContext2D,
  cw: number,
  ch: number,
  sx: number,
  sy: number,
  hex: string,
): boolean {
  if (sx < 0 || sy < 0 || sx >= cw || sy >= ch) return false;
  const img = ctx.getImageData(0, 0, cw, ch);
  const d = img.data;
  const [fr, fg, fb] = hexToRgb(hex);
  const i0 = (sy * cw + sx) * 4;
  const tr = d[i0];
  const tg = d[i0 + 1];
  const tb = d[i0 + 2];
  const ta = d[i0 + 3];
  if (tr === fr && tg === fg && tb === fb && ta === 255) return false;
  const TOL = 40;
  const seen = new Uint8Array(cw * ch);
  const test = (x: number, y: number) => {
    const p = y * cw + x;
    if (seen[p]) return false;
    const i = p * 4;
    return (
      Math.abs(d[i] - tr) <= TOL &&
      Math.abs(d[i + 1] - tg) <= TOL &&
      Math.abs(d[i + 2] - tb) <= TOL &&
      Math.abs(d[i + 3] - ta) <= TOL
    );
  };
  const stack: number[] = [sx, sy];
  while (stack.length) {
    const y = stack.pop()!;
    const x = stack.pop()!;
    if (!test(x, y)) continue;
    let lx = x;
    while (lx > 0 && test(lx - 1, y)) lx--;
    let rx = x;
    while (rx < cw - 1 && test(rx + 1, y)) rx++;
    let up = false;
    let down = false;
    for (let i = lx; i <= rx; i++) {
      const p = y * cw + i;
      seen[p] = 1;
      const k = p * 4;
      d[k] = fr;
      d[k + 1] = fg;
      d[k + 2] = fb;
      d[k + 3] = 255;
      if (y > 0) {
        if (test(i, y - 1)) {
          if (!up) {
            stack.push(i, y - 1);
            up = true;
          }
        } else up = false;
      }
      if (y < ch - 1) {
        if (test(i, y + 1)) {
          if (!down) {
            stack.push(i, y + 1);
            down = true;
          }
        } else down = false;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  return true;
}

type Dialog =
  | null
  | { kind: 'open'; selected: string | null }
  | { kind: 'saveas'; name: string; error: string | null }
  | { kind: 'overwrite'; name: string; id: string }
  | { kind: 'unsaved'; then: () => void };

export default function PaintApp({ win }: AppProps) {
  const { t } = useTranslation('c-dunesday');
  const vfs = useOs((s) => s.vfs);
  const fs = useOs((s) => s.fs);
  const setTitle = useOs((s) => s.setTitle);

  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const posRef = useRef<HTMLSpanElement>(null);
  const dprRef = useRef(1);
  const undoRef = useRef<ImageData[]>([]);
  const redoRef = useRef<ImageData[]>([]);
  const strokeRef = useRef<null | { tool: Tool; color: string; start: Pt; last: Pt; id: number }>(
    null,
  );
  const afterSaveRef = useRef<(() => void) | null>(null);

  const [tool, setTool] = useState<Tool>('pencil');
  const [lastDrawTool, setLastDrawTool] = useState<Tool>('pencil');
  const [size, setSize] = useState<number>(3);
  const [color1, setColor1] = useState('#000000');
  const [color2, setColor2] = useState('#ffffff');
  const [slot, setSlot] = useState<1 | 2>(1);
  const [fillShapes, setFillShapes] = useState(false);
  const [dims, setDims] = useState({ w: DEFAULT_W, h: DEFAULT_H });
  const [zoom, setZoom] = useState<1 | 2>(1);
  const [fileId, setFileId] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [history, setHistory] = useState({ undo: 0, redo: 0 });
  const [menu, setMenu] = useState<null | { x: number; y: number }>(null);
  const [dialog, setDialog] = useState<Dialog>(null);

  const untitled = t('paint-untitled', { defaultValue: 'Untitled' });
  const shownName = fileName ?? untitled;

  useEffect(() => {
    setTitle(
      win.id,
      t('paint-title', {
        defaultValue: '{{star}}{{name}} - Paint',
        star: dirty ? '*' : '',
        name: shownName,
      }),
    );
  }, [dirty, shownName, setTitle, t, win.id]);

  // ── canvas plumbing ──────────────────────────────────────────────────────

  const ctxOf = (c: HTMLCanvasElement | null) =>
    c?.getContext('2d', { willReadFrequently: true }) ?? null;

  const syncHistory = () =>
    setHistory({ undo: undoRef.current.length, redo: redoRef.current.length });

  /** Resize both canvases (which clears them) and paint the new ground. */
  const resetCanvas = useCallback(
    (w: number, h: number, draw?: (ctx: CanvasRenderingContext2D) => void) => {
      const c = canvasRef.current;
      const o = overlayRef.current;
      if (!c || !o) return;
      const dpr = Math.min(
        2,
        Math.max(1, typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1),
      );
      dprRef.current = dpr;
      for (const el of [c, o]) {
        el.width = Math.round(w * dpr);
        el.height = Math.round(h * dpr);
      }
      const ctx = ctxOf(c);
      const octx = ctxOf(o);
      if (!ctx || !octx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      octx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      draw?.(ctx);
      undoRef.current = [];
      redoRef.current = [];
      syncHistory();
      setDims({ w, h });
    },
    [],
  );

  const snapshot = () => {
    const c = canvasRef.current;
    const ctx = ctxOf(c);
    if (!c || !ctx) return;
    undoRef.current.push(ctx.getImageData(0, 0, c.width, c.height));
    if (undoRef.current.length > MAX_HISTORY) undoRef.current.shift();
    redoRef.current = [];
    syncHistory();
  };

  const undo = useCallback(() => {
    const c = canvasRef.current;
    const ctx = ctxOf(c);
    const prev = undoRef.current.pop();
    if (!c || !ctx || !prev) return;
    redoRef.current.push(ctx.getImageData(0, 0, c.width, c.height));
    ctx.putImageData(prev, 0, 0);
    setDirty(true);
    syncHistory();
  }, []);

  const redo = useCallback(() => {
    const c = canvasRef.current;
    const ctx = ctxOf(c);
    const next = redoRef.current.pop();
    if (!c || !ctx || !next) return;
    undoRef.current.push(ctx.getImageData(0, 0, c.width, c.height));
    ctx.putImageData(next, 0, 0);
    setDirty(true);
    syncHistory();
  }, []);

  const clearCanvas = () => {
    const ctx = ctxOf(canvasRef.current);
    if (!ctx) return;
    snapshot();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, dims.w, dims.h);
    setDirty(true);
  };

  // ── files ────────────────────────────────────────────────────────────────

  const newPicture = useCallback(() => {
    resetCanvas(DEFAULT_W, DEFAULT_H);
    setFileId(null);
    setFileName(null);
    setDirty(false);
  }, [resetCanvas]);

  const loadNode = useCallback(
    (id: string) => {
      const node = useOs.getState().vfs[id];
      if (!node || node.kind !== 'file' || !node.content?.startsWith('data:image/')) {
        showMessage({
          icon: 'error',
          text: t('paint-cannot-read', {
            defaultValue:
              'Paint cannot read this file. This is not a valid bitmap file, or its format is not currently supported.',
          }),
        });
        return;
      }
      const img = new Image();
      img.onload = () => {
        let w = img.naturalWidth || DEFAULT_W;
        let h = img.naturalHeight || DEFAULT_H;
        const k = Math.min(1, MAX_SIDE / Math.max(w, h));
        w = Math.max(1, Math.round(w * k));
        h = Math.max(1, Math.round(h * k));
        resetCanvas(w, h, (ctx) => ctx.drawImage(img, 0, 0, w, h));
        setFileId(id);
        setFileName(node.name);
        setDirty(false);
      };
      img.onerror = () =>
        showMessage({
          icon: 'error',
          text: t('paint-cannot-read', {
            defaultValue:
              'Paint cannot read this file. This is not a valid bitmap file, or its format is not currently supported.',
          }),
        });
      img.src = node.content;
    },
    [resetCanvas, t],
  );

  const initialFile = win.params?.file;
  useEffect(() => {
    resetCanvas(DEFAULT_W, DEFAULT_H);
    if (initialFile) loadNode(initialFile);
    // Open once, on mount: later opens go through the File menu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** The picture at its logical size, as a PNG data URL. */
  const exportPng = (): string | null => {
    const c = canvasRef.current;
    if (!c) return null;
    const out = document.createElement('canvas');
    out.width = dims.w;
    out.height = dims.h;
    const octx = out.getContext('2d');
    if (!octx) return null;
    octx.drawImage(c, 0, 0, dims.w, dims.h);
    return out.toDataURL('image/png');
  };

  const reportError = (err: VfsError) =>
    showMessage({
      icon: 'error',
      text:
        err.code === 'quota'
          ? t('paint-quota', {
              defaultValue:
                'There is not enough space on Local Disk (C:) to save this picture. Delete some files and try again.',
            })
          : err.message,
    });

  const finishSave = (id: string, name: string) => {
    setFileId(id);
    setFileName(name);
    setDirty(false);
    setDialog(null);
    sfx.pop();
    const next = afterSaveRef.current;
    afterSaveRef.current = null;
    next?.();
  };

  const writeTo = (id: string, name: string) => {
    const url = exportPng();
    if (!url) return;
    const err = fs((v) => writeContent(v, id, url));
    if (err) {
      afterSaveRef.current = null;
      reportError(err);
      return;
    }
    finishSave(id, name);
  };

  const openSaveAs = () => {
    const base = fileName ? fileName.replace(/\.[^.]*$/, '') : untitled;
    setDialog({ kind: 'saveas', name: `${base}.png`, error: null });
  };

  const save = () => {
    const node = fileId ? useOs.getState().vfs[fileId] : undefined;
    if (node && node.kind === 'file' && node.parent !== RECYCLE && extOf(node.name) === 'png') {
      writeTo(node.id, node.name);
    } else {
      openSaveAs();
    }
  };

  const confirmSaveAs = (raw: string) => {
    let name: string;
    try {
      name = validateName(raw);
    } catch (e) {
      if (e instanceof VfsError) {
        setDialog({ kind: 'saveas', name: raw, error: e.message });
        return;
      }
      throw e;
    }
    if (!extOf(name)) name = `${name}.png`;
    else if (extOf(name) !== 'png') name = `${name.replace(/\.[^.]*$/, '')}.png`;
    const current = useOs.getState().vfs;
    const clash = Object.values(current).find(
      (n) => n.parent === PICTURES && n.name.toLowerCase() === name.toLowerCase(),
    );
    if (clash) {
      if (clash.kind !== 'file') {
        setDialog({
          kind: 'saveas',
          name,
          error: t('paint-name-taken', {
            defaultValue: 'A folder with that name already exists. Choose another name.',
          }),
        });
        return;
      }
      setDialog({ kind: 'overwrite', name: clash.name, id: clash.id });
      return;
    }
    const url = exportPng();
    if (!url) return;
    let createdId = '';
    let createdName = name;
    const err = fs((v) => {
      const r = create(v, PICTURES, { name, kind: 'file', content: url });
      createdId = r.id;
      createdName = r.vfs[r.id].name;
      return r.vfs;
    });
    if (err) {
      afterSaveRef.current = null;
      setDialog(null);
      reportError(err);
      return;
    }
    finishSave(createdId, createdName);
  };

  /** Run `then` now, or after the "save changes?" prompt when there is unsaved work. */
  const guardUnsaved = (then: () => void) => {
    if (dirty) setDialog({ kind: 'unsaved', then });
    else then();
  };

  const images = useMemo(
    () =>
      Object.values(vfs)
        .filter((n) => isImage(n) && n.parent !== RECYCLE && n.content?.startsWith('data:image/'))
        .map((n) => ({ node: n, where: n.parent ? pathOf(vfs, n.parent) : '' }))
        .sort((a, b) => {
          const pa = a.node.parent === PICTURES ? 0 : 1;
          const pb = b.node.parent === PICTURES ? 0 : 1;
          return (
            pa - pb || a.where.localeCompare(b.where) || a.node.name.localeCompare(b.node.name)
          );
        }),
    [vfs],
  );

  // ── keyboard ─────────────────────────────────────────────────────────────

  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  keyRef.current = (e: KeyboardEvent) => {
    if (dialog || menu) return;
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
    if (!(e.ctrlKey || e.metaKey)) return;
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) undo();
    else if (k === 'y' || (k === 'z' && e.shiftKey)) redo();
    else if (k === 's') save();
    else if (k === 'n') guardUnsaved(newPicture);
    else if (k === 'o') guardUnsaved(() => setDialog({ kind: 'open', selected: null }));
    else return;
    e.preventDefault();
  };
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const on = (e: KeyboardEvent) => keyRef.current(e);
    el.addEventListener('keydown', on);
    return () => el.removeEventListener('keydown', on);
  }, []);

  // ── drawing ──────────────────────────────────────────────────────────────

  const toPoint = (e: { clientX: number; clientY: number }): Pt => {
    const c = overlayRef.current!;
    const r = c.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) * dims.w) / (r.width || 1),
      y: ((e.clientY - r.top) * dims.h) / (r.height || 1),
    };
  };

  const strokeStyle = (ctx: CanvasRenderingContext2D, which: Tool, color: string) => {
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineJoin = 'round';
    if (which === 'brush') {
      ctx.lineWidth = size * 3;
      ctx.lineCap = 'round';
    } else if (which === 'eraser') {
      ctx.lineWidth = Math.max(4, size * 4);
      ctx.lineCap = 'square';
    } else {
      ctx.lineWidth = size;
      ctx.lineCap = which === 'pencil' ? 'round' : 'butt';
    }
  };

  const segment = (ctx: CanvasRenderingContext2D, a: Pt, b: Pt) => {
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  };

  const drawShape = (
    ctx: CanvasRenderingContext2D,
    which: Tool,
    a: Pt,
    b0: Pt,
    color: string,
    shift: boolean,
  ) => {
    let b = b0;
    if (shift && which !== 'line') {
      const s = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y));
      b = { x: a.x + Math.sign(b.x - a.x || 1) * s, y: a.y + Math.sign(b.y - a.y || 1) * s };
    }
    strokeStyle(ctx, which, color);
    ctx.lineCap = which === 'line' ? 'round' : 'butt';
    ctx.beginPath();
    if (which === 'line') {
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      return;
    }
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    const w = Math.abs(b.x - a.x);
    const h = Math.abs(b.y - a.y);
    if (which === 'rect') ctx.rect(x, y, w, h);
    else ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    if (fillShapes) {
      ctx.fillStyle = color === color1 ? color2 : color1;
      ctx.fill();
    }
    ctx.stroke();
  };

  const clearOverlay = () => {
    const ctx = ctxOf(overlayRef.current);
    if (ctx) ctx.clearRect(0, 0, dims.w, dims.h);
  };

  const onPointerDown = (e: RPointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0 && e.button !== 2) return;
    rootRef.current?.focus({ preventScroll: true });
    const ctx = ctxOf(canvasRef.current);
    if (!ctx) return;
    e.preventDefault();
    const color = e.button === 2 ? color2 : color1;
    const p = toPoint(e);
    const dpr = dprRef.current;

    if (tool === 'fill') {
      const c = canvasRef.current!;
      const before = ctx.getImageData(0, 0, c.width, c.height);
      if (floodFill(ctx, c.width, c.height, Math.floor(p.x * dpr), Math.floor(p.y * dpr), color)) {
        undoRef.current.push(before);
        if (undoRef.current.length > MAX_HISTORY) undoRef.current.shift();
        redoRef.current = [];
        syncHistory();
        setDirty(true);
      }
      return;
    }
    if (tool === 'picker') {
      const px = ctx.getImageData(
        Math.min(canvasRef.current!.width - 1, Math.max(0, Math.floor(p.x * dpr))),
        Math.min(canvasRef.current!.height - 1, Math.max(0, Math.floor(p.y * dpr))),
        1,
        1,
      ).data;
      const hex = rgbToHex(px[0], px[1], px[2]);
      if (e.button === 2) setColor2(hex);
      else setColor1(hex);
      setTool(lastDrawTool);
      return;
    }

    e.currentTarget.setPointerCapture(e.pointerId);
    snapshot();
    const drawColor = tool === 'eraser' ? color2 : color;
    strokeRef.current = { tool, color: drawColor, start: p, last: p, id: e.pointerId };
    if (tool === 'pencil' || tool === 'brush' || tool === 'eraser') {
      strokeStyle(ctx, tool, drawColor);
      segment(ctx, p, p);
      setDirty(true);
    }
  };

  const onPointerMove = (e: RPointerEvent<HTMLCanvasElement>) => {
    const p = toPoint(e);
    if (posRef.current) posRef.current.textContent = `${Math.floor(p.x)}, ${Math.floor(p.y)}px`;
    const s = strokeRef.current;
    if (!s || s.id !== e.pointerId) return;
    if (s.tool === 'pencil' || s.tool === 'brush' || s.tool === 'eraser') {
      const ctx = ctxOf(canvasRef.current);
      if (!ctx) return;
      strokeStyle(ctx, s.tool, s.color);
      const native = e.nativeEvent;
      const events =
        typeof native.getCoalescedEvents === 'function' ? native.getCoalescedEvents() : [];
      const pts = events.length ? events.map((ev) => toPoint(ev)) : [p];
      let last = s.last;
      for (const q of pts) {
        segment(ctx, last, q);
        last = q;
      }
      s.last = last;
    } else {
      const octx = ctxOf(overlayRef.current);
      if (!octx) return;
      octx.clearRect(0, 0, dims.w, dims.h);
      drawShape(octx, s.tool, s.start, p, s.color, e.shiftKey);
      s.last = p;
    }
  };

  const endStroke = (e: RPointerEvent<HTMLCanvasElement>, commit: boolean) => {
    const s = strokeRef.current;
    if (!s || s.id !== e.pointerId) return;
    strokeRef.current = null;
    if (s.tool === 'line' || s.tool === 'rect' || s.tool === 'ellipse') {
      clearOverlay();
      const ctx = ctxOf(canvasRef.current);
      const end = commit ? toPoint(e) : s.last;
      if (ctx && (end.x !== s.start.x || end.y !== s.start.y)) {
        drawShape(ctx, s.tool, s.start, end, s.color, e.shiftKey);
        setDirty(true);
      } else {
        // Nothing drawn: drop the snapshot taken on press.
        undoRef.current.pop();
        syncHistory();
      }
    }
  };

  const pickTool = (next: Tool) => {
    setTool(next);
    if (next !== 'picker') setLastDrawTool(next);
    sfx.tick();
  };

  const setActiveColor = (hex: string) => {
    if (slot === 1) setColor1(hex);
    else setColor2(hex);
  };

  // ── menu ─────────────────────────────────────────────────────────────────

  const fileItems: MenuItem[] = [
    {
      label: t('paint-new', { defaultValue: 'New' }),
      icon: <FilePlus size={14} />,
      hint: 'Ctrl+N',
      onSelect: () => guardUnsaved(newPicture),
    },
    {
      label: t('paint-open', { defaultValue: 'Open' }),
      icon: <FolderOpen size={14} />,
      hint: 'Ctrl+O',
      onSelect: () => guardUnsaved(() => setDialog({ kind: 'open', selected: null })),
    },
    {
      label: t('paint-save', { defaultValue: 'Save' }),
      icon: <Save size={14} />,
      hint: 'Ctrl+S',
      onSelect: save,
    },
    { label: t('paint-save-as', { defaultValue: 'Save as' }), onSelect: openSaveAs },
  ];

  const tools: { id: Tool; label: string; icon: ReactNode }[] = [
    {
      id: 'pencil',
      label: t('paint-tool-pencil', { defaultValue: 'Pencil' }),
      icon: <Pencil size={16} aria-hidden="true" />,
    },
    {
      id: 'brush',
      label: t('paint-tool-brush', { defaultValue: 'Brush' }),
      icon: <Brush size={16} aria-hidden="true" />,
    },
    {
      id: 'eraser',
      label: t('paint-tool-eraser', { defaultValue: 'Eraser' }),
      icon: <Eraser size={16} aria-hidden="true" />,
    },
    {
      id: 'fill',
      label: t('paint-tool-fill', { defaultValue: 'Fill with color' }),
      icon: <PaintBucket size={16} aria-hidden="true" />,
    },
    {
      id: 'picker',
      label: t('paint-tool-picker', { defaultValue: 'Color picker' }),
      icon: <Pipette size={16} aria-hidden="true" />,
    },
  ];
  const shapes: { id: Tool; label: string; icon: ReactNode }[] = [
    {
      id: 'line',
      label: t('paint-shape-line', { defaultValue: 'Line' }),
      icon: <Slash size={16} aria-hidden="true" />,
    },
    {
      id: 'rect',
      label: t('paint-shape-rect', { defaultValue: 'Rectangle' }),
      icon: <Square size={16} aria-hidden="true" />,
    },
    {
      id: 'ellipse',
      label: t('paint-shape-ellipse', { defaultValue: 'Oval' }),
      icon: <Circle size={16} aria-hidden="true" />,
    },
  ];

  const openDialog = dialog?.kind === 'open' ? dialog : null;
  const saveDialog = dialog?.kind === 'saveas' ? dialog : null;

  return (
    <div ref={rootRef} className="ds-paint" tabIndex={-1}>
      <div className="ds-paint-tabs">
        <button
          type="button"
          className="ds-paint-filebtn"
          aria-haspopup="menu"
          aria-expanded={!!menu}
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setMenu({ x: r.left, y: r.bottom });
          }}
        >
          {t('paint-file', { defaultValue: 'File' })}
        </button>
        <span className="ds-paint-tablabel">{t('paint-home', { defaultValue: 'Home' })}</span>
      </div>

      <div
        className="ds-paint-ribbon"
        role="toolbar"
        aria-label={t('paint-ribbon', { defaultValue: 'Home' })}
      >
        <div className="ds-paint-group">
          <div className="ds-paint-grouprow">
            <button
              type="button"
              className="ds-paint-tool"
              aria-label={t('paint-undo', { defaultValue: 'Undo (Ctrl+Z)' })}
              title={t('paint-undo', { defaultValue: 'Undo (Ctrl+Z)' })}
              disabled={history.undo === 0}
              onClick={undo}
            >
              <Undo2 size={16} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="ds-paint-tool"
              aria-label={t('paint-redo', { defaultValue: 'Redo (Ctrl+Y)' })}
              title={t('paint-redo', { defaultValue: 'Redo (Ctrl+Y)' })}
              disabled={history.redo === 0}
              onClick={redo}
            >
              <Redo2 size={16} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="ds-paint-tool"
              aria-label={t('paint-clear', { defaultValue: 'Clear' })}
              title={t('paint-clear', { defaultValue: 'Clear' })}
              onClick={clearCanvas}
            >
              <Trash2 size={16} aria-hidden="true" />
            </button>
          </div>
          <span className="ds-paint-grouplabel">
            {t('paint-group-edit', { defaultValue: 'Edit' })}
          </span>
        </div>

        <div className="ds-paint-group">
          <div className="ds-paint-grouprow ds-paint-grouprow--wrap">
            {tools.map((x) => (
              <button
                key={x.id}
                type="button"
                className={cn('ds-paint-tool', tool === x.id && 'is-on')}
                aria-pressed={tool === x.id}
                aria-label={x.label}
                title={x.label}
                onClick={() => pickTool(x.id)}
              >
                {x.icon}
              </button>
            ))}
          </div>
          <span className="ds-paint-grouplabel">
            {t('paint-group-tools', { defaultValue: 'Tools' })}
          </span>
        </div>

        <div className="ds-paint-group">
          <div className="ds-paint-grouprow">
            {shapes.map((x) => (
              <button
                key={x.id}
                type="button"
                className={cn('ds-paint-tool', tool === x.id && 'is-on')}
                aria-pressed={tool === x.id}
                aria-label={x.label}
                title={x.label}
                onClick={() => pickTool(x.id)}
              >
                {x.icon}
              </button>
            ))}
            <label className="ds-paint-check">
              <input
                type="checkbox"
                checked={fillShapes}
                onChange={(e) => setFillShapes(e.target.checked)}
              />
              {t('paint-fill-shapes', { defaultValue: 'Fill' })}
            </label>
          </div>
          <span className="ds-paint-grouplabel">
            {t('paint-group-shapes', { defaultValue: 'Shapes' })}
          </span>
        </div>

        <div className="ds-paint-group">
          <div className="ds-paint-grouprow">
            {SIZES.map((s) => (
              <button
                key={s}
                type="button"
                className={cn('ds-paint-size', size === s && 'is-on')}
                aria-pressed={size === s}
                aria-label={t('paint-size-px', { defaultValue: '{{n}} px', n: s })}
                title={t('paint-size-px', { defaultValue: '{{n}} px', n: s })}
                onClick={() => setSize(s)}
              >
                <span className="ds-paint-sizebar" style={{ height: s }} aria-hidden="true" />
              </button>
            ))}
          </div>
          <span className="ds-paint-grouplabel">
            {t('paint-group-size', { defaultValue: 'Size' })}
          </span>
        </div>

        <div className="ds-paint-group">
          <div className="ds-paint-grouprow">
            <button
              type="button"
              className={cn('ds-paint-slot', slot === 1 && 'is-on')}
              aria-pressed={slot === 1}
              onClick={() => setSlot(1)}
            >
              <span
                className="ds-paint-chip ds-paint-chip--big"
                style={{ background: color1 }}
                aria-hidden="true"
              />
              <span>{t('paint-color1', { defaultValue: 'Color 1' })}</span>
            </button>
            <button
              type="button"
              className={cn('ds-paint-slot', slot === 2 && 'is-on')}
              aria-pressed={slot === 2}
              onClick={() => setSlot(2)}
            >
              <span className="ds-paint-chip" style={{ background: color2 }} aria-hidden="true" />
              <span>{t('paint-color2', { defaultValue: 'Color 2' })}</span>
            </button>
            <div className="ds-paint-palette">
              {PALETTE.map((hex) => (
                <button
                  key={hex}
                  type="button"
                  className="ds-paint-swatch"
                  style={{ background: hex }}
                  aria-label={hex}
                  title={hex}
                  onClick={() => setActiveColor(hex)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setColor2(hex);
                  }}
                />
              ))}
            </div>
            <label className="ds-paint-edit">
              <Icon name="paint" size={22} />
              <span>{t('paint-edit-colors', { defaultValue: 'Edit colors' })}</span>
              <input
                type="color"
                className="ds-paint-colorinput"
                value={slot === 1 ? color1 : color2}
                onChange={(e) => setActiveColor(e.target.value)}
              />
            </label>
          </div>
          <span className="ds-paint-grouplabel">
            {t('paint-group-colors', { defaultValue: 'Colors' })}
          </span>
        </div>
      </div>

      <div className="ds-paint-scroll">
        <div className="ds-paint-sheet" style={{ width: dims.w * zoom, height: dims.h * zoom }}>
          <canvas
            ref={canvasRef}
            className="ds-paint-canvas"
            style={{ width: dims.w * zoom, height: dims.h * zoom }}
            aria-hidden="true"
          />
          <canvas
            ref={overlayRef}
            className={cn('ds-paint-overlay', `ds-paint-overlay--${tool}`)}
            style={{ width: dims.w * zoom, height: dims.h * zoom }}
            role="img"
            aria-label={t('paint-canvas', { defaultValue: 'Drawing canvas' })}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={(e) => endStroke(e, true)}
            onPointerCancel={(e) => endStroke(e, false)}
            onPointerLeave={() => {
              if (posRef.current && !strokeRef.current) posRef.current.textContent = '';
            }}
            onContextMenu={(e) => e.preventDefault()}
          />
        </div>
      </div>

      <div className="ds-paint-status">
        <span className="ds-paint-statuscell" ref={posRef} aria-live="off" />
        <span className="ds-paint-statuscell">
          {t('paint-dims', { defaultValue: '{{w}} × {{h}}px', w: dims.w, h: dims.h })}
        </span>
        <span className="ds-paint-statusgrow" />
        <button
          type="button"
          className="ds-paint-zoom"
          aria-label={t('paint-zoom-toggle', { defaultValue: 'Zoom: {{n}}%', n: zoom * 100 })}
          onClick={() => setZoom((z) => (z === 1 ? 2 : 1))}
        >
          {zoom * 100}%
        </button>
      </div>

      {menu && (
        <PopupMenu
          at={menu}
          items={fileItems}
          label={t('paint-file', { defaultValue: 'File' })}
          onClose={() => setMenu(null)}
        />
      )}

      {openDialog && (
        <div
          className="ds-paint-modal"
          role="dialog"
          aria-modal="true"
          aria-label={t('paint-open', { defaultValue: 'Open' })}
        >
          <div className="ds-paint-dialog">
            <div className="ds-paint-dialogtitle">{t('paint-open', { defaultValue: 'Open' })}</div>
            {images.length === 0 ? (
              <p className="ds-paint-empty">
                {t('paint-no-pictures', { defaultValue: 'There are no pictures to open yet.' })}
              </p>
            ) : (
              <div className="ds-paint-filelist">
                {images.map(({ node, where }) => (
                  <button
                    key={node.id}
                    type="button"
                    className={cn('ds-paint-fileitem', openDialog.selected === node.id && 'is-on')}
                    aria-pressed={openDialog.selected === node.id}
                    onClick={() => setDialog({ kind: 'open', selected: node.id })}
                    onDoubleClick={() => {
                      setDialog(null);
                      loadNode(node.id);
                    }}
                  >
                    <Icon name="image" size={20} />
                    <span className="ds-paint-filename">{node.name}</span>
                    <span className="ds-paint-filewhere">{where}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="ds-paint-dialogbtns">
              <button
                type="button"
                className="ds-btn7"
                disabled={!openDialog.selected}
                onClick={() => {
                  const id = openDialog.selected;
                  setDialog(null);
                  if (id) loadNode(id);
                }}
              >
                {t('paint-open', { defaultValue: 'Open' })}
              </button>
              <button type="button" className="ds-btn7" onClick={() => setDialog(null)}>
                {t('paint-cancel', { defaultValue: 'Cancel' })}
              </button>
            </div>
          </div>
        </div>
      )}

      {saveDialog && (
        <div
          className="ds-paint-modal"
          role="dialog"
          aria-modal="true"
          aria-label={t('paint-save-as', { defaultValue: 'Save as' })}
        >
          <form
            className="ds-paint-dialog"
            onSubmit={(e) => {
              e.preventDefault();
              confirmSaveAs(saveDialog.name);
            }}
          >
            <div className="ds-paint-dialogtitle">
              {t('paint-save-as', { defaultValue: 'Save as' })}
            </div>
            <p className="ds-paint-where">
              {t('paint-save-in', {
                defaultValue: 'Save in: {{path}}',
                path: pathOf(vfs, PICTURES),
              })}
            </p>
            <label className="ds-paint-field">
              <span>{t('paint-file-name', { defaultValue: 'File name:' })}</span>
              <input
                type="text"
                value={saveDialog.name}

                autoFocus
                onFocus={(e) => {
                  const v = e.target.value;
                  const dot = v.lastIndexOf('.');
                  e.target.setSelectionRange(0, dot > 0 ? dot : v.length);
                }}
                onChange={(e) => setDialog({ kind: 'saveas', name: e.target.value, error: null })}
                aria-invalid={!!saveDialog.error}
              />
            </label>
            <p className="ds-paint-where">
              {t('paint-save-type', { defaultValue: 'Save as type: PNG (*.png)' })}
            </p>
            {saveDialog.error && (
              <p className="ds-paint-error" role="alert">
                {saveDialog.error}
              </p>
            )}
            <div className="ds-paint-dialogbtns">
              <button type="submit" className="ds-btn7">
                {t('paint-save', { defaultValue: 'Save' })}
              </button>
              <button
                type="button"
                className="ds-btn7"
                onClick={() => {
                  afterSaveRef.current = null;
                  setDialog(null);
                }}
              >
                {t('paint-cancel', { defaultValue: 'Cancel' })}
              </button>
            </div>
          </form>
        </div>
      )}

      {dialog?.kind === 'overwrite' && (
        <div
          className="ds-paint-modal"
          role="alertdialog"
          aria-modal="true"
          aria-label={t('paint-confirm-save-as', { defaultValue: 'Confirm Save As' })}
        >
          <div className="ds-paint-dialog ds-paint-dialog--msg">
            <div className="ds-paint-msg">
              <Icon name="warning" size={36} />
              <p>
                {t('paint-overwrite', {
                  defaultValue: '{{name}} already exists. Do you want to replace it?',
                  name: dialog.name,
                })}
              </p>
            </div>
            <div className="ds-paint-dialogbtns">
              <button
                type="button"
                className="ds-btn7"

                autoFocus
                onClick={() => writeTo(dialog.id, dialog.name)}
              >
                {t('paint-yes', { defaultValue: 'Yes' })}
              </button>
              <button
                type="button"
                className="ds-btn7"
                onClick={() => setDialog({ kind: 'saveas', name: dialog.name, error: null })}
              >
                {t('paint-no', { defaultValue: 'No' })}
              </button>
            </div>
          </div>
        </div>
      )}

      {dialog?.kind === 'unsaved' && (
        <div
          className="ds-paint-modal"
          role="alertdialog"
          aria-modal="true"
          aria-label={t('app-paint', { defaultValue: 'Paint' })}
        >
          <div className="ds-paint-dialog ds-paint-dialog--msg">
            <div className="ds-paint-msg">
              <Icon name="question" size={36} />
              <p>
                {t('paint-save-changes', {
                  defaultValue: 'Do you want to save changes to {{name}}?',
                  name: shownName,
                })}
              </p>
            </div>
            <div className="ds-paint-dialogbtns">
              <button
                type="button"
                className="ds-btn7"

                autoFocus
                onClick={() => {
                  afterSaveRef.current = dialog.then;
                  setDialog(null);
                  save();
                }}
              >
                {t('paint-save', { defaultValue: 'Save' })}
              </button>
              <button
                type="button"
                className="ds-btn7"
                onClick={() => {
                  setDialog(null);
                  dialog.then();
                }}
              >
                {t('paint-dont-save', { defaultValue: 'Don’t Save' })}
              </button>
              <button type="button" className="ds-btn7" onClick={() => setDialog(null)}>
                {t('paint-cancel', { defaultValue: 'Cancel' })}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
