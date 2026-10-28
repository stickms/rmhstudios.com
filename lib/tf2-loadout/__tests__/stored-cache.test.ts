import { beforeEach, describe, expect, it, vi } from 'vitest';

const storage = vi.hoisted(() => ({ getObjectEncoded: vi.fn() }));
vi.mock('@/lib/storage/s3.server', () => storage);

import { clearStoredCache, readStored } from '../stored-cache.server';

const object = (text: string) => ({ body: Buffer.from(text), contentType: 'x' });

describe('readStored', () => {
  beforeEach(() => {
    clearStoredCache();
    storage.getObjectEncoded.mockReset();
  });

  it('reads a key once however many ask, together or later', async () => {
    storage.getObjectEncoded.mockResolvedValue(object('model'));
    const [a, b] = await Promise.all([readStored('k'), readStored('k')]);
    await readStored('k');
    expect(storage.getObjectEncoded).toHaveBeenCalledTimes(1);
    expect(a?.etag).toBe(b?.etag);
    expect(a?.etag).toMatch(/^[\w-]{22}$/);
  });

  it('gives a changed file a new validator', async () => {
    storage.getObjectEncoded.mockResolvedValueOnce(object('one'));
    const one = await readStored('a');
    storage.getObjectEncoded.mockResolvedValueOnce(object('two'));
    const two = await readStored('b');
    expect(one?.etag).not.toBe(two?.etag);
  });

  it('remembers a missing file for a while instead of asking the bucket each time', async () => {
    storage.getObjectEncoded.mockResolvedValue(null);
    expect(await readStored('gone')).toBeNull();
    expect(await readStored('gone')).toBeNull();
    expect(storage.getObjectEncoded).toHaveBeenCalledTimes(1);
  });

  it('does not hold a failed read', async () => {
    storage.getObjectEncoded.mockRejectedValueOnce(new Error('network'));
    await expect(readStored('flaky')).rejects.toThrow('network');
    storage.getObjectEncoded.mockResolvedValueOnce(object('ok'));
    expect((await readStored('flaky'))?.body.toString()).toBe('ok');
  });

  it('passes a file too large to hold straight through, uncached', async () => {
    storage.getObjectEncoded.mockResolvedValue({ body: Buffer.alloc(9 * 1024 * 1024), contentType: 'x' });
    await readStored('big');
    await readStored('big');
    expect(storage.getObjectEncoded).toHaveBeenCalledTimes(2);
  });
});
