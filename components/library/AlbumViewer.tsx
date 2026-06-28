'use client';

/**
 * AlbumViewer — fullscreen carousel viewer for a library album.
 *
 * Reimplements the alexpics gallery experience natively (no external lightbox
 * dependency): one image/video at a time, shuffled on load, with
 *   • prev / next via arrows, keyboard (←/→), and swipe
 *   • pinch-free zoom for images (wheel, double-click, drag-to-pan)
 *   • inline video playback (autoplay, loop, controls)
 *   • share (Web Share API w/ copy-link fallback) and download per slide
 *   • a thumbnail strip for quick jumping
 *
 * The project doesn't run the React Compiler, so hot event listeners read their
 * dependencies through a "latest" ref (liveRef) instead of resubscribing, and
 * the 85-item strip is a memoized child fed the stable `setState` setter.
 */

import { memo, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { useNavigate } from '@tanstack/react-router';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Play,
  Share2,
  Shuffle,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Album, AlbumSlide } from '@/lib/albums';
import './album-viewer.css';

const MAX_SCALE = 6;
const SWIPE_THRESHOLD = 60; // px before a horizontal drag counts as a swipe

/** Fisher–Yates shuffle returning the index order [0..n). */
function shuffledOrder(n: number): number[] {
  const order = Array.from({ length: n }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

export function AlbumViewer({ album }: { album: Album }) {
  const { t } = useTranslation('library');
  const navigate = useNavigate();
  const slides = album.slides;

  // Identity order on the server + first client render (no hydration mismatch),
  // then shuffle once mounted so each visit is a fresh random order.
  const [order, setOrder] = useState<number[]>(() => slides.map((_, i) => i));
  const [pos, setPos] = useState(0);

  // Zoom / pan state (images only).
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [swipeDX, setSwipeDX] = useState(0);
  const [grabbing, setGrabbing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const stageRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    startX: number;
    startY: number;
    offX: number;
    offY: number;
    mode: 'pan' | 'swipe';
  } | null>(null);

  const slide: AlbumSlide | undefined = slides[order[pos] ?? 0];

  // Shuffle once mounted.
  useEffect(() => {
    setOrder(shuffledOrder(slides.length));
    setPos(0);
  }, [slides.length]);

  // Reset zoom + swipe whenever the slide changes.
  useEffect(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
    setSwipeDX(0);
  }, [pos]);

  // Keep the active thumbnail in view.
  useEffect(() => {
    const active = stripRef.current?.querySelector<HTMLElement>('[data-active="true"]');
    active?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [pos]);

  // Toast auto-dismiss.
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 1800);
    return () => window.clearTimeout(id);
  }, [toast]);

  function go(dir: -1 | 1) {
    setPos((p) => (p + dir + slides.length) % slides.length);
  }

  function close() {
    void navigate({ to: '/library' });
  }

  function clampOffset(x: number, y: number, s: number) {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return { x, y };
    const maxX = ((s - 1) * rect.width) / 2;
    const maxY = ((s - 1) * rect.height) / 2;
    return { x: clamp(x, -maxX, maxX), y: clamp(y, -maxY, maxY) };
  }

  // Zoom toward a point in client coordinates (keeps that point stationary).
  function zoomAt(next: number, clientX: number, clientY: number) {
    const rect = stageRef.current?.getBoundingClientRect();
    const nextScale = clamp(next, 1, MAX_SCALE);
    if (!rect) {
      setScale(nextScale);
      return;
    }
    const cx = clientX - rect.left - rect.width / 2;
    const cy = clientY - rect.top - rect.height / 2;
    setOffset((prev) => {
      if (nextScale <= 1) return { x: 0, y: 0 };
      const ratio = nextScale / scale;
      return clampOffset(cx - (cx - prev.x) * ratio, cy - (cy - prev.y) * ratio, nextScale);
    });
    setScale(nextScale);
  }

  // Zoom about the stage centre (toolbar + keyboard).
  function zoomBy(factor: number) {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    zoomAt(scale * factor, rect.left + rect.width / 2, rect.top + rect.height / 2);
  }

  // Hot event listeners read the latest closures/state through this ref so they
  // can be attached once (empty-deps effects) without going stale.
  const liveRef = useRef({ go, close, zoomBy, zoomAt, scale, isImage: slide?.type === 'image' });
  useEffect(() => {
    liveRef.current = { go, close, zoomBy, zoomAt, scale, isImage: slide?.type === 'image' };
  });

  // Keyboard navigation.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const f = liveRef.current;
      if (e.key === 'ArrowLeft') f.go(-1);
      else if (e.key === 'ArrowRight') f.go(1);
      else if (e.key === 'Escape') f.close();
      else if (e.key === '+' || e.key === '=') f.zoomBy(1.3);
      else if (e.key === '-' || e.key === '_') f.zoomBy(1 / 1.3);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Non-passive wheel listener so we can preventDefault while zooming.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const onWheel = (e: WheelEvent) => {
      const w = liveRef.current;
      if (!w.isImage) return;
      e.preventDefault();
      w.zoomAt(w.scale * (e.deltaY < 0 ? 1.18 : 1 / 1.18), e.clientX, e.clientY);
    };
    stage.addEventListener('wheel', onWheel, { passive: false });
    return () => stage.removeEventListener('wheel', onWheel);
  }, []);

  function onPointerDown(e: React.PointerEvent) {
    if (slide?.type !== 'image') return; // let video controls receive the event
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = {
      startX: e.clientX,
      startY: e.clientY,
      offX: offset.x,
      offY: offset.y,
      mode: scale > 1 ? 'pan' : 'swipe',
    };
    setGrabbing(true);
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    if (d.mode === 'pan') {
      setOffset(clampOffset(d.offX + dx, d.offY + (e.clientY - d.startY), scale));
    } else {
      setSwipeDX(dx);
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    const d = drag.current;
    drag.current = null;
    setGrabbing(false);
    if (!d) return;
    if (d.mode === 'swipe') {
      const dx = e.clientX - d.startX;
      setSwipeDX(0);
      if (dx <= -SWIPE_THRESHOLD) go(1);
      else if (dx >= SWIPE_THRESHOLD) go(-1);
    }
  }

  function onDoubleClick(e: React.MouseEvent) {
    if (slide?.type !== 'image') return;
    if (scale > 1) {
      setScale(1);
      setOffset({ x: 0, y: 0 });
    } else {
      zoomAt(2.5, e.clientX, e.clientY);
    }
  }

  function reshuffle() {
    setOrder(shuffledOrder(slides.length));
    setPos(0);
  }

  function absoluteUrl(src: string) {
    return typeof window === 'undefined' ? src : new URL(src, window.location.origin).href;
  }

  async function share() {
    if (!slide) return;
    const url = absoluteUrl(slide.src);
    try {
      if (navigator.share) {
        await navigator.share({ title: album.title, text: album.title, url });
        return;
      }
    } catch {
      return; // user dismissed the share sheet
    }
    try {
      await navigator.clipboard.writeText(url);
      setToast(t('album-link-copied', { defaultValue: 'Link copied' }));
    } catch {
      setToast(t('album-share-failed', { defaultValue: 'Could not share' }));
    }
  }

  function download() {
    if (!slide) return;
    const a = document.createElement('a');
    a.href = slide.src;
    a.download = slide.download;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  if (!slide) return null;

  const isZoomed = scale > 1;
  const dragging = drag.current !== null;
  const imgTransform = `translate(${offset.x + swipeDX}px, ${offset.y}px) scale(${scale})`;

  return (
    <div className="av" role="dialog" aria-modal="true" aria-label={album.title}>
      <header className="av__bar av__bar--top">
        <div className="av__title-group">
          <button type="button" className="av__btn" onClick={close} aria-label={t('album-close', { defaultValue: 'Close' })}>
            <X size={18} />
          </button>
          <div className="av__titles">
            <span className="av__title">{album.title}</span>
            <span className="av__counter">
              {pos + 1} / {slides.length}
            </span>
          </div>
        </div>
        <div className="av__tools">
          {slide.type === 'image' && (
            <>
              <button type="button" className="av__btn" onClick={() => zoomBy(1 / 1.3)} disabled={!isZoomed} aria-label={t('album-zoom-out', { defaultValue: 'Zoom out' })}>
                <ZoomOut size={18} />
              </button>
              <button type="button" className="av__btn" onClick={() => zoomBy(1.3)} aria-label={t('album-zoom-in', { defaultValue: 'Zoom in' })}>
                <ZoomIn size={18} />
              </button>
            </>
          )}
          <button type="button" className="av__btn" onClick={reshuffle} aria-label={t('album-shuffle', { defaultValue: 'Shuffle' })}>
            <Shuffle size={18} />
          </button>
          <button type="button" className="av__btn" onClick={share} aria-label={t('album-share', { defaultValue: 'Share' })}>
            <Share2 size={18} />
          </button>
          <button type="button" className="av__btn" onClick={download} aria-label={t('album-download', { defaultValue: 'Download' })}>
            <Download size={18} />
          </button>
        </div>
      </header>

      <div
        ref={stageRef}
        className="av__stage"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={onDoubleClick}
      >
        {slide.type === 'image' ? (
          <img
            key={order[pos]}
            src={slide.src}
            alt={slide.alt}
            className={[
              'av__img',
              isZoomed ? 'is-zoomed' : '',
              grabbing ? 'is-grabbing' : '',
              dragging || swipeDX ? 'is-active' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            style={{ transform: imgTransform }}
            draggable={false}
          />
        ) : (
          <video
            key={order[pos]}
            className="av__video"
            src={slide.src}
            controls
            autoPlay
            loop
            playsInline
            preload="auto"
          />
        )}

        <button type="button" className="av__nav av__nav--prev" onClick={() => go(-1)} aria-label={t('album-prev', { defaultValue: 'Previous' })}>
          <ChevronLeft size={28} />
        </button>
        <button type="button" className="av__nav av__nav--next" onClick={() => go(1)} aria-label={t('album-next', { defaultValue: 'Next' })}>
          <ChevronRight size={28} />
        </button>

        {toast && <div className="av__toast">{toast}</div>}
      </div>

      <AlbumStrip
        slides={slides}
        order={order}
        pos={pos}
        onJump={setPos}
        stripRef={stripRef}
        thumbnailsLabel={t('album-thumbnails', { defaultValue: 'Thumbnails' })}
      />
    </div>
  );
}

/**
 * Bottom thumbnail strip. Memoized + fed the stable `setPos` setter so it only
 * re-renders when the slide order or active position actually changes (not on
 * every pan/zoom frame).
 */
const AlbumStrip = memo(function AlbumStrip({
  slides,
  order,
  pos,
  onJump,
  stripRef,
  thumbnailsLabel,
}: {
  slides: AlbumSlide[];
  order: number[];
  pos: number;
  onJump: Dispatch<SetStateAction<number>>;
  stripRef: React.RefObject<HTMLDivElement | null>;
  thumbnailsLabel: string;
}) {
  return (
    <div className="av__strip" ref={stripRef} role="tablist" aria-label={thumbnailsLabel}>
      {order.map((slideIdx, p) => {
        const s = slides[slideIdx];
        const active = p === pos;
        return (
          <button
            key={slideIdx}
            type="button"
            role="tab"
            aria-selected={active}
            data-active={active}
            className={`av__thumb ${active ? 'is-active' : ''}`}
            onClick={() => onJump(p)}
            aria-label={s.alt}
          >
            {s.type === 'image' ? (
              <img src={s.thumb} alt="" loading="lazy" draggable={false} />
            ) : (
              <span className="av__thumb-video">
                <Play size={16} />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
});
