/**
 * TEST SUPPORT ONLY (Node): opens a TF2 install at TF2_ROOT for the format and
 * world tests. Not imported by any runtime module — the formats themselves
 * stay environment-agnostic.
 */
import fs from 'node:fs';
import path from 'node:path';
import { GameFileSystem, parseVpkDir, type SearchPath } from './vpk';

/** Read at call time so a test can set process.env.TF2_ROOT before first use. */
export const tf2Root = (): string => process.env.TF2_ROOT ?? '';

export function readGameFile(rel: string): Uint8Array {
  return new Uint8Array(fs.readFileSync(path.join(tf2Root(), rel)));
}

export function readMap(name: string): Uint8Array {
  return readGameFile(`tf/maps/${name}.bsp`);
}

/** A VPK search path whose archives are read with pread on demand. */
export function vpkSearchPath(dirFile: string): SearchPath | null {
  const full = path.join(tf2Root(), dirFile);
  if (!fs.existsSync(full)) return null;
  const index = parseVpkDir(new Uint8Array(fs.readFileSync(full)));
  const base = full.replace(/_dir\.vpk$/, '');
  const fds = new Map<number, number>();
  return {
    kind: 'vpk',
    name: dirFile,
    index,
    readArchive: (archive, offset, length) => {
      let fd = fds.get(archive);
      if (fd === undefined) {
        fd = fs.openSync(`${base}_${String(archive).padStart(3, '0')}.vpk`, 'r');
        fds.set(archive, fd);
      }
      const out = new Uint8Array(length);
      fs.readSync(fd, out, 0, length, offset);
      return out;
    },
  };
}

let cached: GameFileSystem | null = null;

/** tf (loose, then tf2_misc) then hl2 (hl2_misc), like gameinfo.txt's game search paths. */
export function gameFileSystem(): GameFileSystem {
  if (cached) return cached;
  const gfs = new GameFileSystem();
  const loose = (dir: string): SearchPath => ({
    kind: 'loose',
    name: dir,
    read: (p) => {
      const f = path.join(tf2Root(), dir, p);
      return fs.existsSync(f) && fs.statSync(f).isFile()
        ? new Uint8Array(fs.readFileSync(f))
        : null;
    },
    exists: (p) => fs.existsSync(path.join(tf2Root(), dir, p)),
  });
  gfs.add(loose('tf'));
  for (const v of ['tf/tf2_misc_dir.vpk', 'hl2/hl2_misc_dir.vpk']) {
    const sp = vpkSearchPath(v);
    if (sp) gfs.add(sp);
  }
  gfs.add(loose('hl2'));
  cached = gfs;
  return gfs;
}
