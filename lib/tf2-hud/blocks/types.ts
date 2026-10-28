/**
 * Blocks: named groups of panels that share a look, so "all the charge bars" is
 * edited once instead of one `.res` entry at a time.
 *
 * A block never replaces the files. Its members are plain `.res` entries and its
 * shared values are written into them as ordinary keys, so the export is a normal
 * HUD. The block itself is editor data kept in one sidecar file (`BLOCKS_FILE`).
 */

/** Where blocks are stored in a project. The game ignores unknown text files in `resource/`. */
export const BLOCKS_FILE = 'resource/_rmh_blocks.txt';

/**
 * Properties a block may hold. Looks and sizes only: position is relative to a
 * panel's own parent and frame, so it is moved and arranged (`arrange.ts`), never
 * copied from one panel to another.
 */
export const SHARABLE_KEYS = [
  'wide',
  'tall',
  'zpos',
  'visible',
  'font',
  'textAlignment',
  'textinsetx',
  'textinsety',
  'fgcolor',
  'fgcolor_override',
  'bgcolor_override',
  'defaultfgcolor_override',
  'defaultbgcolor_override',
  'armedfgcolor_override',
  'armedbgcolor_override',
  'border',
  'PaintBackgroundType',
  'drawcolor',
  'fillcolor',
  'image',
  'scaleImage',
  'fg_image',
  'bg_image',
] as const;

export type SharableKey = (typeof SHARABLE_KEYS)[number];

const SHARABLE = new Set<string>(SHARABLE_KEYS.map((k) => k.toLowerCase()));
export const isSharable = (key: string): boolean => SHARABLE.has(key.toLowerCase());

/** One panel in a block: its file and the key path of its entry. */
export interface BlockMember {
  file: string;
  /** Key path from the file root, as `PanelNode.keyPath`. */
  path: string[];
  /** Shared keys this panel overrides: the block does not write them here. */
  pinned: string[];
}

/** A rule that finds members across the project (used by presets and "refresh members"). */
export interface BlockRule {
  /** Project paths; `*` matches within one path segment. */
  files: string[];
  /** Lower-case `ControlName`s. Absent = any panel. */
  controls?: string[];
  /** Case-insensitive regular expression tested against the entry's key. */
  name?: string;
}

export interface Block {
  id: string;
  name: string;
  members: BlockMember[];
  shared: Record<string, string>;
  rule?: BlockRule;
  /** Set when the block was made from a built-in preset. */
  preset?: string;
}

export interface BlocksDoc {
  version: 1;
  blocks: Block[];
}

export const memberKey = (m: Pick<BlockMember, 'file' | 'path'>): string =>
  `${m.file}#${m.path.join('/')}`;

export const sameMember = (a: BlockMember, b: Pick<BlockMember, 'file' | 'path'>): boolean =>
  memberKey(a).toLowerCase() === memberKey(b).toLowerCase();
