// Platform-independent compiler: no native SDK in developer machines or ARM64 CI.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import asc from 'assemblyscript/asc';

const root = fileURLToPath(new URL('../', import.meta.url));
let pending;
export function buildWasm() {
  return (pending ??= compileKernels());
}

async function compileKernels() {
  const output = new URL('../lib/wasm/generated/', import.meta.url);
  await mkdir(output, { recursive: true });
  // Compile the authoritative elliptic implementation instead of maintaining a
  // second numerical algorithm. Only scalar type annotations differ in Wasm.
  const elliptic = await readFile(
    new URL('../lib/eversion/projections/elliptic.ts', import.meta.url),
    'utf8',
  );
  const kernel = elliptic
    .slice(elliptic.indexOf('function csqrt('))
    .replaceAll('\r\n', '\n')
    .replaceAll(': number', ': f64')
    .replaceAll(']!', ']')
    .replace('o: f64', 'o: i32')
    .replace(/^ {2}let (\w+) = ([01]);$/gm, '  let $1: f64 = $2;');
  await mkdir(new URL('../wasm/.generated/', import.meta.url), { recursive: true });
  await writeFile(new URL('../wasm/.generated/elliptic.ts', import.meta.url), kernel);
  for (const name of ['dough', 'projection']) {
    const { error, stderr } = await asc.main(
      [
        `wasm/${name}.ts`,
        '--outFile',
        `lib/wasm/generated/${name}.wasm`,
        '--optimizeLevel',
        '3',
        '--shrinkLevel',
        '1',
        '--runtime',
        'stub',
        '--noAssert',
        '--use',
        'abort=',
        '--initialMemory',
        name === 'dough' ? '4' : '66',
        '--maximumMemory',
        name === 'dough' ? '4' : '66',
      ],
      { cwd: root },
    );
    if (error) throw new Error(stderr.toString());
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await buildWasm();
