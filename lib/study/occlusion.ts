/**
 * Picture-occlusion flashcards (s09-03), the pure half: rectangles over a card's front picture, one generated card
 * per rectangle. Client-safe and free of zod (the zod schemas are in `occlusion-schema.ts`).
 *
 * A mask is `{ id, x, y, w, h, label }` in picture-relative units (0 to 1, at least 0.02 wide and tall). Its `id` is a
 * stable integer, assigned as the largest id in use plus one when the mask is drawn and never reused; list order is
 * display only. A generated sibling stores its mask's `id` in `clozeIndex`, so the sibling key (`c<id>`) matches a
 * sibling to its mask across label edits and reorders and the member's review history stays.
 */

import { clamp } from '@/lib/core/math';

/** Most masks on one card (each is a generated card). */
export const OCCLUSION_MAX_MASKS = 20;
/** Smallest width and height of a mask, as a share of the picture. */
export const OCCLUSION_MIN_SIZE = 0.02;
/** Longest label (the answer). */
export const OCCLUSION_LABEL_MAX = 200;
/** Largest mask id (the column is a 32-bit integer; ids stay far below it). */
const MASK_ID_MAX = 1_000_000;
/** Coordinates are kept to four decimals. */
const PRECISION = 10_000;
/** Float slack when a mask touches the picture's edge. */
const EDGE_SLACK = 1e-6;

export const OCCLUSION_MODES = ['hide-all', 'hide-one'] as const;
export type OcclusionMode = (typeof OCCLUSION_MODES)[number];

export interface OcclusionMask {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
}

export interface Occlusion {
  mode: OcclusionMode;
  masks: OcclusionMask[];
}

export type OcclusionError =
  | 'not-object'
  | 'bad-mode'
  | 'no-masks'
  | 'too-many-masks'
  | 'bad-mask'
  | 'bad-id'
  | 'duplicate-id'
  | 'bad-label'
  | 'out-of-bounds'
  | 'too-small';

const round = (n: number): number => Math.round(n * PRECISION) / PRECISION;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** The id the next drawn mask takes: one past the largest in use or ever handed out (`floor`). 1 for none. */
export function nextMaskId(masks: readonly Pick<OcclusionMask, 'id'>[], floor = 0): number {
  let max = Math.max(0, floor);
  for (const m of masks) max = Math.max(max, m.id);
  return max + 1;
}

/**
 * Check an occlusion value (stored, from the editor or from the API) and return it normalised: labels trimmed,
 * coordinates rounded to four decimals, a mask with no `id` given the next free one (largest + 1, in list order).
 * The one rule set the editor, the zod schemas and the server all use.
 */
export function checkOcclusion(
  value: unknown,
): { ok: true; occlusion: Occlusion } | { ok: false; error: OcclusionError } {
  if (!isRecord(value)) return { ok: false, error: 'not-object' };
  const mode = value.mode;
  if (mode !== 'hide-all' && mode !== 'hide-one') return { ok: false, error: 'bad-mode' };
  const list = value.masks;
  if (!Array.isArray(list) || list.length === 0) return { ok: false, error: 'no-masks' };
  if (list.length > OCCLUSION_MAX_MASKS) return { ok: false, error: 'too-many-masks' };
  const given = new Set<number>();
  let top = 0;
  for (const raw of list) {
    if (!isRecord(raw)) return { ok: false, error: 'bad-mask' };
    if (raw.id === undefined || raw.id === null) continue;
    const id = raw.id;
    if (typeof id !== 'number' || !Number.isInteger(id) || id < 1 || id > MASK_ID_MAX)
      return { ok: false, error: 'bad-id' };
    if (given.has(id)) return { ok: false, error: 'duplicate-id' };
    given.add(id);
    top = Math.max(top, id);
  }
  const masks: OcclusionMask[] = [];
  for (const raw of list as Record<string, unknown>[]) {
    const { x, y, w, h, label } = raw;
    if (![x, y, w, h].every((n) => typeof n === 'number' && Number.isFinite(n)))
      return { ok: false, error: 'bad-mask' };
    if (typeof label !== 'string') return { ok: false, error: 'bad-label' };
    const text = label.trim();
    if (text === '' || text.length > OCCLUSION_LABEL_MAX) return { ok: false, error: 'bad-label' };
    const box = { x: round(x as number), y: round(y as number), w: round(w as number), h: round(h as number) };
    if (box.x < 0 || box.y < 0 || box.x + box.w > 1 + EDGE_SLACK || box.y + box.h > 1 + EDGE_SLACK) {
      return { ok: false, error: 'out-of-bounds' };
    }
    if (box.w < OCCLUSION_MIN_SIZE - EDGE_SLACK || box.h < OCCLUSION_MIN_SIZE - EDGE_SLACK) {
      return { ok: false, error: 'too-small' };
    }
    const id = typeof raw.id === 'number' ? raw.id : ++top;
    masks.push({ id, ...box, label: text });
  }
  return { ok: true, occlusion: { mode, masks } };
}

/** A stored value read back, or null when it is not a valid occlusion (a damaged row is no card, never a crash). */
export function readOcclusion(value: unknown): Occlusion | null {
  const checked = checkOcclusion(value);
  return checked.ok ? checked.occlusion : null;
}

/** Whether two occlusions are the same (mode, and masks in order with the same ids, boxes and labels). */
export function sameOcclusion(a: Occlusion | null | undefined, b: Occlusion | null | undefined): boolean {
  if (!a || !b) return !a && !b;
  return (
    a.mode === b.mode &&
    a.masks.length === b.masks.length &&
    a.masks.every((m, i) => {
      const o = b.masks[i];
      return !!o && m.id === o.id && m.x === o.x && m.y === o.y && m.w === o.w && m.h === o.h && m.label === o.label;
    })
  );
}

/** The sibling an occlusion card generates for one mask: its prompt, the mask's label as the answer, and the mask id. */
export interface OcclusionSibling {
  key: string;
  kind: 'occlusion';
  front: string;
  back: string;
  clozeIndex: number;
}

/** The generated cards of an occlusion card: one per mask, keyed `c<id>` (the same shape as a cloze sibling's key). */
export function occlusionSiblings(front: string, occlusion: Occlusion | null | undefined): OcclusionSibling[] {
  if (!occlusion) return [];
  return occlusion.masks.map((m) => ({
    key: `c${m.id}`,
    kind: 'occlusion' as const,
    front,
    back: m.label,
    clozeIndex: m.id,
  }));
}

/** How a mask is drawn on one review card. */
export type MaskState =
  /** The mask being asked: filled in the ink colour and outlined. */
  | 'target'
  /** Another mask in hide-all mode: filled in the muted colour. */
  | 'covered';

export interface DrawnMask {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  state: MaskState;
}

/**
 * The masks to draw over the picture for the card asking `targetId`. Before the reveal the target is covered, and in
 * hide-all mode every other mask is too; on the reveal the target mask lifts (it is not drawn) and the others stay.
 * In hide-one mode only the target is ever covered.
 */
export function maskLayout(occlusion: Occlusion, targetId: number, reveal: boolean): DrawnMask[] {
  const out: DrawnMask[] = [];
  for (const m of occlusion.masks) {
    const box = { id: m.id, x: m.x, y: m.y, w: m.w, h: m.h };
    if (m.id === targetId) {
      if (!reveal) out.push({ ...box, state: 'target' });
    } else if (occlusion.mode === 'hide-all') {
      out.push({ ...box, state: 'covered' });
    }
  }
  return out;
}

/** "Covered part N of M": N is the target's place in the mask list, 0 when the mask is gone. */
export function partOf(occlusion: Occlusion, targetId: number): { n: number; of: number } {
  const at = occlusion.masks.findIndex((m) => m.id === targetId);
  return { n: at + 1, of: occlusion.masks.length };
}

/** The label of the mask `targetId`, or null. */
export function labelOf(occlusion: Occlusion, targetId: number): string | null {
  return occlusion.masks.find((m) => m.id === targetId)?.label ?? null;
}

/** What a review card needs to draw an occlusion sibling. */
export interface OcclusionReviewData {
  mode: OcclusionMode;
  masks: OcclusionMask[];
  /** The id of the mask this card asks (the sibling's `clozeIndex`). */
  targetId: number;
  /** The authored card's note, shown after the reveal. Empty for none. */
  note: string;
}

/** The review data for a sibling: null when the source is not a valid occlusion or no longer holds the mask. */
export function reviewDataFor(
  source: { occlusion?: unknown; back?: string | null } | null | undefined,
  clozeIndex: number | null,
): OcclusionReviewData | null {
  if (!source || clozeIndex === null) return null;
  const occlusion = readOcclusion(source.occlusion);
  if (!occlusion || !occlusion.masks.some((m) => m.id === clozeIndex)) return null;
  return { mode: occlusion.mode, masks: occlusion.masks, targetId: clozeIndex, note: (source.back ?? '').trim() };
}

/* ------------------------------ editor geometry ----------------------------- */

/** A rectangle dragged out between two points (any direction), clamped to the picture and to the minimum size. */
export function boxFromDrag(
  a: { x: number; y: number },
  b: { x: number; y: number },
): { x: number; y: number; w: number; h: number } {
  const x0 = clamp(Math.min(a.x, b.x), 0, 1);
  const y0 = clamp(Math.min(a.y, b.y), 0, 1);
  const x1 = clamp(Math.max(a.x, b.x), 0, 1);
  const y1 = clamp(Math.max(a.y, b.y), 0, 1);
  const w = Math.max(OCCLUSION_MIN_SIZE, x1 - x0);
  const h = Math.max(OCCLUSION_MIN_SIZE, y1 - y0);
  return { x: round(Math.min(x0, 1 - w)), y: round(Math.min(y0, 1 - h)), w: round(w), h: round(h) };
}

/** Move a mask by `(dx, dy)` and keep it inside the picture. */
export function nudgeBox<T extends { x: number; y: number; w: number; h: number }>(box: T, dx: number, dy: number): T {
  return { ...box, x: round(clamp(box.x + dx, 0, 1 - box.w)), y: round(clamp(box.y + dy, 0, 1 - box.h)) };
}

/** Resize a mask from its top-left corner by `(dw, dh)`, within the picture and above the minimum size. */
export function resizeBox<T extends { x: number; y: number; w: number; h: number }>(box: T, dw: number, dh: number): T {
  return {
    ...box,
    w: round(clamp(box.w + dw, OCCLUSION_MIN_SIZE, 1 - box.x)),
    h: round(clamp(box.h + dh, OCCLUSION_MIN_SIZE, 1 - box.y)),
  };
}

/** The four handles a mask can be resized by. */
export type Corner = 'nw' | 'ne' | 'sw' | 'se';

/** Drag one corner of a mask to the point `p`; the opposite corner stays where it is. */
export function dragCorner<T extends { x: number; y: number; w: number; h: number }>(
  box: T,
  corner: Corner,
  p: { x: number; y: number },
): T {
  const fixedX = corner === 'nw' || corner === 'sw' ? box.x + box.w : box.x;
  const fixedY = corner === 'nw' || corner === 'ne' ? box.y + box.h : box.y;
  return { ...box, ...boxFromDrag({ x: fixedX, y: fixedY }, p) };
}
