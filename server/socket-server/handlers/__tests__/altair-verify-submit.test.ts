/**
 * What the hub hands the verifier when a co-op run ends: trusted setup from the hub's own state, the
 * host's log and claim as untrusted data, never persisted by the hub itself.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const submit = vi.fn(async (_job: unknown) => 'queued');
vi.mock('../../../../lib/altair/verify/submit.server', () => ({ submitToVerifyQueue: (job: unknown) => submit(job) }));

import { __resetAltairLobbies, registerAltairHandlers } from '../altair';
import { all, last, makeWorld, type FakeSocket } from '../../test-support/fake-world';
import { RunRecorder } from '../../../../lib/altair/verify/run-log';

interface LobbyView {
  state: string;
  runSeed?: number | null;
}

function startMatch() {
  const w = makeWorld(registerAltairHandlers);
  const host = w.connect('sock-host', { userId: 'host', userName: 'Host' });
  w.send(host, 'altair:lobby:create', {});
  const lobbyId = (last<{ lobbyId: string }>(host, 'altair:lobby:created') as { lobbyId: string }).lobbyId;
  const guest = w.connect('sock-guest', { userId: 'guest', userName: 'Guest' });
  w.send(guest, 'altair:lobby:join', { lobbyId });
  for (const [s, c] of [[host, 'knight'], [guest, 'ranger']] as [FakeSocket, string][]) {
    w.send(s, 'altair:class:select', { classId: c });
    w.send(s, 'altair:class:ready', { ready: true });
  }
  w.send(host, 'altair:game:start', {});
  vi.advanceTimersByTime(5000);
  const view = (s: FakeSocket) => last<LobbyView>(s, 'altair:lobby:state_snapshot') as LobbyView;
  return { w, host, guest, lobbyId, view };
}

const claim = {
  victory: false,
  time: 12,
  sharedKills: 3,
  bossesDefeated: [],
  players: [
    { userId: 'host', level: 2, kills: 2, coins: 5, timeSurvived: 12, revivesGiven: 0, revivesReceived: 0, wasDowned: true, wasAliveAtEnd: false },
    { userId: 'guest', level: 1, kills: 1, coins: 0, timeSurvived: 12, revivesGiven: 0, revivesReceived: 0, wasDowned: true, wasAliveAtEnd: false },
  ],
};

function logFor(seed: number) {
  const rec = new RunRecorder([
    { id: 'host', classId: 'knight', slot: 0 },
    { id: 'guest', classId: 'ranger', slot: 1 },
  ]);
  rec.input(0, 'host', 50, 50);
  return rec.toLog(700, seed, false);
}

describe('altair hub: run submission', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    submit.mockClear();
  });
  afterEach(() => {
    __resetAltairLobbies();
    vi.useRealTimers();
  });

  it('queues the run with the HUB seed, roster and wall clock, and the host log/claim as data', () => {
    const { w, host, view } = startMatch();
    const seed = view(host).runSeed as number;
    vi.advanceTimersByTime(30_000);
    w.send(host, 'altair:game:end', { ...claim, runLog: { enc: 'json', data: JSON.stringify(logFor(seed)) } });
    return vi.waitFor(() => expect(submit).toHaveBeenCalledTimes(1)).then(() => {
      const job = submit.mock.calls[0][0] as Record<string, unknown>;
      expect(job.seed).toBe(seed);
      expect(job.hostUserId).toBe('host');
      expect(job.roster).toEqual([
        { userId: 'host', userName: 'Host', classId: 'knight', slot: 0 },
        { userId: 'guest', userName: 'Guest', classId: 'ranger', slot: 1 },
      ]);
      expect(job.wallMs).toBe(30_000);
      expect(typeof job.runId).toBe('string');
      expect((job.claim as { players: { coins: number }[] }).players[0].coins).toBe(5);
    });
  });

  it('a mid-run drop-in is admitted in the job (and nobody else is)', async () => {
    const { w, host, lobbyId, view } = startMatch();
    const seed = view(host).runSeed as number;
    const late = w.connect('sock-late', { userId: 'late', userName: 'Late' });
    w.send(late, 'altair:lobby:join', { lobbyId });
    w.send(late, 'altair:class:select', { classId: 'arcanist' });
    vi.advanceTimersByTime(20_000);
    w.send(host, 'altair:game:end', { ...claim, runLog: { enc: 'json', data: JSON.stringify(logFor(seed)) } });
    await vi.waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    const job = submit.mock.calls[0][0] as { joins: unknown[]; roster: unknown[] };
    expect(job.roster).toHaveLength(2);
    expect(job.joins).toEqual([{ userId: 'late', userName: 'Late', classId: 'arcanist', slot: 2 }]);
  });

  it('a guest cannot end the run or submit anything', () => {
    const { w, guest } = startMatch();
    w.send(guest, 'altair:game:end', { ...claim, runLog: { enc: 'json', data: '{}' } });
    expect(all<{ code: string }>(guest, 'altair:error').map((e) => e.code)).toContain('NOT_HOST');
    expect(submit).not.toHaveBeenCalled();
  });

  it('a run with no readable log shows results but is never submitted', async () => {
    const { w, host } = startMatch();
    w.send(host, 'altair:game:end', claim);
    await Promise.resolve();
    expect(submit).not.toHaveBeenCalled();
    expect(last(host, 'altair:game:results')).toBeTruthy();
  });

  it('a bomb or garbage in place of the log is never submitted', async () => {
    const { w, host } = startMatch();
    w.send(host, 'altair:game:end', { ...claim, runLog: { enc: 'gzip-b64', data: 'AAAA' } });
    await Promise.resolve();
    expect(submit).not.toHaveBeenCalled();
  });
});
