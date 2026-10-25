import { afterEach, expect, it, vi } from 'vitest';
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});
it('keeps local paths unchanged and versions only managed CDN directories', async () => {
  vi.stubGlobal('__CDN_BASE__', '');
  vi.stubGlobal('__STATIC_ASSET_VERSIONS__', { models: 'abc' });
  expect((await import('../asset')).asset('/models/scene.glb')).toBe('/models/scene.glb');
  vi.resetModules();
  vi.stubGlobal('__CDN_BASE__', 'https://cdn.example.com/');
  const { asset } = await import('../asset');
  expect(asset('/models/scene.glb')).toBe('https://cdn.example.com/static/abc/models/scene.glb');
  expect(asset('/library/upload.pdf')).toBe('https://cdn.example.com/library/upload.pdf');
  expect(asset('music/song.mp3')).toBe('https://cdn.example.com/music/song.mp3');
});
