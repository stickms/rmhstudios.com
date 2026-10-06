'use client';

/**
 * One desktop window: the Windows 7 glass frame (7.css), a title bar you can
 * drag, eight resize handles, Aero Snap, and minimise / maximise / close.
 *
 * - Drag the title bar; touch the top edge to maximise, a side edge to snap to
 *   half the screen (a translucent preview shows where it will land). Dragging
 *   a maximised window restores it under the pointer, like the real thing.
 * - Double-click the title bar to maximise or restore.
 * - On a phone every window is maximised and the frame is simplified — there
 *   is no room to drag, and the caption buttons grow to touch size.
 *
 * Moving and resizing write `left/top/width/height` on this one element while
 * the pointer is down, and commit to the store once on release, so a drag
 * re-renders nothing else on the desktop.
 *
 * 7.css only reaches the frame and the title bar (`.win7` scope): the app
 * content sits outside it, because 7.css restyles every control it can reach.
 */

import { AnimatePresence, m as motion } from 'framer-motion';
import { Suspense, useCallback, useId, useRef, type PointerEvent as RPointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { sfx } from '../sound';
import { APPS } from './apps';
import { Icon } from './icons';
import { useOs, type Win } from './store';
import { TASKBAR_H } from './actions';
import { BusySpinner } from './BusySpinner';

const SNAP_EDGE = 6;
type Dir = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
const DIRS: Dir[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];

export function Window({ win, active, compact }: { win: Win; active: boolean; compact: boolean }) {
  const { t } = useTranslation('c-dunesday');
  const def = APPS[win.app];
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);
  const focus = useOs((s) => s.focus);
  const close = useOs((s) => s.close);
  const minimize = useOs((s) => s.minimize);
  const toggleMax = useOs((s) => s.toggleMax);
  const setRect = useOs((s) => s.setRect);
  const setSnap = useOs((s) => s.setSnap);
  const setSnapPreview = useOs((s) => s.setSnapPreview);

  const title = win.title ?? def.title(t);
  const maximised = compact || win.max;
  const snapped = !maximised && win.snap;
  const resizable = def.resizable !== false && !maximised && !snapped && !compact;
  const minW = def.minSize?.w ?? 260;
  const minH = def.minSize?.h ?? 180;

  const doClose = useCallback(() => {
    sfx.tick();
    close(win.id);
  }, [close, win.id]);

  // ── Drag to move ──────────────────────────────────────────────────────────
  const onTitlePointerDown = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || compact) return;
    if ((e.target as HTMLElement).closest('button')) return;
    const el = ref.current;
    if (!el) return;
    focus(win.id);
    const startX = e.clientX;
    const startY = e.clientY;
    const desk = el.parentElement!.getBoundingClientRect();
    let rect = { x: win.x, y: win.y, w: win.w, h: win.h };
    let restored = !(win.max || win.snap);
    let moved = false;
    let snap: 'left' | 'right' | 'max' | null = null;
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (!moved && Math.hypot(dx, dy) < 4) return;
      moved = true;
      if (!restored) {
        // Pull a maximised/snapped window out under the pointer, keeping the
        // grab point at the same fraction of the title bar.
        const frac = (startX - desk.left) / desk.width;
        rect = {
          ...rect,
          x: ev.clientX - desk.left - rect.w * frac,
          y: Math.max(0, ev.clientY - desk.top - 14),
        };
        restored = true;
        el.classList.remove('ds-os-win--max', 'ds-os-win--snap-left', 'ds-os-win--snap-right');
        useOs.setState((s) => ({
          windows: s.windows.map((w) => (w.id === win.id ? { ...w, max: false, snap: null } : w)),
        }));
      }
      const x = Math.min(Math.max(rect.x + dx, -rect.w + 80), desk.width - 80);
      const y = Math.min(Math.max(rect.y + dy, 0), desk.height - 30);
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      const px = ev.clientX - desk.left;
      const py = ev.clientY - desk.top;
      const next =
        py <= SNAP_EDGE
          ? 'max'
          : px <= SNAP_EDGE
            ? 'left'
            : px >= desk.width - SNAP_EDGE
              ? 'right'
              : null;
      if (next !== snap) {
        snap = next;
        setSnapPreview(next);
      }
    };
    const onUp = (ev: PointerEvent) => {
      target.releasePointerCapture(ev.pointerId);
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerup', onUp);
      target.removeEventListener('pointercancel', onUp);
      setSnapPreview(null);
      if (!moved) return;
      if (snap && def.resizable !== false) {
        sfx.swoosh();
        setSnap(win.id, snap);
        // Keep the free-floating rect for when it is dragged back out.
        const x = parseFloat(el.style.left);
        const y = parseFloat(el.style.top);
        setRect(win.id, {
          x: Number.isFinite(x) ? x : rect.x,
          y: Number.isFinite(y) ? Math.max(0, y) : rect.y,
        });
        return;
      }
      setRect(win.id, {
        x: parseFloat(el.style.left),
        y: parseFloat(el.style.top),
        w: rect.w,
        h: rect.h,
      });
    };
    target.addEventListener('pointermove', onMove);
    target.addEventListener('pointerup', onUp);
    target.addEventListener('pointercancel', onUp);
  };

  // ── Drag to resize ────────────────────────────────────────────────────────
  const onResizeDown = (dir: Dir) => (e: RPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const el = ref.current;
    if (!el) return;
    focus(win.id);
    const desk = el.parentElement!.getBoundingClientRect();
    const start = { x: win.x, y: win.y, w: win.w, h: win.h };
    const sx = e.clientX;
    const sy = e.clientY;
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    const out = { ...start };
    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - sx;
      const dy = ev.clientY - sy;
      if (dir.includes('e')) out.w = Math.min(Math.max(minW, start.w + dx), desk.width - start.x);
      if (dir.includes('s')) out.h = Math.min(Math.max(minH, start.h + dy), desk.height - start.y);
      if (dir.includes('w')) {
        const w = Math.max(minW, start.w - dx);
        out.x = Math.max(0, start.x + (start.w - w));
        out.w = start.x + start.w - out.x;
      }
      if (dir.includes('n')) {
        const h = Math.max(minH, start.h - dy);
        out.y = Math.max(0, start.y + (start.h - h));
        out.h = start.y + start.h - out.y;
      }
      el.style.left = `${out.x}px`;
      el.style.top = `${out.y}px`;
      el.style.width = `${out.w}px`;
      el.style.height = `${out.h}px`;
    };
    const onUp = (ev: PointerEvent) => {
      target.releasePointerCapture(ev.pointerId);
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerup', onUp);
      target.removeEventListener('pointercancel', onUp);
      setRect(win.id, out);
    };
    target.addEventListener('pointermove', onMove);
    target.addEventListener('pointerup', onUp);
    target.addEventListener('pointercancel', onUp);
  };

  const App = def.component;
  const style =
    maximised || snapped
      ? { zIndex: win.z }
      : { zIndex: win.z, left: win.x, top: win.y, width: win.w, height: win.h };

  return (
    <motion.div
      ref={ref}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      tabIndex={-1}
      data-app={win.app}
      className={cn(
        'ds-os-win',
        active && 'ds-os-win--active',
        maximised && 'ds-os-win--max',
        snapped === 'left' && 'ds-os-win--snap-left',
        snapped === 'right' && 'ds-os-win--snap-right',
        compact && 'ds-os-win--compact',
        win.min && 'ds-os-win--min',
      )}
      style={style}
      initial={{ opacity: 0, scale: 0.94, y: 12 }}
      animate={win.min ? { opacity: 0, scale: 0.6, y: 220 } : { opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.94, transition: { duration: 0.14 } }}
      transition={{ type: 'spring', stiffness: 520, damping: 38, mass: 0.7 }}
      onPointerDownCapture={() => {
        if (!active) focus(win.id);
      }}
      aria-hidden={win.min || undefined}
      inert={win.min || undefined}
    >
      <div className="win7 ds-win-frame" aria-hidden="true">
        <div className={cn('window glass', active && 'active')} />
      </div>
      <div className="win7 ds-os-head">
        {/* The title bar drags the window; the buttons inside it opt out. Every
            action here also has a captioned button, so it needs no role. */}
        {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
        <div
          className={cn('title-bar', active && 'active')}
          onPointerDown={onTitlePointerDown}
          onDoubleClick={(e) => {
            if ((e.target as HTMLElement).closest('button') || compact || def.resizable === false)
              return;
            sfx.swoosh();
            if (win.snap) setSnap(win.id, null);
            else toggleMax(win.id);
          }}
        >
          <div className="title-bar-text ds-os-title">
            <Icon name={def.icon} size={16} />
            <h2 id={titleId}>{title}</h2>
          </div>
          <div className="title-bar-controls">
            <button
              type="button"
              className="is-minimize"
              aria-label={t('win-minimize', { defaultValue: 'Minimize window' })}
              onClick={() => {
                sfx.swoosh();
                minimize(win.id);
              }}
            />
            {!compact && def.resizable !== false && (
              <button
                type="button"
                className={win.max || win.snap ? 'is-restore' : 'is-maximize'}
                aria-label={
                  win.max || win.snap
                    ? t('win-restore', { defaultValue: 'Restore window' })
                    : t('win-maximize', { defaultValue: 'Maximize window' })
                }
                onClick={() => {
                  sfx.swoosh();
                  if (win.snap) setSnap(win.id, null);
                  else toggleMax(win.id);
                }}
              />
            )}
            <button
              type="button"
              className="is-close"
              aria-label={t('win-close', { defaultValue: 'Close window' })}
              onClick={doClose}
            />
          </div>
        </div>
      </div>
      <div className={cn('ds-os-body', def.flush && 'ds-os-body--flush')}>
        <Suspense fallback={<BusySpinner label={t('loading-app', { defaultValue: 'Loading…' })} />}>
          <App win={win} />
        </Suspense>
      </div>
      {resizable &&
        DIRS.map((dir) => (
          <div
            key={dir}
            className={`ds-os-resize ds-os-resize--${dir}`}
            onPointerDown={onResizeDown(dir)}
            aria-hidden="true"
          />
        ))}
    </motion.div>
  );
}

/** Windows' area, the Aero Snap preview, and the windows themselves. */
export function WindowLayer({ compact }: { compact: boolean }) {
  const windows = useOs((s) => s.windows);
  const activeId = useOs((s) => s.activeId);
  const snapPreview = useOs((s) => s.snapPreview);
  const peek = useOs((s) => s.peek);
  return (
    <div
      className={cn('ds-os-windows', peek && 'ds-os-windows--peek')}
      style={{ bottom: TASKBAR_H }}
    >
      {snapPreview && (
        <div className={`ds-snap-preview ds-snap-preview--${snapPreview}`} aria-hidden="true" />
      )}
      <AnimatePresence>
        {windows.map((w) => (
          <Window key={w.id} win={w} active={w.id === activeId} compact={compact} />
        ))}
      </AnimatePresence>
    </div>
  );
}
