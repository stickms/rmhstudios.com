import { describe, expect, it } from 'vitest';
import { Resvg } from '@resvg/resvg-js';
import { dedupeOgRender, svgToPng } from '../render.server';

const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50"><rect width="100" height="50" fill="red"/><circle cx="50" cy="25" r="20" fill="blue"/></svg>';

describe('og render helpers', () => {
  it('svgToPng matches the synchronous Resvg output byte for byte', async () => {
    const sync = Buffer.from(
      new Resvg(SVG, { fitTo: { mode: 'width', value: 200 } }).render().asPng(),
    );
    expect((await svgToPng(SVG, 200)).equals(sync)).toBe(true);
  });

  it('dedupeOgRender shares one render per key and clears after settle', async () => {
    let calls = 0;
    const render = async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 10));
      return Buffer.from('x');
    };
    const [a, b] = await Promise.all([dedupeOgRender('k', render), dedupeOgRender('k', render)]);
    expect(calls).toBe(1);
    expect(a).toBe(b);
    await dedupeOgRender('k', render);
    expect(calls).toBe(2);
  });

  it('does not memoize failures', async () => {
    await expect(dedupeOgRender('f', () => Promise.reject(new Error('boom')))).rejects.toThrow(
      'boom',
    );
    await expect(dedupeOgRender('f', async () => Buffer.from('ok'))).resolves.toBeInstanceOf(
      Buffer,
    );
  });
});
