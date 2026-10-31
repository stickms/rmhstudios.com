/**
 * Frame-pacing probe for /balatro (not a test; a measuring tool):
 *
 *   pnpm exec tsx testing/balatro-e2e/perf-probe.ts [--browser chromium|firefox] [--secs 12] [--size 1280x720]
 *
 * Boots the real engine in the engine-spec harness (software WebGL on a CI box, so the
 * absolute numbers are slow; compare runs against each other, not against a GPU), then
 * records requestAnimationFrame intervals on the main menu and in a live run, and prints
 * mean / p95 / p99 / max frame time and the count of frames over 2× and 4× the median.
 */
import { chromium, firefox, type Browser } from 'playwright';
import { buildHarness } from './lib/build-harness';
import { chromiumLaunchOptions } from './lib/chromium';
import { openEngine } from './lib/engine-driver';
import { startStaticServer } from './lib/static-server';

const argv = process.argv.slice(2);
const arg = (k: string, d: string) => {
  const i = argv.indexOf(`--${k}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};
const kind = arg('browser', 'chromium');
const secs = Number(arg('secs', '12'));
const [vw, vh] = arg('size', '1280x720').split('x').map(Number);

interface Stats {
  frames: number;
  fps: number;
  mean: number;
  p95: number;
  p99: number;
  max: number;
  over2x: number;
  over4x: number;
  median: number;
}

/**
 * Times the engine's own frame callbacks (everything Lua and wasm do in one
 * requestAnimationFrame), which software rendering does not distort: GL work happens
 * in another process. window.__cpu is read and reset by the probe.
 */
const CPU_TIMER = `(() => {
  const raf = window.requestAnimationFrame.bind(window);
  window.__cpu = [];
  window.__long = [];
  window.requestAnimationFrame = (cb) => raf((t) => {
    const s = performance.now();
    cb(t);
    const d = performance.now() - s;
    window.__cpu.push(d);
    if (d > 40) window.__long.push([Math.round(s), Math.round(d)]);
  });
})();`;

async function main() {
  const bundleDir = await buildHarness();
  const server = await startStaticServer({ bundleDir });
  const browser: Browser =
    kind === 'firefox'
      ? // Headless Firefox here has no WebGL (no EGL); under Xvfb it gets Mesa's llvmpipe:
        //   xvfb-run -a pnpm exec tsx testing/balatro-e2e/perf-probe.ts --browser firefox
        await firefox.launch({
          ...(process.env.FIREFOX_PATH ? { executablePath: process.env.FIREFOX_PATH } : {}),
          headless: !process.env.DISPLAY,
          env: { ...process.env, LIBGL_ALWAYS_SOFTWARE: '1' },
          firefoxUserPrefs: { 'gfx.webrender.software': true, 'webgl.forbid-software': false },
        })
      : await chromium.launch(chromiumLaunchOptions());
  try {
    const engine = await openEngine(browser, server.url, { query: '', timeoutMs: 240_000, initScript: CPU_TIMER });
    await engine.page.setViewportSize({ width: vw, height: vh });
    // A string, not a function: tsx's keepNames helper (`__name`) does not exist in the page.
    const script = (ms: number) => `(async () => {
      const dts = [];
      let last = performance.now();
      const end = last + ${ms};
      await new Promise((resolve) => {
        const tick = (t) => { dts.push(t - last); last = t; if (t < end) requestAnimationFrame(tick); else resolve(); };
        requestAnimationFrame(tick);
      });
      dts.shift();
      const sorted = [...dts].sort((a, b) => a - b);
      const q = (p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
      const median = q(0.5);
      const mean = dts.reduce((a, b) => a + b, 0) / dts.length;
      return { frames: dts.length, fps: 1000 / mean, mean, median, p95: q(0.95), p99: q(0.99),
        max: sorted[sorted.length - 1], over2x: dts.filter((d) => d > median * 2).length,
        over4x: dts.filter((d) => d > median * 4).length };
    })()`;
    const sample = (_label: string) => engine.page.evaluate(script(secs * 1000)) as Promise<Stats>;
    const cpu = async () => {
      const xs = (await engine.page.evaluate('(() => { const a = window.__cpu; window.__cpu = []; return a; })()')) as number[];
      const sorted = [...xs].sort((a, b) => a - b);
      const q = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? 0;
      return { median: q(0.5), p95: q(0.95), p99: q(0.99), max: sorted[sorted.length - 1] ?? 0, over16: xs.filter((x) => x > 16.7).length, n: xs.length };
    };
    const printCpu = (label: string, c: Awaited<ReturnType<typeof cpu>>) =>
      process.stdout.write(
        `${kind} ${label.padEnd(8)} cpu/frame  median ${c.median.toFixed(1)}ms  p95 ${c.p95.toFixed(1)}  p99 ${c.p99.toFixed(1)}  max ${c.max.toFixed(1)}  >16.7ms ${c.over16}/${c.n}\n`,
      );
    const print = (label: string, s: Stats) =>
      process.stdout.write(
        `${kind} ${label.padEnd(8)} ${s.frames} frames  ${s.fps.toFixed(1)} fps  mean ${s.mean.toFixed(1)}ms  median ${s.median.toFixed(1)}  p95 ${s.p95.toFixed(1)}  p99 ${s.p99.toFixed(1)}  max ${s.max.toFixed(1)}  >2x ${s.over2x}  >4x ${s.over4x}\n`,
      );
    await engine.page.waitForTimeout(3000);
    // Frames over 40 ms since page load: the engine's start-up and, in time, the audio pack's arrival.
    const long = (await engine.page.evaluate('window.__long')) as number[][];
    process.stdout.write(`${kind} frames >40ms since load (t ms, cost ms): ${JSON.stringify(long)}\n`);
    await cpu();
    print('menu', await sample('menu'));
    printCpu('menu', await cpu());
    await engine.call('start_run', { seed: 'PERF' });
    await engine.page.waitForTimeout(4000);
    await cpu();
    print('run', await sample('run'));
    printCpu('run', await cpu());
    const st = await engine.pageState();
    const all = (await engine.page.evaluate('window.__balatroEngine.state.logs')) as string[];
    process.stdout.write(`${kind} engine log: ${all.filter((l) => /audio|sound|thread|scale|TMP/i.test(l)).join(' | ')}\n`);
    if (st.status !== 'ready' || engine.errors.length) process.stdout.write(`${kind} state ${st.status} ${st.error}\n${st.logs.slice(-15).join('\n')}\n${engine.errors.join('\n')}\n`);
    await engine.close();
  } finally {
    await browser.close().catch(() => {});
    await server.close();
  }
}
main().then(
  () => process.exit(0),
  (e) => {
    process.stderr.write(`${e instanceof Error ? (e.stack ?? e.message) : String(e)}\n`);
    process.exit(1);
  },
);
