/**
 * Writing a block's shared values into its members, and reading back how each
 * member stands against them. Pure text-to-text: callers hand in a reader and get
 * the changed files back, so the store can commit them as one history step.
 */

import { kvSet } from '../kv/edit';
import { propsOf, type Props } from '../kv/props';
import { kvAt } from '../kv/query';
import { parseCached } from '../scene/build';
import type { CondEnv } from '../scheme/cond';
import { isSharable, memberKey, SHARABLE_KEYS, sameMember } from './types';
import type { Block, BlockMember } from './types';

export interface TextReader {
  read(path: string): string | undefined;
}

export interface BlockOpts {
  env: CondEnv;
  /** Edit the `_minmode` copy of a key when the member has one (as the inspector does). */
  minmode?: boolean;
}

export function propsOfMember(
  text: string,
  member: Pick<BlockMember, 'path'>,
  opts: BlockOpts,
): Props | undefined {
  const entry = kvAt(parseCached(text), member.path);
  return entry?.children ? propsOf(entry, { env: opts.env, minmode: opts.minmode }) : undefined;
}

/** The key actually edited for `key`: its `_minmode` copy when previewing minmode and one exists. */
export const writeKeyFor = (props: Props, key: string, minmode?: boolean): string =>
  minmode && props.has(`${key}_minmode`) ? `${key}_minmode` : key;

/** A member's current value for `key`, or undefined if the panel or the key is missing. */
export function memberValue(
  io: TextReader,
  member: BlockMember,
  key: string,
  opts: BlockOpts,
): string | undefined {
  const text = io.read(member.file);
  if (text === undefined) return undefined;
  return propsOfMember(text, member, opts)?.get(key)?.trim();
}

export function memberExists(io: TextReader, member: BlockMember, opts: BlockOpts): boolean {
  const text = io.read(member.file);
  return text !== undefined && propsOfMember(text, member, opts) !== undefined;
}

/**
 * How a member stands on one shared key:
 * - `override`: pinned; the block leaves it alone.
 * - `inherited`: follows the block and already has its value.
 * - `drift`: should follow the block but differs (edited by hand, or never applied).
 */
export type KeyState = 'override' | 'inherited' | 'drift';

export function keyState(
  block: Block,
  member: BlockMember,
  key: string,
  io: TextReader,
  opts: BlockOpts,
): KeyState {
  if (member.pinned.some((p) => p.toLowerCase() === key.toLowerCase())) return 'override';
  return memberValue(io, member, key, opts) === block.shared[key]?.trim() ? 'inherited' : 'drift';
}

export interface Drift {
  member: BlockMember;
  key: string;
  expected: string;
  /** Undefined when the member does not set the key at all. */
  actual: string | undefined;
}

export function driftOf(block: Block, io: TextReader, opts: BlockOpts): Drift[] {
  const out: Drift[] = [];
  for (const member of block.members) {
    if (!memberExists(io, member, opts)) continue;
    for (const [key, expected] of Object.entries(block.shared)) {
      if (keyState(block, member, key, io, opts) === 'drift') {
        out.push({ member, key, expected, actual: memberValue(io, member, key, opts) });
      }
    }
  }
  return out;
}

/** Members whose entry no longer exists (renamed or deleted in the code view). */
export const orphansOf = (block: Block, io: TextReader, opts: BlockOpts): BlockMember[] =>
  block.members.filter((m) => io.read(m.file) !== undefined && !memberExists(io, m, opts));

/**
 * Write the block into every member that follows it. Returns only the files whose
 * text changed. Applying twice changes nothing the second time.
 */
export function applyBlock(
  block: Block,
  io: TextReader,
  opts: BlockOpts,
  only?: readonly string[],
): Record<string, string> {
  const texts = new Map<string, string>();
  const changed = new Set<string>();
  const keys = Object.entries(block.shared).filter(([k]) => !only || only.includes(k));
  for (const member of block.members) {
    for (const [key, value] of keys) {
      if (member.pinned.some((p) => p.toLowerCase() === key.toLowerCase())) continue;
      const text = texts.get(member.file) ?? io.read(member.file);
      if (text === undefined) continue;
      const props = propsOfMember(text, member, opts);
      if (!props) continue;
      if (props.get(key)?.trim() === value.trim()) continue;
      const next = kvSet(text, [...member.path, writeKeyFor(props, key, opts.minmode)], value, {
        env: opts.env,
      });
      if (next !== text) {
        texts.set(member.file, next);
        changed.add(member.file);
      }
    }
  }
  return Object.fromEntries([...changed].map((f) => [f, texts.get(f)!]));
}

/**
 * Seed shared values from the members: a key goes in when every member sets it to
 * the same thing. Keys they disagree on are returned as `mixed` and left out until
 * the author picks a value.
 */
export function seedShared(
  members: readonly BlockMember[],
  io: TextReader,
  opts: BlockOpts,
  keys: readonly string[] = SHARABLE_KEYS,
): { shared: Record<string, string>; mixed: string[] } {
  const shared: Record<string, string> = {};
  const mixed: string[] = [];
  if (members.length === 0) return { shared, mixed };
  for (const key of keys) {
    const values = members.map((m) => memberValue(io, m, key, opts));
    const present = values.filter((v): v is string => v !== undefined);
    if (present.length === 0) continue;
    if (present.length === members.length && present.every((v) => v === present[0])) {
      shared[key] = present[0];
    } else if (new Set(present).size > 1) {
      mixed.push(key);
    }
  }
  return { shared, mixed };
}

/* ───────────────── immutable block edits ───────────────── */

export const setShared = (block: Block, key: string, value: string): Block => ({
  ...block,
  shared: { ...block.shared, [key]: value },
});

export function clearShared(block: Block, key: string): Block {
  const shared = { ...block.shared };
  delete shared[key];
  return { ...block, shared };
}

const edit = (block: Block, member: BlockMember, fn: (m: BlockMember) => BlockMember): Block => ({
  ...block,
  members: block.members.map((m) => (sameMember(m, member) ? fn(m) : m)),
});

export const pinKey = (block: Block, member: BlockMember, key: string): Block =>
  edit(block, member, (m) =>
    m.pinned.some((p) => p.toLowerCase() === key.toLowerCase())
      ? m
      : { ...m, pinned: [...m.pinned, key] },
  );

export const unpinKey = (block: Block, member: BlockMember, key: string): Block =>
  edit(block, member, (m) => ({
    ...m,
    pinned: m.pinned.filter((p) => p.toLowerCase() !== key.toLowerCase()),
  }));

export function addMembers(block: Block, add: readonly BlockMember[]): Block {
  const have = new Set(block.members.map((m) => memberKey(m).toLowerCase()));
  const fresh = add.filter((m) => !have.has(memberKey(m).toLowerCase()));
  return fresh.length ? { ...block, members: [...block.members, ...fresh] } : block;
}

export const removeMember = (block: Block, member: BlockMember): Block => ({
  ...block,
  members: block.members.filter((m) => !sameMember(m, member)),
});

/** Keep only the keys the block can hold. */
export function sanitizeShared(shared: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(shared).filter(([k]) => isSharable(k)));
}
