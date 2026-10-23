/* eslint-disable no-console -- benchmark CLI reports measured CPU latency */
import { execFileSync } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import { buildWasm } from './build-wasm.mjs';

await buildWasm();
await mkdir('.cache', { recursive: true });
execFileSync(
  process.execPath,
  [
    'node_modules/vitest/vitest.mjs',
    'bench',
    '--run',
    'lib/wasm/numerics.bench.ts',
    '--reporter=json',
    '--outputFile=.cache/wasm-bench.json',
  ],
  { stdio: 'inherit' },
);
const report = JSON.parse(await readFile('.cache/wasm-bench.json', 'utf8'));
for (const file of report.testResults) {
  for (const test of file.assertionResults) {
    const tasks = test.benchmarks[0].tasks;
    const js = tasks.find((task) => task.name === 'JavaScript').latency.p50;
    const wasm = tasks.find((task) => task.name === 'WebAssembly').latency.p50;
    console.log(test.title);
    console.table({
      JavaScript: { medianMs: js.toFixed(4) },
      WebAssembly: { medianMs: wasm.toFixed(4) },
    });
    console.log(`Warm CPU speedup: ${(js / wasm).toFixed(2)}x\n`);
  }
}
