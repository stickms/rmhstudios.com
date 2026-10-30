/**
 * Runs the in-engine specs from the command line (no vitest), for writing and
 * debugging specs:
 *
 *   pnpm exec tsx testing/balatro-e2e/engine/cli.ts [--filter text] [--spec name ...]
 *     [--shot out.png] [--verbose] [--quiet] [--serve]   (--serve: keep the harness up, print its URL)
 *
 * Prints TAP; exit code 1 when a spec fails or the engine does not boot.
 */
import { openEngine, startEngineStack } from '../lib/engine-driver';
import { toTap } from '../lib/channel';

const argv = process.argv.slice(2);
const values = (k: string) =>
  argv.flatMap((a, i) => (a === `--${k}` && argv[i + 1] ? [argv[i + 1]] : []));
const flag = (k: string) => argv.includes(`--${k}`);

async function main(): Promise<number> {
  const stack = await startEngineStack();
  if (flag('serve')) {
    process.stdout.write(`harness at ${stack.server.url}/ (Ctrl-C to stop)\n`);
    await new Promise(() => {});
  }
  try {
    const engine = await openEngine(stack.browser, stack.server.url, {
      verbose: flag('verbose'),
      onLog: flag('quiet') ? undefined : (l) => process.stdout.write(`# ${l.slice(0, 400)}\n`),
    });
    process.stdout.write(`# booted ${engine.version}\n`);
    const files = values('spec');
    const summary = await engine.runSpecs({
      files: files.length ? files : undefined,
      filter: values('filter')[0],
    });
    process.stdout.write(`${toTap(summary)}\n`);
    if (Object.keys(summary.reports).length)
      process.stdout.write(`# reports ${JSON.stringify(summary.reports)}\n`);
    const shot = values('shot')[0];
    if (shot) await engine.page.screenshot({ path: shot });
    for (const e of engine.errors) process.stdout.write(`# ${e}\n`);
    await engine.close();
    return summary.failed > 0 ? 1 : 0;
  } catch (e) {
    process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
    return 1;
  } finally {
    await stack.close();
  }
}

main().then((code) => process.exit(code));
