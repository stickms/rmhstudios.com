import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const loader = vi.hoisted(() => ({ loadQuizCards: vi.fn() }));

vi.mock('../../prisma-client', () => ({ getPrismaClient: vi.fn() }));
vi.mock('../../economy', () => ({ awardAppProgress: vi.fn() }));
vi.mock('../../../../lib/rmhstudy/quiz-cards.server', () => loader);

import { registerRmhStudyHandlers } from '../rmhstudy';
import { REVEAL_MS, QUESTION_MS } from '../../../../lib/rmhstudy/quiz';

type Handler = (payload?: unknown) => unknown;

interface FakeSocket {
  id: string;
  data: Record<string, unknown>;
  handlers: Map<string, Handler>;
  emitted: { event: string; payload: unknown }[];
  on: (event: string, h: Handler) => void;
  emit: (event: string, payload?: unknown) => void;
  join: () => void;
  leave: () => void;
}

const sockets = new Map<string, FakeSocket>();
const roomEmits: { event: string; payload: unknown }[] = [];
const io = {
  sockets: { sockets },
  to: () => ({ emit: (event: string, payload?: unknown) => roomEmits.push({ event, payload }) }),
} as never;

function connect(id: string, userName: string): FakeSocket {
  const s: FakeSocket = {
    id,
    data: { userId: id, userName },
    handlers: new Map(),
    emitted: [],
    on: (event, h) => void s.handlers.set(event, h),
    emit: (event, payload) => void s.emitted.push({ event, payload }),
    join: () => undefined,
    leave: () => undefined,
  };
  sockets.set(id, s);
  registerRmhStudyHandlers(io, s as never);
  return s;
}

const call = (s: FakeSocket, event: string, payload?: unknown) => s.handlers.get(event)?.(payload);
const lastError = (s: FakeSocket) =>
  [...s.emitted].reverse().find((e) => e.event === 'rmhstudy:error')?.payload as { message: string; code?: string };
const roomEvents = (name: string) => roomEmits.filter((e) => e.event === name).map((e) => e.payload);

function cards(n: number) {
  return Array.from({ length: n }, (_, i) => ({ id: `c${i}`, front: `Question ${i}`, back: `Answer ${i}` }));
}

let seq = 0;
async function newRoom() {
  seq++;
  const host = connect(`host${seq}`, 'Host');
  const guest = connect(`guest${seq}`, 'Guest');
  call(host, 'rmhstudy:room:create', { settings: {} });
  const state = host.emitted.find((e) => e.event === 'rmhstudy:room:state')?.payload as { roomCode: string };
  call(guest, 'rmhstudy:room:join', { roomCode: state.roomCode });
  return { host, guest, code: state.roomCode };
}

/** Start a work phase and skip it so the room is on its short break. */
function toBreak(host: FakeSocket, code: string) {
  call(host, 'rmhstudy:timer:start', { roomCode: code });
  call(host, 'rmhstudy:timer:skip', { roomCode: code });
}

const flush = async () => {
  await vi.advanceTimersByTimeAsync(0);
};

beforeEach(() => {
  vi.useFakeTimers();
  roomEmits.length = 0;
  loader.loadQuizCards.mockReset();
  loader.loadQuizCards.mockResolvedValue({ ok: true, deckTitle: 'Capitals', cards: cards(12) });
});
afterEach(() => {
  vi.useRealTimers();
});

describe('room quiz: who and when', () => {
  it('lets only the host start a quiz', async () => {
    const { guest, code } = await newRoom();
    call(guest, 'rmhstudy:quiz:start', { deckId: 'd1', count: 5 });
    await flush();
    expect(lastError(guest).code).toBe('NOT_HOST');
    expect(loader.loadQuizCards).not.toHaveBeenCalled();
    expect(code).toBeTruthy();
  });

  it('refuses a quiz during a work phase', async () => {
    const { host, code } = await newRoom();
    call(host, 'rmhstudy:timer:start', { roomCode: code });
    call(host, 'rmhstudy:quiz:start', { deckId: 'd1', count: 5 });
    await flush();
    expect(lastError(host).code).toBe('QUIZ_REFUSED');
    expect(roomEvents('rmhstudy:quiz:question')).toHaveLength(0);
  });

  it('refuses a count other than 5, 10 or 15', async () => {
    const { host } = await newRoom();
    call(host, 'rmhstudy:quiz:start', { deckId: 'd1', count: 7 });
    await flush();
    expect(lastError(host).code).toBe('INVALID_PAYLOAD');
  });

  it('starts on a break, sends the question without the answer, and one quiz at a time', async () => {
    const { host, code } = await newRoom();
    toBreak(host, code);
    call(host, 'rmhstudy:quiz:start', { deckId: 'd1', count: 5 });
    await flush();
    const [q] = roomEvents('rmhstudy:quiz:question') as Record<string, unknown>[];
    expect(q).toMatchObject({ index: 0, total: 5, deckTitle: 'Capitals' });
    expect(Object.keys(q!)).not.toContain('answerIndex');
    expect(JSON.stringify(q)).not.toMatch(/answerIndex|cardId|Sound|Image/);
    call(host, 'rmhstudy:quiz:start', { deckId: 'd1', count: 5 });
    await flush();
    expect(lastError(host).message).toMatch(/already running/);
    call(host, 'rmhstudy:quiz:stop');
  });

  it('only the host stops it, with the standings so far', async () => {
    const { host, guest, code } = await newRoom();
    toBreak(host, code);
    call(host, 'rmhstudy:quiz:start', { deckId: 'd1', count: 5 });
    await flush();
    call(guest, 'rmhstudy:quiz:stop');
    expect(lastError(guest).code).toBe('NOT_HOST');
    expect(roomEvents('rmhstudy:quiz:end')).toHaveLength(0);
    call(host, 'rmhstudy:quiz:stop');
    expect(roomEvents('rmhstudy:quiz:end')).toHaveLength(1);
  });

  it('a work phase ends the quiz', async () => {
    const { host, code } = await newRoom();
    toBreak(host, code);
    call(host, 'rmhstudy:quiz:start', { deckId: 'd1', count: 5 });
    await flush();
    call(host, 'rmhstudy:timer:skip', { roomCode: code }); // the break ends, the next phase is work
    expect(roomEvents('rmhstudy:quiz:end')).toHaveLength(1);
    // No timer is left to open another question.
    await vi.advanceTimersByTimeAsync(QUESTION_MS + REVEAL_MS);
    expect(roomEvents('rmhstudy:quiz:reveal')).toHaveLength(0);
  });
});

describe('room quiz: the deck rule', () => {
  it('refuses a deck the host may not study, and an editor of a private deck, with no question sent', async () => {
    const { host, code } = await newRoom();
    toBreak(host, code);
    for (const reason of ['not-found', 'private-editor', 'confirm-required']) {
      loader.loadQuizCards.mockResolvedValueOnce({ ok: false, reason });
      call(host, 'rmhstudy:quiz:start', { deckId: 'd1', count: 5 });
      await flush();
      expect(lastError(host).code).toBe('QUIZ_REFUSED');
    }
    expect(roomEvents('rmhstudy:quiz:question')).toHaveLength(0);
  });

  it('passes the confirmation flag only when it is exactly true', async () => {
    const { host, code } = await newRoom();
    toBreak(host, code);
    loader.loadQuizCards.mockResolvedValueOnce({ ok: false, reason: 'confirm-required' });
    call(host, 'rmhstudy:quiz:start', { deckId: 'd1', count: 5, confirmPrivate: 'yes' });
    await flush();
    expect(loader.loadQuizCards).toHaveBeenLastCalledWith(host.id, 'd1', { confirmPrivate: false });
    call(host, 'rmhstudy:quiz:start', { deckId: 'd1', count: 5, confirmPrivate: true });
    await flush();
    expect(loader.loadQuizCards).toHaveBeenLastCalledWith(host.id, 'd1', { confirmPrivate: true });
    call(host, 'rmhstudy:quiz:stop');
  });

  it('refuses a deck with fewer than four distinct answers', async () => {
    const { host, code } = await newRoom();
    toBreak(host, code);
    loader.loadQuizCards.mockResolvedValueOnce({ ok: true, deckTitle: 'Tiny', cards: cards(3) });
    call(host, 'rmhstudy:quiz:start', { deckId: 'd1', count: 5 });
    await flush();
    expect(lastError(host).message).toMatch(/four different answers/);
  });

  it('emits no picture or sound field anywhere, even when the loader were to leak one', async () => {
    const { host, guest, code } = await newRoom();
    toBreak(host, code);
    call(host, 'rmhstudy:quiz:start', { deckId: 'd1', count: 5 });
    await flush();
    call(guest, 'rmhstudy:quiz:answer', { choice: 0 });
    call(host, 'rmhstudy:quiz:answer', { choice: 1 });
    await vi.advanceTimersByTimeAsync(0);
    const wire = JSON.stringify(
      [...roomEmits, ...host.emitted, ...guest.emitted].filter((e) => e.event.includes('quiz')),
    );
    expect(wire).not.toMatch(/Image|Sound|occlusion/i);
    call(host, 'rmhstudy:quiz:stop');
  });
});

describe('room quiz: answering and timers', () => {
  it('marks on the server, reveals when everyone has answered, then ends after the last question', async () => {
    const { host, guest, code } = await newRoom();
    toBreak(host, code);
    call(host, 'rmhstudy:quiz:start', { deckId: 'd1', count: 5 });
    await flush();
    call(host, 'rmhstudy:quiz:answer', { choice: 0 });
    call(host, 'rmhstudy:quiz:answer', { choice: 1 }); // a second answer is ignored
    expect(roomEvents('rmhstudy:quiz:reveal')).toHaveLength(0);
    call(guest, 'rmhstudy:quiz:answer', { choice: 2 });
    const reveals = roomEvents('rmhstudy:quiz:reveal') as { answerIndex: number; counts: number[] }[];
    expect(reveals).toHaveLength(1);
    expect(reveals[0]!.counts.reduce((a, b) => a + b, 0)).toBe(2);
    expect(reveals[0]!.answerIndex).toBeGreaterThanOrEqual(0);
    for (let i = 0; i < 4; i++) {
      await vi.advanceTimersByTimeAsync(REVEAL_MS);
      await vi.advanceTimersByTimeAsync(QUESTION_MS);
    }
    await vi.advanceTimersByTimeAsync(REVEAL_MS);
    expect(roomEvents('rmhstudy:quiz:question')).toHaveLength(5);
    const end = roomEvents('rmhstudy:quiz:end') as { standings: unknown[] }[];
    expect(end).toHaveLength(1);
    expect(end[0]!.standings).toHaveLength(2);
  });

  it('reveals at the deadline when someone has not answered', async () => {
    const { host, code } = await newRoom();
    toBreak(host, code);
    call(host, 'rmhstudy:quiz:start', { deckId: 'd1', count: 5 });
    await flush();
    await vi.advanceTimersByTimeAsync(QUESTION_MS - 1);
    expect(roomEvents('rmhstudy:quiz:reveal')).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(roomEvents('rmhstudy:quiz:reveal')).toHaveLength(1);
    call(host, 'rmhstudy:quiz:stop');
  });

  it('clears its timers when the room closes', async () => {
    const { host, guest, code } = await newRoom();
    toBreak(host, code);
    call(host, 'rmhstudy:quiz:start', { deckId: 'd1', count: 5 });
    await flush();
    call(guest, 'rmhstudy:room:leave', { roomCode: code });
    call(host, 'rmhstudy:room:leave', { roomCode: code });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('ends the quiz when the host leaves', async () => {
    const { host, code } = await newRoom();
    toBreak(host, code);
    call(host, 'rmhstudy:quiz:start', { deckId: 'd1', count: 5 });
    await flush();
    call(host, 'rmhstudy:room:leave', { roomCode: code });
    expect(roomEvents('rmhstudy:quiz:end')).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(QUESTION_MS);
    expect(roomEvents('rmhstudy:quiz:reveal')).toHaveLength(0);
  });

  it('a member who joins mid-question watches and cannot answer it', async () => {
    const { host, code } = await newRoom();
    toBreak(host, code);
    call(host, 'rmhstudy:quiz:start', { deckId: 'd1', count: 5 });
    await flush();
    const late = connect(`late${seq}`, 'Late');
    call(late, 'rmhstudy:room:join', { roomCode: code });
    const snap = late.emitted.find((e) => e.event === 'rmhstudy:quiz:state')?.payload as {
      quiz: Record<string, unknown>;
    };
    expect(snap.quiz).toMatchObject({ phase: 'question', myChoice: null });
    expect(JSON.stringify(snap)).not.toMatch(/answerIndex/);
    call(late, 'rmhstudy:quiz:answer', { choice: 0 });
    expect(late.emitted.filter((e) => e.event === 'rmhstudy:quiz:state')).toHaveLength(1);
    call(host, 'rmhstudy:quiz:stop');
  });
});
