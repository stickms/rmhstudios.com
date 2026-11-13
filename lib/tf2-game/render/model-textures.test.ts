import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Texture } from 'three';
import { fitWithin, SharedModelTextures } from './model-textures';

const image = (width: number, height: number) => ({ naturalWidth: width, naturalHeight: height, width, height });

/** An image source that counts what it is asked for. */
function images(byUrl: Record<string, unknown>) {
  const asked: string[] = [];
  return {
    asked,
    loadAsync: async (url: string) => {
      asked.push(url);
      if (!(url in byUrl)) throw new Error(`404 ${url}`);
      return byUrl[url];
    },
  };
}

const load = (textures: SharedModelTextures, url: string) =>
  new Promise<Texture>((resolve, reject) => textures.load(url, resolve, undefined, reject));

afterEach(() => vi.unstubAllGlobals());

describe('SharedModelTextures', () => {
  it('decodes a texture file once however many models name it, and gives each a texture on the one source', async () => {
    const src = images({ 'tex/crate.webp': image(256, 512), 'tex/door.webp': image(128, 128) });
    const textures = new SharedModelTextures({}, src);
    const [a, b, c, d] = await Promise.all([
      load(textures, 'tex/crate.webp'),
      load(textures, 'tex/crate.webp'),
      load(textures, 'tex/door.webp'),
      load(textures, 'tex/crate.webp'),
    ]);
    expect(src.asked.sort()).toEqual(['tex/crate.webp', 'tex/door.webp']);
    expect(textures.size).toBe(2);
    // Textures of their own (a model sets its sampler and name on its texture)…
    expect(new Set([a, b, c, d]).size).toBe(4);
    // …on one source, which is what three.js keys the GPU texture by.
    expect(b.source).toBe(a.source);
    expect(d.source).toBe(a.source);
    expect(c.source).not.toBe(a.source);
    for (const t of [a, b, c, d]) expect(t.version).toBeGreaterThan(0);
  });

  it('keeps an image embedded in a GLB to that GLB', async () => {
    const one = image(64, 64);
    const src = images({ 'blob:https://x/1': one, 'data:image/png;base64,AAAA': one });
    const textures = new SharedModelTextures({}, src);
    const a = await load(textures, 'blob:https://x/1');
    const b = await load(textures, 'blob:https://x/1');
    await load(textures, 'data:image/png;base64,AAAA');
    expect(src.asked.length).toBe(3);
    expect(b.source).not.toBe(a.source);
    expect(textures.size).toBe(0);
  });

  it('shrinks a picture larger than the cap once, before any texture holds it', async () => {
    const made: Array<{ w: number; h: number }> = [];
    vi.stubGlobal('createImageBitmap', async (_src: unknown, o: { resizeWidth: number; resizeHeight: number; premultiplyAlpha: string }) => {
      expect(o.premultiplyAlpha).toBe('none');
      made.push({ w: o.resizeWidth, h: o.resizeHeight });
      return { width: o.resizeWidth, height: o.resizeHeight, bitmap: true };
    });
    const small = image(256, 256);
    const textures = new SharedModelTextures({ maxSize: 512 }, images({ big: image(2048, 1024), small }));
    const [a, b, c] = await Promise.all([load(textures, 'big'), load(textures, 'big'), load(textures, 'small')]);
    expect(made).toEqual([{ w: 512, h: 256 }]);
    expect(a.image).toMatchObject({ width: 512, height: 256, bitmap: true });
    expect(b.image).toBe(a.image);
    expect(c.image).toBe(small);
  });

  it('keeps pictures as they are without a cap', async () => {
    const resize = vi.fn();
    vi.stubGlobal('createImageBitmap', resize);
    const big = image(2048, 2048);
    const t = await load(new SharedModelTextures({}, images({ big })), 'big');
    expect(t.image).toBe(big);
    expect(resize).not.toHaveBeenCalled();
  });

  it('reports a file that failed and asks for it again next time', async () => {
    const byUrl: Record<string, unknown> = {};
    const src = images(byUrl);
    const textures = new SharedModelTextures({}, src);
    await expect(load(textures, 'late')).rejects.toThrow('404');
    byUrl.late = image(8, 8);
    await expect(load(textures, 'late')).resolves.toBeTruthy();
    expect(src.asked).toEqual(['late', 'late']);
  });

  it('fits within the cap keeping the aspect', () => {
    expect(fitWithin(1024, 512, 512)).toEqual({ width: 512, height: 256 });
    expect(fitWithin(300, 200, 512)).toEqual({ width: 300, height: 200 });
    expect(fitWithin(4096, 1, 512)).toEqual({ width: 512, height: 1 });
  });
});
