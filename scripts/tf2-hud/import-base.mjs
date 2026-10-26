#!/usr/bin/env node
/**
 * Build `public/tf2-hud/base/` from an extracted TF2 default-HUD tree.
 *
 *   node scripts/tf2-hud/import-base.mjs <extracted-dir> [--label "TF2 Default (date)"]
 *
 * The source tree is the full game-facing folder (`resource/`, `scripts/`,
 * `materials/`, …); the editor only needs what a HUD can see or change, so this
 * keeps:
 *
 *   resource/**                       every panel, scheme and dialog file
 *   scripts/                          hudlayout.res, hudanimations*, mod_textures.txt, screens/
 *   materials/{vgui,hud,console,logo} the HUD's own material definitions (.vmt)
 *   materials/**                      …plus any other .vmt a panel or script names
 *
 * and drops world/model/backpack materials, sounds scripts, item schemas and
 * everything else (tens of thousands of files no HUD preview ever touches).
 * Textures (.vtf) are not part of the base; a missing texture previews as the
 * engine's pink/black checkerboard. Run `build-manifest.mjs` afterwards.
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, '../../public/tf2-hud/base');

const src = process.argv[2];
if (!src || !existsSync(src)) {
  console.error('usage: import-base.mjs <extracted-dir>');
  process.exit(1);
}
const root = existsSync(path.join(src, 'resource')) ? src : path.join(src, readdirSync(src)[0]);

const KEEP_SCRIPTS = [
  'hudlayout.res',
  'hudanimations_manifest.txt',
  'hudanimations_tf.txt',
  'mod_textures.txt',
];
const KEEP_MATERIAL_DIRS = ['vgui', 'hud', 'console', 'logo'];
const TEXT_EXT = /\.(res|txt|menu)$/i;
const IMAGE_KEYS =
  /"(?:image|icon|fg_image|bg_image|image_default|image_armed|image_selected|teambg_\d+|iconimage|texture|texturename|material|image_[a-z]+)"\s+"([^"\n]+)"/gi;

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)],
  );
}
const rel = (p) => path.relative(root, p).split(path.sep).join('/');

// Clean the previous base but keep its LICENSE.
for (const d of ['resource', 'scripts', 'materials'])
  rmSync(path.join(OUT, d), { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const copy = (relPath) => {
  const from = path.join(root, relPath);
  if (!existsSync(from) || !statSync(from).isFile()) return false;
  const to = path.join(OUT, relPath);
  mkdirSync(path.dirname(to), { recursive: true });
  cpSync(from, to);
  return true;
};

let count = 0;
// resource/** — everything.
for (const f of walk(path.join(root, 'resource'))) count += copy(rel(f)) ? 1 : 0;
// scripts — the named files and screens/.
for (const f of KEEP_SCRIPTS) count += copy(`scripts/${f}`) ? 1 : 0;
if (existsSync(path.join(root, 'scripts/screens'))) {
  for (const f of walk(path.join(root, 'scripts/screens'))) count += copy(rel(f)) ? 1 : 0;
}
// materials — whole HUD dirs, VMT only (textures are not bundled).
for (const d of KEEP_MATERIAL_DIRS) {
  const dir = path.join(root, 'materials', d);
  if (!existsSync(dir)) continue;
  for (const f of walk(dir)) if (/\.vmt$/i.test(f)) count += copy(rel(f)) ? 1 : 0;
}
// …plus any other material a panel or script names.
const named = new Set();
for (const d of ['resource', 'scripts']) {
  for (const f of walk(path.join(OUT, d))) {
    if (!TEXT_EXT.test(f)) continue;
    const text = readFileSync(f, 'utf8');
    for (const m of text.matchAll(IMAGE_KEYS)) named.add(m[1].trim().replace(/\\/g, '/'));
  }
}
for (const v of named) {
  const parts = ['materials', 'vgui', ...v.replace(/\.(vtf|vmt|png|tga)$/i, '').split('/')];
  const out = [];
  for (const p of parts) {
    if (p === '..') out.pop();
    else if (p && p !== '.') out.push(p);
  }
  const candidate = `${out.join('/')}.vmt`;
  if (!existsSync(path.join(OUT, candidate))) count += copy(candidate) ? 1 : 0;
}
process.stdout.write(`kept ${count} files in ${OUT}\n`);
