/** The sidecar file: parse it defensively (it may be hand-edited or come from a newer editor). */

import { BLOCKS_FILE, isSharable, type Block, type BlockMember, type BlocksDoc } from './types';

export const emptyBlocksDoc = (): BlocksDoc => ({ version: 1, blocks: [] });

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

function parseMember(v: unknown): BlockMember | null {
  if (!isRecord(v) || typeof v.file !== 'string') return null;
  const path = strings(v.path);
  if (path.length === 0) return null;
  return { file: v.file, path, pinned: strings(v.pinned) };
}

function parseBlock(v: unknown): Block | null {
  if (!isRecord(v) || typeof v.id !== 'string' || typeof v.name !== 'string') return null;
  const members = Array.isArray(v.members)
    ? v.members.map(parseMember).filter((m): m is BlockMember => m !== null)
    : [];
  const shared: Record<string, string> = {};
  if (isRecord(v.shared)) {
    for (const [k, val] of Object.entries(v.shared)) {
      if (typeof val === 'string' && isSharable(k)) shared[k] = val;
    }
  }
  const block: Block = { id: v.id, name: v.name, members, shared };
  if (typeof v.preset === 'string') block.preset = v.preset;
  if (isRecord(v.rule) && Array.isArray(v.rule.files)) {
    block.rule = {
      files: strings(v.rule.files),
      ...(Array.isArray(v.rule.controls) ? { controls: strings(v.rule.controls) } : {}),
      ...(typeof v.rule.name === 'string' ? { name: v.rule.name } : {}),
    };
  }
  return block;
}

export function parseBlocksDoc(text: string | undefined): BlocksDoc {
  if (!text) return emptyBlocksDoc();
  try {
    const raw: unknown = JSON.parse(text);
    if (!isRecord(raw) || !Array.isArray(raw.blocks)) return emptyBlocksDoc();
    const seen = new Set<string>();
    const blocks: Block[] = [];
    for (const b of raw.blocks) {
      const block = parseBlock(b);
      if (block && !seen.has(block.id)) {
        seen.add(block.id);
        blocks.push(block);
      }
    }
    return { version: 1, blocks };
  } catch {
    return emptyBlocksDoc();
  }
}

export const serializeBlocksDoc = (doc: BlocksDoc): string => `${JSON.stringify(doc, null, 2)}\n`;

export { BLOCKS_FILE };
