'use client';

/**
 * Book3DViewer — pick a book up and look at it.
 *
 * The shelf shows a cover: a rectangle with a picture on it. A book is not a
 * rectangle. This is the same volume as a real object — six faces, front and
 * back boards, a printed spine, and a block of pages on the other three sides —
 * that the viewer can turn over and inspect from any angle.
 *
 * Two inputs drive one object:
 *  - **The phone itself.** `useDeviceAttitude` reports where the handset is
 *    pointing; the book holds its place in the world while the device becomes
 *    the eye, so moving round to the book's right brings its fore-edge into
 *    view and carrying on brings the back cover. This is the point of the
 *    screen — everything else is the fallback.
 *  - **Drag / arrow keys.** For desktops, for anyone who has switched motion
 *    off, and for the last stretch of a turn a wrist can't reach. Composed on
 *    top of the sensor rather than instead of it, so the two never fight.
 *
 * Rendered with CSS 3D rather than WebGL deliberately: this mounts on the
 * library index, where a three.js chunk would be a large regression, and the
 * cover art and spine type stay real DOM — crisp at any zoom, translatable, and
 * themable through the ordinary `--site-*` tokens.
 *
 * Nothing here re-renders per frame: both inputs write one `transform` on the
 * body element.
 */

import { useCallback, useEffect, useRef } from 'react';
import { Link } from '@tanstack/react-router';
import { BookOpen, Crosshair, Rotate3d, Smartphone, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { IDENTITY, fromAxisAngle, multiply, toCssMatrix3d, type Quat } from '@/lib/device-attitude';
import { useDeviceAttitude } from '@/hooks/useDeviceAttitude';
import type { LibraryBook } from '@/lib/library/library';
import './book-3d.css';

const DEG = Math.PI / 180;

/** Screen axes in the rotation frame: dragging spins about these. */
const SCREEN_UP: readonly [number, number, number] = [0, 1, 0];
const SCREEN_RIGHT: readonly [number, number, number] = [1, 0, 0];

/** Degrees of turn per pixel dragged — a comfortable half-screen half-turn. */
const DRAG_SENSITIVITY = 0.42;
/** Degrees per arrow-key press. */
const KEY_STEP = 12;

/**
 * The pose the book opens in: a three-quarter view showing the front cover and
 * a slice of the spine, so it reads as a solid object before anyone touches it.
 */
const OPENING_POSE: Quat = multiply(
  fromAxisAngle(SCREEN_UP, 26 * DEG),
  fromAxisAngle(SCREEN_RIGHT, 7 * DEG),
);

/**
 * Spine thickness in px, from the page count — a pamphlet and a 900-page thesis
 * should not be the same object. Bounded at both ends so a book with no page
 * count still has a spine worth reading and a huge one stays a book.
 */
function spineDepth(pages: number): number {
  return Math.round(Math.min(58, Math.max(14, pages * 0.055)));
}

export function Book3DViewer({ book, onClose }: { book: LibraryBook; onClose: () => void }) {
  const { t } = useTranslation('library');
  const bodyRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // The scrim is a viewport-covering backdrop-filter and this component turns a
  // book above it every frame, which makes Chromium re-blur the whole scrim per
  // frame. That used to need `useFrostedOverlay()` to stand the pointer metaball
  // down — the drop was the *other* thing moving above the scrim, and the two
  // together were a standing 6x frame-time cost. The metaball layer is gone (see
  // components/radial/README.md), so the book is the only thing turning up
  // there now and the hook went with it. Keep it that way: nothing else should
  // animate above this scrim.

  // The two inputs, kept out of React state: they change up to 60×/second and
  // the only thing that has to happen is one style write.
  const sensor = useRef<Quat>(IDENTITY);
  const manual = useRef<Quat>(OPENING_POSE);

  const paint = useCallback(() => {
    const el = bodyRef.current;
    if (el) el.style.transform = toCssMatrix3d(multiply(manual.current, sensor.current));
  }, []);

  const attitude = useDeviceAttitude({
    onRotate: (rotation) => {
      sensor.current = rotation;
      paint();
    },
    onRest: () => {
      sensor.current = IDENTITY;
      paint();
    },
  });

  // A keyboard press or a recentre moves the book in one jump, so those ease;
  // the sensor and drag paths write a transform every frame and must not.
  const stepTimer = useRef(0);
  const ease = useCallback(() => {
    const el = bodyRef.current;
    if (!el) return;
    el.classList.add('is-stepping');
    window.clearTimeout(stepTimer.current);
    stepTimer.current = window.setTimeout(() => el.classList.remove('is-stepping'), 220);
  }, []);
  useEffect(() => () => window.clearTimeout(stepTimer.current), []);

  // Rotate about a screen axis. Left-multiplying keeps the axis fixed to the
  // screen, which is what "drag right turns it right" means however far the
  // book has already been turned.
  const spin = useCallback(
    (axis: readonly [number, number, number], degrees: number) => {
      manual.current = multiply(fromAxisAngle(axis, degrees * DEG), manual.current);
      paint();
    },
    [paint],
  );

  const recenter = useCallback(() => {
    ease();
    manual.current = OPENING_POSE;
    attitude.recenter();
    paint();
  }, [attitude, ease, paint]);

  useEffect(paint, [paint]);

  // Escape closes; focus starts on the close button and goes back where it came
  // from, so opening the viewer from a shelf book returns you to that book.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [onClose]);

  // The stage fills the screen and is dragged on, so the page behind it must not
  // scroll underneath.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  const drag = useRef<{ id: number; x: number; y: number } | null>(null);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const from = drag.current;
    if (!from || from.id !== event.pointerId) return;
    // Turntable: the surface under the finger travels with it, so dragging right
    // brings the book's left-hand side (its spine) round to face you.
    spin(SCREEN_UP, (event.clientX - from.x) * DRAG_SENSITIVITY);
    spin(SCREEN_RIGHT, (event.clientY - from.y) * DRAG_SENSITIVITY);
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (drag.current?.id === event.pointerId) drag.current = null;
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const keyed: Record<string, () => void> = {
      ArrowLeft: () => spin(SCREEN_UP, -KEY_STEP),
      ArrowRight: () => spin(SCREEN_UP, KEY_STEP),
      ArrowUp: () => spin(SCREEN_RIGHT, -KEY_STEP),
      ArrowDown: () => spin(SCREEN_RIGHT, KEY_STEP),
      Home: recenter,
    };
    const action = keyed[event.key];
    if (!action) return;
    event.preventDefault();
    if (event.key !== 'Home') ease();
    action();
  };

  async function toggleMotion() {
    const next = await attitude.toggle();
    if (next === 'denied') {
      toast.info(
        t('book3d-motion-denied', {
          defaultValue: 'Motion access was declined. You can allow it in your browser settings.',
        }),
      );
    }
  }

  const motionLive = attitude.enabled && attitude.status === 'active';
  const hint = motionLive
    ? t('book3d-motion-hint', { defaultValue: 'Move your phone to look around the book.' })
    : t('book3d-drag-hint', { defaultValue: 'Drag to turn the book, or use the arrow keys.' });

  const style = {
    '--b3d-depth': `${spineDepth(book.pages)}px`,
    '--book-hue': String(book.hue),
  } as React.CSSProperties;

  return (
    <div
      // `.glass-scrim` is the shared dialog-backdrop material (§5.1) — the
      // library stays visible and frosted behind the book rather than being
      // painted over, which is what makes it read as lifted off the shelf.
      className="b3d glass-scrim"
      role="dialog"
      aria-modal="true"
      aria-label={t('book3d-open', { title: book.title, defaultValue: 'View {{title}} in 3D' })}
    >
      <header className="b3d__bar">
        <div className="b3d__heading">
          <Rotate3d size={16} aria-hidden="true" />
          <p className="b3d__title">{book.title}</p>
        </div>
        <button
          type="button"
          ref={closeRef}
          className="b3d__icon-btn"
          onClick={onClose}
          aria-label={t('book3d-close', { defaultValue: 'Close 3D view' })}
        >
          <X size={18} aria-hidden="true" />
        </button>
      </header>

      <div
        className="b3d__stage"
        style={style}
        tabIndex={0}
        role="application"
        aria-label={t('book3d-stage', {
          title: book.title,
          defaultValue: '3D model of {{title}}. Drag or use the arrow keys to turn it.',
        })}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
      >
        <div className="b3d__body" ref={bodyRef}>
          <div className="b3d__face b3d__face--front">
            {book.coverUrl ? (
              <img className="b3d__art" src={book.coverUrl} alt="" loading="eager" />
            ) : (
              <span className="b3d__cover-title">{book.title}</span>
            )}
            <span className="b3d__hinge" aria-hidden="true" />
          </div>

          <div className="b3d__face b3d__face--back">
            <span className="b3d__mark" aria-hidden="true">
              RMH
            </span>
            <span className="b3d__imprint">{book.format.toUpperCase()}</span>
          </div>

          <div className="b3d__face b3d__face--spine">
            <span className="b3d__spine-text">{book.title}</span>
          </div>

          <div className="b3d__face b3d__face--edge" aria-hidden="true" />
          <div className="b3d__face b3d__face--head" aria-hidden="true" />
          <div className="b3d__face b3d__face--tail" aria-hidden="true" />
        </div>
        <div className="b3d__shadow" aria-hidden="true" />
      </div>

      <footer className="b3d__controls">
        <p className="b3d__hint" aria-live="polite">
          {hint}
        </p>
        <div className="b3d__actions">
          {attitude.supported && (
            <button
              type="button"
              className={`b3d__btn${attitude.enabled ? ' is-active' : ''}`}
              onClick={toggleMotion}
              aria-pressed={attitude.enabled}
            >
              <Smartphone size={15} aria-hidden="true" />
              {attitude.enabled
                ? t('book3d-motion-on', { defaultValue: 'Motion on' })
                : t('book3d-motion-off', { defaultValue: 'Motion off' })}
            </button>
          )}
          <button type="button" className="b3d__btn" onClick={recenter}>
            <Crosshair size={15} aria-hidden="true" />
            {t('book3d-recenter', { defaultValue: 'Recentre' })}
          </button>
          <Link
            to="/library/$slug"
            params={{ slug: book.slug }}
            className="b3d__btn b3d__btn--primary"
          >
            <BookOpen size={15} aria-hidden="true" />
            {t('book3d-read', { defaultValue: 'Open reader' })}
          </Link>
        </div>
      </footer>
    </div>
  );
}
