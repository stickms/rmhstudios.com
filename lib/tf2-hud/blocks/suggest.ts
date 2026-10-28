/**
 * Finding groups worth making into blocks on the page being edited: panels of the
 * same kind that look alike (same colours, font and border) and sit near each
 * other. Pure: it reads the scene and the files, and proposes; nothing is written.
 */

import { kindOf } from '../scene/build';
import type { PanelNode, Scene } from '../scene/types';
import { propsOfMember, seedShared, type BlockOpts, type TextReader } from './apply';
import { memberKey, type Block, type BlockMember } from './types';

export interface Suggestion {
  id: string;
  name: string;
  members: BlockMember[];
  nodeIds: string[];
  shared: Record<string, string>;
  mixed: string[];
}

/** Properties that make two panels look the same. */
const LOOK_KEYS = [
  'font',
  'fgcolor',
  'fgcolor_override',
  'bgcolor_override',
  'defaultfgcolor_override',
  'border',
  'PaintBackgroundType',
  'drawcolor',
] as const;

const KIND_LABEL: Record<string, string> = {
  label: 'Labels',
  image: 'Images',
  progress: 'Progress bars',
  button: 'Buttons',
};

/** A group bigger than this is a coincidence of styling, not something the author laid out together. */
const MAX_GROUP = 12;
const MIN_GROUP = 3;
/** Sizes within this many virtual units count as the same size. */
const SIZE_STEP = 16;

function gapBetween(a: PanelNode, b: PanelNode): number {
  const dx = Math.max(
    0,
    Math.max(a.rect.x, b.rect.x) - Math.min(a.rect.x + a.rect.w, b.rect.x + b.rect.w),
  );
  const dy = Math.max(
    0,
    Math.max(a.rect.y, b.rect.y) - Math.min(a.rect.y + a.rect.h, b.rect.y + b.rect.h),
  );
  return Math.hypot(dx, dy);
}

export const toMember = (n: PanelNode): BlockMember => ({
  file: n.file,
  path: n.keyPath,
  pinned: [],
});

export function suggestSimilar(
  scene: Scene,
  io: TextReader,
  opts: BlockOpts,
  existing: readonly Block[],
): Suggestion[] {
  const taken = new Set(existing.flatMap((b) => b.members.map((m) => memberKey(m).toLowerCase())));
  const scale = scene.screen.h / 480;
  const buckets = new Map<string, PanelNode[]>();

  for (const n of scene.nodes) {
    if (!n.shown || n.isFrame) continue;
    const kind = kindOf(n.control);
    if (!(kind in KIND_LABEL)) continue;
    if (taken.has(memberKey({ file: n.file, path: n.keyPath }).toLowerCase())) continue;
    const text = io.read(n.file);
    const props = text === undefined ? undefined : propsOfMember(text, { path: n.keyPath }, opts);
    if (!props) continue;
    const look = LOOK_KEYS.map((k) => props.get(k)?.trim() ?? '').join('|');
    const size = `${Math.round(n.rect.w / (SIZE_STEP * scale))}x${Math.round(n.rect.h / (SIZE_STEP * scale))}`;
    const sig = `${kind}|${n.control.toLowerCase()}|${size}|${look}`;
    const list = buckets.get(sig) ?? [];
    list.push(n);
    buckets.set(sig, list);
  }

  const out: Suggestion[] = [];
  for (const [sig, nodes] of buckets) {
    if (nodes.length < MIN_GROUP) continue;
    // Connected components: panels within a short gap of one another.
    const parent = nodes.map((_, i) => i);
    const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const reach = Math.max(16 * scale, 0.75 * Math.min(nodes[i].rect.h, nodes[j].rect.h));
        if (gapBetween(nodes[i], nodes[j]) <= reach) parent[find(i)] = find(j);
      }
    }
    const groups = new Map<number, PanelNode[]>();
    nodes.forEach((n, i) => {
      const r = find(i);
      groups.set(r, [...(groups.get(r) ?? []), n]);
    });
    for (const group of groups.values()) {
      if (group.length < MIN_GROUP || group.length > MAX_GROUP) continue;
      const members = group.map(toMember);
      const { shared, mixed } = seedShared(members, io, opts);
      const kind = sig.split('|')[0];
      out.push({
        id: `similar:${group[0].id}`,
        name: `${KIND_LABEL[kind]} (${group.length})`,
        members,
        nodeIds: group.map((n) => n.id),
        shared,
        mixed,
      });
    }
  }
  return out.sort((a, b) => b.members.length - a.members.length);
}
