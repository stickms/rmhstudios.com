import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';

// The account security log holds a member's own history, so the rules are: the recorder can never
// break the action it reports, no row carries a raw IP or full user agent, a member reads only
// their own rows, the CSV cannot run a formula, and rows are pruned after 365 days.

const db = vi.hoisted(() => ({
  create: vi.fn(),
  findMany: vi.fn(),
  deleteMany: vi.fn(),
  sessionFindFirst: vi.fn(),
}));
const onSessionCreated = vi.hoisted(() => vi.fn());

vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    securityEvent: { create: db.create, findMany: db.findMany, deleteMany: db.deleteMany },
    session: { findFirst: db.sessionFindFirst },
  },
}));
vi.mock('@/lib/auth/session-alert.server', () => ({
  onSessionCreated,
  deviceFingerprintFromRequest: () => 'Firefox on Windows',
}));

const {
  recordSecurityEvent,
  listSecurityEvents,
  exportSecurityEvents,
  pruneSecurityEvents,
  registerSecurityLogPrune,
} = await import('@/lib/auth/security-log.server');
const { trackSignIn } = await import('@/lib/auth/security-hooks.server');
const { csvCell, toCsv, sanitizeDetail, isUnfamiliarEvent, FILTER_KINDS, SECURITY_EVENT_KINDS } =
  await import('@/lib/auth/security-log');

const RAW_IP = '203.0.113.77';
const FULL_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0 SecretBuild/9';

function requestWith(): Request {
  return new Request('https://rmhstudios.com/api/x', {
    headers: { 'user-agent': FULL_UA, 'cf-connecting-ip': RAW_IP },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  db.create.mockResolvedValue({});
  db.findMany.mockResolvedValue([]);
  db.deleteMany.mockImplementation(async ({ where }: { where: { id: { in: bigint[] } } }) => ({
    count: where.id.in.length,
  }));
});

describe('recordSecurityEvent', () => {
  it('swallows a database error and logs it only once', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    db.create.mockRejectedValue(new Error('connection reset'));
    await expect(recordSecurityEvent({ userId: 'u1', kind: 'sign_out' })).resolves.toBeUndefined();
    await expect(recordSecurityEvent({ userId: 'u1', kind: 'sign_out' })).resolves.toBeUndefined();
    expect(db.create).toHaveBeenCalledTimes(2);
    expect(log.mock.calls.length).toBeLessThanOrEqual(1);
    log.mockRestore();
  });

  it('stores no raw IP and no full user agent, only the device label and a hash', async () => {
    await recordSecurityEvent({
      userId: 'u1',
      kind: 'sign_in',
      request: requestWith(),
      sessionId: 's1',
      detail: { providerId: 'github', token: 'tok_secret', password: 'hunter2' } as never,
    });
    const data = db.create.mock.calls[0]![0].data;
    const stored = JSON.stringify(data);
    expect(stored).not.toContain(RAW_IP);
    expect(stored).not.toContain('SecretBuild');
    expect(stored).not.toContain('Mozilla');
    expect(stored).not.toContain('tok_secret');
    expect(stored).not.toContain('hunter2');
    expect(data.device).toBe('Firefox on Windows');
    expect(data.ipHash).toBe(createHash('sha256').update(RAW_IP).digest('hex'));
    expect(data.detail).toEqual({ providerId: 'github' });
    expect(data.sessionId).toBe('s1');
  });

  it('ignores a kind that is not in the list', async () => {
    await recordSecurityEvent({ userId: 'u1', kind: 'made_up' as never });
    expect(db.create).not.toHaveBeenCalled();
  });
});

describe('listSecurityEvents', () => {
  it('reads only the given member, newest first, one page plus a probe row', async () => {
    await listSecurityEvents('u1', { filter: 'account' });
    const args = db.findMany.mock.calls[0]![0];
    expect(args.where.userId).toBe('u1');
    expect(args.where.kind.in).toEqual([...FILTER_KINDS.account]);
    expect(args.orderBy).toEqual({ id: 'desc' });
    expect(args.take).toBe(31);
  });

  it('marks the current session and compares networks without exposing the hash', async () => {
    const mine = createHash('sha256').update('a').digest('hex');
    db.sessionFindFirst.mockResolvedValue({ ipHash: mine });
    db.findMany.mockResolvedValue([
      { id: 9n, kind: 'sign_in', device: 'Chrome on macOS', ipHash: mine, sessionId: 's1', detail: null, createdAt: new Date(0) },
      { id: 8n, kind: 'sign_in', device: 'Firefox on Windows', ipHash: 'other', sessionId: 's2', detail: null, createdAt: new Date(0) },
    ]);
    const page = await listSecurityEvents('u1', { currentSessionId: 's1' });
    expect(db.sessionFindFirst.mock.calls[0]![0].where).toEqual({ id: 's1', userId: 'u1' });
    expect(page.items.map((i) => [i.thisDevice, i.sameNetwork])).toEqual([
      [true, true],
      [false, false],
    ]);
    expect(JSON.stringify(page)).not.toContain(mine);
    expect(page.nextCursor).toBeNull();
  });

  it('hands back a cursor when there is another page', async () => {
    db.findMany.mockResolvedValue(
      Array.from({ length: 31 }, (_, i) => ({
        id: BigInt(100 - i),
        kind: 'sign_in',
        device: null,
        ipHash: null,
        sessionId: null,
        detail: null,
        createdAt: new Date(0),
      })),
    );
    const page = await listSecurityEvents('u1');
    expect(page.items).toHaveLength(30);
    expect(page.nextCursor).toBe('71');
    await listSecurityEvents('u1', { cursor: '71' });
    expect(db.findMany.mock.calls[1]![0].where.id).toEqual({ lt: 71n });
  });

  it('exports only the member rows and leaves the hash and session id out', async () => {
    await exportSecurityEvents('u1');
    const args = db.findMany.mock.calls[0]![0];
    expect(args.where).toEqual({ userId: 'u1' });
    expect(Object.keys(args.select).sort()).toEqual(['createdAt', 'detail', 'device', 'kind']);
  });
});

describe('CSV', () => {
  it('turns anything a spreadsheet would evaluate into text', () => {
    for (const cell of ['=1+1', '+SUM(A1)', '-2+3', '@cmd', '\t=1', '\r=1']) {
      expect(csvCell(cell).replace(/^"/, '').startsWith("'")).toBe(true);
    }
    expect(csvCell('Chrome on macOS')).toBe('Chrome on macOS');
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
  });

  it('writes a header and one guarded row per event', () => {
    const csv = toCsv([
      { createdAt: new Date('2026-01-02T03:04:05Z'), kind: 'handle_changed', device: '=HYPERLINK("x")', detail: { oldHandle: 'a', newHandle: 'b' } },
    ]);
    const [header, row] = csv.trim().split('\r\n');
    expect(header).toBe('time,event,device,detail');
    expect(row).toBe('2026-01-02T03:04:05.000Z,handle_changed,"\'=HYPERLINK(""x"")",old_handle=a; new_handle=b');
  });

  it('keeps only allow-listed, short detail fields', () => {
    expect(sanitizeDetail({ oldHandle: 'x'.repeat(200), session: 'abc' })?.oldHandle).toHaveLength(80);
    expect(sanitizeDetail({ session: 'abc' })).toBeNull();
  });
});

describe('filters and the "Not you?" line', () => {
  it('every kind belongs to exactly one filter besides all', () => {
    const grouped = [FILTER_KINDS['sign-ins'], FILTER_KINDS.methods, FILTER_KINDS.account].flat();
    expect([...grouped].sort()).toEqual([...SECURITY_EVENT_KINDS].sort());
  });

  it('is not shown for what you did from this device', () => {
    expect(isUnfamiliarEvent('passkey_added', true)).toBe(false);
    expect(isUnfamiliarEvent('passkey_added', false)).toBe(true);
    expect(isUnfamiliarEvent('sign_out', false)).toBe(false);
  });
});

describe('pruning', () => {
  it('registers a daily job that keeps 365 days', async () => {
    const boss = {
      createQueue: vi.fn(async (_name: string, _options?: object) => {}),
      schedule: vi.fn(async (_name: string, _cron: string, _data: object, _options: object) => {}),
      work: vi.fn(async (_n: string, _h: () => Promise<void>) => {}),
    };
    await registerSecurityLogPrune(boss);
    expect(boss.schedule.mock.calls[0]![0]).toBe('security-log.prune');
    expect(boss.schedule.mock.calls[0]![1]).toMatch(/^\d+ \d+ \* \* \*$/);

    const now = Date.now();
    await boss.work.mock.calls[0]![1]();
    const cutoff: Date = db.findMany.mock.calls[0]![0].where.createdAt.lt;
    const days = (now - cutoff.getTime()) / 86_400_000;
    expect(days).toBeGreaterThan(364.99);
    expect(days).toBeLessThan(365.01);
  });

  it('deletes in batches of 5,000 until a short batch', async () => {
    const ids = (n: number) => Array.from({ length: n }, (_, i) => ({ id: BigInt(i + 1) }));
    db.findMany.mockResolvedValueOnce(ids(5000)).mockResolvedValueOnce(ids(1200));
    const total = await pruneSecurityEvents(new Date());
    expect(db.findMany.mock.calls[0]![0].take).toBe(5000);
    expect(db.deleteMany).toHaveBeenCalledTimes(2);
    expect(total).toBe(6200);
  });
});

describe('trackSignIn', () => {
  const flush = async () => {
    for (let i = 0; i < 10; i++) await new Promise((r) => setImmediate(r));
  };

  it('returns at once and records sign_in after a slow alert finishes', async () => {
    let finish!: (v: { alerted: boolean }) => void;
    onSessionCreated.mockReturnValue(new Promise((r) => (finish = r)));
    const out = trackSignIn({ id: 's1', userId: 'u1' }, requestWith());
    expect(out).toBeUndefined();
    await flush();
    expect(db.create).not.toHaveBeenCalled();
    finish({ alerted: false });
    await flush();
    expect(db.create).toHaveBeenCalledTimes(1);
    expect(db.create.mock.calls[0]![0].data).toMatchObject({ userId: 'u1', kind: 'sign_in', sessionId: 's1' });
  });

  it('records sign_in_new_device when the alert fired, and still records if the alert throws', async () => {
    onSessionCreated.mockResolvedValue({ alerted: true });
    trackSignIn({ id: 's1', userId: 'u1' }, requestWith());
    await flush();
    expect(db.create.mock.calls[0]![0].data.kind).toBe('sign_in_new_device');

    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    onSessionCreated.mockRejectedValue(new Error('boom'));
    trackSignIn({ id: 's2', userId: 'u1' }, requestWith());
    await flush();
    expect(db.create.mock.calls[1]![0].data.kind).toBe('sign_in');
    log.mockRestore();
  });
});
