import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { pct } from '@/components/study/OcclusionReview';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { clamp01 } from '@/lib/core/math';
import type { CardImage } from '@/lib/study/card-images';
import {
  OCCLUSION_LABEL_MAX,
  OCCLUSION_MAX_MASKS,
  OCCLUSION_MIN_SIZE,
  boxFromDrag,
  dragCorner,
  nextMaskId,
  nudgeBox,
  resizeBox,
  type Corner,
  type Occlusion,
  type OcclusionMask,
  type OcclusionMode,
} from '@/lib/study/occlusion';

/** One arrow key press moves a mask by this share of the picture (1 %). */
const STEP = 0.01;
/** A drag shorter than this (either way) is a click, not a new mask. */
const MIN_DRAG = OCCLUSION_MIN_SIZE;

const CORNERS: readonly { corner: Corner; className: string }[] = [
  { corner: 'nw', className: 'left-0 top-0 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize' },
  { corner: 'ne', className: 'right-0 top-0 translate-x-1/2 -translate-y-1/2 cursor-nesw-resize' },
  { corner: 'sw', className: 'bottom-0 left-0 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize' },
  { corner: 'se', className: 'bottom-0 right-0 translate-x-1/2 translate-y-1/2 cursor-nwse-resize' },
];

type Drag =
  | { kind: 'new'; origin: { x: number; y: number }; box: { x: number; y: number; w: number; h: number } }
  | { kind: 'move'; id: number; grab: { x: number; y: number } }
  | { kind: 'resize'; id: number; corner: Corner };

/**
 * The occlusion editor (s09-03): the front picture with a draw surface over it, and a list of the masks beside it.
 *
 * Drag on the picture to add a mask, drag a mask to move it and its corners to resize it (pointer events, so mouse,
 * pen and touch alike; nothing animates). With a mask selected, the arrow keys nudge it by 1 %, Shift with the arrows
 * resizes it and Delete removes it; those keys are bound only while the draw surface (or a mask's number button in the
 * list) has focus, and none is one of the site's shortcuts. Every mask is also editable from the list with the keyboard
 * alone: "Add mask" makes one, its number selects it, its label field names it, and the buttons move and delete it.
 * Masks are positioned elements over the `<img>` (no canvas on the site tier, B3). A mask's `id` is the largest one
 * ever handed out plus one, never reused, so each keeps its generated card (and its review history) across edits.
 */
export function OcclusionEditor({
  image,
  value,
  onChange,
  showErrors,
}: {
  image: CardImage;
  value: Occlusion;
  onChange: (next: Occlusion) => void;
  /** The form was submitted: mark an unlabelled mask as the problem. */
  showErrors: boolean;
}) {
  const { t } = useTranslation('occlusion-cards');
  const uid = useId();
  const surfaceRef = useRef<HTMLDivElement>(null);
  const imageBoxRef = useRef<HTMLDivElement>(null);
  const labelRefs = useRef(new Map<number, HTMLInputElement>());
  // The highest id ever given in this editor, so a mask drawn after another is deleted never reuses its id.
  const idFloor = useRef(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [focusId, setFocusId] = useState<number | null>(null);

  const masks = value.masks;
  const selectedIndex = masks.findIndex((m) => m.id === selected);
  const full = masks.length >= OCCLUSION_MAX_MASKS;

  // A new mask's label field takes focus once its row exists (a direct focus, never a frame callback).
  useEffect(() => {
    if (focusId === null) return;
    labelRefs.current.get(focusId)?.focus();
    setFocusId(null);
  }, [focusId, masks.length]);

  const setMasks = (next: OcclusionMask[]) => onChange({ mode: value.mode, masks: next });
  const patchMask = (id: number, patch: Partial<OcclusionMask>) =>
    setMasks(masks.map((m) => (m.id === id ? { ...m, ...patch } : m)));

  function addMask(box: { x: number; y: number; w: number; h: number }) {
    if (full) return;
    const id = nextMaskId(masks, idFloor.current);
    idFloor.current = id;
    setMasks([...masks, { id, ...box, label: '' }]);
    setSelected(id);
    setFocusId(id);
  }

  function removeMask(id: number) {
    const at = masks.findIndex((m) => m.id === id);
    setMasks(masks.filter((m) => m.id !== id));
    setSelected(null);
    // Keep the keyboard where it was: the row that took the removed one's place, or the surface.
    const after = masks[at + 1] ?? masks[at - 1];
    if (after) setSelected(after.id);
    else surfaceRef.current?.focus();
  }

  function moveMask(id: number, by: -1 | 1) {
    const at = masks.findIndex((m) => m.id === id);
    const to = at + by;
    if (at < 0 || to < 0 || to >= masks.length) return;
    const next = masks.slice();
    const [item] = next.splice(at, 1);
    if (item) next.splice(to, 0, item);
    setMasks(next);
  }

  /** A point of the picture, 0 to 1 each way, from a pointer event. */
  function pointOf(e: PointerEvent): { x: number; y: number } | null {
    const rect = imageBoxRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return null;
    return { x: clamp01((e.clientX - rect.left) / rect.width), y: clamp01((e.clientY - rect.top) / rect.height) };
  }

  function onSurfaceDown(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0 || full) return;
    const p = pointOf(e);
    if (!p) return;
    surfaceRef.current?.focus();
    surfaceRef.current?.setPointerCapture(e.pointerId);
    setSelected(null);
    setDrag({ kind: 'new', origin: p, box: { x: p.x, y: p.y, w: 0, h: 0 } });
  }

  function onMaskDown(e: PointerEvent<HTMLElement>, mask: OcclusionMask) {
    if (e.button !== 0) return;
    e.stopPropagation();
    const p = pointOf(e);
    if (!p) return;
    surfaceRef.current?.focus();
    surfaceRef.current?.setPointerCapture(e.pointerId);
    setSelected(mask.id);
    setDrag({ kind: 'move', id: mask.id, grab: { x: p.x - mask.x, y: p.y - mask.y } });
  }

  function onHandleDown(e: PointerEvent<HTMLElement>, mask: OcclusionMask, corner: Corner) {
    if (e.button !== 0) return;
    e.stopPropagation();
    surfaceRef.current?.focus();
    surfaceRef.current?.setPointerCapture(e.pointerId);
    setSelected(mask.id);
    setDrag({ kind: 'resize', id: mask.id, corner });
  }

  function onSurfaceMove(e: PointerEvent<HTMLDivElement>) {
    if (!drag) return;
    const p = pointOf(e);
    if (!p) return;
    if (drag.kind === 'new') {
      const raw = {
        x: Math.min(drag.origin.x, p.x),
        y: Math.min(drag.origin.y, p.y),
        w: Math.abs(p.x - drag.origin.x),
        h: Math.abs(p.y - drag.origin.y),
      };
      setDrag({ ...drag, box: raw });
      return;
    }
    const mask = masks.find((m) => m.id === drag.id);
    if (!mask) return;
    if (drag.kind === 'move') {
      const moved = nudgeBox(mask, p.x - drag.grab.x - mask.x, p.y - drag.grab.y - mask.y);
      patchMask(mask.id, { x: moved.x, y: moved.y });
    } else {
      const next = dragCorner(mask, drag.corner, p);
      patchMask(mask.id, { x: next.x, y: next.y, w: next.w, h: next.h });
    }
  }

  function endDrag(e: PointerEvent<HTMLDivElement>, commit: boolean) {
    if (surfaceRef.current?.hasPointerCapture(e.pointerId)) surfaceRef.current.releasePointerCapture(e.pointerId);
    if (drag?.kind === 'new' && commit && drag.box.w >= MIN_DRAG && drag.box.h >= MIN_DRAG) {
      addMask(
        boxFromDrag({ x: drag.box.x, y: drag.box.y }, { x: drag.box.x + drag.box.w, y: drag.box.y + drag.box.h }),
      );
    }
    setDrag(null);
  }

  /** Arrow keys nudge the selected mask, Shift with them resizes it, Delete removes it; nothing else is taken. */
  function onKeys(e: KeyboardEvent<HTMLElement>) {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const mask = masks.find((m) => m.id === selected);
    if (!mask) return;
    const arrow: Record<string, [number, number]> = {
      ArrowLeft: [-STEP, 0],
      ArrowRight: [STEP, 0],
      ArrowUp: [0, -STEP],
      ArrowDown: [0, STEP],
    };
    const delta = arrow[e.key];
    if (delta) {
      e.preventDefault();
      const next = e.shiftKey ? resizeBox(mask, delta[0], delta[1]) : nudgeBox(mask, delta[0], delta[1]);
      patchMask(mask.id, { x: next.x, y: next.y, w: next.w, h: next.h });
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      removeMask(mask.id);
    }
  }

  const hintId = `${uid}-hint`;
  const surfaceLabel =
    selectedIndex >= 0
      ? t('surface-label-selected', {
          defaultValue:
            'Picture with masks. Mask {{n}} of {{of}} is selected: arrow keys move it, Shift with the arrow keys resizes it, Delete removes it.',
          n: selectedIndex + 1,
          of: masks.length,
        })
      : t('surface-label', {
          defaultValue: 'Picture with masks. Select a mask in the list, or drag on the picture to add one.',
        });
  const modes: { id: OcclusionMode; label: string; hint: string }[] = [
    {
      id: 'hide-all',
      label: t('mode-hide-all', { defaultValue: 'Hide all masks' }),
      hint: t('mode-hide-all-hint', {
        defaultValue: 'Every mask is covered, and one is asked. The others stay covered after the answer.',
      }),
    },
    {
      id: 'hide-one',
      label: t('mode-hide-one', { defaultValue: 'Hide one mask' }),
      hint: t('mode-hide-one-hint', {
        defaultValue: 'Only the mask being asked is covered; the rest of the picture shows.',
      }),
    },
  ];
  const mode = modes.find((m) => m.id === value.mode) ?? modes[0];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${uid}-mode`}>{t('mode-label', { defaultValue: 'Mode' })}</Label>
        <Select
          id={`${uid}-mode`}
          value={value.mode}
          onChange={(e) => onChange({ mode: e.target.value === 'hide-one' ? 'hide-one' : 'hide-all', masks })}
        >
          {modes.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </Select>
        <p className="t-meta">{mode?.hint}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="flex min-w-0 flex-col gap-2">
          {/* The draw surface: a picture (S4), focusable for the keyboard, pointer events for mouse, pen and touch. */}
          <div
            ref={surfaceRef}
            role="application"
            tabIndex={0}
            aria-label={surfaceLabel}
            aria-describedby={hintId}
            onKeyDown={onKeys}
            onPointerDown={onSurfaceDown}
            onPointerMove={onSurfaceMove}
            onPointerUp={(e) => endDrag(e, true)}
            onPointerCancel={(e) => endDrag(e, false)}
            className="flex touch-none select-none justify-center overflow-hidden rounded-site border border-site-border bg-site-bg-subtle"
          >
            <div ref={imageBoxRef} className="relative inline-block max-w-full">
              <img
                src={image.url}
                alt={image.alt}
                draggable={false}
                className="block max-h-[60vh] w-auto max-w-full cursor-crosshair"
              />
              {masks.map((m, i) => {
                const isSelected = m.id === selected;
                return (
                  <div
                    key={m.id}
                    aria-hidden="true"
                    data-mask-id={m.id}
                    onPointerDown={(e) => onMaskDown(e, m)}
                    className={`absolute cursor-move border-2 ${isSelected ? 'border-site-text' : 'border-site-text-muted'}`}
                    style={{
                      left: pct(m.x),
                      top: pct(m.y),
                      width: pct(m.w),
                      height: pct(m.h),
                    }}
                  >
                    <span className="t-meta absolute left-0 top-0 bg-site-text px-1 text-site-bg">{i + 1}</span>
                    {isSelected &&
                      CORNERS.map((c) => (
                        <span
                          key={c.corner}
                          onPointerDown={(e) => onHandleDown(e, m, c.corner)}
                          className={`absolute size-3 border border-site-text bg-site-bg ${c.className}`}
                        />
                      ))}
                  </div>
                );
              })}
              {drag?.kind === 'new' && (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute border-2 border-dashed border-site-text"
                  style={{
                    left: pct(drag.box.x),
                    top: pct(drag.box.y),
                    width: pct(drag.box.w),
                    height: pct(drag.box.h),
                  }}
                />
              )}
            </div>
          </div>
          <p id={hintId} className="t-meta">
            {t('draw-hint', {
              defaultValue:
                'Drag on the picture to add a mask. Drag a mask to move it and its corners to resize it. With a mask selected, the arrow keys move it by 1 %, Shift with the arrow keys resizes it, and Delete removes it.',
            })}
          </p>
        </div>

        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="t-label">{t('masks-heading', { defaultValue: 'Masks' })}</h3>
            <span className="t-meta" dir="ltr">
              {masks.length} / {OCCLUSION_MAX_MASKS}
            </span>
          </div>
          {masks.length === 0 && (
            <p className="t-meta">
              {t('no-masks', { defaultValue: 'No masks yet. Drag on the picture, or press Add mask.' })}
            </p>
          )}
          <ol className="border-t border-site-border">
            {masks.map((m, i) => {
              const missing = showErrors && m.label.trim() === '';
              const errorId = `${uid}-label-${m.id}-error`;
              return (
                <li key={m.id} className="flex flex-wrap items-start gap-1 border-b border-site-border py-2">
                  <Button
                    type="button"
                    variant={m.id === selected ? 'default' : 'ghost'}
                    size="icon-sm"
                    aria-pressed={m.id === selected}
                    aria-label={t('select-mask', { defaultValue: 'Select mask {{n}}', n: i + 1 })}
                    onClick={() => setSelected(m.id)}
                    onKeyDown={onKeys}
                  >
                    {i + 1}
                  </Button>
                  {/* At least 10rem for the label: on a phone, in a card being edited, the move and delete
                      buttons wrap under it rather than squeezing it to a few letters. */}
                  <div className="flex min-w-40 flex-1 flex-col gap-1">
                    <Input
                      ref={(el) => {
                        if (el) labelRefs.current.set(m.id, el);
                        else labelRefs.current.delete(m.id);
                      }}
                      dir="auto"
                      value={m.label}
                      maxLength={OCCLUSION_LABEL_MAX}
                      aria-label={t('label-field', { defaultValue: 'Label for mask {{n}}', n: i + 1 })}
                      aria-invalid={missing || undefined}
                      aria-describedby={missing ? errorId : undefined}
                      placeholder={t('label-placeholder', { defaultValue: 'What is covered' })}
                      onFocus={() => setSelected(m.id)}
                      onChange={(e) => patchMask(m.id, { label: e.target.value })}
                    />
                    {missing && (
                      <p id={errorId} role="alert" className="t-meta text-site-danger">
                        {t('label-required', { defaultValue: 'Label this mask' })}
                      </p>
                    )}
                  </div>
                  <IconButton
                    icon={ArrowUp}
                    label={t('move-up', { defaultValue: 'Move mask {{n}} up', n: i + 1 })}
                    disabled={i === 0}
                    onClick={() => moveMask(m.id, -1)}
                  />
                  <IconButton
                    icon={ArrowDown}
                    label={t('move-down', { defaultValue: 'Move mask {{n}} down', n: i + 1 })}
                    disabled={i === masks.length - 1}
                    onClick={() => moveMask(m.id, 1)}
                  />
                  <IconButton
                    icon={Trash2}
                    label={t('delete-mask', { defaultValue: 'Delete mask {{n}}', n: i + 1 })}
                    onClick={() => removeMask(m.id)}
                  />
                </li>
              );
            })}
          </ol>
          <div>
            <Button
              type="button"
              variant="default"
              disabled={full}
              onClick={() => addMask({ x: 0.35, y: 0.4, w: 0.3, h: 0.2 })}
            >
              <Plus aria-hidden />
              {t('add-mask', { defaultValue: 'Add mask' })}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
