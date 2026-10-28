/**
 * Moving and arranging a block's panels.
 *
 * A tool works out where each panel should end up on screen (`desired`, in scene
 * pixels). `planWrites` then turns that into edits to the files: it keeps each
 * panel's own anchoring (`shiftPosition`) and does not move a panel twice when it
 * rides on another one that is moving too (a child of a moved panel, or a panel
 * pinned to a moved sibling).
 */

import { kvSet } from '../kv/edit';
import { kvAt } from '../kv/query';
import { shiftPosition } from '../layout/inverse';
import { parseCached } from '../scene/build';
import type { PanelNode } from '../scene/types';
import { propsOfMember, writeKeyFor, type BlockOpts, type TextReader } from './apply';

export interface Delta {
  dx: number;
  dy: number;
}

export type Axis = 'x' | 'y';
export type AlignMode = 'left' | 'right' | 'top' | 'bottom' | 'centerH' | 'centerV';

const right = (n: PanelNode) => n.rect.x + n.rect.w;
const bottom = (n: PanelNode) => n.rect.y + n.rect.h;

export function boundsOf(nodes: readonly PanelNode[]) {
  const x = Math.min(...nodes.map((n) => n.rect.x));
  const y = Math.min(...nodes.map((n) => n.rect.y));
  return {
    x,
    y,
    w: Math.max(...nodes.map(right)) - x,
    h: Math.max(...nodes.map(bottom)) - y,
  };
}

export function moveBy(nodes: readonly PanelNode[], dx: number, dy: number): Map<string, Delta> {
  return new Map(nodes.map((n) => [n.id, { dx, dy }]));
}

export function align(nodes: readonly PanelNode[], mode: AlignMode): Map<string, Delta> {
  const out = new Map<string, Delta>();
  if (nodes.length < 2) return out;
  const b = boundsOf(nodes);
  for (const n of nodes) {
    let dx = 0;
    let dy = 0;
    if (mode === 'left') dx = b.x - n.rect.x;
    if (mode === 'right') dx = b.x + b.w - right(n);
    if (mode === 'centerH') dx = b.x + b.w / 2 - (n.rect.x + n.rect.w / 2);
    if (mode === 'top') dy = b.y - n.rect.y;
    if (mode === 'bottom') dy = b.y + b.h - bottom(n);
    if (mode === 'centerV') dy = b.y + b.h / 2 - (n.rect.y + n.rect.h / 2);
    out.set(n.id, { dx, dy });
  }
  return out;
}

const startOf = (n: PanelNode, axis: Axis) => (axis === 'x' ? n.rect.x : n.rect.y);
const sizeOf = (n: PanelNode, axis: Axis) => (axis === 'x' ? n.rect.w : n.rect.h);
const delta = (axis: Axis, d: number): Delta =>
  axis === 'x' ? { dx: d, dy: 0 } : { dx: 0, dy: d };

/** Equal gaps between panels along an axis; the outermost two stay where they are. */
export function distribute(nodes: readonly PanelNode[], axis: Axis): Map<string, Delta> {
  const out = new Map<string, Delta>();
  if (nodes.length < 3) return out;
  const sorted = [...nodes].sort((a, b) => startOf(a, axis) - startOf(b, axis));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const span = startOf(last, axis) + sizeOf(last, axis) - startOf(first, axis);
  const inner = sorted.reduce((s, n) => s + sizeOf(n, axis), 0);
  const gap = (span - inner) / (sorted.length - 1);
  let cursor = startOf(first, axis);
  for (const n of sorted) {
    out.set(n.id, delta(axis, cursor - startOf(n, axis)));
    cursor += sizeOf(n, axis) + gap;
  }
  return out;
}

/** Lay panels end to end along an axis with a fixed gap (in scene pixels), keeping the first in place. */
export function stack(nodes: readonly PanelNode[], axis: Axis, gapPx: number): Map<string, Delta> {
  const out = new Map<string, Delta>();
  if (nodes.length < 2) return out;
  const sorted = [...nodes].sort((a, b) => startOf(a, axis) - startOf(b, axis));
  let cursor = startOf(sorted[0], axis);
  for (const n of sorted) {
    out.set(n.id, delta(axis, cursor - startOf(n, axis)));
    cursor += sizeOf(n, axis) + gapPx;
  }
  return out;
}

export interface FileEdit {
  file: string;
  path: string[];
  key: 'xpos' | 'ypos';
  value: string;
}

/**
 * Per-panel position writes for `desired` shifts. A panel that rides on another
 * moving panel is written only the difference, so the pair ends up where the tool
 * asked rather than moving twice.
 */
export function planWrites(
  members: readonly PanelNode[],
  scene: { nodes: readonly PanelNode[] },
  desired: ReadonlyMap<string, Delta>,
  io: TextReader,
  opts: BlockOpts,
): Map<string, Delta> {
  const byId = new Map(scene.nodes.map((n) => [n.id, n]));
  const memberIds = new Set(members.map((m) => m.id));

  /** The panel this one is positioned from, when that panel is also being moved. */
  const carrier = (n: PanelNode): string | null => {
    if (!n.isFrame) {
      const text = io.read(n.file);
      const entry = text === undefined ? undefined : kvAt(parseCached(text), n.keyPath);
      const pin = entry?.children
        ? propsOfMember(text!, { path: n.keyPath }, opts)?.get('pin_to_sibling')?.toLowerCase()
        : undefined;
      if (pin) {
        const target = scene.nodes.find(
          (s) =>
            s.file === n.file &&
            s.parentId === n.parentId &&
            s.keyPath[s.keyPath.length - 1]?.toLowerCase() === pin,
        );
        if (target) return memberIds.has(target.id) ? target.id : ridesOn(target.id);
      }
    }
    return ridesOn(n.parentId);
  };
  /** Nearest ancestor (or the panel itself) that is a moving member. */
  const ridesOn = (id: string | null): string | null => {
    let cur = id;
    for (let guard = 0; cur && guard < 64; guard++) {
      if (memberIds.has(cur)) return cur;
      cur = byId.get(cur)?.parentId ?? null;
    }
    return null;
  };

  const writes = new Map<string, Delta>();
  const effective = new Map<string, Delta>();
  const resolving = new Set<string>();
  const effectiveOf = (n: PanelNode): Delta => {
    const cached = effective.get(n.id);
    if (cached) return cached;
    if (resolving.has(n.id)) return { dx: 0, dy: 0 };
    resolving.add(n.id);
    const want = desired.get(n.id) ?? { dx: 0, dy: 0 };
    const c = carrier(n);
    const carried = c && c !== n.id ? effectiveOf(byId.get(c)!) : { dx: 0, dy: 0 };
    const write = { dx: want.dx - carried.dx, dy: want.dy - carried.dy };
    writes.set(n.id, write);
    resolving.delete(n.id);
    const eff = { dx: want.dx, dy: want.dy };
    effective.set(n.id, eff);
    return eff;
  };
  for (const n of members) effectiveOf(n);
  return writes;
}

/** Turn pixel writes into edited file texts (positions only; each panel keeps its anchoring). */
export function applyWrites(
  members: readonly PanelNode[],
  writes: ReadonlyMap<string, Delta>,
  scale: number,
  io: TextReader,
  opts: BlockOpts,
): Record<string, string> {
  const texts = new Map<string, string>();
  const changed = new Set<string>();
  for (const n of members) {
    const w = writes.get(n.id);
    if (!w || (Math.abs(w.dx) < 0.5 && Math.abs(w.dy) < 0.5)) continue;
    let text = texts.get(n.file) ?? io.read(n.file);
    if (text === undefined) continue;
    const props = propsOfMember(text, { path: n.keyPath }, opts);
    if (!props) continue;
    const dxv = w.dx / scale;
    const dyv = w.dy / scale;
    for (const [base, d] of [
      ['xpos', dxv],
      ['ypos', dyv],
    ] as const) {
      if (Math.abs(d) < 0.5) continue;
      const key = writeKeyFor(props, base, opts.minmode);
      text = kvSet(text, [...n.keyPath, key], shiftPosition(props.get(key), d), { env: opts.env });
    }
    texts.set(n.file, text);
    changed.add(n.file);
  }
  return Object.fromEntries([...changed].map((f) => [f, texts.get(f)!]));
}
