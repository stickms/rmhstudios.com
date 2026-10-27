/**
 * Upload converted TF2 item models to the site's object storage.
 *
 *   pnpm exec tsx scripts/tf2-models/upload.ts <dir-of-glb-files>
 *
 * Files are named `<defindex>.glb` (the item's number in items_game.txt), or
 * `<defindex>_<class>.glb` for an item with a model per class; anything
 * else in the directory is ignored. Uses the same storage as the rest of the site
 * (R2/S3 when configured, the local filesystem otherwise), so run it with the
 * target environment's variables. See docs/tf2-hub.md → "3D models".
 */

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { putObject } from '../../lib/storage/s3.server';
import { modelKey } from '../../lib/tf2-loadout/models.server';

const dir = process.argv[2];
if (!dir) {
  console.error('usage: upload.ts <dir-of-glb-files>');
  process.exit(1);
}

const MAGIC = 0x46546c67; // "glTF"
let ok = 0;
let skipped = 0;
for (const name of readdirSync(dir)) {
  const m = /^(\d{1,7}(?:_[a-z]{3,10})?)\.glb$/.exec(name);
  if (!m) continue;
  const bytes = readFileSync(path.join(dir, name));
  if (bytes.length < 12 || bytes.readUInt32LE(0) !== MAGIC) {
    console.warn(`skip ${name}: not a binary glTF`);
    skipped++;
    continue;
  }
  await putObject(modelKey(m[1]), bytes, 'model/gltf-binary');
  ok++;
}
process.stdout.write(`uploaded ${ok} model(s)${skipped ? `, skipped ${skipped}` : ''}\n`);
process.exit(0);
