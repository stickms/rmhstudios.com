/**
 * List the game model files the loadout items need, ready for extraction.
 *
 *   pnpm exec tsx scripts/tf2-models/model-manifest.ts <out-dir> [items_game.txt tf_english.txt]
 *
 * Without file arguments the current schema is fetched from the GameTracking-TF2
 * mirror. Writes, into <out-dir>:
 *
 *   model-manifest.json   per item: the .mdl path(s) and the GLB name each converts to
 *   model-manifest.csv    the same, one row per model (defindex, class, glb, mdl, name)
 *   mdl-paths.txt         every distinct .mdl path — feed to your VPK extractor
 *   icon-manifest.json    per item: the inventory icon texture and the WebP it converts to
 *   taunt-manifest.json   per taunt item: the animation scene it plays for each class
 *
 * See docs/tf2-hub.md → "3D models" for the extract → convert → upload steps.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  buildIconManifest,
  buildModelManifest,
  buildTauntManifest,
  classModelEntries,
  uniqueModels,
} from '../../lib/tf2-loadout/model-manifest';

const [out, itemsPath, englishPath] = process.argv.slice(2);
if (!out) {
  console.error('usage: model-manifest.ts <out-dir> [items_game.txt tf_english.txt]');
  process.exit(1);
}

/** The game ships some files (tf_english.txt) as UTF-16 with a BOM; the public mirror re-encodes them as UTF-8. */
function decodeText(bytes: Buffer): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return bytes.subarray(2).toString('utf16le');
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return Buffer.from(bytes.subarray(2)).swap16().toString('utf16le');
  }
  return bytes.toString('utf8');
}

const MIRROR = 'https://raw.githubusercontent.com/SteamDatabase/GameTracking-TF2/master/tf/';
async function text(local: string | undefined, remote: string): Promise<string> {
  if (local) return decodeText(readFileSync(local));
  const res = await fetch(MIRROR + remote);
  if (!res.ok) throw new Error(`${remote}: HTTP ${res.status}`);
  return res.text();
}

const itemsGame = await text(itemsPath, 'scripts/items/items_game.txt');
const english = await text(englishPath, 'resource/tf_english.txt');
const manifest = [classModelEntries(), ...buildModelManifest(itemsGame, english)];
const icons = buildIconManifest(itemsGame, english);
const taunts = buildTauntManifest(itemsGame, english);
const mdls = uniqueModels(manifest);

mkdirSync(out, { recursive: true });
writeFileSync(path.join(out, 'model-manifest.json'), JSON.stringify(manifest, null, 1));
const csv = ['defindex,class,role,glb,mdl,name'];
for (const item of manifest) {
  for (const m of item.models) {
    csv.push(
      [item.id, m.class ?? '', m.role, m.glb, m.mdl, `"${item.name.replace(/"/g, '""')}"`].join(
        ',',
      ),
    );
  }
}
writeFileSync(path.join(out, 'icon-manifest.json'), JSON.stringify(icons));
writeFileSync(path.join(out, 'taunt-manifest.json'), JSON.stringify(taunts));
writeFileSync(path.join(out, 'model-manifest.csv'), csv.join('\n') + '\n');
writeFileSync(path.join(out, 'mdl-paths.txt'), mdls.join('\n') + '\n');

process.stdout.write(
  `${manifest.length} items, ${manifest.reduce((n, i) => n + i.models.length, 0)} GLB files, ${mdls.length} distinct .mdl files, ${icons.length} icons → ${out}` +
    '\n',
);
