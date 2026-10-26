#!/usr/bin/env node
/**
 * Regenerates `public/tf2-hud/base/manifest.json` — the index of the vendored
 * "TF2 Default" base HUD (filtered by import-base.mjs).
 *
 * The editor fetches the manifest once and each base file lazily, so opening a
 * project never downloads all 735 files. The SHA-1 of every file lets the
 * changed-files view tell "modified" from "untouched" without fetching the base
 * copy at all.
 *
 *   node scripts/tf2-hud/build-manifest.mjs          # write
 *   node scripts/tf2-hud/build-manifest.mjs --check  # exit 1 if stale (CI)
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../public/tf2-hud/base',
);
const OUT = path.join(ROOT, 'manifest.json');
const SOURCE = {
  repo: 'https://github.com/stickms/stickshud',
  /** Identifies this snapshot of the base (see import-base.mjs); shown in exports. */
  commit: 'tf2-default-2026-10-26',
  license: 'GPL-3.0-only',
};

function walk(dir) {
  return readdirSync(dir)
    .sort()
    .flatMap((name) => {
      const full = path.join(dir, name);
      return statSync(full).isDirectory() ? walk(full) : [full];
    });
}

export function buildManifest() {
  const files = walk(ROOT)
    .filter((f) => f !== OUT && path.basename(f) !== 'LICENSE')
    .map((f) => {
      const bytes = readFileSync(f);
      // Compact tuples — [path, size, sha1] — keep a 4,000-entry index small enough
      // to ship on first load (≈100 KB gzipped).
      return [
        path.relative(ROOT, f).split(path.sep).join('/'),
        bytes.length,
        createHash('sha1').update(bytes).digest('hex'),
      ];
    });
  const rows = files.map((f) => ` ${JSON.stringify(f)}`).join(',\n');
  return `{"version":2,"source":${JSON.stringify(SOURCE)},"files":[\n${rows}\n]}\n`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const next = buildManifest();
  if (process.argv.includes('--check')) {
    let current = '';
    try {
      current = readFileSync(OUT, 'utf8');
    } catch {
      /* missing */
    }
    if (current !== next) {
      console.error(
        'tf2-hud base manifest is stale — run: node scripts/tf2-hud/build-manifest.mjs',
      );
      process.exit(1);
    }
  } else {
    writeFileSync(OUT, next);
    process.stdout.write(`wrote ${OUT}\n`);
  }
}
