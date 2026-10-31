/**
 * The full in-engine UI sweep (lib/balatro/lua/mp_test/specs/ui_sweep_full.lua), chunk by chunk,
 * each chunk in a fresh engine boot (one boot for the whole sweep runs the page out of memory on
 * software WebGL). The chunks are the Lua file's CHUNKS table (lib/sweep-chunks.ts).
 *
 *   pnpm exec tsx testing/balatro-e2e/engine/sweep.ts [--chunk id ...] [--list]
 *
 * Prints each chunk's TAP and time, then a table of every chunk's time and result; exit code 1
 * when any chunk failed (or did not boot). CI: the nightly `e2e-sweep` job
 * (.github/workflows/balatro-mp-tests.yml). BALATRO_E2E_SWEEP_CHUNK_TIMEOUT_MS bounds one chunk
 * (default 45 minutes).
 */
import { defaultEngineQuery, openEngine, startEngineStack } from '../lib/engine-driver';
import { toTap, type SpecSummary } from '../lib/channel';
import { chunkFilter, SWEEP_FILE, sweepChunks } from '../lib/sweep-chunks';

const argv = process.argv.slice(2);
const values = (k: string) =>
  argv.flatMap((a, i) => (a === `--${k}` && argv[i + 1] ? [argv[i + 1]!] : []));

const CHUNK_TIMEOUT_MS = Number(process.env.BALATRO_E2E_SWEEP_CHUNK_TIMEOUT_MS || 2_700_000);

interface Row {
  id: string;
  seconds: number;
  passed: number;
  failed: number;
  note: string;
}

async function runChunk(id: string): Promise<Row> {
  const t0 = Date.now();
  const row = (passed: number, failed: number, note = ''): Row => ({
    id,
    seconds: Math.round((Date.now() - t0) / 1000),
    passed,
    failed,
    note,
  });
  // A fresh browser per chunk too: nothing a chunk leaves behind can weigh on the next.
  const stack = await startEngineStack();
  try {
    const engine = await openEngine(stack.browser, stack.server.url, {
      query: defaultEngineQuery(),
      onLog: (l) => {
        // test results, and every error the sweep collected (it fails the test that saw it)
        if (/^(ok {2}|FAIL|CRASH|\[sweep-error\])/.test(l))
          process.stdout.write(`#   [${id}] ${l.slice(0, 600)}\n`);
      },
    });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(async () => {
          const st = await engine.pageState().catch(() => null);
          reject(
            new Error(
              `still running after ${Math.round(CHUNK_TIMEOUT_MS / 1000)} s; last engine log lines:\n${st ? st.logs.slice(-40).join('\n') : '(page state unavailable)'}`,
            ),
          );
        }, CHUNK_TIMEOUT_MS);
      });
      const s: SpecSummary = await Promise.race([
        engine.runSpecs({ files: [SWEEP_FILE], filter: chunkFilter(id) }),
        timeout,
      ]);
      process.stdout.write(`# chunk ${id}\n${toTap(s)}\n`);
      const errors = engine.errors.filter((e) => !/favicon|AudioContext|audio/i.test(e));
      for (const e of errors) process.stdout.write(`# page: ${e}\n`);
      if (s.tests.length === 0) return row(0, 1, 'no test matched the chunk');
      return row(s.passed, s.failed + (errors.length ? 1 : 0), errors.length ? 'page errors' : '');
    } finally {
      if (timer) clearTimeout(timer);
      await engine.close().catch(() => {});
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    process.stdout.write(`# chunk ${id} FAILED: ${msg}\n`);
    return row(0, 1, msg.split('\n')[0]!.slice(0, 120));
  } finally {
    await stack.close().catch(() => {});
  }
}

async function main(): Promise<number> {
  const all = sweepChunks();
  if (argv.includes('--list')) {
    for (const c of all) process.stdout.write(`${c.id}\t${c.tests.join(' | ')}\n`);
    return 0;
  }
  const wanted = values('chunk');
  const unknown = wanted.filter((w) => !all.some((c) => c.id === w));
  if (unknown.length) {
    process.stderr.write(`unknown chunk(s): ${unknown.join(', ')} (--list shows them)\n`);
    return 2;
  }
  const chunks = wanted.length ? all.filter((c) => wanted.includes(c.id)) : all;
  const rows: Row[] = [];
  for (const c of chunks) {
    process.stdout.write(`# chunk ${c.id}: ${c.tests.join(' | ')}\n`);
    rows.push(await runChunk(c.id));
  }
  process.stdout.write('\n# chunk                 seconds  passed  failed\n');
  for (const r of rows)
    process.stdout.write(
      `# ${r.id.padEnd(22)}${String(r.seconds).padStart(7)}${String(r.passed).padStart(8)}${String(r.failed).padStart(8)}  ${r.note}\n`,
    );
  const total = rows.reduce((n, r) => n + r.seconds, 0);
  const failed = rows.filter((r) => r.failed > 0);
  process.stdout.write(
    `# total ${total} s; ${failed.length ? `FAILED: ${failed.map((r) => r.id).join(', ')}` : 'all green'}\n`,
  );
  return failed.length ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (e) => {
    process.stderr.write(`${e instanceof Error ? (e.stack ?? e.message) : String(e)}\n`);
    process.exit(1);
  },
);
