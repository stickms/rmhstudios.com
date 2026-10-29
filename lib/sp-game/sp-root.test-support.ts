/**
 * TEST SUPPORT ONLY (Node): opens the Half-Life 2 demo (HL2_ROOT) and Portal:
 * First Slice (PORTAL_ROOT) installs as GameFileSystems with the search paths
 * of their gameinfo.txt (sound packs left out), like scripts/tf2-game/build-maps.ts.
 * Never imported by runtime modules.
 */
import fs from 'node:fs';
import path from 'node:path';
import { GameFileSystem, parseVpkDir, type SearchPath } from '../tf2-game/formats/vpk';
import { parseBsp, type BspFile } from '../tf2-game/formats/bsp';
import type { SpGame } from './constants';

export const hl2Root = (): string => process.env.HL2_ROOT ?? '';
export const portalRoot = (): string => process.env.PORTAL_ROOT ?? '';
export const gameRoot = (game: SpGame): string => (game === 'hl2' ? hl2Root() : portalRoot());

function vpk(root: string, dirFile: string): SearchPath | null {
  const full = path.join(root, dirFile);
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

function loose(root: string, dir: string): SearchPath {
  return {
    kind: 'loose',
    name: dir,
    read: (p) => {
      const f = path.join(root, dir, p);
      return fs.existsSync(f) && fs.statSync(f).isFile() ? new Uint8Array(fs.readFileSync(f)) : null;
    },
    exists: (p) => fs.existsSync(path.join(root, dir, p)),
  };
}

const cache = new Map<SpGame, GameFileSystem>();

/** The game's file system, or null when its root env var is unset. */
export function spFileSystem(game: SpGame): GameFileSystem | null {
  const root = gameRoot(game);
  if (!root) return null;
  const hit = cache.get(game);
  if (hit) return hit;
  const gfs = new GameFileSystem();
  const add = (sp: SearchPath | null): void => {
    if (sp) gfs.add(sp);
  };
  if (game === 'hl2') {
    add(vpk(root, 'hl2/hl2_pak_dir.vpk'));
    add(vpk(root, 'hl2/hl2_textures_dir.vpk'));
    add(vpk(root, 'hl2/hl2_misc_dir.vpk'));
    gfs.add(loose(root, 'hl2'));
  } else {
    add(vpk(root, 'portal/portal_pak_dir.vpk'));
    add(vpk(root, 'hl2/hl2_textures_dir.vpk'));
    add(vpk(root, 'hl2/hl2_misc_dir.vpk'));
    gfs.add(loose(root, 'portal'));
    gfs.add(loose(root, 'hl2'));
  }
  cache.set(game, gfs);
  return gfs;
}

/** Reads and parses a map of the game. */
export function readSpMap(game: SpGame, name: string): BspFile {
  const dir = game === 'hl2' ? 'hl2/maps' : 'portal/maps';
  return parseBsp(new Uint8Array(fs.readFileSync(path.join(gameRoot(game), dir, `${name}.bsp`))));
}
