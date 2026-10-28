/**
 * Block operations against the open project. Each one reads the project, works out
 * the file edits with the pure engine, and commits the sidecar and the edited
 * panel files as ONE history step, so a single undo reverts a whole block edit.
 *
 * Client-side only (it talks to the editor store); the logic lives in the engine.
 */

import { useMemo } from 'react';
import { kvSet } from '../kv/edit';
import type { PanelNode, Scene } from '../scene/types';
import { COND_ENVS } from '../scheme/cond';
import { useEditor } from '../store';
import {
  addMembers,
  applyBlock,
  clearShared,
  driftOf,
  pinKey,
  propsOfMember,
  removeMember,
  seedShared,
  setShared,
  unpinKey,
  writeKeyFor,
  type BlockOpts,
  type Drift,
  type TextReader,
} from './apply';
import {
  align,
  applyWrites,
  distribute,
  moveBy,
  planWrites,
  stack,
  type AlignMode,
  type Axis,
  type Delta,
} from './arrange';
import { emptyBlocksDoc, parseBlocksDoc, serializeBlocksDoc } from './doc';
import { presetById } from './presets';
import { resolveRule, ruleFiles } from './rule';
import { toMember, type Suggestion } from './suggest';
import {
  BLOCKS_FILE,
  memberKey,
  sameMember,
  SHARABLE_KEYS,
  type Block,
  type BlockMember,
  type BlockRule,
  type BlocksDoc,
} from './types';

/** Keys seeded into a new block. `visible` and `zpos` stay out: they surprise more than they help. */
const SEED_KEYS = SHARABLE_KEYS.filter((k) => k !== 'visible' && k !== 'zpos');

const blockId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

function env() {
  const s = useEditor.getState();
  const io: TextReader = { read: (p) => s.readText(p) };
  const opts: BlockOpts = { env: COND_ENVS[s.view.env], minmode: s.view.minmode };
  return { s, io, opts };
}

/* ───────────── reading ───────────── */

const parsed = new WeakMap<object, BlocksDoc>();
const EMPTY = emptyBlocksDoc();

/** The project's blocks (re-parsed only when the sidecar file changes). */
export function useBlocksDoc(): BlocksDoc {
  const content = useEditor((s) => s.overlay.get(BLOCKS_FILE));
  return useMemo(() => {
    if (!content || content.kind !== 'text') return EMPTY;
    let doc = parsed.get(content);
    if (!doc) {
      doc = parseBlocksDoc(content.text);
      parsed.set(content, doc);
    }
    return doc;
  }, [content]);
}

export function readBlocksDoc(): BlocksDoc {
  const text = useEditor.getState().readText(BLOCKS_FILE);
  return text === undefined ? emptyBlocksDoc() : parseBlocksDoc(text);
}

export function blockOfMember(
  doc: BlocksDoc,
  m: Pick<BlockMember, 'file' | 'path'>,
): { block: Block; member: BlockMember } | undefined {
  for (const block of doc.blocks) {
    const member = block.members.find((x) => sameMember(x, m));
    if (member) return { block, member };
  }
  return undefined;
}

export const blockOfNode = (doc: BlocksDoc, n: Pick<PanelNode, 'file' | 'keyPath'>) =>
  blockOfMember(doc, { file: n.file, path: n.keyPath });

/** The scene panels that are members of `block`. */
export function nodesOfBlock(block: Block, scene: Scene | null): PanelNode[] {
  if (!scene) return [];
  return scene.nodes.filter((n) =>
    block.members.some((m) => sameMember(m, { file: n.file, path: n.keyPath })),
  );
}

/* ───────────── writing ───────────── */

function save(
  doc: BlocksDoc,
  label: string,
  files: Record<string, string> = {},
  coalesceKey?: string,
): void {
  useEditor
    .getState()
    .applyBatch(label, { ...files, [BLOCKS_FILE]: serializeBlocksDoc(doc) }, coalesceKey);
}

const replace = (doc: BlocksDoc, block: Block): BlocksDoc => ({
  ...doc,
  blocks: doc.blocks.map((b) => (b.id === block.id ? block : b)),
});

const find = (doc: BlocksDoc, id: string): Block | undefined => doc.blocks.find((b) => b.id === id);

/** Members not already in some other block (a panel follows at most one). */
function freeMembers(doc: BlocksDoc, members: readonly BlockMember[], except?: string) {
  const taken = new Set(
    doc.blocks
      .filter((b) => b.id !== except)
      .flatMap((b) => b.members.map((m) => memberKey(m).toLowerCase())),
  );
  const free = members.filter((m) => !taken.has(memberKey(m).toLowerCase()));
  return { free, skipped: members.length - free.length };
}

export interface CreateResult {
  block?: Block;
  skipped: number;
}

export function createBlock(
  name: string,
  members: readonly BlockMember[],
  extra: { rule?: BlockRule; preset?: string } = {},
): CreateResult {
  const { io, opts } = env();
  const doc = readBlocksDoc();
  const { free, skipped } = freeMembers(doc, members);
  if (free.length === 0) return { skipped };
  const { shared } = seedShared(free, io, opts, SEED_KEYS);
  const block: Block = { id: blockId(), name, members: free, shared, ...extra };
  save({ ...doc, blocks: [...doc.blocks, block] }, `New block "${name}"`);
  useEditor.getState().focusBlock(block.id);
  return { block, skipped };
}

export const createFromSuggestion = (sug: Suggestion): CreateResult =>
  createBlock(sug.name.replace(/\s*\(\d+\)$/, ''), sug.members);

/** Make a block from a built-in preset, fetching the HUD files it covers first. */
export async function createFromPreset(presetId: string): Promise<CreateResult> {
  const preset = presetById(presetId);
  if (!preset) return { skipped: 0 };
  const store = useEditor.getState();
  await store.ensureFiles(ruleFiles(preset.rule, store.paths()));
  const { opts } = env();
  const s = useEditor.getState();
  const members = resolveRule(preset.rule, s.paths(), s.readText, opts.env);
  return createBlock(preset.name, members, { rule: preset.rule, preset: preset.id });
}

/** Pick up panels a block's rule finds now that it did not before (a file was imported, say). */
export async function refreshFromRule(id: string): Promise<number> {
  const block = find(readBlocksDoc(), id);
  if (!block?.rule) return 0;
  const store = useEditor.getState();
  await store.ensureFiles(ruleFiles(block.rule, store.paths()));
  const { opts } = env();
  const s = useEditor.getState();
  const found = resolveRule(block.rule, s.paths(), s.readText, opts.env);
  return addToBlock(id, found);
}

/** Add panels to a block; they take on its shared look right away (undo reverts it). */
export function addToBlock(id: string, members: readonly BlockMember[]): number {
  const { io, opts } = env();
  const doc = readBlocksDoc();
  const block = find(doc, id);
  if (!block) return 0;
  const { free } = freeMembers(doc, members, id);
  const next = addMembers(block, free);
  if (next === block) return 0;
  save(replace(doc, next), `Add to block "${block.name}"`, applyBlock(next, io, opts));
  return next.members.length - block.members.length;
}

export function removeFromBlock(id: string, member: BlockMember): void {
  const doc = readBlocksDoc();
  const block = find(doc, id);
  if (!block) return;
  const next = removeMember(block, member);
  if (next.members.length === 0) {
    save({ ...doc, blocks: doc.blocks.filter((b) => b.id !== id) }, `Remove block "${block.name}"`);
    useEditor.getState().focusBlock(null);
  } else {
    save(replace(doc, next), `Remove from block "${block.name}"`);
  }
}

export function renameBlock(id: string, name: string): void {
  const doc = readBlocksDoc();
  const block = find(doc, id);
  if (!block || !name.trim()) return;
  save(replace(doc, { ...block, name: name.trim() }), `Rename block`, {}, `block-name:${id}`);
}

/** Delete the block only. Its panels keep every value they have. */
export function deleteBlock(id: string): void {
  const doc = readBlocksDoc();
  const block = find(doc, id);
  if (!block) return;
  save({ ...doc, blocks: doc.blocks.filter((b) => b.id !== id) }, `Delete block "${block.name}"`);
  if (useEditor.getState().focusedBlockId === id) useEditor.getState().focusBlock(null);
}

/** Set a shared value and write it to every member that follows the block. */
export function setBlockValue(id: string, key: string, value: string): void {
  const { io, opts } = env();
  const doc = readBlocksDoc();
  const block = find(doc, id);
  if (!block) return;
  const next = setShared(block, key, value);
  save(
    replace(doc, next),
    `Block "${block.name}": ${key}`,
    applyBlock(next, io, opts, [key]),
    `block:${id}:${key}`,
  );
}

/** Stop sharing a key. Members keep what they have. */
export function removeBlockKey(id: string, key: string): void {
  const doc = readBlocksDoc();
  const block = find(doc, id);
  if (!block) return;
  save(replace(doc, clearShared(block, key)), `Block "${block.name}": stop sharing ${key}`);
}

/**
 * Start sharing a key, starting from the value on `from` (the first member if omitted). Nothing is
 * written to the panels: the ones that differ show as such, and the author applies the value when ready.
 */
export function addBlockKey(id: string, key: string, from?: BlockMember): void {
  const { io, opts } = env();
  const doc = readBlocksDoc();
  const block = find(doc, id);
  if (!block) return;
  const src = from ?? block.members[0];
  const text = src ? io.read(src.file) : undefined;
  const value = (text && propsOfMember(text, src, opts)?.get(key)) ?? '';
  save(replace(doc, setShared(block, key, value)), `Block "${block.name}": share ${key}`);
}

/** Write one shared value into every panel that follows the block. */
export function applyBlockKey(id: string, key: string): void {
  const { io, opts } = env();
  const doc = readBlocksDoc();
  const block = find(doc, id);
  if (!block) return;
  save(doc, `Block "${block.name}": apply ${key}`, applyBlock(block, io, opts, [key]));
}

/** Write every shared value into every member again (after hand edits you want undone). */
export function reapplyBlock(id: string): void {
  const { io, opts } = env();
  const doc = readBlocksDoc();
  const block = find(doc, id);
  if (!block) return;
  save(doc, `Apply block "${block.name}"`, applyBlock(block, io, opts));
}

/**
 * An inspector edit on a panel that is in a block. `block` changes the block (and so every
 * panel that follows it); `panel` changes only this panel and remembers that it overrides.
 */
export function editMemberValue(
  id: string,
  member: BlockMember,
  key: string,
  value: string,
  scope: 'block' | 'panel',
): void {
  if (scope === 'block') {
    setBlockValue(id, key, value);
    return;
  }
  const { s, io, opts } = env();
  const doc = readBlocksDoc();
  const block = find(doc, id);
  const text = io.read(member.file);
  if (!block || text === undefined) return;
  const props = propsOfMember(text, member, opts);
  if (!props) return;
  const next = kvSet(text, [...member.path, writeKeyFor(props, key, opts.minmode)], value, {
    env: opts.env,
  });
  const pinned = pinKey(block, member, key);
  void s;
  save(
    replace(doc, pinned),
    `Override ${key} on ${member.path[member.path.length - 1]}`,
    { [member.file]: next },
    `block-override:${id}:${memberKey(member)}:${key}`,
  );
}

/** Make a pinned key follow the block again, and write the block's value. */
export function resetOverride(id: string, member: BlockMember, key: string): void {
  const { io, opts } = env();
  const doc = readBlocksDoc();
  const block = find(doc, id);
  if (!block) return;
  const unpinned = unpinKey(block, member, key);
  const only: Block = {
    ...unpinned,
    members: unpinned.members.filter((m) => sameMember(m, member)),
  };
  save(replace(doc, unpinned), `Reset ${key} to block`, applyBlock(only, io, opts, [key]));
}

export type DriftChoice = 'block' | 'override' | 'revert';

/** A panel differs from its block (edited by hand). Adopt it, keep it as an override, or undo it. */
export function resolveDrift(id: string, d: Drift, choice: DriftChoice): void {
  const { io, opts } = env();
  const doc = readBlocksDoc();
  const block = find(doc, id);
  if (!block) return;
  if (choice === 'override') {
    save(replace(doc, pinKey(block, d.member, d.key)), `Keep ${d.key} as an override`);
  } else if (choice === 'block' && d.actual !== undefined) {
    setBlockValue(id, d.key, d.actual);
  } else {
    const only: Block = { ...block, members: block.members.filter((m) => sameMember(m, d.member)) };
    save(doc, `Restore ${d.key} from block`, applyBlock(only, io, opts, [d.key]));
  }
}

export function currentDrift(id: string): Drift[] {
  const { io, opts } = env();
  const block = find(readBlocksDoc(), id);
  return block ? driftOf(block, io, opts) : [];
}

/* ───────────── moving and arranging ───────────── */

/** Apply desired on-screen shifts to `nodes`, committing the position edits as one step. */
export function shiftNodes(
  nodes: readonly PanelNode[],
  scene: Scene,
  desired: ReadonlyMap<string, Delta>,
  label: string,
  opts?: { snapshot?: ReadonlyMap<string, string>; coalesceKey?: string },
): void {
  const { s, opts: bo } = env();
  const read = opts?.snapshot
    ? (p: string) => opts.snapshot!.get(p) ?? s.readText(p)
    : (p: string) => s.readText(p);
  const io: TextReader = { read };
  const writes = planWrites(nodes, scene, desired, io, bo);
  const files = applyWrites(nodes, writes, scene.screen.h / 480, io, bo);
  if (Object.keys(files).length === 0) return;
  s.applyBatch(label, files, opts?.coalesceKey);
}

export const moveNodes = (
  nodes: readonly PanelNode[],
  scene: Scene,
  dx: number,
  dy: number,
  opts?: { snapshot?: ReadonlyMap<string, string>; coalesceKey?: string },
) => shiftNodes(nodes, scene, moveBy(nodes, dx, dy), 'Move panels', opts);

export type ArrangeOp =
  | { kind: 'align'; mode: AlignMode }
  | { kind: 'distribute'; axis: Axis }
  | { kind: 'stack'; axis: Axis; gap: number };

/** Align, distribute or stack panels. `gap` is in virtual units. */
export function arrangeNodes(nodes: readonly PanelNode[], scene: Scene, op: ArrangeOp): void {
  const scale = scene.screen.h / 480;
  const desired =
    op.kind === 'align'
      ? align(nodes, op.mode)
      : op.kind === 'distribute'
        ? distribute(nodes, op.axis)
        : stack(nodes, op.axis, op.gap * scale);
  shiftNodes(
    nodes,
    scene,
    desired,
    op.kind === 'align'
      ? 'Align panels'
      : op.kind === 'distribute'
        ? 'Distribute panels'
        : 'Stack panels',
  );
}

export { toMember };
