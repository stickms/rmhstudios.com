// The persistence gate: processCoopRun may only hand the REPLAY's numbers to the database, only when
// the replay agrees with the claim, and only once per run id.
import {
  describe,
  it,
  expect,
  beforeAll,
  vi,
} from 'vitest';

vi.mock(
  '@/lib/prisma.server',
  () => ({
    prisma:
      {},
  }),
);
vi.mock(
  '@/lib/achievements/engine.server',
  () => ({
    grantAchievement:
      vi.fn(),
    progressAchievement:
      vi.fn(),
  }),
);
vi.mock(
  '@/lib/quests/engine.server',
  () => ({
    recordGamePlay:
      vi.fn(),
  }),
);
vi.mock(
  '../submit.server',
  () => ({
    submitToVerifyQueue:
      vi.fn(
        async () =>
          'no_queue',
      ),
  }),
);

import {
  processCoopRun,
  type ProcessDeps,
} from '../queue.server';
import {
  verifyCoopRun,
  type VerifiedCoopRun,
} from '../verify-coop';
import type { CoopRunJob } from '../job';
import {
  playHonestRun,
  type Recorded,
} from './fixture';

vi.setConfig(
  {
    testTimeout: 120_000,
  },
);

const clone =
  <
    T,
  >(
    v: T,
  ): T =>
    JSON.parse(
      JSON.stringify(
        v,
      ),
    );

let honest: Recorded;
beforeAll(
  () => {
    honest =
      playHonestRun();
  },
  120_000,
);

function jobFor(
  r: Recorded,
  over: Partial<CoopRunJob> = {},
): CoopRunJob {
  const name =
    (p: {
      id: string;
      classId: string;
      slot: number;
    }) => ({
      userId:
        p.id,
      userName:
        p.id.toUpperCase(),
      classId:
        p.classId,
      slot: p.slot,
    });
  return {
    runId:
      'run-aaaaaaaa-1',
    lobbyId:
      'LOBBY1',
    hostUserId:
      'alice',
    seed: r
      .trusted
      .seed,
    doubleTime:
      r
        .trusted
        .doubleTime,
    roster:
      r.trusted.roster.map(
        name,
      ),
    joins:
      r.trusted.joins.map(
        name,
      ),
    wallMs:
      r
        .trusted
        .wallMs,
    log: clone(
      r.log,
    ),
    claim:
      clone(
        r.claim,
      ),
    ...over,
  };
}

/** A fake database: persist remembers run ids and refuses a second one, like the unique index. */
function fakeDb() {
  const saved =
    new Map<
      string,
      VerifiedCoopRun
    >();
  const verify =
    vi.fn(
      verifyCoopRun,
    );
  const persist =
    vi.fn(
      async (
        job: CoopRunJob,
        run: VerifiedCoopRun,
      ) => {
        if (
          saved.has(
            job.runId,
          )
        )
          return {
            saved:
              false as const,
            reason:
              'duplicate' as const,
          };
        saved.set(
          job.runId,
          run,
        );
        return {
          saved:
            true as const,
          matchId: `m-${saved.size}`,
        };
      },
    );
  const deps: ProcessDeps =
    {
      recorded:
        async (
          id,
        ) =>
          saved.has(
            id,
          ),
      persist,
      verify,
    };
  return {
    saved,
    verify,
    persist,
    deps,
  };
}

describe('processCoopRun', () => {
  it('persists an honest run, with the replay-computed numbers', async () => {
    const db =
      fakeDb();
    const out =
      await processCoopRun(
        jobFor(
          honest,
        ),
        db.deps,
      );
    expect(
      out,
    ).toMatchObject(
      {
        status:
          'saved',
      },
    );
    expect(
      db.persist,
    ).toHaveBeenCalledTimes(
      1,
    );
    const run =
      db.saved.get(
        'run-aaaaaaaa-1',
      )!;
    expect(
      run.sharedKills,
    ).toBe(
      honest
        .claim
        .sharedKills,
    );
    for (const c of honest
      .claim
      .players) {
      expect(
        run.players.find(
          (
            p,
          ) =>
            p.userId ===
            c.userId,
        ),
      ).toMatchObject(
        {
          kills:
            c.kills,
          coins:
            c.coins,
          level:
            c.level,
        },
      );
    }
  });

  it('a replayed submission of the same run id is a duplicate and costs no simulation', async () => {
    const db =
      fakeDb();
    expect(
      await processCoopRun(
        jobFor(
          honest,
        ),
        db.deps,
      ),
    ).toMatchObject(
      {
        status:
          'saved',
      },
    );
    const second =
      await processCoopRun(
        jobFor(
          honest,
        ),
        db.deps,
      );
    expect(
      second,
    ).toEqual(
      {
        status:
          'duplicate',
      },
    );
    expect(
      db.verify,
    ).toHaveBeenCalledTimes(
      1,
    ); // the second one never reached the replay
    expect(
      db.persist,
    ).toHaveBeenCalledTimes(
      1,
    );
    expect(
      db
        .saved
        .size,
    ).toBe(
      1,
    );
  });

  it('even if the pre-check races, the unique index makes the second write a duplicate', async () => {
    const db =
      fakeDb();
    db.deps.recorded =
      async () =>
        false; // the pre-check is stale
    await processCoopRun(
      jobFor(
        honest,
      ),
      db.deps,
    );
    expect(
      await processCoopRun(
        jobFor(
          honest,
        ),
        db.deps,
      ),
    ).toEqual(
      {
        status:
          'duplicate',
      },
    );
    expect(
      db
        .saved
        .size,
    ).toBe(
      1,
    );
  });

  it('inflated claimed kills/coins are rejected and NOTHING is persisted', async () => {
    const db =
      fakeDb();
    const job =
      jobFor(
        honest,
      );
    job.claim.players[0].kills += 9999;
    job.claim.players[0].coins += 123456;
    const out =
      await processCoopRun(
        job,
        db.deps,
      );
    expect(
      out,
    ).toMatchObject(
      {
        status:
          'rejected',
        reason:
          'claim_mismatch',
      },
    );
    expect(
      db.persist,
    ).not.toHaveBeenCalled();
    expect(
      db
        .saved
        .size,
    ).toBe(
      0,
    );
  });

  it('a tampered log is rejected and NOTHING is persisted', async () => {
    const db =
      fakeDb();
    const job =
      jobFor(
        honest,
      );
    (
      job.log as {
        seed: number;
      }
    ).seed +=
      1;
    expect(
      await processCoopRun(
        job,
        db.deps,
      ),
    ).toMatchObject(
      {
        status:
          'rejected',
        reason:
          'setup_mismatch',
      },
    );
    const job2 =
      jobFor(
        honest,
        {
          seed:
            honest
              .trusted
              .seed +
            1,
        },
      ); // hub says another seed than the host played
    expect(
      await processCoopRun(
        job2,
        db.deps,
      ),
    ).toMatchObject(
      {
        status:
          'rejected',
      },
    );
    const job3 =
      jobFor(
        honest,
        {
          log: null,
        },
      );
    expect(
      await processCoopRun(
        job3,
        db.deps,
      ),
    ).toMatchObject(
      {
        status:
          'rejected',
        reason:
          'invalid_log',
      },
    );
    expect(
      db.persist,
    ).not.toHaveBeenCalled();
  });
});
