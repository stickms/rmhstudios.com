/**
 * RMHVibe spend: the ledger rows, the exclusion from the shared allowance, and the two gates.
 * Money, so every branch that refuses (or fails open) is pinned. Prisma is mocked.
 */
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from 'vitest';

const db =
  vi.hoisted(
    () => ({
      $queryRaw:
        vi.fn(),
      aiUsage:
        {
          create:
            vi.fn(),
          aggregate:
            vi.fn(),
        },
      computeGrant:
        {
          aggregate:
            vi.fn(),
        },
    }),
  );
vi.mock(
  '@/lib/prisma.server',
  () => ({
    prisma:
      db,
  }),
);
const tier =
  vi.hoisted(
    () =>
      vi.fn(),
  );
vi.mock(
  '@/lib/entitlements',
  () => ({
    getUserTier:
      tier,
  }),
);

import { spentThisMonth } from '@/lib/ai/budget.server';
import {
  assertVibeBudget,
  assertVibeDailyCap,
  vibeDailyBudgetMicros,
  VIBE_MONTHLY_BUDGET_MICROS,
} from '@/lib/ai/vibe-budget.server';
import {
  costMicros,
  estimateTokens,
  meterVibe,
} from '@/lib/ai/provider.server';
import { invalidateCached } from '@/lib/cached.server';

beforeEach(
  () => {
    vi.clearAllMocks();
    invalidateCached(
      'vibe:daily-spend',
    );
    delete process
      .env
      .VIBE_DAILY_BUDGET_MICROS;
    tier.mockResolvedValue(
      'free',
    );
    vi.spyOn(
      console,
      'error',
    ).mockImplementation(
      () =>
        undefined,
    );
  },
);
afterEach(
  () =>
    vi.restoreAllMocks(),
);

const sqlOf =
  (
    call: unknown[],
  ) =>
    (
      call[0] as TemplateStringsArray
    ).join(
      '?',
    );

describe('the shared allowance', () => {
  it('does not count vibe rows', async () => {
    db.$queryRaw.mockResolvedValue(
      [
        {
          spent:
            123n,
        },
      ],
    );
    expect(
      await spentThisMonth(
        'u1',
      ),
    ).toBe(
      123,
    );
    expect(
      sqlOf(
        db
          .$queryRaw
          .mock
          .calls[0]!,
      ),
    ).toContain(
      "task NOT LIKE 'vibe%'",
    );
  });
});

describe('meterVibe', () => {
  it('writes the real provider, user, model and tokens, priced from the table', async () => {
    await meterVibe(
      {
        userId:
          'u1',
        task: 'vibe',
        provider:
          'kimi',
        model:
          'kimi-k2.7-code',
        inTokens: 1000,
        outTokens: 2000,
        ok: true,
      },
    );
    const data =
      db
        .aiUsage
        .create
        .mock
        .calls[0]![0]
        .data;
    expect(
      data,
    ).toMatchObject(
      {
        userId:
          'u1',
        task: 'vibe',
        provider:
          'kimi',
        model:
          'kimi-k2.7-code',
        inTokens: 1000,
        outTokens: 2000,
        ok: true,
        costMicros:
          costMicros(
            'kimi-k2.7-code',
            1000,
            2000,
          ),
      },
    );
    expect(
      data.costMicros,
    ).toBe(
      Math.ceil(
        (1000 *
          600_000 +
          2000 *
            2_500_000) /
          1_000_000,
      ),
    );
  });

  it('records a signed-out build with a null user', async () => {
    await meterVibe(
      {
        userId:
          null,
        task: 'vibe-ai',
        provider:
          'deepseek',
        model:
          'deepseek-v4-flash',
        inTokens: 10,
        outTokens: 10,
        ok: false,
      },
    );
    expect(
      db
        .aiUsage
        .create
        .mock
        .calls[0]![0]
        .data,
    ).toMatchObject(
      {
        userId:
          null,
        task: 'vibe-ai',
        provider:
          'deepseek',
        ok: false,
      },
    );
  });

  it('never throws when the ledger write fails', async () => {
    db.aiUsage.create.mockRejectedValue(
      new Error(
        'db down',
      ),
    );
    await expect(
      meterVibe(
        {
          userId:
            'u1',
          task: 'vibe',
          provider:
            'kimi',
          model:
            'x',
          inTokens: 1,
          outTokens: 1,
          ok: true,
        },
      ),
    ).resolves.toBeUndefined();
  });

  it('estimates four characters a token', () => {
    expect(
      estimateTokens(
        401,
      ),
    ).toBe(
      101,
    );
    expect(
      estimateTokens(
        0,
      ),
    ).toBe(
      0,
    );
  });
});

describe('assertVibeBudget', () => {
  it('lets a signed-out build through (the daily cap bounds it)', async () => {
    await expect(
      assertVibeBudget(
        null,
      ),
    ).resolves.toBeUndefined();
    expect(
      db.$queryRaw,
    ).not.toHaveBeenCalled();
  });

  it('refuses a user at or over the tier ceiling with 402', async () => {
    db.$queryRaw.mockResolvedValue(
      [
        {
          spent:
            BigInt(
              VIBE_MONTHLY_BUDGET_MICROS.free,
            ),
        },
      ],
    );
    await expect(
      assertVibeBudget(
        'u1',
      ),
    ).rejects.toMatchObject(
      {
        code: 'AI_BUDGET_EXCEEDED',
        detail:
          expect.objectContaining(
            {
              scope:
                'vibe',
            },
          ),
        status: 402,
      },
    );
  });

  it('allows a user under it, and a higher tier a higher ceiling', async () => {
    db.$queryRaw.mockResolvedValue(
      [
        {
          spent:
            3_000_000n,
        },
      ],
    );
    await expect(
      assertVibeBudget(
        'u1',
      ),
    ).rejects.toMatchObject(
      {
        code: 'AI_BUDGET_EXCEEDED',
      },
    );
    tier.mockResolvedValue(
      'starter',
    );
    await expect(
      assertVibeBudget(
        'u1',
      ),
    ).resolves.toBeUndefined();
  });

  it('counts only vibe rows', async () => {
    db.$queryRaw.mockResolvedValue(
      [
        {
          spent:
            0n,
        },
      ],
    );
    await assertVibeBudget(
      'u1',
    );
    expect(
      sqlOf(
        db
          .$queryRaw
          .mock
          .calls[0]!,
      ),
    ).toContain(
      "task LIKE 'vibe%'",
    );
  });

  it('fails open when the ledger cannot be read', async () => {
    db.$queryRaw.mockRejectedValue(
      new Error(
        'db down',
      ),
    );
    await expect(
      assertVibeBudget(
        'u1',
      ),
    ).resolves.toBeUndefined();
  });
});

describe('assertVibeDailyCap', () => {
  it('refuses every build once the day is over the cap (503)', async () => {
    db.aiUsage.aggregate.mockResolvedValue(
      {
        _sum: {
          costMicros: 25_000_000,
        },
      },
    );
    await expect(
      assertVibeDailyCap(),
    ).rejects.toMatchObject(
      {
        code: 'AI_UNAVAILABLE',
        status: 503,
        detail:
          {
            scope:
              'vibe-busy',
          },
      },
    );
  });

  it('allows a build under the cap, and reads the ledger once for a burst', async () => {
    db.aiUsage.aggregate.mockResolvedValue(
      {
        _sum: {
          costMicros: 1_000,
        },
      },
    );
    await Promise.all(
      [
        assertVibeDailyCap(),
        assertVibeDailyCap(),
        assertVibeDailyCap(),
      ],
    );
    await assertVibeDailyCap();
    expect(
      db
        .aiUsage
        .aggregate,
    ).toHaveBeenCalledTimes(
      1,
    );
    expect(
      db
        .aiUsage
        .aggregate
        .mock
        .calls[0]![0]
        .where
        .task,
    ).toEqual(
      {
        startsWith:
          'vibe',
      },
    );
  });

  it('honours the env override, and 0 means no cap', async () => {
    db.aiUsage.aggregate.mockResolvedValue(
      {
        _sum: {
          costMicros: 500,
        },
      },
    );
    process.env.VIBE_DAILY_BUDGET_MICROS =
      '400';
    await expect(
      assertVibeDailyCap(),
    ).rejects.toMatchObject(
      {
        code: 'AI_UNAVAILABLE',
      },
    );
    process.env.VIBE_DAILY_BUDGET_MICROS =
      '0';
    await expect(
      assertVibeDailyCap(),
    ).resolves.toBeUndefined();
    expect(
      vibeDailyBudgetMicros(
        {
          VIBE_DAILY_BUDGET_MICROS:
            'junk',
        } as NodeJS.ProcessEnv,
      ),
    ).toBe(
      25_000_000,
    );
  });

  it('fails open when the ledger cannot be read, and does not cache the failure', async () => {
    db.aiUsage.aggregate.mockRejectedValueOnce(
      new Error(
        'db down',
      ),
    );
    await expect(
      assertVibeDailyCap(),
    ).resolves.toBeUndefined();
    db.aiUsage.aggregate.mockResolvedValue(
      {
        _sum: {
          costMicros: 30_000_000,
        },
      },
    );
    await expect(
      assertVibeDailyCap(),
    ).rejects.toMatchObject(
      {
        code: 'AI_UNAVAILABLE',
      },
    );
  });
});
