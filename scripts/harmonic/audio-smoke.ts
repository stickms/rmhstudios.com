/**
 * Browser smoke for Harmonic's audio (plan H3.3), against a running `pnpm dev`:
 *
 *   [CHROMIUM_PATH=/path/to/chrome] pnpm exec tsx scripts/harmonic/audio-smoke.ts [base-url]
 *
 * 1. Renders a handful of sounds in the page through an `OfflineAudioContext` and asserts each is
 *    audible (RMS above a floor) and does not clip (peak < 1).
 * 2. Opens /harmonic, starts the dev level, walks, and asserts the audio player (dev hook
 *    `window.__harmonicAudio`) recorded footstep playbacks from the simulation, and that bus events
 *    (`harmonicSounds`) and the volume setting reach it.
 */
import { chromium, type Page } from 'playwright';

const base = process.argv[2] ?? 'http://localhost:7005';

interface Offline {
  peak: number;
  rms: number;
  seconds: number;
  channels: number;
}
interface AudioDebug {
  state: string;
  voices: number;
  area: string | null;
  plays: number;
  recent: Array<{ sound: string; source: string; positional: boolean }>;
  counts: Record<string, number>;
}

const SAMPLE = [
  'step.concrete',
  'step.snow',
  'pulse.fire',
  'coil.fire',
  'tuner.shift',
  'unstrung.voice',
  'ship.groan',
  'bed.ice_open',
  'wind.loop',
  'radio.static',
] as const;

const audioDebug = (page: Page): Promise<AudioDebug | null> =>
  page.evaluate(() => {
    const a = (window as unknown as { __harmonicAudio?: { debug(): unknown } }).__harmonicAudio;
    return (a?.debug() as AudioDebug | undefined) ?? null;
  });

async function main(): Promise<void> {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: [
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist',
      '--autoplay-policy=no-user-gesture-required',
    ],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  const errors: string[] = [];

  await page.goto(`${base}/harmonic`, { waitUntil: 'networkidle', timeout: 120_000 });

  // 1. Offline renders.
  const rendered = await page.evaluate(async (names) => {
    // Root-relative: Vite's dev server serves the repo's modules by path.
    const mod = (await import(/* @vite-ignore */ '/lib/harmonic-game/audio/synth.ts')) as {
      renderOffline(name: string, variant?: number): Promise<Offline>;
    };
    const out: Record<string, Offline> = {};
    for (const n of names) out[n] = await mod.renderOffline(n, 0);
    return out;
  }, SAMPLE as unknown as string[]);
  for (const [name, m] of Object.entries(rendered)) {
    process.stdout.write(
      `${name.padEnd(16)} peak ${m.peak.toFixed(3)} rms ${m.rms.toFixed(3)} ${m.seconds.toFixed(2)}s x${m.channels}\n`,
    );
    if (!(m.peak < 1)) errors.push(`${name} clips (peak ${m.peak})`);
    if (!(m.rms > 0.01)) errors.push(`${name} is near-silent (rms ${m.rms})`);
    if (!(m.peak > 0.1)) errors.push(`${name} is too quiet (peak ${m.peak})`);
  }

  // 2. The game: walking makes footstep playbacks. A fresh load, so the page is the real app.
  await page.goto(`${base}/harmonic`, { waitUntil: 'networkidle', timeout: 120_000 });
  await page.screenshot({ path: '/tmp/h33-title.png' }).catch(() => {});
  await page.getByRole('button', { name: 'New game' }).click();
  await page.waitForSelector('canvas', { timeout: 60_000 });
  await page.waitForFunction(
    () => {
      const g = (
        window as unknown as { __rmhGame?: { debug?: () => { stats: { drawCalls: number } } } }
      ).__rmhGame;
      return (g?.debug?.().stats.drawCalls ?? 0) > 0;
    },
    undefined,
    { timeout: 90_000 },
  );
  await page.waitForTimeout(1500);
  await page.mouse.click(640, 360);
  await page.waitForTimeout(300);
  const before = await audioDebug(page);
  if (!before) errors.push('no audio player (window.__harmonicAudio missing)');
  await page.keyboard.down('w');
  await page.waitForTimeout(3500);
  await page.keyboard.up('w');
  const after = await audioDebug(page);
  const steps = Object.entries(after?.counts ?? {})
    .filter(([k]) => k.startsWith('step.'))
    .reduce((n, [, c]) => n + c, 0);
  process.stdout.write(
    `audio state ${after?.state}, area ${after?.area}, plays ${after?.plays}, footsteps ${steps}\n`,
  );
  if (steps < 2) errors.push(`walking made ${steps} footstep playbacks`);
  if (after?.state !== 'running') errors.push(`audio context is ${after?.state}`);

  // A bus event reaches the player.
  const bus = await page.evaluate(async () => {
    const mod = (await import(/* @vite-ignore */ '/lib/harmonic-game/audio/events.ts')) as {
      harmonicSounds: { sfx(name: string): void };
    };
    mod.harmonicSounds.sfx('tuner.shift');
    const a = (window as unknown as { __harmonicAudio?: { debug(): AudioDebug } }).__harmonicAudio;
    return a?.debug().counts['tuner.shift'] ?? 0;
  });
  if (bus < 1) errors.push('a bus event did not reach the player');

  if (problems.length) errors.push(...problems);
  await browser.close();
  if (errors.length) {
    process.stderr.write(`${errors.join('\n')}\n`);
    process.exit(1);
  }
  process.stdout.write('audio smoke ok\n');
}

void main();
