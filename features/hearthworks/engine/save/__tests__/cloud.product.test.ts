import { describe, expect, it } from 'vitest';
import { dominates } from '@/lib/game-saves/conflict';
import { buildFirstTown, ticks, townWorld } from '../../world/__tests__/town';
import {
  HEARTHWORKS_CLOUD_BYTES,
  compressionSupported,
  monotonicOf,
  packWorld,
  payloadBytes,
  payloadSavedAt,
  payloadTick,
  summaryOf,
  unpackWorld,
} from '../cloud';
import { encodeWorld } from '../format';

async function grownTown() {
  const w = townWorld();
  buildFirstTown(w);
  ticks(w, 2000);
  return w;
}

describe('the account copy of a town', () => {
  it('runs where the browser API exists (Node has CompressionStream)', () => {
    expect(compressionSupported()).toBe(true);
  });

  it('packs then unpacks to an equal world', async () => {
    const w = await grownTown();
    const payload = await packWorld(w, 1234);
    expect(payload).not.toBeNull();
    expect(payload).toMatchObject({ v: 1, enc: 'gzip-b64' });
    expect(typeof payload?.data).toBe('string');
    const back = await unpackWorld(payload);
    expect(back).toEqual(w);
  });

  it('survives a trip through JSON, which is how the shared save table stores it', async () => {
    const w = await grownTown();
    const payload = await packWorld(w);
    const stored = JSON.parse(JSON.stringify(payload));
    expect(await unpackWorld(stored)).toEqual(w);
  });

  it('is smaller than the raw world and well inside the shared save cap for an ordinary town', async () => {
    const w = await grownTown();
    const payload = await packWorld(w);
    expect(payload).not.toBeNull();
    expect(payloadBytes(payload!)).toBeLessThan(encodeWorld(w).length);
    expect(payloadBytes(payload!)).toBeLessThan(HEARTHWORKS_CLOUD_BYTES);
  });

  it('keeps the shared save table ceiling and does not raise it', () => {
    expect(HEARTHWORKS_CLOUD_BYTES).toBe(500_000);
  });

  it('unpacks anything unreadable to null and never throws', async () => {
    const w = await grownTown();
    const good = await packWorld(w);
    const cases: unknown[] = [
      null,
      undefined,
      'a string',
      42,
      {},
      { v: 2, enc: 'gzip-b64', data: good!.data },
      { v: 1, enc: 'plain', data: good!.data },
      { v: 1, enc: 'gzip-b64', data: 12 },
      { v: 1, enc: 'gzip-b64', data: '!!! not base64 !!!' },
      // base64 that is not gzip
      { v: 1, enc: 'gzip-b64', data: btoa('hello, this is not a gzip stream') },
      // gzip that is not a world
      { v: 1, enc: 'gzip-b64', data: good!.data.slice(0, 40) },
    ];
    for (const c of cases) expect(await unpackWorld(c)).toBeNull();
  });

  it('refuses an oversized payload without inflating it', async () => {
    const huge = { v: 1, enc: 'gzip-b64', data: 'A'.repeat(HEARTHWORKS_CLOUD_BYTES + 1) };
    expect(await unpackWorld(huge)).toBeNull();
  });

  it('refuses a small payload that inflates past the world size limit', async () => {
    const stream = new CompressionStream('gzip');
    const writer = stream.writable.getWriter();
    void writer.write(new Uint8Array(9 * 1024 * 1024)).catch(() => {});
    void writer.close().catch(() => {});
    const zipped = new Uint8Array(await new Response(stream.readable).arrayBuffer());
    expect(zipped.length).toBeLessThan(HEARTHWORKS_CLOUD_BYTES);
    let binary = '';
    for (const b of zipped) binary += String.fromCharCode(b);
    expect(await unpackWorld({ v: 1, enc: 'gzip-b64', data: btoa(binary) })).toBeNull();
  });

  it('summarises a town for the conflict choice', async () => {
    const w = await grownTown();
    const summary = summaryOf(w, 99);
    expect(summary).toEqual({
      savedAt: 99,
      tick: w.tick,
      population: w.city.population,
      coins: Object.values(w.players).reduce((n, p) => n + p.money, 0),
      buildings: w.buildings.length,
    });
    const payload = await packWorld(w, 99);
    expect(payload?.summary).toEqual(summary);
    expect(payloadSavedAt(payload)).toBe(99);
    expect(payloadTick(payload)).toBe(w.tick);
    expect(payloadSavedAt({})).toBe(0);
    expect(payloadTick('nope')).toBeNull();
  });

  it('counts monotonic figures: the tick, buildings, and the town’s peak population', async () => {
    const w = await grownTown();
    const m = monotonicOf(w);
    expect(m).toEqual({ tick: w.tick, buildings: w.buildings.length, population: w.city.peakPopulation });
    const later = await grownTown();
    ticks(later, 500);
    expect(dominates(monotonicOf(later), m)).toBe(true);
    expect(dominates(m, monotonicOf(later))).toBe(false);
  });

  it('losing residents does not make the town look like a different history', async () => {
    const w = await grownTown();
    const before = monotonicOf(w);
    w.city.population = 0;
    expect(monotonicOf(w).population).toBe(before.population);
  });

  it("drops other members' seats from the account copy", async () => {
    const w = townWorld();
    const seat = Object.values(w.players)[0]!;
    w.players['guest-account-id'] = { ...seat, id: 'guest-account-id' };
    const back = await unpackWorld(
      await packWorld(w, 1, ['local', ...Object.keys(w.players).filter((k) => k !== 'guest-account-id')]),
    );
    expect(back).not.toBeNull();
    expect(Object.keys(back!.players)).not.toContain('guest-account-id');
    expect(Object.keys(back!.players).length).toBe(Object.keys(w.players).length - 1);
  });
});
