import { randomBytes } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { decodeAsset, encodeAsset } from '../asset-codec';

// Stand-in for object storage: what `putObject` was given is what `getObjectEncoded` returns.
const store = new Map<string, { body: Buffer; contentEncoding?: string; contentType: string }>();
vi.mock('@/lib/storage/s3.server', () => ({
  getObjectEncoded: async (key: string) => store.get(key) ?? null,
  getObject: async (key: string) => {
    const o = store.get(key);
    if (!o) return null;
    const { decodeAsset: dec } = await import('../asset-codec');
    return { body: dec(o.body, o.contentEncoding), contentType: o.contentType };
  },
  listObjects: async () => [],
}));

const { readModel } = await import('../models.server');
const { readIcon } = await import('../icons.server');
const { readBaseFile } = await import('../../tf2-hud/base-store.server');

const put = (key: string, raw: Buffer, contentType: string) => {
  const { body, contentEncoding } = encodeAsset(raw, contentType);
  store.set(key, { body, contentEncoding, contentType });
  return { body, contentEncoding };
};

describe('encodeAsset / decodeAsset', () => {
  it('compresses compressible data and decodes to identical bytes', () => {
    const raw = Buffer.from('"HudPlayerHealth" { "xpos" "0" "ypos" "0" }\n'.repeat(500));
    const { body, contentEncoding } = encodeAsset(raw, 'text/plain; charset=utf-8');
    expect(contentEncoding).toBe('br');
    expect(body.length).toBeLessThan(raw.length / 5);
    expect(decodeAsset(body, contentEncoding).equals(raw)).toBe(true);
  });

  it('stores incompressible data raw rather than making it larger', () => {
    const raw = randomBytes(4096);
    const { body, contentEncoding } = encodeAsset(raw, 'image/webp');
    expect(contentEncoding).toBeUndefined();
    expect(body.equals(raw)).toBe(true);
    expect(decodeAsset(body, contentEncoding).equals(raw)).toBe(true);
  });
});

describe('what a client receives', () => {
  const glb = Buffer.concat([Buffer.from('glTF'), Buffer.alloc(8000, 7)]);

  it('model: stored Brotli bytes go straight to a browser that accepts br', async () => {
    const stored = put('tf2-models/940.glb', glb, 'model/gltf-binary');
    const m = await readModel('940', 'gzip, deflate, br');
    expect(m?.contentEncoding).toBe('br');
    expect(m?.body.equals(stored.body)).toBe(true);
  });

  it('model: a client that does not accept br gets the original bytes', async () => {
    put('tf2-models/940.glb', glb, 'model/gltf-binary');
    const m = await readModel('940', 'gzip');
    expect(m?.contentEncoding).toBeUndefined();
    expect(m?.body.equals(glb)).toBe(true);
  });

  it('HUD base file: both paths round-trip', async () => {
    const res = Buffer.from('"Resource/UI/HudPlayerHealth.res" {}\n'.repeat(200));
    const stored = put('tf2-hud-base/resource/ui/hudplayerhealth.res', res, 'text/plain; charset=utf-8');
    const withBr = await readBaseFile('resource/ui/hudplayerhealth.res', 'br');
    expect(withBr?.contentEncoding).toBe('br');
    expect(withBr?.body.equals(stored.body)).toBe(true);
    const without = await readBaseFile('resource/ui/hudplayerhealth.res', '');
    expect(without?.contentEncoding).toBeUndefined();
    expect(without?.body.equals(res)).toBe(true);
  });

  it('icon: always served decoded', async () => {
    const icon = Buffer.alloc(3000, 1);
    put('tf2-icons/13.webp', icon, 'image/webp');
    expect((await readIcon('13'))?.equals(icon)).toBe(true);
  });
});
