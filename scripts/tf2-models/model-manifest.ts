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
 *
 * See docs/tf2-hub.md → "3D models" for the extract → convert → upload steps.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { buildModelManifest, uniqueModels } from '../../lib/tf2-loadout/model-manifest';

const [out, itemsPath, englishPath] = process.argv.slice(2);
if (!out) {
  console.error('usage: model-manifest.ts <out-dir> [items_game.txt tf_english.txt]');
  process.exit(1);
}

const MIRROR = 'https://raw.githubusercontent.com/SteamDatabase/GameTracking-TF2/master/tf/';
async function text(local: string | undefined, remote: string): Promise<string> {
  if (local) return readFileSync(local, 'utf8');
  const res = await fetch(MIRROR + remote);
  if (!res.ok) throw new Error(`${remote}: HTTP ${res.status}`);
  return res.text();
}

const manifest = buildModelManifest(
  await text(itemsPath, 'scripts/items/items_game.txt'),
  await text(englishPath, 'resource/tf_english.txt'),
);
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
writeFileSync(path.join(out, 'model-manifest.csv'), csv.join('\n') + '\n');
writeFileSync(path.join(out, 'mdl-paths.txt'), mdls.join('\n') + '\n');

process.stdout.write(
  `${manifest.length} items, ${manifest.reduce((n, i) => n + i.models.length, 0)} GLB files, ${mdls.length} distinct .mdl files → ${out}` +
    '\n',
);
