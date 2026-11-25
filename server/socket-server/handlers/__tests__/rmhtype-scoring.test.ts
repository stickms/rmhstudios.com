/**
 * RMHType results the server can stand behind (sprint 12 17): a solo finish and a room finish are scored from the
 * hub's own clock and a position clamped to the passage, and a run that does not reach the end, computes above the
 * ceiling or has no believable curve is shown but not ranked. The hub's Prisma client is an in-memory recorder;
 * timers are fake, so the countdown and the run's length are advanced by hand.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;

const state = vi.hoisted(() => ({ db: null as unknown, award: vi.fn() }));

vi.mock('../../prisma-client', () => ({ getPrismaClient: () => state.db }));
vi.mock('../../economy', () => ({ awardAppProgress: state.award }));
vi.mock('../../logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('../../../../lib/ai/text.server', () => ({ generateTypingPassage: vi.fn(async () => null) }));

import { registerRmhTypeHandlers } from '../rmhtype';
import { buildSamples } from '../../../../lib/rmhtype/ghost';
import { MAX_WPM } from '../../../../lib/rmhtype/typing-run';

interface Recorder {
  matches: Row[];
  profiles: Row[];
  players: Row[];
  ghosts: Row[];
}

function newRecorder(): Recorder & Record<string, unknown> {
  const rec: Recorder = { matches: [], profiles: [], players: [], ghosts: [] };
  let id = 0;
  const db: Record<string, unknown> = {
    ...rec,
    rmhTypeMatch: {
      create: async ({ data }: { data: Row }) => {
        const row = { id: `m${++id}`, ...data };
        rec.matches.push(row);
        return row;
      },
    },
    rmhTypeProfile: {
      upsert: async ({ where, create, update }: { where: Row; create: Row; update: Row }) => {
        const key = where.userId_difficulty as { userId: string; difficulty: string };
        const found = rec.profiles.find((p) => p.userId === key.userId && p.difficulty === key.difficulty);
        if (found) {
          const step = (update.totalGamesPlayed as { increment?: number } | undefined)?.increment ?? 0;
          found.totalGamesPlayed = (found.totalGamesPlayed as number) + step;
          return found;
        }
        const row = { id: `p${++id}`, ...create };
        rec.profiles.push(row);
        return row;
      },
      update: async ({ where, data }: { where: Row; data: Row }) => {
        const row = rec.profiles.find((p) => p.id === where.id)!;
        Object.assign(row, data);
        return row;
      },
      findMany: async () => [],
    },
    rmhTypeMatchPlayer: {
      create: async ({ data }: { data: Row }) => {
        rec.players.push(data);
        return data;
      },
    },
    rmhTypeGhost: {
      findUnique: async () => null,
      findMany: async () => [],
      deleteMany: async () => ({ count: 0 }),
      upsert: async ({ create }: { create: Row }) => {
        rec.ghosts.push(create);
        return create;
      },
    },
    $executeRaw: async () => 1,
  };
  db.$transaction = async (fn: (tx: unknown) => unknown) => fn(db);
  return db as Recorder & Record<string, unknown>;
}

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

/** Everything the hub broadcasts to a room, by event. */
const roomEmits: { event: string; payload: unknown }[] = [];
const io = {
  sockets: { sockets: new Map() },
  to: () => ({
    emit: (event: string, payload: unknown) => void roomEmits.push({ event, payload }),
    volatile: { emit: (event: string, payload: unknown) => void roomEmits.push({ event, payload }) },
  }),
} as never;
let seq = 0;
let rec: Recorder & Record<string, unknown>;

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
const own = (s: FakeSocket, name: string) => s.emitted.filter((e) => e.event === name).map((e) => e.payload);
const heard = (name: string) => roomEmits.filter((e) => e.event === name).map((e) => e.payload);
const flush = async () => {
  await vi.advanceTimersByTimeAsync(0);
  await vi.advanceTimersByTimeAsync(0);
};

/** The marks and the curve of a run that types one character every `msPerChar` ms. */
function honestRun(length: number, msPerChar: number): { samples: number[]; timeMs: number } {
  const marks: [number, number][] = [];
  for (let i = 1; i <= length; i++) marks.push([i * msPerChar, i]);
  const timeMs = length * msPerChar;
  return { samples: buildSamples(marks, timeMs), timeMs };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-12-01T12:00:00Z'));
  roomEmits.length = 0;
  state.award.mockClear();
  rec = newRecorder();
  state.db = rec;
});

afterEach(() => {
  vi.useRealTimers();
});

type SoloResult = { wpm: number; accuracy: number; ranked: boolean; scorePosted: boolean; reason?: string };

describe('a solo finish', () => {
  async function startSolo(s: FakeSocket): Promise<string> {
    call(s, 'rmhtype:solo:start', { difficulty: 'easy' });
    await flush();
    await vi.advanceTimersByTimeAsync(5000);
    return (own(s, 'rmhtype:solo:started')[0] as { passage: string }).passage;
  }
  const nothingWritten = () => {
    expect(rec.matches).toHaveLength(0);
    expect(rec.profiles).toHaveLength(0);
    expect(rec.players).toHaveLength(0);
    expect(rec.ghosts).toHaveLength(0);
    expect(state.award).not.toHaveBeenCalled();
  };

  it('one second in with the full position is "Not ranked: too fast" and writes nothing', async () => {
    const bo = connect('bo', 'Bo');
    const passage = await startSolo(bo);
    await vi.advanceTimersByTimeAsync(1000);
    call(bo, 'rmhtype:solo:finish', { position: passage.length, errors: 0, samples: [passage.length] });
    await flush();
    const result = own(bo, 'rmhtype:solo:result')[0] as SoloResult;
    expect(result).toMatchObject({ ranked: false, scorePosted: false, reason: 'too-fast' });
    expect(result.wpm).toBeGreaterThan(MAX_WPM);
    nothingWritten();
  });

  it('a whole passage at a believable 120 WPM with no curve is not ranked, with the curve reason', async () => {
    const bo = connect('bo', 'Bo');
    const passage = await startSolo(bo);
    await vi.advanceTimersByTimeAsync(passage.length * 100);
    call(bo, 'rmhtype:solo:finish', { position: passage.length, errors: 0 });
    await flush();
    const result = own(bo, 'rmhtype:solo:result')[0] as SoloResult;
    expect(result).toMatchObject({ ranked: false, scorePosted: false, reason: 'implausible' });
    expect(result.wpm).toBeCloseTo(120, 0);
    nothingWritten();
  });

  it('a flat curve (nothing, then the whole passage in one step) is not ranked either', async () => {
    const bo = connect('bo', 'Bo');
    const passage = await startSolo(bo);
    const steps = Math.round((passage.length * 100) / 250);
    await vi.advanceTimersByTimeAsync(passage.length * 100);
    const flat = Array.from({ length: steps }, (_, i) => (i === steps - 1 ? passage.length : 0));
    call(bo, 'rmhtype:solo:finish', { position: passage.length, errors: 0, samples: flat });
    await flush();
    expect(own(bo, 'rmhtype:solo:result')[0]).toMatchObject({ ranked: false, reason: 'implausible' });
    nothingWritten();
  });

  it('a position short of the passage is not ranked, from the clamped figures', async () => {
    const bo = connect('bo', 'Bo');
    const passage = await startSolo(bo);
    const { samples, timeMs } = honestRun(passage.length, 150);
    await vi.advanceTimersByTimeAsync(timeMs);
    call(bo, 'rmhtype:solo:finish', { position: passage.length - 3, errors: 0, samples });
    await flush();
    expect(own(bo, 'rmhtype:solo:result')[0]).toMatchObject({ ranked: false, reason: 'short' });
    nothingWritten();
  });

  it('an honest 80 WPM run ranks with the figures it always had', async () => {
    const bo = connect('bo', 'Bo');
    const passage = await startSolo(bo);
    const { samples, timeMs } = honestRun(passage.length, 150);
    await vi.advanceTimersByTimeAsync(timeMs);
    call(bo, 'rmhtype:solo:finish', { position: passage.length, errors: 2, samples });
    await flush();
    const result = own(bo, 'rmhtype:solo:result')[0] as SoloResult;
    const wpm = passage.length / 5 / (timeMs / 60000);
    const accuracy = ((passage.length - 2) / passage.length) * 100;
    expect(result).toMatchObject({ ranked: true, scorePosted: true, timedOut: false });
    expect(result.reason).toBeUndefined();
    expect(result.wpm).toBe(Math.round(wpm * 100) / 100);
    expect(result.accuracy).toBe(Math.round(accuracy * 100) / 100);
    expect(rec.matches).toHaveLength(1);
    expect(rec.matches[0]).toMatchObject({ isSolo: true, results: { wpm, accuracy, timeMs } });
    expect(rec.profiles[0]).toMatchObject({ userId: 'bo', bestWpm: wpm, bestWpmAccuracy: accuracy });
    expect(rec.ghosts).toHaveLength(1);
    expect(state.award).toHaveBeenCalledTimes(1);
  });

  it('a full honest run under 90% accuracy is kept as a match but not posted, with no reason from the check', async () => {
    const bo = connect('bo', 'Bo');
    const passage = await startSolo(bo);
    const { samples, timeMs } = honestRun(passage.length, 150);
    await vi.advanceTimersByTimeAsync(timeMs);
    call(bo, 'rmhtype:solo:finish', { position: passage.length, errors: Math.ceil(passage.length / 4), samples });
    await flush();
    const result = own(bo, 'rmhtype:solo:result')[0] as SoloResult;
    expect(result).toMatchObject({ ranked: false, scorePosted: false });
    expect(result.reason).toBeUndefined();
    expect(rec.matches).toHaveLength(1);
    expect(rec.profiles[0]).toMatchObject({ bestWpm: 0 });
  });

  it('a timed-out run never ranks', async () => {
    const bo = connect('bo', 'Bo');
    await startSolo(bo);
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 1000);
    expect(own(bo, 'rmhtype:solo:result')[0]).toMatchObject({ timedOut: true, ranked: false, scorePosted: false });
    nothingWritten();
  });
});

describe('a room', () => {
  /** Ada hosts a one-round room and Bo joins; the countdown has run, so everyone is typing. */
  async function startRoom() {
    const ada = connect('ada', 'Ada');
    call(ada, 'rmhtype:room:create', { settings: { rounds: 1, difficulty: 'easy' } });
    const roomId = (own(ada, 'rmhtype:room:created')[0] as { roomId: string }).roomId;
    const bo = connect('bo', 'Bo');
    call(bo, 'rmhtype:room:join', { roomId });
    call(ada, 'rmhtype:game:start');
    await vi.advanceTimersByTimeAsync(5000);
    const text = (heard('rmhtype:game:passage')[0] as { text: string }).text;
    return { ada, bo, text };
  }
  const lastBroadcast = (userId: string) => {
    const frames = heard('rmhtype:game:progress') as { userId: string; charsTyped: number }[][];
    return frames[frames.length - 1]?.find((p) => p.userId === userId);
  };

  it('clamps a progress jump past the passage, and never lets progress go backwards', async () => {
    const { ada, text } = await startRoom();
    await vi.advanceTimersByTimeAsync(1000);
    call(ada, 'rmhtype:game:progress', { position: 10 ** 9, errors: 0 });
    await vi.advanceTimersByTimeAsync(200);
    const jumped = lastBroadcast('ada')!.charsTyped;
    expect(jumped).toBeGreaterThan(0);
    expect(jumped).toBeLessThan(text.length);
    expect(jumped).toBeLessThanOrEqual(Math.ceil((6 * 1000) / 250));

    await vi.advanceTimersByTimeAsync(300);
    call(ada, 'rmhtype:game:progress', { position: 1, errors: 0 });
    await vi.advanceTimersByTimeAsync(200);
    expect(lastBroadcast('ada')!.charsTyped).toBe(jumped);
  });

  it('a finish with a whole passage in one step and no plausible curve is "Did not finish"; the honest one wins', async () => {
    const { ada, bo, text } = await startRoom();
    // Ada claims the whole passage one second in, with a curve that fits the claim.
    await vi.advanceTimersByTimeAsync(1000);
    call(ada, 'rmhtype:game:progress', { position: text.length, errors: 0 });
    call(ada, 'rmhtype:game:finish', { position: text.length, errors: 0, samples: [text.length] });
    const adaFinished = heard('rmhtype:game:playerFinished')[0];
    expect(adaFinished).toMatchObject({ userId: 'ada', didNotFinish: true, reason: 'too-fast', wpm: 0 });

    // Bo types it honestly at 80 WPM.
    const { samples, timeMs } = honestRun(text.length, 150);
    await vi.advanceTimersByTimeAsync(timeMs - 1000);
    call(bo, 'rmhtype:game:finish', { position: text.length, errors: 1, samples });
    await flush();

    const round = heard('rmhtype:game:roundResults')[0] as { rankings: Row[] };
    expect(round.rankings.map((r) => r.userId)).toEqual(['bo', 'ada']);
    expect(round.rankings[0]).toMatchObject({ userId: 'bo', rank: 1 });
    expect(round.rankings[0].didNotFinish).toBeUndefined();
    expect(round.rankings[0].wpm).toBeCloseTo(80, 0);
    expect(round.rankings[1]).toMatchObject({
      userId: 'ada',
      didNotFinish: true,
      reason: 'too-fast',
      wpm: 0,
      score: 0,
    });
  });

  it('a room finish with no samples at a believable speed is "Did not finish" with the curve reason', async () => {
    const { ada, text } = await startRoom();
    await vi.advanceTimersByTimeAsync(text.length * 100); // 120 WPM
    call(ada, 'rmhtype:game:finish', { position: text.length, errors: 0 });
    expect(heard('rmhtype:game:playerFinished')[0]).toMatchObject({
      userId: 'ada',
      didNotFinish: true,
      reason: 'implausible',
    });
  });

  it('persists only the honest player: no profile, best or match row for a failed finish', async () => {
    const { ada, bo, text } = await startRoom();
    await vi.advanceTimersByTimeAsync(1000);
    call(ada, 'rmhtype:game:finish', { position: text.length, errors: 0, samples: [text.length] });
    const { samples, timeMs } = honestRun(text.length, 150);
    await vi.advanceTimersByTimeAsync(timeMs - 1000);
    call(bo, 'rmhtype:game:finish', { position: text.length, errors: 0, samples });
    await flush();
    await flush();

    expect(rec.matches).toHaveLength(1);
    expect(rec.matches[0].winnerUserId).toBe('bo');
    expect(rec.profiles.map((p) => p.userId)).toEqual(['bo']);
    expect(rec.players.map((p) => p.userId)).toEqual(['bo']);
    // Honest figures: set as a best, no more than the ceiling.
    expect(rec.profiles[0].bestWpm).toBeGreaterThan(0);
    expect(rec.profiles[0].bestWpm).toBeLessThanOrEqual(MAX_WPM);
    expect(rec.profiles[0].bestWpm).toBeCloseTo(80, 0);
  });

  it('an old client that sends no payload at finish is placed "Did not finish" rather than scored on faith', async () => {
    const { ada, text } = await startRoom();
    await vi.advanceTimersByTimeAsync(text.length * 150);
    call(ada, 'rmhtype:game:progress', { position: text.length, errors: 0 });
    call(ada, 'rmhtype:game:finish');
    expect(heard('rmhtype:game:playerFinished')[0]).toMatchObject({ userId: 'ada', didNotFinish: true });
  });
});
