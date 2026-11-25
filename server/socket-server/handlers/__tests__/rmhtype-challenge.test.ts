/**
 * The RMHType hub and a challenge race (s11-12): `rmhtype:solo:start` with a challenge id is checked on the server,
 * claims the challenge once and seeds the passage and the challenger's ghost; `rmhtype:solo:finish` settles it from
 * the server's own clock and checks; leaving or disconnecting settles "Did not finish". The hub's Prisma client is an
 * in-memory fake; timers are fake, so the five-second countdown and the run's length are advanced by hand.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  makeChallengePrisma,
  newFakeChallengeDb,
  type FakeChallengeDb,
} from '../../../../lib/rmhtype/__tests__/fake-challenge-db';

const state = vi.hoisted(() => ({ db: null as unknown, ghostSaves: 0 }));

vi.mock('../../prisma-client', () => ({ getPrismaClient: () => state.db }));
vi.mock('../../economy', () => ({ awardAppProgress: vi.fn() }));
vi.mock('../../logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('../../../../lib/ai/text.server', () => ({ generateTypingPassage: vi.fn(async () => null) }));

import { handleRmhTypeDisconnect, registerRmhTypeHandlers } from '../rmhtype';
import { buildSamples } from '../../../../lib/rmhtype/ghost';
import { challengePassage } from '../../../../lib/rmhtype/challenges';

type Handler = (payload?: unknown) => unknown;
interface FakeSocket {
  id: string;
  connected: boolean;
  data: Record<string, unknown>;
  handlers: Map<string, Handler>;
  emitted: { event: string; payload: unknown }[];
  on: (event: string, h: Handler) => void;
  emit: (event: string, payload?: unknown) => void;
  join: () => void;
  leave: () => void;
}

const io = { sockets: { sockets: new Map() }, to: () => ({ emit: () => undefined }) } as never;
const PASSAGE = 'easy-01';
const TEXT = challengePassage(PASSAGE)!.text;
let fake: FakeChallengeDb;
let seq = 0;

function connect(userId: string, userName: string): FakeSocket {
  const s: FakeSocket = {
    id: `sock${++seq}`,
    connected: true,
    data: { userId, userName },
    handlers: new Map(),
    emitted: [],
    on: (event, h) => void s.handlers.set(event, h),
    emit: (event, payload) => void s.emitted.push({ event, payload }),
    join: () => undefined,
    leave: () => undefined,
  };
  registerRmhTypeHandlers(io, s as never);
  return s;
}

const call = (s: FakeSocket, event: string, payload?: unknown) => s.handlers.get(event)?.(payload);
const events = (s: FakeSocket, name: string) => s.emitted.filter((e) => e.event === name).map((e) => e.payload);
const flush = async () => {
  await vi.advanceTimersByTimeAsync(0);
};

function seedChallenge(over: Record<string, unknown> = {}) {
  const marks: [number, number][] = [];
  for (let i = 1; i <= TEXT.length; i++) marks.push([i * 240, i]);
  const timeMs = TEXT.length * 240;
  const row = {
    id: `ch${fake.nextId++}`,
    challengerId: 'ada',
    opponentId: 'bo',
    passageId: PASSAGE,
    challengerWpm: 50,
    challengerAccuracy: 96,
    challengerTimeMs: timeMs,
    samples: buildSamples(marks, timeMs),
    status: 'pending',
    opponentWpm: null,
    opponentAccuracy: null,
    opponentTimeMs: null,
    outcome: null,
    finished: null,
    raceStartedAt: null,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 7 * 86_400_000),
    settledAt: null,
    ...over,
  };
  fake.challenges.push(row);
  return row;
}

/** Start a race as `bo` and run the countdown, so the room is typing. */
async function startRace(s: FakeSocket, id: string) {
  call(s, 'rmhtype:solo:start', { challengeId: id });
  await flush();
  await vi.advanceTimersByTimeAsync(5000);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-12-01T12:00:00Z'));
  fake = newFakeChallengeDb();
  fake.users.push(
    { id: 'ada', name: 'Ada', handle: 'ada', profile: null, bannedUntil: null, deletionScheduledAt: null },
    { id: 'bo', name: 'Bo', handle: 'bo', profile: null, bannedUntil: null, deletionScheduledAt: null },
    { id: 'cy', name: 'Cy', handle: 'cy', profile: null, bannedUntil: null, deletionScheduledAt: null },
  );
  fake.follows.push({ followerId: 'ada', followingId: 'bo' }, { followerId: 'bo', followingId: 'ada' });
  state.db = makeChallengePrisma(fake);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('rmhtype:solo:start with a challenge', () => {
  it("refuses another member's challenge and starts nothing", async () => {
    const row = seedChallenge();
    const cy = connect('cy', 'Cy');
    call(cy, 'rmhtype:solo:start', { challengeId: row.id });
    await flush();
    expect(events(cy, 'rmhtype:error')[0]).toMatchObject({ code: 'NOT_FOUND' });
    expect(events(cy, 'rmhtype:solo:countdown')).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(6000);
    expect(events(cy, 'rmhtype:solo:started')).toHaveLength(0);
    expect(row.status).toBe('pending');
  });

  it('refuses the challenger racing their own challenge', async () => {
    const row = seedChallenge();
    const ada = connect('ada', 'Ada');
    call(ada, 'rmhtype:solo:start', { challengeId: row.id });
    await flush();
    expect(events(ada, 'rmhtype:error')[0]).toMatchObject({ code: 'NOT_FOUND' });
    expect(row.status).toBe('pending');
  });

  it("uses the challenge's passage and sends the snapshot as the ghost", async () => {
    const row = seedChallenge();
    const bo = connect('bo', 'Bo');
    await startRace(bo, row.id as string);
    expect(row.status).toBe('racing');
    const started = events(bo, 'rmhtype:solo:started')[0] as {
      passage: string;
      passageId: string;
      challenge: { id: string; challengerName: string; ghost: { wpm: number; timeMs: number; samples: number[] } };
    };
    expect(started.passageId).toBe(PASSAGE);
    expect(started.passage).toBe(TEXT);
    expect(started.challenge).toMatchObject({ id: row.id, challengerName: 'Ada' });
    expect(started.challenge.ghost).toMatchObject({ wpm: 50, timeMs: row.challengerTimeMs, samples: row.samples });
  });

  it('refuses a second start on the same challenge, in another tab or after a reload', async () => {
    const row = seedChallenge();
    const first = connect('bo', 'Bo');
    await startRace(first, row.id as string);
    const second = connect('bo', 'Bo');
    call(second, 'rmhtype:solo:start', { challengeId: row.id });
    await flush();
    expect(events(second, 'rmhtype:error')[0]).toMatchObject({ code: 'TYPE_CHALLENGE_RACED' });
    expect(events(second, 'rmhtype:solo:countdown')).toHaveLength(0);
  });

  it('claims once when two starts race for it', async () => {
    const row = seedChallenge();
    const one = connect('bo', 'Bo');
    const two = connect('bo', 'Bo');
    call(one, 'rmhtype:solo:start', { challengeId: row.id });
    call(two, 'rmhtype:solo:start', { challengeId: row.id });
    await flush();
    await vi.advanceTimersByTimeAsync(5000);
    const started = [one, two].filter((s) => events(s, 'rmhtype:solo:started').length === 1);
    expect(started).toHaveLength(1);
  });

  it("ignores a topic or a source sent with a challenge: the text is the challenge's", async () => {
    const row = seedChallenge();
    const bo = connect('bo', 'Bo');
    call(bo, 'rmhtype:solo:start', { challengeId: row.id, topic: 'deep sea', source: 'code', difficulty: 'hard' });
    await flush();
    await vi.advanceTimersByTimeAsync(5000);
    expect((events(bo, 'rmhtype:solo:started')[0] as { passage: string }).passage).toBe(TEXT);
  });
});

describe('rmhtype:solo:finish in a challenge race', () => {
  it('settles "Did not finish" for a full position sent one second after the start', async () => {
    const row = seedChallenge();
    const bo = connect('bo', 'Bo');
    await startRace(bo, row.id as string);
    await vi.advanceTimersByTimeAsync(1000);
    call(bo, 'rmhtype:solo:finish', {
      position: TEXT.length,
      errors: 0,
      samples: Array.from({ length: 4 }, (_, i) => (i === 3 ? TEXT.length : 0)),
    });
    await flush();
    expect(row).toMatchObject({ status: 'done', outcome: 'challenger', finished: false, opponentWpm: null });
    expect(events(bo, 'rmhtype:solo:challengeResult')[0]).toMatchObject({ outcome: 'challenger', finished: false });
    expect(fake.notifications.map((n) => n.userId).sort()).toEqual(['ada', 'bo']);
  });

  it('settles "Did not finish" for a position clamped short of the passage', async () => {
    const row = seedChallenge();
    const bo = connect('bo', 'Bo');
    await startRace(bo, row.id as string);
    await vi.advanceTimersByTimeAsync(TEXT.length * 200);
    call(bo, 'rmhtype:solo:finish', { position: TEXT.length - 3, errors: 0, samples: [1] });
    await flush();
    expect(row).toMatchObject({ status: 'done', outcome: 'challenger', finished: false });
  });

  it('settles a real finish from the server clock: a faster full run wins', async () => {
    const row = seedChallenge();
    const bo = connect('bo', 'Bo');
    await startRace(bo, row.id as string);
    const timeMs = TEXT.length * 150; // 80 WPM against a ghost of 50
    const marks: [number, number][] = [];
    for (let i = 1; i <= TEXT.length; i++) marks.push([i * 150, i]);
    await vi.advanceTimersByTimeAsync(timeMs);
    call(bo, 'rmhtype:solo:finish', { position: TEXT.length, errors: 1, samples: buildSamples(marks, timeMs) });
    await flush();
    expect(row).toMatchObject({ status: 'done', outcome: 'opponent', finished: true });
    expect(row.opponentWpm as unknown as number).toBeCloseTo(80, 0);
    expect(events(bo, 'rmhtype:solo:challengeResult')[0]).toMatchObject({ outcome: 'opponent', finished: true });
  });

  it("takes the client's word for nothing: an inflated position cannot beat the clock", async () => {
    const row = seedChallenge();
    const bo = connect('bo', 'Bo');
    await startRace(bo, row.id as string);
    await vi.advanceTimersByTimeAsync(2000);
    call(bo, 'rmhtype:solo:finish', { position: 1_000_000, errors: 0, samples: [TEXT.length] });
    await flush();
    expect(row).toMatchObject({ status: 'done', outcome: 'challenger', finished: false });
  });

  it('settles once, and leaving afterwards changes nothing', async () => {
    const row = seedChallenge();
    const bo = connect('bo', 'Bo');
    await startRace(bo, row.id as string);
    await vi.advanceTimersByTimeAsync(1000);
    call(bo, 'rmhtype:solo:finish', { position: TEXT.length, errors: 0, samples: [TEXT.length] });
    await flush();
    call(bo, 'rmhtype:room:leave');
    handleRmhTypeDisconnect(io, bo as never);
    await flush();
    expect(fake.notifications).toHaveLength(2);
    expect(row.status).toBe('done');
  });
});

describe('leaving a challenge race', () => {
  it('settles "Did not finish" when the member leaves the room', async () => {
    const row = seedChallenge();
    const bo = connect('bo', 'Bo');
    await startRace(bo, row.id as string);
    call(bo, 'rmhtype:room:leave');
    await flush();
    expect(row).toMatchObject({ status: 'done', outcome: 'challenger', finished: false });
  });

  it('settles "Did not finish" when the socket disconnects (a reload), and the link cannot be raced again', async () => {
    const row = seedChallenge();
    const bo = connect('bo', 'Bo');
    await startRace(bo, row.id as string);
    handleRmhTypeDisconnect(io, bo as never);
    await flush();
    expect(row).toMatchObject({ status: 'done', finished: false });
    const reloaded = connect('bo', 'Bo');
    call(reloaded, 'rmhtype:solo:start', { challengeId: row.id });
    await flush();
    expect(events(reloaded, 'rmhtype:error')[0]).toMatchObject({ code: 'TYPE_CHALLENGE_RACED' });
  });

  it('settles "Did not finish" when the solo timeout runs out', async () => {
    const row = seedChallenge();
    const bo = connect('bo', 'Bo');
    await startRace(bo, row.id as string);
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 1000);
    await flush();
    expect(row).toMatchObject({ status: 'done', outcome: 'challenger', finished: false });
  });

  it('settles "Did not finish" when the member starts something else', async () => {
    const row = seedChallenge();
    const bo = connect('bo', 'Bo');
    await startRace(bo, row.id as string);
    call(bo, 'rmhtype:solo:start', { difficulty: 'easy' });
    await flush();
    expect(row).toMatchObject({ status: 'done', finished: false });
  });
});

describe('an ordinary solo run (no challenge) is clamped the same way', () => {
  async function startSolo(s: FakeSocket): Promise<string> {
    call(s, 'rmhtype:solo:start', { difficulty: 'easy' });
    await flush();
    await vi.advanceTimersByTimeAsync(5000);
    const started = events(s, 'rmhtype:solo:started')[0] as { passage: string };
    return started.passage;
  }

  it('caps the position at the passage and the errors at the position', async () => {
    const bo = connect('bo', 'Bo');
    const passage = await startSolo(bo);
    const timeMs = passage.length * 240; // 50 WPM
    await vi.advanceTimersByTimeAsync(timeMs);
    call(bo, 'rmhtype:solo:finish', { position: 1e9, errors: -40 });
    const result = events(bo, 'rmhtype:solo:result')[0] as { wpm: number; accuracy: number; scorePosted: boolean };
    expect(result.wpm).toBeCloseTo(50, 0);
    expect(result.accuracy).toBe(100);
    expect(result.scorePosted).toBe(true);
  });

  it('keeps accuracy within 0 to 100 when the errors claimed exceed the position', async () => {
    const bo = connect('bo', 'Bo');
    const passage = await startSolo(bo);
    await vi.advanceTimersByTimeAsync(passage.length * 240);
    call(bo, 'rmhtype:solo:finish', { position: passage.length, errors: 1e9 });
    const result = events(bo, 'rmhtype:solo:result')[0] as { accuracy: number; scorePosted: boolean };
    expect(result.accuracy).toBe(0);
    expect(result.scorePosted).toBe(false);
  });

  it('does not post a finish sent too early to be real (over the MAX_WPM ceiling)', async () => {
    const bo = connect('bo', 'Bo');
    await startSolo(bo);
    await vi.advanceTimersByTimeAsync(1000);
    call(bo, 'rmhtype:solo:finish', { position: Number.MAX_SAFE_INTEGER, errors: 0 });
    const result = events(bo, 'rmhtype:solo:result')[0] as { wpm: number; scorePosted: boolean };
    expect(result.wpm).toBeGreaterThan(250);
    expect(Number.isFinite(result.wpm)).toBe(true);
    expect(result.scorePosted).toBe(false);
  });
});
