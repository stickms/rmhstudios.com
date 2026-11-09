import { describe, expect, it, vi } from 'vitest';
import type { SharedScene } from '@/lib/liquid/glass/scene-store';
import { sceneImage } from '../scene-image';

const shot = (version: number, scrollY = 0): SharedScene => ({
  bitmap: { width: 10, height: 10, close() {} } as unknown as ImageBitmap,
  width: 1000,
  height: 800,
  scrollX: 0,
  scrollY,
  version,
});

function rig() {
  let scene: SharedScene | null = null;
  const subs = new Set<() => void>();
  const urls: string[] = [];
  const revoked: string[] = [];
  let n = 0;
  const img = sceneImage({} as Document, {
    current: () => scene,
    subscribe: (fn) => {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    encode: async () => ({}) as Blob,
    createUrl: () => {
      const u = `blob:scene-${++n}`;
      urls.push(u);
      return u;
    },
    revokeUrl: (u) => void revoked.push(u),
  });
  const publish = async (s: SharedScene | null) => {
    scene = s;
    for (const fn of [...subs]) fn();
    await Promise.resolve();
    await Promise.resolve();
  };
  return { img, publish, urls, revoked, subs };
}

describe('sceneImage', () => {
  it('encodes each new picture to one blob URL and revokes the previous one', async () => {
    const { img, publish, urls, revoked } = rig();
    expect(img.url).toBeNull();
    await publish(shot(1, 100));
    expect(img.url).toBe('blob:scene-1');
    expect(img.scrollY).toBe(100);
    expect(img.width).toBe(1000);
    await publish(shot(2, 250));
    expect(img.url).toBe('blob:scene-2');
    expect(img.scrollY).toBe(250);
    expect(revoked).toEqual(['blob:scene-1']);
    expect(urls).toHaveLength(2);
  });

  it('tells listeners and nulls the URL at once when the scene is cleared (Review Focus 4)', async () => {
    const { img, publish, revoked } = rig();
    await publish(shot(1));
    const seen: Array<string | null> = [];
    img.onChange(() => seen.push(img.url));
    await publish(null);
    expect(img.url).toBeNull();
    expect(seen).toEqual([null]);
    expect(revoked).toEqual(['blob:scene-1']);
  });

  it('does not let a slow encode of an older picture overwrite a newer one', async () => {
    let scene: SharedScene | null = null;
    const subs = new Set<() => void>();
    const resolvers: Array<(b: Blob) => void> = [];
    const img = sceneImage({} as Document, {
      current: () => scene,
      subscribe: (fn) => (subs.add(fn), () => subs.delete(fn)),
      encode: () => new Promise<Blob | null>((r) => resolvers.push(r as (b: Blob) => void)),
      createUrl: (() => {
        let i = 0;
        return () => `blob:${++i}`;
      })(),
      revokeUrl: vi.fn(),
    });
    scene = shot(1);
    subs.forEach((f) => f());
    scene = shot(2);
    subs.forEach((f) => f());
    resolvers[1]({} as Blob);
    await Promise.resolve();
    await Promise.resolve();
    resolvers[0]({} as Blob);
    await Promise.resolve();
    await Promise.resolve();
    expect(img.version).toBe(2);
  });

  it('dispose revokes the URL, unsubscribes and goes quiet', async () => {
    const { img, publish, revoked, subs } = rig();
    await publish(shot(1));
    img.dispose();
    expect(revoked).toEqual(['blob:scene-1']);
    expect(subs.size).toBe(0);
  });
});
