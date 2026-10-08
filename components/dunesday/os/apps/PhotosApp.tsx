'use client';

/**
 * Windows Photo Viewer for the Dunesday 7 sandbox.
 *
 * Shows one picture from the sandboxed file system (`win.params.file`: a data
 * URL, PNG or SVG) with the Windows 7 furniture: a slim toolbar (Open in Paint,
 * Delete, Properties) and the glossy control bar along the bottom — zoom,
 * actual size / fit, previous / next among the pictures in the same folder,
 * slide show, rotate and delete. Wheel and pinch zoom; drag pans once the
 * picture is larger than the window. Arrow keys step through the folder.
 */

import {
  ChevronLeft,
  ChevronRight,
  Info,
  Maximize2,
  Paintbrush,
  Play,
  RotateCcw,
  RotateCw,
  Scan,
  Trash2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as RPointerEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import { children, extOf, pathOf, recycle } from '@/lib/dunesday/vfs';
import { cn } from '@/lib/utils';
import { sfx } from '../../sound';
import { isImage, openApp, showMessage } from '../actions';
import type { AppProps } from '../apps';
import { Icon } from '../icons';
import { useOs } from '../store';

const MIN_ZOOM = 0.05;
const MAX_ZOOM = 16;
const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
/** Slider position 0–100 ↔ zoom 5%–1600% on a log scale. */
const toSlider = (z: number) => (Math.log(z / MIN_ZOOM) / Math.log(MAX_ZOOM / MIN_ZOOM)) * 100;
const fromSlider = (v: number) => MIN_ZOOM * Math.pow(MAX_ZOOM / MIN_ZOOM, v / 100);

function approxBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(',');
  const body = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  return dataUrl.slice(0, comma).includes(';base64')
    ? Math.floor((body.length * 3) / 4)
    : decodeURIComponent(body).length;
}

export default function PhotosApp({ win }: AppProps) {
  const { t, i18n } = useTranslation('c-dunesday');
  const vfs = useOs((s) => s.vfs);
  const fs = useOs((s) => s.fs);
  const setTitle = useOs((s) => s.setTitle);
  const close = useOs((s) => s.close);

  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const showRef = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<
    null | { dist: number; zoom: number } | { x: number; y: number; px: number; py: number }
  >(null);

  const [fileId, setFileId] = useState<string | undefined>(win.params?.file);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [broken, setBroken] = useState(false);
  const [stage, setStage] = useState({ w: 0, h: 0 });
  const [zoom, setZoom] = useState<number | null>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [rot, setRot] = useState(0);
  const [slideshow, setSlideshow] = useState(false);
  const [info, setInfo] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const node = fileId ? vfs[fileId] : undefined;
  const valid = !!node && node.kind === 'file' && !!node.content?.startsWith('data:image/');

  const parentId = node?.parent;
  const siblings = useMemo(
    () => (parentId ? children(vfs, parentId).filter((n) => isImage(n) && n.content) : []),
    [vfs, parentId],
  );
  const index = node ? siblings.findIndex((n) => n.id === node.id) : -1;

  useEffect(() => {
    setTitle(
      win.id,
      node
        ? t('photos-title', { defaultValue: '{{name}} - Windows Photo Viewer', name: node.name })
        : t('app-photos', { defaultValue: 'Windows Photo Viewer' }),
    );
  }, [node, setTitle, t, win.id]);

  // A new picture starts fitted, upright and centred.
  useEffect(() => {
    setNatural(null);
    setBroken(false);
    setZoom(null);
    setPan({ x: 0, y: 0 });
    setRot(0);
  }, [fileId]);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setStage({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setStage({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, [slideshow]);

  const sideways = rot % 180 !== 0;
  const fit = useMemo(() => {
    if (!natural || !stage.w || !stage.h) return 1;
    const w = sideways ? natural.h : natural.w;
    const h = sideways ? natural.w : natural.h;
    return Math.min(1, (stage.w - 24) / w, (stage.h - 24) / h);
  }, [natural, stage, sideways]);
  const scale = zoom ?? fit;
  const canPan = scale > fit + 0.001;

  const step = useCallback(
    (dir: 1 | -1) => {
      if (siblings.length < 2 || index < 0) return;
      setFileId(siblings[(index + dir + siblings.length) % siblings.length].id);
    },
    [siblings, index],
  );

  const zoomBy = (k: number) => {
    setZoom(clampZoom(scale * k));
    setPan((p) => ({ x: p.x * k, y: p.y * k }));
  };

  const toggleActual = () => {
    if (zoom !== null && Math.abs(zoom - 1) < 0.001) setZoom(null);
    else setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // Slide show: every 3 seconds, the next picture in the folder.
  const stepRef = useRef(step);
  stepRef.current = step;
  useEffect(() => {
    if (!slideshow) return;
    showRef.current?.focus();
    const id = window.setInterval(() => stepRef.current(1), 3000);
    return () => window.clearInterval(id);
  }, [slideshow]);

  // Wheel zoom needs a non-passive listener to keep the page from scrolling.
  const wheelRef = useRef<(e: WheelEvent) => void>(() => {});
  wheelRef.current = (e: WheelEvent) => {
    if (!valid) return;
    e.preventDefault();
    zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15);
  };
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const on = (e: WheelEvent) => wheelRef.current(e);
    el.addEventListener('wheel', on, { passive: false });
    return () => el.removeEventListener('wheel', on);
  }, [slideshow]);

  // Keyboard: arrows step, +/- zoom, Delete deletes, Escape leaves the slide show.
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  keyRef.current = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement | null;
    if (target?.tagName === 'INPUT' || confirmDelete) return;
    if (e.key === 'Escape' && slideshow) setSlideshow(false);
    else if (e.key === 'ArrowRight' || (slideshow && e.key === ' ')) step(1);
    else if (e.key === 'ArrowLeft') step(-1);
    else if ((e.key === '+' || e.key === '=') && !slideshow) zoomBy(1.25);
    else if (e.key === '-' && !slideshow) zoomBy(0.8);
    else if (e.key === 'Delete' && valid && !slideshow) setConfirmDelete(true);
    else if (e.key === 'F11' && valid) setSlideshow((s) => !s);
    else return;
    e.preventDefault();
    e.stopPropagation();
  };
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const on = (e: KeyboardEvent) => keyRef.current(e);
    el.addEventListener('keydown', on);
    return () => el.removeEventListener('keydown', on);
  }, []);

  // Pointer: one finger / mouse pans when zoomed in; two fingers pinch-zoom.
  const onPointerDown = (e: RPointerEvent<HTMLDivElement>) => {
    if (!valid || e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    if (pts.length === 2) {
      gesture.current = {
        dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1,
        zoom: scale,
      };
    } else if (pts.length === 1) {
      gesture.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
    }
  };
  const onPointerMove = (e: RPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (!g) return;
    if ('dist' in g) {
      const pts = [...pointers.current.values()];
      if (pts.length < 2) return;
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      setZoom(clampZoom((g.zoom * d) / g.dist));
    } else if (canPan) {
      setPan({ x: g.px + e.clientX - g.x, y: g.py + e.clientY - g.y });
    }
  };
  const onPointerUp = (e: RPointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    const rest = [...pointers.current.entries()];
    gesture.current =
      rest.length === 1 ? { x: rest[0][1].x, y: rest[0][1].y, px: pan.x, py: pan.y } : null;
  };

  const doDelete = () => {
    if (!node) return;
    const err = fs((v) => recycle(v, node.id));
    setConfirmDelete(false);
    if (err) {
      showMessage({ icon: 'error', text: err.message });
      return;
    }
    sfx.undo();
    close(win.id);
  };

  const imgStyle = {
    width: natural?.w,
    height: natural?.h,
    transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px) rotate(${rot}deg) scale(${scale})`,
  };

  const picture = valid ? (
    <img
      key={node.id}
      src={node.content}
      alt={node.name}
      draggable={false}
      className={cn('ds-photos-img', !natural && 'is-loading')}
      style={natural ? imgStyle : undefined}
      onLoad={(e) => {
        const im = e.currentTarget;
        setNatural({ w: im.naturalWidth || 400, h: im.naturalHeight || 300 });
      }}
      onError={() => setBroken(true)}
      onDoubleClick={toggleActual}
    />
  ) : null;

  const missingText = t('photos-missing', {
    defaultValue:
      'Windows Photo Viewer can’t display this picture because the file is missing, empty or might be damaged.',
  });

  const pct = Math.round(scale * 100);
  const dateFmt = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  if (slideshow && valid) {
    return (
      <div ref={rootRef} className="ds-photos">
        <div
          ref={showRef}
          className="ds-photos-show"
          role="dialog"
          aria-modal="true"
          aria-label={t('photos-slideshow', { defaultValue: 'Play slide show' })}
          tabIndex={-1}
        >
          <div ref={stageRef} className="ds-photos-showstage">
            <img
              key={node.id}
              src={node.content}
              alt={node.name}
              className="ds-photos-showimg"
              draggable={false}
            />
          </div>
          <button
            type="button"
            className="ds-btn7 ds-photos-exit"
            onClick={() => setSlideshow(false)}
          >
            {t('photos-exit-slideshow', { defaultValue: 'Exit (Esc)' })}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="ds-photos" tabIndex={-1}>
      <div
        className="ds-photos-toolbar"
        role="toolbar"
        aria-label={t('photos-toolbar', { defaultValue: 'Picture tools' })}
      >
        <button
          type="button"
          className="ds-photos-tbtn"
          disabled={!valid}
          onClick={() => node && openApp('paint', { params: { file: node.id } })}
        >
          <Paintbrush size={14} aria-hidden="true" />
          {t('photos-open-paint', { defaultValue: 'Open in Paint' })}
        </button>
        <button
          type="button"
          className="ds-photos-tbtn"
          disabled={!valid}
          onClick={() => setConfirmDelete(true)}
        >
          <Trash2 size={14} aria-hidden="true" />
          {t('photos-delete', { defaultValue: 'Delete' })}
        </button>
        <button
          type="button"
          className={cn('ds-photos-tbtn', info && 'is-on')}
          aria-pressed={info}
          disabled={!node}
          onClick={() => setInfo((v) => !v)}
        >
          <Info size={14} aria-hidden="true" />
          {t('photos-properties', { defaultValue: 'Properties' })}
        </button>
      </div>

      <div className="ds-photos-body">
        <div
          ref={stageRef}
          className={cn('ds-photos-stage', canPan && 'is-pannable')}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {valid && !broken ? (
            picture
          ) : (
            <div className="ds-photos-missing" role="status">
              <Icon name="photos" size={48} />
              <p>{missingText}</p>
            </div>
          )}
        </div>

        {info && node && (
          <aside
            className="ds-photos-info"
            aria-label={t('photos-properties', { defaultValue: 'Properties' })}
          >
            <dl>
              <dt>{t('photos-info-name', { defaultValue: 'Name' })}</dt>
              <dd>{node.name}</dd>
              <dt>{t('photos-info-type', { defaultValue: 'Type' })}</dt>
              <dd>
                {t('photos-info-type-value', {
                  defaultValue: '{{ext}} image',
                  ext: extOf(node.name).toUpperCase() || '—',
                })}
              </dd>
              {natural && (
                <>
                  <dt>{t('photos-info-dimensions', { defaultValue: 'Dimensions' })}</dt>
                  <dd>
                    {t('photos-info-dimensions-value', {
                      defaultValue: '{{w}} × {{h}}',
                      w: natural.w,
                      h: natural.h,
                    })}
                  </dd>
                </>
              )}
              {node.content && (
                <>
                  <dt>{t('photos-info-size', { defaultValue: 'Size' })}</dt>
                  <dd>
                    {t('photos-info-size-value', {
                      defaultValue: '{{kb}} KB',
                      kb: Math.max(1, Math.round(approxBytes(node.content) / 1024)),
                    })}
                  </dd>
                </>
              )}
              <dt>{t('photos-info-modified', { defaultValue: 'Date modified' })}</dt>
              <dd>{dateFmt.format(node.modified)}</dd>
              <dt>{t('photos-info-location', { defaultValue: 'Location' })}</dt>
              <dd>{node.parent ? pathOf(vfs, node.parent) : '—'}</dd>
            </dl>
          </aside>
        )}
      </div>

      <div className="ds-photos-bar">
        <div className="ds-photos-zoom">
          <button
            type="button"
            className="ds-photos-cbtn"
            aria-label={t('photos-zoom-out', { defaultValue: 'Zoom out' })}
            title={t('photos-zoom-out', { defaultValue: 'Zoom out' })}
            disabled={!valid}
            onClick={() => zoomBy(0.8)}
          >
            <ZoomOut size={16} aria-hidden="true" />
          </button>
          <input
            type="range"
            className="ds-photos-slider"
            min={0}
            max={100}
            step={0.5}
            value={toSlider(scale)}
            disabled={!valid}
            aria-label={t('photos-zoom', { defaultValue: 'Zoom' })}
            aria-valuetext={`${pct}%`}
            onChange={(e) => {
              const next = clampZoom(fromSlider(Number(e.target.value)));
              setPan((p) => ({ x: (p.x * next) / scale, y: (p.y * next) / scale }));
              setZoom(next);
            }}
          />
          <button
            type="button"
            className="ds-photos-cbtn"
            aria-label={t('photos-zoom-in', { defaultValue: 'Zoom in' })}
            title={t('photos-zoom-in', { defaultValue: 'Zoom in' })}
            disabled={!valid}
            onClick={() => zoomBy(1.25)}
          >
            <ZoomIn size={16} aria-hidden="true" />
          </button>
          <span className="ds-photos-pct" aria-hidden="true">
            {pct}%
          </span>
        </div>

        <div className="ds-photos-nav">
          <button
            type="button"
            className="ds-photos-cbtn"
            aria-label={
              zoom === 1
                ? t('photos-fit', { defaultValue: 'Fit to window' })
                : t('photos-actual-size', { defaultValue: 'Actual size' })
            }
            title={
              zoom === 1
                ? t('photos-fit', { defaultValue: 'Fit to window' })
                : t('photos-actual-size', { defaultValue: 'Actual size' })
            }
            disabled={!valid}
            onClick={toggleActual}
          >
            {zoom === 1 ? (
              <Maximize2 size={16} aria-hidden="true" />
            ) : (
              <Scan size={16} aria-hidden="true" />
            )}
          </button>
          <button
            type="button"
            className="ds-photos-cbtn"
            aria-label={t('photos-previous', { defaultValue: 'Previous (Left Arrow)' })}
            title={t('photos-previous', { defaultValue: 'Previous (Left Arrow)' })}
            disabled={siblings.length < 2}
            onClick={() => step(-1)}
          >
            <ChevronLeft size={18} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="ds-photos-play"
            aria-label={t('photos-slideshow', { defaultValue: 'Play slide show' })}
            title={t('photos-slideshow', { defaultValue: 'Play slide show' })}
            disabled={!valid}
            onClick={() => setSlideshow(true)}
          >
            <Play size={20} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="ds-photos-cbtn"
            aria-label={t('photos-next', { defaultValue: 'Next (Right Arrow)' })}
            title={t('photos-next', { defaultValue: 'Next (Right Arrow)' })}
            disabled={siblings.length < 2}
            onClick={() => step(1)}
          >
            <ChevronRight size={18} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="ds-photos-cbtn"
            aria-label={t('photos-rotate-left', { defaultValue: 'Rotate counterclockwise' })}
            title={t('photos-rotate-left', { defaultValue: 'Rotate counterclockwise' })}
            disabled={!valid}
            onClick={() => {
              setRot((r) => r - 90);
              setPan({ x: 0, y: 0 });
            }}
          >
            <RotateCcw size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="ds-photos-cbtn"
            aria-label={t('photos-rotate-right', { defaultValue: 'Rotate clockwise' })}
            title={t('photos-rotate-right', { defaultValue: 'Rotate clockwise' })}
            disabled={!valid}
            onClick={() => {
              setRot((r) => r + 90);
              setPan({ x: 0, y: 0 });
            }}
          >
            <RotateCw size={16} aria-hidden="true" />
          </button>
        </div>

        <div className="ds-photos-end">
          <button
            type="button"
            className="ds-photos-cbtn ds-photos-cbtn--delete"
            aria-label={t('photos-delete', { defaultValue: 'Delete' })}
            title={t('photos-delete', { defaultValue: 'Delete' })}
            disabled={!valid}
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 size={16} aria-hidden="true" />
          </button>
        </div>
      </div>

      {confirmDelete && node && (
        <div
          className="ds-photos-modal"
          role="alertdialog"
          aria-modal="true"
          aria-label={t('photos-delete-file', { defaultValue: 'Delete File' })}
        >
          <div className="ds-photos-dialog">
            <div className="ds-photos-msg">
              <Icon name="recycle-full" size={36} />
              <p>
                {t('photos-confirm-delete', {
                  defaultValue: 'Are you sure you want to move “{{name}}” to the Recycle Bin?',
                  name: node.name,
                })}
              </p>
            </div>
            <div className="ds-photos-dialogbtns">
              <button
                type="button"
                className="ds-btn7"

                autoFocus
                onClick={doDelete}
              >
                {t('photos-yes', { defaultValue: 'Yes' })}
              </button>
              <button type="button" className="ds-btn7" onClick={() => setConfirmDelete(false)}>
                {t('photos-no', { defaultValue: 'No' })}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
