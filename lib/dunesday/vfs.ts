/**
 * The Dunesday desktop's sandboxed file system.
 *
 * A tiny in-browser tree of folders, files and shortcuts, persisted to the
 * viewer's localStorage by the OS store. Nothing here touches the network or
 * the real disk: "C:\" is a JSON object. That is the whole sandbox — a file can
 * hold text (Notepad), a data-URL image (Paint), or point at an app or a URL
 * (a shortcut), and nothing it contains is ever executed or rendered as HTML.
 *
 * Pure functions over an immutable `Vfs` record so the store can keep history
 * cheap and the command prompt can reuse the same path resolver.
 */

export type NodeKind = 'folder' | 'file' | 'shortcut';

export interface VNode {
  id: string;
  parent: string | null;
  name: string;
  kind: NodeKind;
  /** Text for .txt, a data: URL for images. */
  content?: string;
  /** For shortcuts: `app:<id>` or an http(s) URL. */
  target?: string;
  created: number;
  modified: number;
  /** System folders and the seeded app shortcuts' parents cannot be removed. */
  system?: boolean;
  /** Set while the node sits in the Recycle Bin: where it came from. */
  deletedFrom?: string;
  /** A special folder whose listing is generated (the watch-list Videos library). */
  virtual?: 'watchlist';
}

export type Vfs = Record<string, VNode>;

export const ROOT = 'computer';
export const DRIVE = 'c';
export const HOME = 'home';
export const DESKTOP = 'desktop';
export const DOCUMENTS = 'documents';
export const PICTURES = 'pictures';
export const MUSIC = 'music';
export const VIDEOS = 'videos';
export const DOWNLOADS = 'downloads';
export const RECYCLE = 'recycle';
export const PROGRAM_FILES = 'programfiles';

/** Total bytes the sandbox may keep in localStorage. */
export const QUOTA_BYTES = 3 * 1024 * 1024;

// Control characters are invalid in Windows file names too.
// eslint-disable-next-line no-control-regex
const INVALID = /[\\/:*?"<>|\u0000-\u001f]/;
const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i;

export class VfsError extends Error {
  constructor(
    public code:
      'invalid-name' | 'exists' | 'not-found' | 'system' | 'into-self' | 'quota' | 'not-folder',
    message: string,
  ) {
    super(message);
  }
}

export function validateName(name: string): string {
  const n = name.trim().replace(/[. ]+$/, '');
  if (!n) throw new VfsError('invalid-name', 'A file name can’t be empty.');
  if (n.length > 120) throw new VfsError('invalid-name', 'That file name is too long.');
  if (INVALID.test(n)) {
    throw new VfsError(
      'invalid-name',
      'A file name can’t contain any of the following characters: \\ / : * ? " < > |',
    );
  }
  if (RESERVED.test(n)) throw new VfsError('invalid-name', 'That name is reserved by the system.');
  return n;
}

export function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(i + 1).toLowerCase() : '';
}

let counter = 0;
export function newId(): string {
  counter = (counter + 1) % 1_000_000;
  return `n${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function children(vfs: Vfs, parent: string): VNode[] {
  return Object.values(vfs)
    .filter((n) => n.parent === parent)
    .sort((a, b) => {
      if ((a.kind === 'folder') !== (b.kind === 'folder')) return a.kind === 'folder' ? -1 : 1;
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    });
}

export function isAncestor(vfs: Vfs, maybeAncestor: string, id: string): boolean {
  let cur: string | null = id;
  while (cur) {
    if (cur === maybeAncestor) return true;
    cur = vfs[cur]?.parent ?? null;
  }
  return false;
}

export function pathOf(vfs: Vfs, id: string): string {
  if (id === ROOT) return 'Computer';
  const parts: string[] = [];
  let cur: string | null = id;
  while (cur && cur !== ROOT) {
    const node: VNode | undefined = vfs[cur];
    if (!node) break;
    parts.unshift(cur === DRIVE ? 'C:' : node.name);
    cur = node.parent;
  }
  return parts.length === 1 ? `${parts[0]}\\` : parts.join('\\');
}

/** Ancestors from Computer down to `id`, for breadcrumbs. */
export function trail(vfs: Vfs, id: string): VNode[] {
  const out: VNode[] = [];
  let cur: string | null = id;
  while (cur) {
    const node: VNode | undefined = vfs[cur];
    if (!node) break;
    out.unshift(node);
    cur = node.parent;
  }
  return out;
}

/** A name not already taken in `parent`: "New folder", "New folder (2)", … */
export function uniqueName(vfs: Vfs, parent: string, wanted: string, except?: string): string {
  const taken = new Set(
    children(vfs, parent)
      .filter((n) => n.id !== except)
      .map((n) => n.name.toLowerCase()),
  );
  if (!taken.has(wanted.toLowerCase())) return wanted;
  const dot = wanted.lastIndexOf('.');
  const base = dot > 0 ? wanted.slice(0, dot) : wanted;
  const ext = dot > 0 ? wanted.slice(dot) : '';
  for (let i = 2; i < 1000; i++) {
    const candidate = `${base} (${i})${ext}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return `${base} (${Date.now()})${ext}`;
}

export function byteSize(vfs: Vfs): number {
  return new Blob([JSON.stringify(vfs)]).size;
}

function guardQuota(next: Vfs): Vfs {
  if (byteSize(next) > QUOTA_BYTES) {
    throw new VfsError(
      'quota',
      'There is not enough space on Local Disk (C:). Delete some files and try again.',
    );
  }
  return next;
}

export function create(
  vfs: Vfs,
  parent: string,
  input: { name: string; kind: NodeKind; content?: string; target?: string },
): { vfs: Vfs; id: string } {
  const p = vfs[parent];
  if (!p || p.kind !== 'folder')
    throw new VfsError('not-folder', 'The destination is not a folder.');
  if (p.virtual) throw new VfsError('system', 'You can’t add files to this library here.');
  const name = uniqueName(vfs, parent, validateName(input.name));
  const id = newId();
  const now = Date.now();
  const node: VNode = { id, parent, name, kind: input.kind, created: now, modified: now };
  if (input.content !== undefined) node.content = input.content;
  if (input.target !== undefined) node.target = input.target;
  return { vfs: guardQuota({ ...vfs, [id]: node }), id };
}

export function rename(vfs: Vfs, id: string, name: string): Vfs {
  const node = vfs[id];
  if (!node) throw new VfsError('not-found', 'The item could not be found.');
  if (node.system) throw new VfsError('system', 'This system folder can’t be renamed.');
  const clean = validateName(name);
  const clash = children(vfs, node.parent ?? ROOT).find(
    (n) => n.id !== id && n.name.toLowerCase() === clean.toLowerCase(),
  );
  if (clash)
    throw new VfsError(
      'exists',
      `There is already a file with the name “${clean}” in this location.`,
    );
  return { ...vfs, [id]: { ...node, name: clean, modified: Date.now() } };
}

export function writeContent(vfs: Vfs, id: string, content: string): Vfs {
  const node = vfs[id];
  if (!node || node.kind !== 'file')
    throw new VfsError('not-found', 'The file could not be found.');
  return guardQuota({ ...vfs, [id]: { ...node, content, modified: Date.now() } });
}

export function move(vfs: Vfs, id: string, parent: string): Vfs {
  const node = vfs[id];
  const dest = vfs[parent];
  if (!node || !dest) throw new VfsError('not-found', 'The item could not be found.');
  if (node.system) throw new VfsError('system', 'This system folder can’t be moved.');
  if (dest.kind !== 'folder' || dest.virtual)
    throw new VfsError('not-folder', 'You can’t move items there.');
  if (isAncestor(vfs, id, parent)) {
    throw new VfsError('into-self', 'The destination folder is a subfolder of the source folder.');
  }
  if (node.parent === parent) return vfs;
  const name = uniqueName(vfs, parent, node.name);
  return { ...vfs, [id]: { ...node, parent, name, modified: Date.now() } };
}

function subtree(vfs: Vfs, id: string): string[] {
  const out = [id];
  for (const n of Object.values(vfs)) if (n.parent === id) out.push(...subtree(vfs, n.id));
  return out;
}

function withCopySuffix(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? `${name.slice(0, dot)} - Copy${name.slice(dot)}` : `${name} - Copy`;
}

export function copy(vfs: Vfs, id: string, parent: string): { vfs: Vfs; id: string } {
  const node = vfs[id];
  if (!node) throw new VfsError('not-found', 'The item could not be found.');
  if (isAncestor(vfs, id, parent)) {
    throw new VfsError('into-self', 'The destination folder is a subfolder of the source folder.');
  }
  const mapping = new Map<string, string>();
  for (const old of subtree(vfs, id)) mapping.set(old, newId());
  const next: Vfs = { ...vfs };
  const now = Date.now();
  for (const [oldId, freshId] of mapping) {
    const src = vfs[oldId];
    const isTop = oldId === id;
    next[freshId] = {
      ...src,
      id: freshId,
      system: undefined,
      virtual: undefined,
      parent: isTop ? parent : (mapping.get(src.parent ?? '') ?? parent),
      // Windows 7 appends " - Copy" only when copying within the same folder.
      name: isTop
        ? uniqueName(vfs, parent, parent === src.parent ? withCopySuffix(src.name) : src.name)
        : src.name,
      created: now,
      modified: now,
    };
  }
  return { vfs: guardQuota(next), id: mapping.get(id)! };
}

/** To the Recycle Bin (restorable). */
export function recycle(vfs: Vfs, id: string): Vfs {
  const node = vfs[id];
  if (!node) return vfs;
  if (node.system) throw new VfsError('system', 'This system folder can’t be deleted.');
  if (node.parent === RECYCLE) return vfs;
  return {
    ...vfs,
    [id]: {
      ...node,
      deletedFrom: node.parent ?? DESKTOP,
      parent: RECYCLE,
      name: uniqueName(vfs, RECYCLE, node.name),
    },
  };
}

export function restore(vfs: Vfs, id: string): Vfs {
  const node = vfs[id];
  if (!node || node.parent !== RECYCLE) return vfs;
  const home =
    node.deletedFrom && vfs[node.deletedFrom] && vfs[node.deletedFrom].parent !== RECYCLE
      ? node.deletedFrom
      : DESKTOP;
  const { deletedFrom: _gone, ...rest } = node;
  return { ...vfs, [id]: { ...rest, parent: home, name: uniqueName(vfs, home, node.name) } };
}

/** Permanently delete (also used by "Empty Recycle Bin"). */
export function purge(vfs: Vfs, id: string): Vfs {
  const node = vfs[id];
  if (!node || node.system) return vfs;
  const doomed = new Set(subtree(vfs, id));
  const next: Vfs = {};
  for (const [k, v] of Object.entries(vfs)) if (!doomed.has(k)) next[k] = v;
  return next;
}

/**
 * Resolve a command-prompt path against a working folder. Accepts absolute
 * (`C:\Users`), relative (`Documents\notes.txt`), `.`, `..`, and is
 * case-insensitive like the real thing. Returns null when nothing matches.
 */
export function resolve(vfs: Vfs, cwd: string, input: string): string | null {
  let raw = input.trim().replace(/^"|"$/g, '').replace(/\//g, '\\');
  if (!raw) return cwd;
  let cur = cwd;
  if (/^[a-z]:\\?/i.test(raw)) {
    cur = DRIVE;
    raw = raw.replace(/^[a-z]:\\?/i, '');
  } else if (raw.startsWith('\\')) {
    cur = DRIVE;
    raw = raw.slice(1);
  }
  for (const part of raw.split('\\').filter(Boolean)) {
    if (part === '.') continue;
    if (part === '..') {
      const parent: string | null = vfs[cur]?.parent ?? null;
      if (parent && parent !== ROOT) cur = parent;
      continue;
    }
    const match = children(vfs, cur).find((n) => n.name.toLowerCase() === part.toLowerCase());
    if (!match) return null;
    cur = match.id;
  }
  return cur;
}

const SVG_ART = (a: string, b: string, c: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 260'><defs><linearGradient id='s' x1='0' x2='0' y1='0' y2='1'><stop offset='0' stop-color='${a}'/><stop offset='1' stop-color='${b}'/></linearGradient></defs><rect width='400' height='260' fill='url(#s)'/><circle cx='310' cy='70' r='38' fill='#fff' opacity='.75'/><path d='M0 190 C 90 140 180 170 260 185 S 360 160 400 170 L400 260 L0 260Z' fill='${c}'/><path d='M0 220 C 120 180 240 230 400 205 L400 260 L0 260Z' fill='${c}' opacity='.7'/></svg>`,
  )}`;

/** The first-boot tree. `user` names the profile folder. */
export function seed(user: string, apps: { id: string; name: string }[]): Vfs {
  const now = Date.now();
  const folder = (
    id: string,
    parent: string | null,
    name: string,
    extra: Partial<VNode> = {},
  ): VNode => ({
    id,
    parent,
    name,
    kind: 'folder',
    created: now,
    modified: now,
    system: true,
    ...extra,
  });
  const vfs: Vfs = {
    [ROOT]: folder(ROOT, null, 'Computer'),
    [DRIVE]: folder(DRIVE, ROOT, 'Local Disk (C:)'),
    users: folder('users', DRIVE, 'Users'),
    [HOME]: folder(HOME, 'users', user),
    [DESKTOP]: folder(DESKTOP, HOME, 'Desktop'),
    [DOCUMENTS]: folder(DOCUMENTS, HOME, 'Documents'),
    [PICTURES]: folder(PICTURES, HOME, 'Pictures'),
    [MUSIC]: folder(MUSIC, HOME, 'Music'),
    [VIDEOS]: folder(VIDEOS, HOME, 'Videos', { virtual: 'watchlist' }),
    [DOWNLOADS]: folder(DOWNLOADS, HOME, 'Downloads'),
    [PROGRAM_FILES]: folder(PROGRAM_FILES, DRIVE, 'Program Files'),
    windows: folder('windows', DRIVE, 'Windows'),
    [RECYCLE]: folder(RECYCLE, null, 'Recycle Bin'),
  };
  const file = (parent: string, name: string, extra: Partial<VNode>) => {
    const id = newId();
    vfs[id] = { id, parent, name, kind: 'file', created: now, modified: now, ...extra };
    return id;
  };
  for (const app of apps) {
    const id = newId();
    vfs[id] = {
      id,
      parent: DESKTOP,
      name: app.name,
      kind: 'shortcut',
      target: `app:${app.id}`,
      created: now,
      modified: now,
    };
  }
  file(DESKTOP, 'Read Me.txt', {
    content:
      'Welcome to Dunesday 7!\r\n\r\n' +
      'This desktop is a sandbox that lives in your browser. Create folders, write notes, paint pictures, ' +
      'play Minesweeper, and plan your MCU + Dune marathon before Avengers: Doomsday and Dune: Part Three ' +
      'open on 18 December 2026.\r\n\r\n' +
      '• Videos (in your user folder) is your watch list. Double-click a title for its properties.\r\n' +
      '• Drag a title to the Recycle Bin to leave it out of the plan.\r\n' +
      '• Dunesday Planner sets your pace; Calendar shows night by night.\r\n' +
      '• Messenger can answer questions about the films (spoiler shield on).\r\n\r\n' +
      'Nothing here leaves your browser unless you turn on Sync Center.',
  });
  file(DOCUMENTS, 'Marathon notes.txt', {
    content: 'Snacks:\r\n- popcorn\r\n- spice coffee\r\n\r\nFavourite so far:\r\n',
  });
  const samples = folder(newId(), PICTURES, 'Sample Pictures');
  vfs[samples.id] = { ...samples, system: false };
  file(samples.id, 'Aero Meadow.svg', { content: SVG_ART('#2f8fe6', '#bfe6ff', '#4cbf33') });
  file(samples.id, 'Arrakis.svg', { content: SVG_ART('#f6b452', '#ffe6b0', '#c98b37') });
  file(samples.id, 'Aurora.svg', { content: SVG_ART('#030a24', '#1f5aa8', '#145a44') });
  return vfs;
}
