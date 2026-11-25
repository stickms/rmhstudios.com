/**
 * RMHType challenges (s11-12), against an in-memory Prisma: who can challenge whom (mutuals, blocks, bans, the
 * switch), what can be sent (curated passages only), the caps under the lock, one attempt (claim once, settle once),
 * the winner rule and the checks that turn a finish into "Did not finish", and the hourly expiry. No database.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { newFakeChallengeDb, makeChallengePrisma, type FakeChallengeDb } from './fake-challenge-db';

const db = vi.hoisted(() => ({ current: null as unknown as FakeChallengeDb, prisma: null as unknown })) as {
  current: FakeChallengeDb;
  prisma: unknown;
};
const notices = vi.hoisted(() => [] as Record<string, unknown>[]);

vi.mock('@/lib/prisma.server', () => ({
  prisma: new Proxy({}, { get: (_t, key) => (db.prisma as Record<string | symbol, unknown>)[key] }),
}));
vi.mock('@/lib/notifications.server', () => ({
  createNotification: async (n: Record<string, unknown>) => {
    notices.push(n);
  },
}));

const server = await import('@/lib/rmhtype/challenges.server');
const settle = await import('@/lib/rmhtype/challenges-settle.server');
const jobs = await import('@/lib/rmhtype/challenges-jobs.server');
const {
  MAX_OPEN_CHALLENGES,
  MAX_OPEN_PER_OPPONENT,
  RACING_STALE_MS,
  challengePassage,
  decideOutcome,
  evaluateFinish,
  isChallengeablePassage,
  isChallengeSnapshot,
  passageTitle,
  resultFor,
} = await import('@/lib/rmhtype/challenges');
const { buildSamples } = await import('@/lib/rmhtype/ghost');
const { MAX_WPM } = await import('@/lib/rmhtype/typing-run');

const PASSAGE = 'easy-01';
const TEXT = challengePassage(PASSAGE)!.text;
const NOW = new Date('2026-12-01T12:00:00Z');

/** A believable curve for the passage typed at `wpm`: steady, ending at the passage length. */
function curve(wpm: number, length = TEXT.length) {
  const timeMs = Math.round((length / 5 / wpm) * 60000);
  const marks: [number, number][] = [];
  for (let i = 1; i <= length; i++) marks.push([Math.round((i / length) * timeMs), i]);
  return { timeMs, samples: buildSamples(marks, timeMs) };
}

function user(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    name: id.toUpperCase(),
    handle: id,
    image: null,
    profile: null,
    bannedUntil: null,
    deletionScheduledAt: null,
    ...extra,
  };
}

function mutual(a: string, b: string) {
  db.current.follows.push({ followerId: a, followingId: b }, { followerId: b, followingId: a });
}

function giveGhost(userId: string, wpm = 60, passageId = PASSAGE) {
  const { timeMs, samples } = curve(wpm);
  db.current.ghosts.push({ userId, passageId, wpm, timeMs, samples });
}

function seedRacing(over: Record<string, unknown> = {}) {
  const { timeMs, samples } = curve(60);
  const row = {
    id: `c${db.current.nextId++}`,
    challengerId: 'ada',
    opponentId: 'bo',
    passageId: PASSAGE,
    challengerWpm: 60,
    challengerAccuracy: 96,
    challengerTimeMs: timeMs,
    samples,
    status: 'racing',
    opponentWpm: null,
    opponentAccuracy: null,
    opponentTimeMs: null,
    outcome: null,
    finished: null,
    raceStartedAt: NOW,
    createdAt: NOW,
    expiresAt: new Date(NOW.getTime() + 7 * 86_400_000),
    settledAt: null,
    ...over,
  };
  db.current.challenges.push(row);
  return row;
}

beforeEach(() => {
  db.current = newFakeChallengeDb();
  db.prisma = makeChallengePrisma(db.current);
  notices.length = 0;
  db.current.users.push(user('ada'), user('bo'), user('cy'));
  mutual('ada', 'bo');
});

describe('which passages can be challenged', () => {
  it('accepts a standard passage and a code snippet, and nothing else', () => {
    expect(isChallengeablePassage('easy-01')).toBe(true);
    expect(isChallengeablePassage('code-ts-debounce')).toBe(true);
    expect(isChallengeablePassage('text:abc123')).toBe(false);
    expect(isChallengeablePassage('ai-lx9f2')).toBe(false);
    expect(isChallengeablePassage('lore-article-1')).toBe(false);
    expect(isChallengeablePassage('code-nope')).toBe(false);
    expect(isChallengeablePassage('custom-practice')).toBe(false);
    expect(isChallengeablePassage('unknown')).toBe(false);
  });

  it('names a passage by its first words and a snippet by its id', () => {
    expect(passageTitle('easy-01')).toBe('The quick brown fox…');
    expect(passageTitle('code-ts-debounce')).toBe('ts-debounce');
  });

  it('refuses to send a saved text or a generated passage', async () => {
    for (const passageId of ['text:abc123', 'ai-lx9f2', 'lore-x', 'nope']) {
      const res = await server.sendChallenge('ada', 'bo', passageId, NOW);
      expect(res).toMatchObject({ ok: false, status: 400, code: 'TYPE_CHALLENGE_PASSAGE' });
    }
    expect(db.current.challenges).toHaveLength(0);
  });
});

describe('who can be challenged', () => {
  beforeEach(() => giveGhost('ada', 82));

  it('sends the best run to a mutual, with a snapshot of the ghost, and tells them', async () => {
    const res = await server.sendChallenge('ada', 'bo', PASSAGE, NOW);
    expect(res.ok).toBe(true);
    const row = db.current.challenges[0]!;
    expect(row).toMatchObject({
      challengerId: 'ada',
      opponentId: 'bo',
      passageId: PASSAGE,
      status: 'pending',
      challengerWpm: 82,
    });
    expect(row.samples).toEqual((db.current.ghosts[0] as { samples: number[] }).samples);
    expect((row.expiresAt as Date).getTime() - NOW.getTime()).toBe(7 * 86_400_000);
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({ userId: 'bo', actorId: 'ada', type: 'SYSTEM', entityType: 'type-challenge' });
    expect((notices[0]!.preview as { key: string }).key).toBe('type-challenge-received');
  });

  it('keeps the snapshot when the ghost later changes', async () => {
    await server.sendChallenge('ada', 'bo', PASSAGE, NOW);
    (db.current.ghosts[0] as { wpm: number }).wpm = 120;
    expect(db.current.challenges[0]!.challengerWpm).toBe(82);
  });

  it('refuses a member who does not follow back, and one the challenger does not follow', async () => {
    db.current.follows.length = 0;
    db.current.follows.push({ followerId: 'ada', followingId: 'bo' });
    expect(await server.sendChallenge('ada', 'bo', PASSAGE, NOW)).toMatchObject({
      ok: false,
      code: 'TYPE_CHALLENGE_UNAVAILABLE',
    });
    db.current.follows.length = 0;
    db.current.follows.push({ followerId: 'bo', followingId: 'ada' });
    expect(await server.sendChallenge('ada', 'bo', PASSAGE, NOW)).toMatchObject({
      ok: false,
      code: 'TYPE_CHALLENGE_UNAVAILABLE',
    });
    expect(await server.sendChallenge('ada', 'cy', PASSAGE, NOW)).toMatchObject({
      ok: false,
      code: 'TYPE_CHALLENGE_UNAVAILABLE',
    });
  });

  it('refuses a block in either direction with the same answer as any other refusal', async () => {
    db.current.blocks.push({ blockerId: 'bo', blockedId: 'ada' });
    const a = await server.sendChallenge('ada', 'bo', PASSAGE, NOW);
    db.current.blocks.length = 0;
    db.current.blocks.push({ blockerId: 'ada', blockedId: 'bo' });
    const b = await server.sendChallenge('ada', 'bo', PASSAGE, NOW);
    expect(a).toMatchObject({ ok: false, status: 403, code: 'TYPE_CHALLENGE_UNAVAILABLE' });
    expect(b).toEqual(a);
    expect(db.current.challenges).toHaveLength(0);
    expect(notices).toHaveLength(0);
  });

  it('refuses a banned member, a deleting member and one who turned challenges off', async () => {
    const bo = db.current.users.find((u) => u.id === 'bo')!;
    bo.bannedUntil = new Date(NOW.getTime() + 3600_000);
    expect(await server.sendChallenge('ada', 'bo', PASSAGE, NOW)).toMatchObject({ code: 'TYPE_CHALLENGE_UNAVAILABLE' });
    bo.bannedUntil = new Date(NOW.getTime() - 3600_000);
    bo.deletionScheduledAt = new Date(NOW.getTime() + 3600_000);
    expect(await server.sendChallenge('ada', 'bo', PASSAGE, NOW)).toMatchObject({ code: 'TYPE_CHALLENGE_UNAVAILABLE' });
    bo.deletionScheduledAt = null;
    await server.setChallengesEnabled('bo', false);
    expect(await server.sendChallenge('ada', 'bo', PASSAGE, NOW)).toMatchObject({ code: 'TYPE_CHALLENGE_UNAVAILABLE' });
    await server.setChallengesEnabled('bo', true);
    expect((await server.sendChallenge('ada', 'bo', PASSAGE, NOW)).ok).toBe(true);
  });

  it('refuses a passage the challenger has no ghost on, and a challenge to oneself', async () => {
    expect(await server.sendChallenge('ada', 'bo', 'easy-02', NOW)).toMatchObject({
      ok: false,
      code: 'TYPE_CHALLENGE_NO_RUN',
    });
    expect(await server.sendChallenge('ada', 'ada', PASSAGE, NOW)).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
  });

  it('reads the accuracy from the run the ghost came from, else the 90% floor', async () => {
    await server.sendChallenge('ada', 'bo', PASSAGE, NOW);
    expect(db.current.challenges[0]!.challengerAccuracy).toBe(90);
    db.current.challenges.length = 0;
    db.current.matchPlayers.push({ userId: 'ada', wpm: 82, accuracy: 97.5 });
    await server.sendChallenge('ada', 'bo', PASSAGE, NOW);
    expect(db.current.challenges[0]!.challengerAccuracy).toBe(97.5);
  });
});

describe('the caps run under the lock', () => {
  beforeEach(() => {
    giveGhost('ada', 82);
    for (const id of ['d1', 'd2', 'd3', 'd4']) {
      db.current.users.push(user(id));
      mutual('ada', id);
    }
  });

  it('takes the challenger lock before it counts', async () => {
    await server.sendChallenge('ada', 'bo', PASSAGE, NOW);
    expect(db.current.locks).toEqual(['type-challenges:ada']);
  });

  it('allows three open challenges to one opponent, then refuses', async () => {
    for (let i = 0; i < MAX_OPEN_PER_OPPONENT; i++) {
      expect((await server.sendChallenge('ada', 'bo', PASSAGE, NOW)).ok).toBe(true);
    }
    expect(await server.sendChallenge('ada', 'bo', PASSAGE, NOW)).toMatchObject({
      ok: false,
      code: 'TYPE_CHALLENGE_PAIR_FULL',
      max: 3,
    });
    // Another opponent is unaffected.
    expect((await server.sendChallenge('ada', 'd1', PASSAGE, NOW)).ok).toBe(true);
  });

  it('allows ten open challenges, then refuses; a lapsed one does not count', async () => {
    const people = ['bo', 'd1', 'd2', 'd3'];
    let sent = 0;
    for (let i = 0; sent < MAX_OPEN_CHALLENGES; i++) {
      const who = people[i % people.length]!;
      if (i >= 12) break;
      if ((await server.sendChallenge('ada', who, PASSAGE, NOW)).ok) sent++;
    }
    expect(db.current.challenges).toHaveLength(MAX_OPEN_CHALLENGES);
    expect(await server.sendChallenge('ada', 'd4', PASSAGE, NOW)).toMatchObject({
      ok: false,
      code: 'TYPE_CHALLENGE_FULL',
      max: 10,
    });
    // A week later the open ones have lapsed, so they count for nothing.
    const later = new Date(NOW.getTime() + 8 * 86_400_000);
    expect((await server.sendChallenge('ada', 'd4', PASSAGE, later)).ok).toBe(true);
  });
});

describe('declining', () => {
  it('lets only the opponent decline a pending challenge, once, and tells nobody', async () => {
    giveGhost('ada', 82);
    await server.sendChallenge('ada', 'bo', PASSAGE, NOW);
    const id = db.current.challenges[0]!.id as string;
    notices.length = 0;
    expect(await server.declineChallenge('ada', id, NOW)).toMatchObject({ ok: false, status: 404 });
    expect(await server.declineChallenge('cy', id, NOW)).toMatchObject({ ok: false, status: 404 });
    expect(await server.declineChallenge('bo', id, NOW)).toEqual({ ok: true });
    expect(db.current.challenges[0]!.status).toBe('declined');
    expect(await server.declineChallenge('bo', id, NOW)).toMatchObject({ ok: false });
    expect(notices).toHaveLength(0);
  });
});

describe('claiming a race: one attempt', () => {
  it('lets only the opponent claim, and only a pending, unlapsed challenge', async () => {
    const row = seedRacing({ status: 'pending', raceStartedAt: null });
    const p = db.prisma as Parameters<typeof settle.claimChallengeRace>[0];
    expect(await settle.claimChallengeRace(p, 'ada', row.id as string, NOW)).toMatchObject({
      ok: false,
      status: 404,
      code: 'NOT_FOUND',
    });
    expect(await settle.claimChallengeRace(p, 'cy', row.id as string, NOW)).toMatchObject({ ok: false, status: 404 });
    expect(row.status).toBe('pending');
    const lapsed = new Date((row.expiresAt as Date).getTime() + 1);
    expect(await settle.claimChallengeRace(p, 'bo', row.id as string, lapsed)).toMatchObject({
      ok: false,
      status: 410,
    });
    const ok = await settle.claimChallengeRace(p, 'bo', row.id as string, NOW);
    expect(ok).toMatchObject({ ok: true, race: { passageId: PASSAGE, challengerName: 'ADA' } });
    expect(row.status).toBe('racing');
    expect(row.raceStartedAt).toEqual(NOW);
  });

  it('claims once when two starts race for it (another tab, a reload)', async () => {
    const row = seedRacing({ status: 'pending', raceStartedAt: null });
    const p = db.prisma as Parameters<typeof settle.claimChallengeRace>[0];
    const [a, b] = await Promise.all([
      settle.claimChallengeRace(p, 'bo', row.id as string, NOW),
      settle.claimChallengeRace(p, 'bo', row.id as string, NOW),
    ]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    const lost = [a, b].find((r) => !r.ok)!;
    expect(lost).toMatchObject({ ok: false, status: 409, code: 'TYPE_CHALLENGE_RACED' });
  });

  it('refuses a race that has started or been settled, and a block or ban since it was sent', async () => {
    const p = db.prisma as Parameters<typeof settle.claimChallengeRace>[0];
    const racing = seedRacing();
    expect(await settle.claimChallengeRace(p, 'bo', racing.id as string, NOW)).toMatchObject({
      code: 'TYPE_CHALLENGE_RACED',
    });
    const done = seedRacing({ status: 'done' });
    expect(await settle.claimChallengeRace(p, 'bo', done.id as string, NOW)).toMatchObject({
      code: 'TYPE_CHALLENGE_RACED',
    });
    const pending = seedRacing({ status: 'pending' });
    db.current.blocks.push({ blockerId: 'bo', blockedId: 'ada' });
    expect(await settle.claimChallengeRace(p, 'bo', pending.id as string, NOW)).toMatchObject({
      code: 'TYPE_CHALLENGE_UNAVAILABLE',
    });
    expect(pending.status).toBe('pending');
    db.current.blocks.length = 0;
    db.current.users.find((u) => u.id === 'ada')!.bannedUntil = new Date(NOW.getTime() + 1000);
    expect(await settle.claimChallengeRace(p, 'bo', pending.id as string, NOW)).toMatchObject({
      code: 'TYPE_CHALLENGE_UNAVAILABLE',
    });
  });

  it('refuses a race once the pair no longer follow each other, without spending the attempt', async () => {
    const p = db.prisma as Parameters<typeof settle.claimChallengeRace>[0];
    const pending = seedRacing({ status: 'pending' });
    db.current.follows.length = 0;
    db.current.follows.push({ followerId: 'ada', followingId: 'bo' });
    expect(await settle.claimChallengeRace(p, 'bo', pending.id as string, NOW)).toMatchObject({
      code: 'TYPE_CHALLENGE_UNAVAILABLE',
    });
    expect(pending.status).toBe('pending');
  });

  it('writes no result notice to a member who turned system notices off', async () => {
    const p = db.prisma as Parameters<typeof settle.claimChallengeRace>[0];
    db.current.prefs.push({ userId: 'ada', system: false });
    const row = seedRacing();
    await settle.settleAndNotify(p, row.id as string, null);
    expect(db.current.notifications.map((n) => n.userId)).toEqual(['bo']);
  });

  it('does not spend the attempt on a passage that has left the curated source', async () => {
    const row = seedRacing({ status: 'pending', passageId: 'easy-gone' });
    const p = db.prisma as Parameters<typeof settle.claimChallengeRace>[0];
    expect(await settle.claimChallengeRace(p, 'bo', row.id as string, NOW)).toMatchObject({ ok: false, status: 410 });
    expect(row.status).toBe('pending');
  });
});

describe('the winner rule', () => {
  const opp = (wpm: number, accuracy = 95, finished = true) => ({ wpm, accuracy, finished });

  it('gives the race to the faster finisher', () => {
    expect(decideOutcome(60, opp(61))).toBe('opponent');
    expect(decideOutcome(60, opp(59))).toBe('challenger');
  });

  it('calls the same speed to two decimals a draw', () => {
    expect(decideOutcome(60.004, opp(60.001))).toBe('draw');
    expect(decideOutcome(60.0, opp(60.01))).toBe('opponent');
  });

  it('needs 90% accuracy to win: 89.9 loses, 90 wins', () => {
    expect(decideOutcome(60, opp(80, 89.9))).toBe('challenger');
    expect(decideOutcome(60, opp(80, 90))).toBe('opponent');
    expect(decideOutcome(60, opp(60, 89.9))).toBe('challenger');
  });

  it('is lost by a run that did not finish, whatever its figures', () => {
    expect(decideOutcome(60, opp(200, 100, false))).toBe('challenger');
  });

  it('words the result from each side', () => {
    expect(resultFor('opponent', 'opponent', true)).toBe('won');
    expect(resultFor('challenger', 'opponent', true)).toBe('lost');
    expect(resultFor('challenger', 'challenger', true)).toBe('won');
    expect(resultFor('opponent', 'challenger', false)).toBe('unfinished');
    expect(resultFor('challenger', 'challenger', false)).toBe('forfeited');
    expect(resultFor('opponent', 'draw', true)).toBe('drew');
  });
});

describe('what counts as a finish', () => {
  it('accepts a full-length finish at a believable speed with a believable curve', () => {
    const { timeMs, samples } = curve(70);
    const f = evaluateFinish({ passageLength: TEXT.length, position: TEXT.length, errors: 2, timeMs, samples });
    expect(f.finished).toBe(true);
    expect(f.wpm).toBeCloseTo(70, 0);
    expect(f.accuracy).toBeCloseTo(((TEXT.length - 2) / TEXT.length) * 100, 5);
  });

  it('is not a finish when the position is short of the passage', () => {
    const { timeMs, samples } = curve(70);
    expect(
      evaluateFinish({ passageLength: TEXT.length, position: TEXT.length - 1, errors: 0, timeMs, samples }).finished,
    ).toBe(false);
  });

  it('clamps a position past the passage and still needs the length to match', () => {
    const { timeMs, samples } = curve(70);
    const f = evaluateFinish({ passageLength: TEXT.length, position: TEXT.length + 500, errors: 0, timeMs, samples });
    expect(f.position).toBe(TEXT.length);
    expect(f.finished).toBe(true);
    expect(f.wpm).toBeCloseTo(70, 0);
  });

  it('is not a finish above the speed cap', () => {
    const timeMs = Math.round((TEXT.length / 5 / (MAX_WPM + 40)) * 60000);
    const samples = [TEXT.length];
    expect(
      evaluateFinish({ passageLength: TEXT.length, position: TEXT.length, errors: 0, timeMs, samples }).finished,
    ).toBe(false);
  });

  it('is not a finish with an implausible curve (a jump, a short curve, no curve)', () => {
    const { timeMs } = curve(70);
    const steps = Math.ceil(timeMs / 250);
    const jump = Array.from({ length: steps }, (_, i) => (i === steps - 1 ? TEXT.length : 0));
    expect(
      evaluateFinish({ passageLength: TEXT.length, position: TEXT.length, errors: 0, timeMs, samples: jump }).finished,
    ).toBe(false);
    expect(
      evaluateFinish({ passageLength: TEXT.length, position: TEXT.length, errors: 0, timeMs, samples: [TEXT.length] })
        .finished,
    ).toBe(false);
    expect(
      evaluateFinish({ passageLength: TEXT.length, position: TEXT.length, errors: 0, timeMs, samples: undefined })
        .finished,
    ).toBe(false);
    expect(
      evaluateFinish({ passageLength: TEXT.length, position: TEXT.length, errors: 0, timeMs, samples: 'x' }).finished,
    ).toBe(false);
  });

  it('is not a finish one second after the start', () => {
    const f = evaluateFinish({
      passageLength: TEXT.length,
      position: TEXT.length,
      errors: 0,
      timeMs: 1000,
      samples: [TEXT.length, TEXT.length, TEXT.length, TEXT.length],
    });
    expect(f.finished).toBe(false);
  });

  it('refuses a snapshot that is not believable', () => {
    const { timeMs, samples } = curve(60);
    expect(isChallengeSnapshot({ wpm: 60, accuracy: 96, timeMs, samples }, PASSAGE)).toBe(true);
    expect(isChallengeSnapshot({ wpm: 60, accuracy: 89, timeMs, samples }, PASSAGE)).toBe(false);
    expect(isChallengeSnapshot({ wpm: MAX_WPM + 1, accuracy: 96, timeMs, samples }, PASSAGE)).toBe(false);
    expect(isChallengeSnapshot({ wpm: 60, accuracy: 96, timeMs, samples: [1, 2, 3] }, PASSAGE)).toBe(false);
    expect(isChallengeSnapshot({ wpm: 60, accuracy: 96, timeMs, samples }, 'text:abc')).toBe(false);
  });
});

describe('settling a race', () => {
  const p = () => db.prisma as Parameters<typeof settle.settleChallengeRace>[0];

  it('settles a finished run from the checked figures', async () => {
    const row = seedRacing();
    const { timeMs, samples } = curve(70);
    const figures = evaluateFinish({ passageLength: TEXT.length, position: TEXT.length, errors: 1, timeMs, samples });
    const settled = await settle.settleChallengeRace(p(), row.id as string, figures, 'bo', NOW);
    expect(settled).toMatchObject({ outcome: 'opponent', finished: true, challengerWpm: 60 });
    expect(row).toMatchObject({ status: 'done', outcome: 'opponent', finished: true, settledAt: NOW });
    expect(row.opponentWpm).toBeCloseTo(70, 0);
  });

  it('settles a finish that fails a check as "Did not finish" and stores none of its figures', async () => {
    const row = seedRacing();
    const figures = evaluateFinish({
      passageLength: TEXT.length,
      position: TEXT.length,
      errors: 0,
      timeMs: 1000,
      samples: [TEXT.length],
    });
    const settled = await settle.settleChallengeRace(p(), row.id as string, figures, 'bo', NOW);
    expect(settled).toMatchObject({ outcome: 'challenger', finished: false, opponentWpm: null });
    expect(row).toMatchObject({
      status: 'done',
      outcome: 'challenger',
      finished: false,
      opponentWpm: null,
      opponentAccuracy: null,
      opponentTimeMs: null,
    });
  });

  it('gives the challenger the race when the opponent finished under 90%', async () => {
    const row = seedRacing();
    const { timeMs, samples } = curve(90);
    const figures = evaluateFinish({
      passageLength: TEXT.length,
      position: TEXT.length,
      errors: Math.ceil(TEXT.length * 0.11),
      timeMs,
      samples,
    });
    expect(figures.finished).toBe(true);
    expect(figures.accuracy).toBeLessThan(90);
    const settled = await settle.settleChallengeRace(p(), row.id as string, figures, 'bo', NOW);
    expect(settled).toMatchObject({ outcome: 'challenger', finished: true });
  });

  it('settles once when two finishes race for it', async () => {
    const row = seedRacing();
    const { timeMs, samples } = curve(70);
    const figures = evaluateFinish({ passageLength: TEXT.length, position: TEXT.length, errors: 0, timeMs, samples });
    const [a, b] = await Promise.all([
      settle.settleChallengeRace(p(), row.id as string, figures, 'bo', NOW),
      settle.settleChallengeRace(p(), row.id as string, null, 'bo', NOW),
    ]);
    expect([a, b].filter((x) => x !== null)).toHaveLength(1);
    expect(row.status).toBe('done');
  });

  it('settles and notifies once under two concurrent finishes', async () => {
    const row = seedRacing();
    const { timeMs, samples } = curve(70);
    const figures = evaluateFinish({ passageLength: TEXT.length, position: TEXT.length, errors: 0, timeMs, samples });
    const results = await Promise.all([
      settle.settleAndNotify(p(), row.id as string, figures, 'bo'),
      settle.settleAndNotify(p(), row.id as string, figures, 'bo'),
    ]);
    expect(results.filter((x) => x !== null)).toHaveLength(1);
    expect(db.current.notifications).toHaveLength(2);
  });

  it('settles only for the opponent, and only a racing challenge', async () => {
    const row = seedRacing();
    expect(await settle.settleChallengeRace(p(), row.id as string, null, 'cy', NOW)).toBeNull();
    expect(row.status).toBe('racing');
    const pending = seedRacing({ status: 'pending' });
    expect(await settle.settleChallengeRace(p(), pending.id as string, null, 'bo', NOW)).toBeNull();
    expect(pending.status).toBe('pending');
  });

  it('tells each side from their own side, with the other member and the speed that decided it', async () => {
    const row = seedRacing();
    const { timeMs, samples } = curve(70);
    const figures = evaluateFinish({ passageLength: TEXT.length, position: TEXT.length, errors: 0, timeMs, samples });
    await settle.settleAndNotify(p(), row.id as string, figures, 'bo');
    const byUser = Object.fromEntries(db.current.notifications.map((n) => [n.userId as string, n]));
    expect(byUser.bo).toMatchObject({ previewKey: 'type-challenge-won', actorId: 'ada', entityType: 'type-challenge' });
    expect(byUser.bo!.previewParams).toMatchObject({ name: 'ADA', wpm: 60, passage: 'The quick brown fox…' });
    expect(byUser.ada).toMatchObject({ previewKey: 'type-challenge-lost', actorId: 'bo' });
    expect(byUser.ada!.previewParams).toMatchObject({ name: 'BO', wpm: 70 });
    expect(byUser.bo!.preview).toBe("You beat ADA's 60 WPM on 'The quick brown fox…'");
  });

  it('words a left race as the opponent not finishing and the challenger winning', async () => {
    const row = seedRacing();
    await settle.settleAndNotify(p(), row.id as string, null);
    const byUser = Object.fromEntries(db.current.notifications.map((n) => [n.userId as string, n]));
    expect(byUser.bo).toMatchObject({ previewKey: 'type-challenge-unfinished' });
    expect(byUser.ada).toMatchObject({ previewKey: 'type-challenge-forfeited' });
  });
});

describe('expiry', () => {
  const p = () => db.prisma as Parameters<typeof settle.expireChallenges>[0];

  it('expires a pending challenge past its date, without a notice, and leaves a live one', async () => {
    const old = seedRacing({ status: 'pending', raceStartedAt: null, expiresAt: new Date(NOW.getTime() - 1) });
    const live = seedRacing({ status: 'pending', raceStartedAt: null });
    const pass = await jobs.runChallengeExpiry(p(), NOW);
    expect(pass.expired).toBe(1);
    expect(old.status).toBe('expired');
    expect(live.status).toBe('pending');
    expect(notices).toHaveLength(0);
  });

  it('settles a race stuck in racing for more than 15 minutes as "Did not finish", with the result notices', async () => {
    const stale = seedRacing({ raceStartedAt: new Date(NOW.getTime() - RACING_STALE_MS - 1000) });
    const fresh = seedRacing({ raceStartedAt: new Date(NOW.getTime() - 60_000) });
    const pass = await jobs.runChallengeExpiry(p(), NOW);
    expect(pass.settled).toHaveLength(1);
    expect(stale).toMatchObject({ status: 'done', outcome: 'challenger', finished: false });
    expect(fresh.status).toBe('racing');
    expect(notices.map((n) => n.userId).sort()).toEqual(['ada', 'bo']);
  });

  it('does not settle a race a finishing socket got to first', async () => {
    const stale = seedRacing({ raceStartedAt: new Date(NOW.getTime() - RACING_STALE_MS - 1000) });
    const { timeMs, samples } = curve(70);
    const figures = evaluateFinish({ passageLength: TEXT.length, position: TEXT.length, errors: 0, timeMs, samples });
    await Promise.all([
      settle.settleChallengeRace(p(), stale.id as string, figures, 'bo', NOW),
      jobs.runChallengeExpiry(p(), NOW),
    ]);
    expect(stale.status).toBe('done');
    expect(db.current.challenges.filter((c) => c.status === 'done')).toHaveLength(1);
  });
});

describe('what a member sees', () => {
  it('lists received, sent and settled, and hides a challenge with a blocked member', async () => {
    seedRacing({ status: 'pending', raceStartedAt: null, challengerId: 'ada', opponentId: 'bo' });
    seedRacing({ status: 'pending', raceStartedAt: null, challengerId: 'cy', opponentId: 'bo' });
    seedRacing({
      status: 'done',
      outcome: 'challenger',
      finished: false,
      challengerId: 'bo',
      opponentId: 'ada',
      settledAt: NOW,
    });
    db.current.blocks.push({ blockerId: 'bo', blockedId: 'cy' });
    const view = await server.listChallenges('bo', NOW);
    expect(view.enabled).toBe(true);
    expect(view.received.map((r) => r.challenger.id)).toEqual(['ada']);
    expect(view.received[0]).toMatchObject({ role: 'opponent', title: 'The quick brown fox…', status: 'pending' });
    expect(view.settled).toHaveLength(1);
    expect(view.settled[0]).toMatchObject({ role: 'challenger', finished: false });
    expect(view.sent).toHaveLength(0);
  });

  it('shows no challenge a member has already settled as received', async () => {
    seedRacing({ status: 'declined' });
    seedRacing({ status: 'expired' });
    expect((await server.listChallenges('bo', NOW)).received).toHaveLength(0);
  });

  it("asks for the caller's own mutuals only, never anyone else's follow list", async () => {
    const spy = vi.fn(async (_args: unknown) => [user('bo')]);
    const prisma = db.prisma as { user: { findMany: unknown } };
    const original = prisma.user.findMany;
    prisma.user.findMany = spy;
    try {
      const people = await server.listMutuals('ada', NOW);
      expect(people).toEqual([{ id: 'bo', name: 'BO', handle: 'bo' }]);
      const where = (spy.mock.calls[0]![0] as { where: Record<string, unknown> }).where;
      expect(where.followers).toEqual({ some: { followerId: 'ada' } });
      expect(where.following).toEqual({ some: { followingId: 'ada' } });
      expect(where.rmhTypeChallengeOptOut).toBeNull();
      expect(where.deletionScheduledAt).toBeNull();
    } finally {
      prisma.user.findMany = original;
    }
  });

  it("exports sent and received challenges with the member's own figures", async () => {
    seedRacing({
      status: 'done',
      outcome: 'opponent',
      finished: true,
      opponentWpm: 70,
      opponentAccuracy: 95,
      opponentTimeMs: 15000,
    });
    const out = await server.exportTypeChallenges('bo');
    expect(out.challengesOn).toBe(true);
    expect(out.challenges[0]).toMatchObject({
      role: 'opponent',
      with: 'ada',
      yourWpm: 70,
      theirWpm: 60,
      outcome: 'opponent',
    });
    expect(JSON.stringify(out)).not.toContain('samples');
  });
});
