import { createRequire } from 'node:module';
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';
import { afterAll, describe, expect, it } from 'vitest';

import { resolveDecoder } from '../decode.server';

/**
 * Uploaded songs charted nothing in production because the jobs worker is an
 * esbuild CJS bundle, and `import decode from '@audio/decode'` compiled there to
 * a namespace object rather than a function (see `lib/audio/decode.server.ts`).
 * Vitest and `tsx` hand over the real default, so only a test that builds the
 * module the way `pnpm build` does can see it.
 */

const OUT = path.resolve(process.cwd(), 'node_modules/.cache/decode-bundle-test');

function tinyWav(): Uint8Array {
  const rate = 8000;
  const samples = 800;
  const bytes = new Uint8Array(44 + samples * 2);
  const view = new DataView(bytes.buffer);
  const ascii = (offset: number, text: string) =>
    [...text].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + samples * 2, true);
  ascii(8, 'WAVEfmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, 'data');
  view.setUint32(40, samples * 2, true);
  for (let i = 0; i < samples; i++) {
    view.setInt16(44 + i * 2, Math.round(Math.sin(i / 6) * 12000), true);
  }
  return bytes;
}

describe('decodeAudio in the production (esbuild CJS) bundle', () => {
  afterAll(() => rmSync(OUT, { recursive: true, force: true }));

  it('decodes audio when bundled with the build script’s settings', async () => {
    mkdirSync(OUT, { recursive: true });
    await build({
      entryPoints: [path.resolve('lib/audio/decode.server.ts')],
      outfile: path.join(OUT, 'decode.server.cjs'),
      bundle: true,
      platform: 'node',
      target: 'node22',
      format: 'cjs',
      packages: 'external',
      tsconfig: path.resolve('tsconfig.server.json'),
      logLevel: 'silent',
    });

    const bundled = createRequire(path.join(OUT, 'x.cjs'))(path.join(OUT, 'decode.server.cjs')) as {
      decodeAudio: (source: Uint8Array) => Promise<{ channelData: Float32Array[]; sampleRate: number }>;
    };
    const decoded = await bundled.decodeAudio(tinyWav());
    expect(decoded.sampleRate).toBe(8000);
    expect(decoded.channelData[0]?.length).toBe(800);
  });
});

describe('resolveDecoder', () => {
  const fn = async () => ({ channelData: [], sampleRate: 1 });

  it('finds the function at every depth a loader may leave it', () => {
    expect(resolveDecoder(fn)).toBe(fn);
    expect(resolveDecoder({ default: fn })).toBe(fn);
    expect(resolveDecoder({ default: { default: fn } })).toBe(fn);
  });

  it('fails loudly rather than returning something uncallable', () => {
    expect(() => resolveDecoder({ default: {} })).toThrow(/decode function/);
    expect(() => resolveDecoder(null)).toThrow(/decode function/);
  });
});
