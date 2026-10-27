/**
 * Name converted GLBs the way the site expects (`<defindex>.glb`,
 * `<defindex>_<class>.glb`), using the manifest from model-manifest.ts.
 *
 *   pnpm exec tsx scripts/tf2-models/rename-glb.ts <converted-dir> <model-manifest.json> <out-dir>
 *
 * A converted file is matched to its model by its path under <converted-dir>
 * (`player/items/scout/bonk_helmet.glb` ↔ `models/player/items/scout/bonk_helmet.mdl`),
 * or — when the converter flattened the tree — by file name, provided that name is
 * unambiguous. Anything unmatched or ambiguous is listed, never guessed.
 */

import { copyFileSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import type { ModelManifestItem } from '../../lib/tf2-loadout/model-manifest';

const [dir, manifestPath, out] = process.argv.slice(2);
if (!dir || !manifestPath || !out) {
  console.error('usage: rename-glb.ts <converted-dir> <model-manifest.json> <out-dir>');
  process.exit(1);
}

function walk(root: string, rel = ''): string[] {
  return readdirSync(path.join(root, rel), { withFileTypes: true }).flatMap((e) => {
    const r = rel ? `${rel}/${e.name}` : e.name;
    return e.isDirectory() ? walk(root, r) : [r];
  });
}

const stripExt = (p: string) => p.replace(/\.[^./]+$/, '').toLowerCase();
const files = walk(dir).filter((f) => f.toLowerCase().endsWith('.glb'));
const byPath = new Map(files.map((f) => [stripExt(f), f]));
const byName = new Map<string, string[]>();
for (const f of files) {
  const k = path.posix.basename(stripExt(f));
  byName.set(k, [...(byName.get(k) ?? []), f]);
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as ModelManifestItem[];
const wanted = manifest.flatMap((i) => i.models.map((m) => ({ ...m, id: i.id })));
// How many *different* model files want each bare file name (items often share one model).
const nameDemand = new Map<string, Set<string>>();
for (const w of wanted) {
  const k = path.posix.basename(stripExt(w.mdl));
  nameDemand.set(k, (nameDemand.get(k) ?? new Set()).add(w.mdl));
}

mkdirSync(out, { recursive: true });
let copied = 0;
const missing: string[] = [];
const ambiguous: string[] = [];
const claimed = new Set<string>();
for (const w of wanted) {
  const noModels = stripExt(w.mdl).replace(/^models\//, '');
  let src = byPath.get(noModels) ?? byPath.get(stripExt(w.mdl));
  if (!src) {
    const k = path.posix.basename(stripExt(w.mdl));
    const hits = byName.get(k) ?? [];
    if (hits.length === 1 && nameDemand.get(k)?.size === 1) src = hits[0];
    else if (hits.length > 0) ambiguous.push(w.mdl);
  }
  if (!src) {
    if (!ambiguous.includes(w.mdl)) missing.push(w.mdl);
    continue;
  }
  claimed.add(src);
  copyFileSync(path.join(dir, src), path.join(out, w.glb));
  copied++;
}

const lines = [`copied ${copied} of ${wanted.length} models → ${out}`];
if (missing.length) lines.push(`not converted yet: ${missing.length} (first: ${missing[0]})`);
if (ambiguous.length)
  lines.push(`ambiguous by name, skipped: ${ambiguous.length} (first: ${ambiguous[0]})`);
const extras = files.filter((f) => !claimed.has(f)).length;
if (extras) lines.push(`converted files matching no item: ${extras}`);
process.stdout.write(lines.join('\n') + '\n');
