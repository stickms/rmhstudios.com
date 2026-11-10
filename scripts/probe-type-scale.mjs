#!/usr/bin/env node
/* eslint-disable no-console -- CLI script */
/**
 * Proof for the E2 named type steps and layer utilities (app/globals.css, the block
 * between "E2 type scale" and "A full radius").
 *
 * For every arbitrary class the codemod replaced it compiles BOTH the arbitrary form and
 * the named form with Tailwind itself (@tailwindcss/node), under the variants the site
 * uses, and fails unless the emitted CSS is identical once the class name is normalised.
 * That is the "zero visual change" claim, checked by the compiler instead of by eye.
 *
 *   node scripts/probe-type-scale.mjs
 */
import { readCssInlined } from './css-inline.mjs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const req = createRequire(join(root, 'package.json'));
const viteReq = createRequire(req.resolve('@tailwindcss/vite'));
const { compile } = await import(viteReq.resolve('@tailwindcss/node'));

const globals = readCssInlined(join(root, 'app/globals.css'));
const start = globals.indexOf('/* E2 type scale');
const end = globals.indexOf('/* A full radius');
if (start < 0 || end < 0) throw new Error('E2 block markers not found in app/globals.css');
// The z tokens live in :root; the utilities read them, so the probe needs the values too.
const rootTokens = [...globals.matchAll(/^\s*(--z-[a-z-]+:\s*\d+;)/gm)].map((m) => m[1]).join('\n');

/** [arbitrary, named] */
export const PAIRS = [
  ['text-[7px]', 'text-pico'],
  ['text-[8px]', 'text-nano'],
  ['text-[9px]', 'text-tiny'],
  ['text-[10px]', 'text-micro'],
  ['text-[11px]', 'text-caption'],
  ['text-[15px]', 'text-body'],
  ['text-[0.9375rem]', 'text-body-rem'],
  ['text-[0.6rem]', 'text-rem-60'],
  ['text-[0.62rem]', 'text-rem-62'],
  ['text-[0.64rem]', 'text-rem-64'],
  ['text-[0.65rem]', 'text-rem-65'],
  ['text-[0.68rem]', 'text-rem-68'],
  ['text-[0.7rem]', 'text-rem-70'],
  ['text-[0.72rem]', 'text-rem-72'],
  ['z-[1]', 'z-content'],
  ['z-[60]', 'z-topbar'],
  ['z-[90]', 'z-hub-overlay'],
  ['z-[91]', 'z-palette'],
  ['z-[100]', 'z-popover'],
  ['z-[120]', 'z-call'],
  ['z-[121]', 'z-call-dialog'],
];
const VARIANTS = ['', 'sm:', 'md:', 'hover:', '!', 'md:hover:'];

const css = `@import 'tailwindcss/theme.css' layer(theme);
@import 'tailwindcss/utilities.css' layer(utilities);
:root{${rootTokens}}
${globals.slice(start, end)}`;

// A compiler accumulates every candidate it has built, so each probe gets a fresh one.
const fresh = () => compile(css, { base: root, onDependency() {} });

const tokenValue = Object.fromEntries(
  [...rootTokens.matchAll(/(--z-[a-z-]+):\s*(\d+);/g)].map((m) => [m[1], m[2]]),
);

/**
 * The utility rules only, with the class selector normalised to `.X` and `var(--z-*)` resolved
 * to the :root value (the layer tokens are the point; the computed z-index must be the same).
 */
async function emitted(candidate) {
  const out = (await fresh()).build([candidate]);
  const from = out.indexOf('@layer utilities');
  const to = out.indexOf(':root', from);
  const body = out.slice(from, to < 0 ? undefined : to);
  const esc = candidate.replace(/[^a-zA-Z0-9_-]/g, (c) => '\\' + c);
  return body
    .split('.' + esc)
    .join('.X')
    .replace(/var\((--z-[a-z-]+)\)/g, (_, n) => tokenValue[n])
    .replace(/\s+/g, ' ')
    .trim();
}

let bad = 0;
for (const [arb, named] of PAIRS) {
  for (const v of VARIANTS) {
    const bang = v === '!';
    const a = bang ? `${arb}!` : `${v}${arb}`;
    const n = bang ? `${named}!` : `${v}${named}`;
    const ea = await emitted(a);
    const en = await emitted(n);
    const ok = ea === en && ea.includes('X');
    if (!ok) {
      bad++;
      console.log(`MISMATCH ${a}\n   ${ea}\n ${n}\n   ${en}`);
    }
  }
  console.log(`ok  ${arb.padEnd(18)} -> ${named.padEnd(14)} ${await emitted(arb)}`);
}
if (bad) {
  console.error(`${bad} mismatches`);
  process.exit(1);
}
console.log(`\n${PAIRS.length} mappings x ${VARIANTS.length} variant forms identical`);
