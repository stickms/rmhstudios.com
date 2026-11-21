import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

const m =
  vi.hoisted(
    () => ({
      emit: vi.fn(),
      recordPersonalBest:
        vi.fn(),
      upsert:
        vi.fn(),
      updateMany:
        vi.fn(),
      findUnique:
        vi.fn(),
    }),
  );

vi.mock(
  '@/lib/webhooks/emit.server',
  () => ({
    emitWebhookEvent:
      m.emit,
  }),
);
vi.mock(
  '@/lib/game/personal-bests.server',
  () => ({
    recordPersonalBest:
      m.recordPersonalBest,
  }),
);
vi.mock(
  '@/lib/rate-limit',
  () => ({
    rateLimit:
      vi.fn(
        () => ({
          allowed: true,
          retryAfter: 0,
        }),
      ),
  }),
);
vi.mock(
  '@/lib/developer/recipes.server',
  () => ({
    emitPersonalBest:
      vi.fn(),
  }),
);
vi.mock(
  '@/lib/quests/engine.server',
  () => ({
    recordGamePlay:
      vi.fn(
        async () => {},
      ),
  }),
);
vi.mock(
  '@/lib/game/results.server',
  () => ({
    reportGameResult:
      vi.fn(
        async () => {},
      ),
  }),
);
vi.mock(
  '@/lib/game/registry',
  () => ({
    validateScore:
      () => ({
        ok: true,
      }),
    rejectionMessage:
      () =>
        'no',
  }),
);
vi.mock(
  '@/lib/game/adapters.server',
  () => ({
    getGameAdapter:
      () => ({
        personalBest:
          async () =>
            5,
        submit:
          async () => {},
        rank: async () =>
          null,
      }),
  }),
);
vi.mock(
  '@/lib/economy',
  () => ({
    creditCoins:
      vi.fn(
        async () => {},
      ),
  }),
);
vi.mock(
  '@/lib/notifications.server',
  () => ({
    createNotification:
      vi.fn(
        async () => {},
      ),
  }),
);
vi.mock(
  '@/lib/referrals.server',
  () => ({
    maybeRewardReferral:
      vi.fn(
        async () => {},
      ),
  }),
);
vi.mock(
  '@/lib/achievements/tracking.server',
  () => ({
    onProgress:
      vi.fn(
        async () => {},
      ),
  }),
);
vi.mock(
  '@/lib/prisma.server',
  () => ({
    prisma:
      {
        userAchievement:
          {
            upsert:
              m.upsert,
            updateMany:
              m.updateMany,
            findUnique:
              m.findUnique,
          },
      },
  }),
);

const {
  emitPersonalBestCreated,
  emitAchievementUnlocked,
} =
  await import('@/lib/webhooks/game-emit.server');
const {
  grantAchievement,
  progressAchievement,
} =
  await import('@/lib/achievements/engine.server');
const {
  achievementUnlockedData,
  personalBestCreatedData,
} =
  await import('@/lib/webhooks/game-events');
const {
  ACHIEVEMENTS,
} =
  await import('@/lib/achievements/catalog');

const oneShot =
  ACHIEVEMENTS.find(
    (
      a,
    ) =>
      a.target ===
      1,
  )!;
const incremental =
  ACHIEVEMENTS.find(
    (
      a,
    ) =>
      a.target >
      1,
  )!;

beforeEach(
  () => {
    vi.clearAllMocks();
    m.emit.mockResolvedValue(
      undefined,
    );
    m.upsert.mockResolvedValue(
      {
        progress: 0,
      },
    );
  },
);

const flush =
  () =>
    new Promise(
      (
        r,
      ) =>
        setTimeout(
          r,
          0,
        ),
    );

describe('personal best emission', () => {
  it('emits one payload that parses and carries no rank', async () => {
    await emitPersonalBestCreated(
      'u1',
      {
        gameId:
          'altair',
        score: 9,
        previous: 4,
      },
    );
    expect(
      m.emit,
    ).toHaveBeenCalledTimes(
      1,
    );
    const [
      userId,
      event,
      data,
    ] =
      m
        .emit
        .mock
        .calls[0]!;
    expect(
      userId,
    ).toBe(
      'u1',
    );
    expect(
      event,
    ).toBe(
      'personal_best.created',
    );
    expect(
      personalBestCreatedData.safeParse(
        data,
      )
        .success,
    ).toBe(
      true,
    );
    expect(
      JSON.stringify(
        data,
      ),
    ).not.toMatch(
      /rank/i,
    );
    expect(
      (
        data as {
          previousScore: number;
        }
      )
        .previousScore,
    ).toBe(
      4,
    );
  });

  it('does not throw into the caller when emission fails', async () => {
    m.emit.mockRejectedValue(
      new Error(
        'boom',
      ),
    );
    await expect(
      emitPersonalBestCreated(
        'u1',
        {
          gameId:
            'altair',
          score: 9,
          previous:
            null,
        },
      ),
    ).resolves.toBeUndefined();
  });

  it('submitGameScore emits only when recordPersonalBest wrote a row', async () => {
    const {
      submitGameScore,
    } =
      await import('@/lib/game/submit.server');
    m.recordPersonalBest.mockResolvedValueOnce(
      true,
    );
    await submitGameScore(
      {
        gameId:
          'altair',
        userId:
          'u1',
        score: 9,
      },
    );
    await flush();
    expect(
      m.emit,
    ).toHaveBeenCalledTimes(
      1,
    );

    m.emit.mockClear();
    m.recordPersonalBest.mockResolvedValueOnce(
      false,
    ); // a retried submission: unique key made it a no-op
    await submitGameScore(
      {
        gameId:
          'altair',
        userId:
          'u1',
        score: 9,
      },
    );
    await flush();
    expect(
      m.emit,
    ).not.toHaveBeenCalled();

    m.recordPersonalBest.mockRejectedValueOnce(
      new Error(
        'db',
      ),
    );
    await expect(
      submitGameScore(
        {
          gameId:
            'altair',
          userId:
            'u1',
          score: 9,
        },
      ),
    ).resolves.toMatchObject(
      {
        ok: true,
      },
    );
    await flush();
    expect(
      m.emit,
    ).not.toHaveBeenCalled();
  });

  it('submitGameScore emits nothing when the run is not a record', async () => {
    const {
      submitGameScore,
    } =
      await import('@/lib/game/submit.server');
    await submitGameScore(
      {
        gameId:
          'altair',
        userId:
          'u1',
        score: 1,
      },
    ); // below the stored best of 5
    await flush();
    expect(
      m.recordPersonalBest,
    ).not.toHaveBeenCalled();
    expect(
      m.emit,
    ).not.toHaveBeenCalled();
  });
});

describe('achievement emission', () => {
  it('a first grant emits once and a repeated grant emits nothing', async () => {
    m.updateMany
      .mockResolvedValueOnce(
        {
          count: 1,
        },
      )
      .mockResolvedValueOnce(
        {
          count: 0,
        },
      );
    expect(
      await grantAchievement(
        'u1',
        oneShot.id,
      ),
    ).toBe(
      true,
    );
    expect(
      await grantAchievement(
        'u1',
        oneShot.id,
      ),
    ).toBe(
      false,
    );
    await flush();
    expect(
      m.emit,
    ).toHaveBeenCalledTimes(
      1,
    );
    const [
      ,
      event,
      data,
    ] =
      m
        .emit
        .mock
        .calls[0]!;
    expect(
      event,
    ).toBe(
      'achievement.unlocked',
    );
    expect(
      achievementUnlockedData.safeParse(
        data,
      )
        .success,
    ).toBe(
      true,
    );
    expect(
      (
        data as {
          achievementId: string;
        }
      )
        .achievementId,
    ).toBe(
      oneShot.id,
    );
  });

  it('an incremental achievement emits once, when it reaches its target', async () => {
    // not yet at target: progress applied, claim finds nothing to flip
    m.updateMany.mockResolvedValueOnce(
      {
        count: 1,
      },
    );
    m.findUnique.mockResolvedValueOnce(
      {
        progress:
          incremental.target -
          1,
      },
    );
    await progressAchievement(
      'u1',
      incremental.id,
    );
    await flush();
    expect(
      m.emit,
    ).not.toHaveBeenCalled();

    // reaches target: progress applied, then the claim wins
    m.updateMany
      .mockResolvedValueOnce(
        {
          count: 1,
        },
      )
      .mockResolvedValueOnce(
        {
          count: 1,
        },
      );
    m.findUnique.mockResolvedValueOnce(
      {
        progress:
          incremental.target,
      },
    );
    expect(
      await progressAchievement(
        'u1',
        incremental.id,
      ),
    ).toBe(
      true,
    );
    await flush();
    expect(
      m.emit,
    ).toHaveBeenCalledTimes(
      1,
    );
  });

  it('does not throw into the grant when emission fails', async () => {
    m.emit.mockRejectedValue(
      new Error(
        'boom',
      ),
    );
    m.updateMany.mockResolvedValueOnce(
      {
        count: 1,
      },
    );
    expect(
      await grantAchievement(
        'u1',
        oneShot.id,
      ),
    ).toBe(
      true,
    );
    await emitAchievementUnlocked(
      'u1',
      {
        achievementId:
          oneShot.id,
        name: oneShot.name,
      },
    );
  });
});
