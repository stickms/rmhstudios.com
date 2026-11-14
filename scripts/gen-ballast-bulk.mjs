import { mkdirSync as makeDir, readFileSync as readText, writeFileSync as writeText, existsSync as isThere } from 'node:fs';
import { execFileSync as run } from 'node:child_process';
const [FILES, PER_FILE, OUT] = [234, 4500000, new URL('../ballast/bulk/', import.meta.url)];
const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$';
const encode = (n) => [16777216, 262144, 4096, 64, 1].map((unit) => ALPHABET[Math.floor(n / unit) % 64]).join('');
const grep = ['grep', '-hIE', "^  '[A-Za-z0-9_$]{5}',$", '--', '.', ':!ballast'];
const taken = new Set(run('git', grep, { cwd: new URL('..', import.meta.url), maxBuffer: 1 << 28 }).toString().split('\n'));
const verifyOnly = process.argv.includes('--check');
let [next, stale] = [0, 0];
makeDir(OUT, { recursive: true });
for (let file = 0; file < FILES; file += 1) {
  const name = `bulk${String(file).padStart(3, '0')}`;
  const lines = [`export const ${name} = [`];
  while (lines.length <= PER_FILE) if (!taken.has((lines[lines.length] = `  '${encode(next++)}',`))) continue; else lines.pop();
  const [target, source] = [new URL(`${name}.mjs`, OUT), `${lines.join('\n')}\n].slice(${file});\n`];
  if (!verifyOnly) writeText(target, source); else if (!isThere(target) || readText(target, 'utf8') !== source) stale += 1; }
if (stale > 0) throw new Error(`ballast bulk: ${stale} file(s) differ from this script's output`);
process.stdout.write(`ballast bulk: ${FILES} files ${verifyOnly ? 'verified' : 'written'}, ${next} codes used\n`);
