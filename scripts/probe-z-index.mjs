#!/usr/bin/env node
/* eslint-disable no-console -- CLI script */
/**
 * Proof for the E2 z-index conversions: every site-tier declaration that moved from a raw number
 * to a `--z-*` token must resolve to exactly the number it replaced.
 *
 *   node scripts/probe-z-index.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(join(root, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const globals = read('app/globals.css');
const tokens = new Map([...globals.matchAll(/^\s*(--z-[a-z-]+):\s*(-?\d+);/gm)].map((m) => [m[1], Number(m[2])]));

/** [file, selector, old literal] */
const CONVERTED = [
  ['components/security/security.css', '.sec-skip', 200],
  ['components/library/album-viewer.css', '.av', 50],
  ['components/library/book-3d.css', '.b3d', 50],
  ['components/library/library.css', '.lib-upload__overlay', 50],
  ['components/library/library.css', '.lib-ctx', 1000],
  ['app/globals.css', 'html[data-bedtime]::before,\nhtml[data-bedtime]::after', 2147483000],
];

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
let bad = 0;
const rows = [];
for (const [file, sel, old] of CONVERTED) {
  const m = new RegExp(`(?:^|[}\\s])${esc(sel)}\\s*\\{([^{}]*)\\}`, 'm').exec(read(file));
  const z = m && /z-index:\s*([^;]+);/.exec(m[1]);
  const expr = z ? z[1].trim() : '(missing)';
  const ref = /^var\((--z-[a-z-]+)\)$/.exec(expr);
  const now = ref ? tokens.get(ref[1]) : Number.NaN;
  const ok = now === old;
  if (!ok) bad++;
  rows.push(`${ok ? 'OK ' : 'BAD'}  ${file}  ${sel.replace(/\n/g, ' ')}  ${old} -> ${expr} = ${now}`);
}
console.log(rows.join('\n'));
if (bad) {
  console.error(`\n${bad} conversion(s) changed the computed z-index`);
  process.exit(1);
}
console.log(`\nall ${rows.length} converted declarations compute to their old literal`);
