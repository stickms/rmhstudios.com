/**
 * Builds the pre-paint script: bundles lib/prepaint/entry.ts (and the tiny
 * body-entry.ts) with esbuild into minified ES2017 IIFEs and writes them, with
 * their sha256 (base64 — the form a CSP `'sha256-…'` source takes), to the
 * GENERATED module lib/prepaint/generated.ts.
 *
 *     pnpm prepaint:build     # regenerate
 *     pnpm prepaint:check     # regenerate in memory and diff (CI + commit gate)
 *
 * Why generated rather than built by Vite: `app/routes/__root.tsx` emits the
 * string as inline <script> text during SSR and needs the exact bytes (and their
 * hash) at module load, with no asset pipeline in between.
 */
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'lib', 'prepaint', 'generated.ts');

async function bundle(entry: string): Promise<string> {
  const res = await build({
    entryPoints: [join(ROOT, 'lib', 'prepaint', entry)],
    bundle: true,
    write: false,
    format: 'iife',
    minify: true,
    target: 'es2017',
    platform: 'browser',
    legalComments: 'none',
    charset: 'ascii',
    tsconfig: join(ROOT, 'tsconfig.json'),
    logLevel: 'silent',
  });
  if (res.outputFiles.length !== 1) throw new Error(`prepaint: ${entry} produced several outputs`);
  return res.outputFiles[0].text.trim();
}

const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('base64');

export async function generate(): Promise<string> {
  const head = await bundle('entry.ts');
  const body = await bundle('body-entry.ts');
  return `// GENERATED FILE — do not edit by hand.
// Source: lib/prepaint/*.ts (entry.ts, body-entry.ts). Regenerate with \`pnpm prepaint:build\`;
// \`pnpm prepaint:check\` (commit gate + CI) fails when this file is stale.
//
// PREPAINT_CODE is the ONE inline <script> the root document runs before first
// paint; PREPAINT_BODY_CODE is the tiny <body>-top companion. The hashes are
// base64 sha256 of the exact text, ready for a CSP 'sha256-…' source (redesign F5).

export const PREPAINT_CODE = ${JSON.stringify(head)};
export const PREPAINT_SHA256 = ${JSON.stringify(sha256(head))};

export const PREPAINT_BODY_CODE = ${JSON.stringify(body)};
export const PREPAINT_BODY_SHA256 = ${JSON.stringify(sha256(body))};
`;
}

async function main() {
  const next = await generate();
  if (process.argv.includes('--check')) {
    const current = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';
    if (current !== next) {
      console.error('lib/prepaint/generated.ts is stale — run `pnpm prepaint:build` and stage it.');
      process.exit(1);
    }
    process.stdout.write('lib/prepaint/generated.ts is current\n');
    return;
  }
  writeFileSync(OUT, next);
  process.stdout.write(`wrote lib/prepaint/generated.ts (${next.length} bytes)\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
