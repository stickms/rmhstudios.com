/**
 * VPK (Valve pack) v1/v2 directory parsing and file reads over an abstract
 * byte source, plus a `GameFileSystem` that searches several packs and loose
 * directories in order like gameinfo.txt's SearchPaths.
 *
 * Layout (SDK: vpklib/packedstore.h — VPKDirHeader_t, CPackedStore::BuildDirectoryTree):
 * header (v1 12 bytes; v2 28 bytes), then a tree of
 * extension → directory → file name strings, each file followed by a
 * VPKDirEntry (crc u32, preload u16, archive u16, offset u32, length u32,
 * terminator u16 0xffff) and its preload bytes.
 */

import { readCString, viewOf } from './binary';

export const VPK_SIGNATURE = 0x55aa1234;
/** Archive index meaning "the data follows the tree in the _dir file". */
export const VPK_DIR_ARCHIVE = 0x7fff;

export interface VpkEntry {
  /** Normalized path: lowercase, forward slashes, no leading slash. */
  path: string;
  crc: number;
  /** Bytes stored in the directory itself (served before archive data). */
  preload: Uint8Array;
  archiveIndex: number;
  offset: number;
  length: number;
}

/** Reads `length` bytes at `offset` of archive `archiveIndex` (…_000.vpk = 0). */
export type VpkArchiveReader = (archiveIndex: number, offset: number, length: number) => Uint8Array;

/** Lowercases and turns backslashes into slashes; strips leading "./" and "/". */
export function normalizeGamePath(p: string): string {
  let s = p.replace(/\\/g, '/').toLowerCase();
  while (s.startsWith('./')) s = s.slice(2);
  while (s.startsWith('/')) s = s.slice(1);
  return s.replace(/\/{2,}/g, '/');
}

export class VpkIndex {
  readonly version: number;
  /** Offset in the _dir file where embedded (0x7fff) data starts. */
  readonly dataOffset: number;
  readonly entries: Map<string, VpkEntry>;
  /** The _dir bytes, kept so embedded entries can be read. */
  private readonly dirBytes: Uint8Array;

  constructor(
    version: number,
    dataOffset: number,
    entries: Map<string, VpkEntry>,
    dirBytes: Uint8Array,
  ) {
    this.version = version;
    this.dataOffset = dataOffset;
    this.entries = entries;
    this.dirBytes = dirBytes;
  }

  get size(): number {
    return this.entries.size;
  }

  has(path: string): boolean {
    return this.entries.has(normalizeGamePath(path));
  }

  entry(path: string): VpkEntry | undefined {
    return this.entries.get(normalizeGamePath(path));
  }

  /** Paths under `prefix` (a directory or path prefix) with extension `ext` ("vtf" or ".vtf"). */
  list(prefix = '', ext?: string): string[] {
    const pre = normalizeGamePath(prefix);
    const e = ext ? '.' + ext.replace(/^\./, '').toLowerCase() : null;
    const out: string[] = [];
    for (const p of this.entries.keys()) {
      if (pre && !p.startsWith(pre)) continue;
      if (e && !p.endsWith(e)) continue;
      out.push(p);
    }
    return out;
  }

  /** The archive indices referenced (excluding the _dir file). */
  archiveIndices(): number[] {
    const s = new Set<number>();
    for (const e of this.entries.values())
      if (e.archiveIndex !== VPK_DIR_ARCHIVE && e.length > 0) s.add(e.archiveIndex);
    return [...s].sort((a, b) => a - b);
  }

  /**
   * Reads a file: preload bytes followed by the archive bytes. Returns null when
   * the path is not in the pack. `readArchive` may throw if the archive is absent.
   */
  read(path: string, readArchive: VpkArchiveReader): Uint8Array | null {
    const e = this.entries.get(normalizeGamePath(path));
    if (!e) return null;
    if (e.length === 0) return e.preload.slice();
    const data =
      e.archiveIndex === VPK_DIR_ARCHIVE
        ? this.dirBytes.subarray(this.dataOffset + e.offset, this.dataOffset + e.offset + e.length)
        : readArchive(e.archiveIndex, e.offset, e.length);
    if (data.length !== e.length) throw new Error(`vpk: short read for ${e.path}`);
    if (e.preload.length === 0) return data;
    const out = new Uint8Array(e.preload.length + e.length);
    out.set(e.preload, 0);
    out.set(data, e.preload.length);
    return out;
  }
}

/** SDK: CPackedStore::Init / BuildDirectoryTree — parses a `_dir.vpk`. */
export function parseVpkDir(dirBytes: Uint8Array): VpkIndex {
  const view = viewOf(dirBytes);
  if (dirBytes.length < 12 || view.getUint32(0, true) !== VPK_SIGNATURE) {
    throw new Error('vpk: not a VPK directory (bad signature)');
  }
  const version = view.getUint32(4, true);
  const treeSize = view.getUint32(8, true);
  let headerSize: number;
  if (version === 1) headerSize = 12;
  else if (version === 2) headerSize = 28;
  else throw new Error(`vpk: unsupported version ${version}`);

  const entries = new Map<string, VpkEntry>();
  let p = headerSize;
  const treeEnd = headerSize + treeSize;
  const readStr = (): string => {
    const s = readCString(dirBytes, p, treeEnd - p);
    p += s.length + 1;
    return s;
  };

  for (;;) {
    const ext = readStr();
    if (ext === '') break;
    for (;;) {
      const dir = readStr();
      if (dir === '') break;
      for (;;) {
        const name = readStr();
        if (name === '') break;
        const crc = view.getUint32(p, true);
        const preloadSize = view.getUint16(p + 4, true);
        const archiveIndex = view.getUint16(p + 6, true);
        const offset = view.getUint32(p + 8, true);
        const length = view.getUint32(p + 12, true);
        const term = view.getUint16(p + 16, true);
        if (term !== 0xffff) throw new Error('vpk: corrupt directory entry');
        p += 18;
        const preload = dirBytes.subarray(p, p + preloadSize);
        p += preloadSize;
        // A single space stands for "no directory" / "no extension".
        const dirPart = dir === ' ' ? '' : dir + '/';
        const extPart = ext === ' ' ? '' : '.' + ext;
        const path = normalizeGamePath(dirPart + name + extPart);
        entries.set(path, { path, crc, preload, archiveIndex, offset, length });
      }
    }
  }
  return new VpkIndex(version, treeEnd, entries, dirBytes);
}

// --- Search paths -----------------------------------------------------------

/** One search path: a VPK with its archive reader, or a loose-file source. */
export type SearchPath =
  | { kind: 'vpk'; index: VpkIndex; readArchive: VpkArchiveReader; name?: string }
  | {
      kind: 'loose';
      /** Returns the file's bytes or null if absent. Receives a normalized path. */
      read: (path: string) => Uint8Array | null;
      /** Optional cheaper existence check. */
      exists?: (path: string) => boolean;
      name?: string;
    };

/**
 * Searches its paths in order (first hit wins), like the engine's filesystem
 * with gameinfo.txt SearchPaths "game" (tf before hl2). A map's pakfile can be
 * pushed to the front with `addFront`.
 */
export class GameFileSystem {
  readonly paths: SearchPath[] = [];

  add(path: SearchPath): this {
    this.paths.push(path);
    return this;
  }

  addFront(path: SearchPath): this {
    this.paths.unshift(path);
    return this;
  }

  remove(path: SearchPath): void {
    const i = this.paths.indexOf(path);
    if (i >= 0) this.paths.splice(i, 1);
  }

  /** Reads the first match, or null. Archive read failures (missing archive) fall through. */
  read(path: string): Uint8Array | null {
    const p = normalizeGamePath(path);
    for (const sp of this.paths) {
      if (sp.kind === 'vpk') {
        if (!sp.index.entries.has(p)) continue;
        try {
          const b = sp.index.read(p, sp.readArchive);
          if (b) return b;
        } catch {
          // archive missing in this install — try the next path
        }
      } else {
        const b = sp.read(p);
        if (b) return b;
      }
    }
    return null;
  }

  /** Whether any search path lists the file (VPK: by directory, without reading). */
  exists(path: string): boolean {
    const p = normalizeGamePath(path);
    for (const sp of this.paths) {
      if (sp.kind === 'vpk') {
        if (sp.index.entries.has(p)) return true;
      } else if (sp.exists ? sp.exists(p) : sp.read(p) !== null) {
        return true;
      }
    }
    return false;
  }

  /** Reads a text file (Latin-1), or null. */
  readText(path: string): string | null {
    const b = this.read(path);
    return b ? new TextDecoder('latin1').decode(b) : null;
  }

  /** Union of VPK listings (loose paths cannot be enumerated). */
  list(prefix = '', ext?: string): string[] {
    const s = new Set<string>();
    for (const sp of this.paths)
      if (sp.kind === 'vpk') for (const p of sp.index.list(prefix, ext)) s.add(p);
    return [...s];
  }
}
