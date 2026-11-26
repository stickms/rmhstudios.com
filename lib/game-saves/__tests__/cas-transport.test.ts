/**
 * The compare-and-set transport: it sends the row's `updatedAt` it last saw (`null` for "no row"), a 409 stops its
 * writes until the next read, it never writes before it has read, and its beacon carries the same expectation.
 */
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BEACON_MAX_BYTES, SaveNotWrittenError, casJsonTransport } from '../cas-transport';

const URL_OF = '/api/game-saves/test-game';
const T1 = '2027-01-05T10:00:00.000Z';
const T2 = '2027-01-05T10:05:00.000Z';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

let fetchMock: ReturnType<typeof vi.fn>;

function lastBody(): { saveData: unknown; expectedUpdatedAt: unknown } {
  const call = fetchMock.mock.calls.at(-1);
  return JSON.parse((call?.[1] as RequestInit).body as string);
}

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('casJsonTransport', () => {
  it('sends the updatedAt it read, and the one each accepted write returns', async () => {
    const t = casJsonTransport('test-game');
    fetchMock.mockResolvedValueOnce(json({ saveData: { a: 1 }, updatedAt: T1 }));
    expect(await t.read()).toEqual({ a: 1 });
    expect(t.updatedAt).toBe(T1);

    fetchMock.mockResolvedValueOnce(json({ success: true, updatedAt: T2 }));
    await t.write({ a: 2 });
    expect(fetchMock.mock.calls.at(-1)?.[0]).toBe(URL_OF);
    expect(lastBody()).toEqual({ saveData: { a: 2 }, expectedUpdatedAt: T1 });
    expect(t.updatedAt).toBe(T2);

    fetchMock.mockResolvedValueOnce(json({ success: true, updatedAt: '2027-01-05T10:06:00.000Z' }));
    await t.write({ a: 3 });
    expect(lastBody().expectedUpdatedAt).toBe(T2);
  });

  it('sends null when the account has no row', async () => {
    const t = casJsonTransport('test-game');
    fetchMock.mockResolvedValueOnce(json({ saveData: null, updatedAt: null }));
    expect(await t.read()).toBeNull();
    expect(t.updatedAt).toBeNull();

    fetchMock.mockResolvedValueOnce(json({ success: true, updatedAt: T1 }));
    await t.write({ a: 1 });
    expect(lastBody().expectedUpdatedAt).toBeNull();
  });

  it('a 409 sets stale and blocks further writes until the next read', async () => {
    const t = casJsonTransport('test-game');
    fetchMock.mockResolvedValueOnce(json({ saveData: { a: 1 }, updatedAt: T1 }));
    await t.read();

    fetchMock.mockResolvedValueOnce(json({ error: 'Save changed elsewhere', updatedAt: T2 }, 409));
    await expect(t.write({ a: 2 })).rejects.toBeInstanceOf(SaveNotWrittenError);
    expect(t.stale).toBe(true);

    const calls = fetchMock.mock.calls.length;
    await expect(t.write({ a: 3 })).rejects.toMatchObject({ reason: 'stale' });
    expect(t.beacon({ a: 3 })).toBe(false);
    expect(fetchMock.mock.calls.length).toBe(calls);

    // The next read learns the row as it is now and lifts the stop.
    fetchMock.mockResolvedValueOnce(json({ saveData: { a: 9 }, updatedAt: T2 }));
    expect(await t.read()).toEqual({ a: 9 });
    expect(t.stale).toBe(false);
    fetchMock.mockResolvedValueOnce(json({ success: true, updatedAt: '2027-01-05T10:07:00.000Z' }));
    await t.write({ a: 10 });
    expect(lastBody().expectedUpdatedAt).toBe(T2);
  });

  it('never writes before it has read, nor after a read that failed', async () => {
    const t = casJsonTransport('test-game');
    await expect(t.write({ a: 1 })).rejects.toMatchObject({ reason: 'unknown' });
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock.mockResolvedValueOnce(json({ error: 'nope' }, 500));
    expect(await t.read()).toBeNull();
    await expect(t.write({ a: 1 })).rejects.toMatchObject({ reason: 'unknown' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('another failure is not a stale mark', async () => {
    const t = casJsonTransport('test-game');
    fetchMock.mockResolvedValueOnce(json({ saveData: null, updatedAt: null }));
    await t.read();
    fetchMock.mockResolvedValueOnce(json({ error: 'Too many' }, 429));
    await expect(t.write({ a: 1 })).rejects.toThrow('save failed: 429');
    expect(t.stale).toBe(false);
    // The expectation is unchanged, so a retry can still be accepted.
    fetchMock.mockResolvedValueOnce(json({ success: true, updatedAt: T1 }));
    await t.write({ a: 1 });
    expect(lastBody().expectedUpdatedAt).toBeNull();
  });

  it('the beacon carries expectedUpdatedAt, and afterwards the time is unknown', async () => {
    const sendBeacon = vi.fn((_url: string, _body: Blob) => true);
    vi.stubGlobal('navigator', { sendBeacon });
    const t = casJsonTransport('test-game');
    fetchMock.mockResolvedValueOnce(json({ saveData: { a: 1 }, updatedAt: T1 }));
    await t.read();

    expect(t.beacon({ a: 2 })).toBe(true);
    expect(sendBeacon).toHaveBeenCalledTimes(1);
    const [url, blob] = sendBeacon.mock.calls[0]!;
    expect(url).toBe(URL_OF);
    expect(JSON.parse(await blob.text())).toEqual({ saveData: { a: 2 }, expectedUpdatedAt: T1 });
    expect(blob.type).toBe('application/json');

    // The answer is invisible, so a page that came back refuses rather than guess, and says it must read again.
    expect(t.updatedAt).toBeUndefined();
    expect(t.stale).toBe(true);
    expect(t.beacon({ a: 3 })).toBe(false);
    await expect(t.write({ a: 3 })).rejects.toMatchObject({ reason: 'stale' });

    // The next read recovers without a reload.
    fetchMock.mockResolvedValueOnce(json({ saveData: { a: 2 }, updatedAt: T2 }));
    await t.read();
    expect(t.stale).toBe(false);
    fetchMock.mockResolvedValueOnce(json({ success: true, updatedAt: '2027-01-05T10:07:00.000Z' }));
    await t.write({ a: 4 });
    expect(lastBody().expectedUpdatedAt).toBe(T2);
  });

  it('writes go one at a time, each carrying the time the previous one returned', async () => {
    const t = casJsonTransport('test-game');
    fetchMock.mockResolvedValueOnce(json({ saveData: { a: 1 }, updatedAt: T1 }));
    await t.read();
    fetchMock.mockResolvedValueOnce(json({ success: true, updatedAt: T2 }));
    fetchMock.mockResolvedValueOnce(json({ success: true, updatedAt: '2027-01-05T10:07:00.000Z' }));
    await Promise.all([t.write({ a: 2 }), t.write({ a: 3 })]);
    const sent = fetchMock.mock.calls.slice(1).map((call) => JSON.parse((call[1] as RequestInit).body as string));
    expect(sent.map((body) => body.expectedUpdatedAt)).toEqual([T1, T2]);
  });

  it('an answer that arrives after reset() teaches the new identity nothing', async () => {
    const t = casJsonTransport('test-game');
    fetchMock.mockResolvedValueOnce(json({ saveData: null, updatedAt: null }));
    await t.read();
    let answer!: (res: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => (answer = resolve)));
    const pending = t.write({ a: 1 });
    await Promise.resolve();
    await Promise.resolve();
    t.reset();
    answer(json({ success: true, updatedAt: T1 }));
    await pending.catch(() => {});
    expect(t.updatedAt).toBeUndefined();
  });

  it('a body past the keepalive cap is sent as an ordinary request', async () => {
    vi.stubGlobal('navigator', { sendBeacon: vi.fn(() => true) });
    const t = casJsonTransport('test-game');
    fetchMock.mockResolvedValue(json({ saveData: null, updatedAt: null }));
    await t.read();
    fetchMock.mockResolvedValueOnce(json({ success: true, updatedAt: T1 }));
    await t.write({ big: 'x'.repeat(BEACON_MAX_BYTES) });
    expect((fetchMock.mock.calls.at(-1)?.[1] as RequestInit).keepalive).toBe(false);

    fetchMock.mockResolvedValueOnce(json({ success: true, updatedAt: T2 }));
    await t.write({ small: true });
    expect((fetchMock.mock.calls.at(-1)?.[1] as RequestInit).keepalive).toBe(true);
  });

  it('reset forgets the account', async () => {
    const t = casJsonTransport('test-game');
    fetchMock.mockResolvedValueOnce(json({ saveData: { a: 1 }, updatedAt: T1 }));
    await t.read();
    t.reset();
    expect(t.updatedAt).toBeUndefined();
    await expect(t.write({ a: 2 })).rejects.toMatchObject({ reason: 'unknown' });
  });

  it('deleting the account copy leaves "no row" as the expectation', async () => {
    const t = casJsonTransport('test-game');
    fetchMock.mockResolvedValueOnce(json({ success: true }));
    await t.remove();
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'DELETE' });
    expect(t.updatedAt).toBeNull();
  });
});
