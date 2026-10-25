/** Content-addressed directory versions; only these three short hashes enter the client. */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const STATIC_ASSET_DIRS = ['music', 'models', 'sprites'];
export function staticAssetVersions(publicDir) {
  const versions = {};
  function walk(root, relative = '') {
    const entries = readdirSync(join(root, relative), { withFileTypes: true }).sort((a, b) =>
      a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
    );
    return entries.flatMap((entry) => {
      const name = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) throw new Error(`Static asset symlink is unsupported: ${name}`);
      return entry.isDirectory() ? walk(root, name) : [name];
    });
  }
  for (const dir of STATIC_ASSET_DIRS) {
    const root = join(publicDir, dir);
    if (!existsSync(root)) continue;
    const hash = createHash('sha256');
    for (const file of walk(root)) {
      const digest = createHash('sha256')
        .update(readFileSync(join(root, file)))
        .digest('hex');
      hash.update(`${file}\0${digest}\n`);
    }
    versions[dir] = hash.digest('hex');
  }
  return versions;
}
export function parseAssetVersions(value) {
  const versions = JSON.parse(value);
  if (!versions || Array.isArray(versions) || typeof versions !== 'object')
    throw new Error('Invalid static asset versions');
  for (const [key, hash] of Object.entries(versions)) {
    if (
      !STATIC_ASSET_DIRS.includes(key) ||
      typeof hash !== 'string' ||
      !/^[a-f0-9]{64}$/.test(hash)
    )
      throw new Error('Invalid static asset version');
  }
  return versions;
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  process.stdout.write(JSON.stringify(staticAssetVersions(resolve(process.argv[2] || 'public'))));
}
