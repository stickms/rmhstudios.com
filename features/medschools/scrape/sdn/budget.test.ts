import {
  describe,
  expect,
  it,
} from 'vitest';
import { createFakePrisma } from '../test-support';
import {
  BACKFILL_SHARE,
  createBudgetGate,
  monthStartUtc,
  monthlyCapUsd,
} from './budget';

const NOW =
  new Date(
    '2026-11-20T10:00:00Z',
  );

function seed(
  rows: Array<
    Record<
      string,
      unknown
    >
  >,
) {
  const {
    prisma,
    tables,
  } =
    createFakePrisma();
  tables.aiUsage!.push(
    ...rows,
  );
  return prisma;
}
const row =
  (
    costMicros: number,
    over: Record<
      string,
      unknown
    > = {},
  ) => ({
    task: 'medschools-extract',
    costMicros,
    createdAt:
      new Date(
        '2026-11-05T00:00:00Z',
      ),
    ...over,
  });

describe('budget', () => {
  it('monthStartUtc is the first of the UTC month', () => {
    expect(
      monthStartUtc(
        NOW,
      ).toISOString(),
    ).toBe(
      '2026-11-01T00:00:00.000Z',
    );
  });
  it('monthlyCapUsd defaults and parses', () => {
    expect(
      monthlyCapUsd(
        undefined,
      ),
    ).toBe(
      20,
    );
    expect(
      monthlyCapUsd(
        'abc',
      ),
    ).toBe(
      20,
    );
    expect(
      monthlyCapUsd(
        '-5',
      ),
    ).toBe(
      20,
    );
    expect(
      monthlyCapUsd(
        '0',
      ),
    ).toBe(
      0,
    );
    expect(
      monthlyCapUsd(
        '35.5',
      ),
    ).toBe(
      35.5,
    );
  });
  it('allows live below the cap and refuses at it', async () => {
    expect(
      await createBudgetGate(
        seed(
          [
            row(
              9_999_999,
            ),
          ],
        ),
        () =>
          NOW,
        10,
      ).allow(
        'live',
      ),
    ).toBe(
      true,
    );
    expect(
      await createBudgetGate(
        seed(
          [
            row(
              10_000_000,
            ),
          ],
        ),
        () =>
          NOW,
        10,
      ).allow(
        'live',
      ),
    ).toBe(
      false,
    );
  });
  it('refuses backfill at 80% while live still runs', async () => {
    const prisma =
      seed(
        [
          row(
            10_000_000 *
              BACKFILL_SHARE,
          ),
        ],
      );
    const gate =
      createBudgetGate(
        prisma,
        () =>
          NOW,
        10,
      );
    expect(
      await gate.allow(
        'backfill',
      ),
    ).toBe(
      false,
    );
    expect(
      await gate.allow(
        'live',
      ),
    ).toBe(
      true,
    );
  });
  it('a zero cap pauses extraction', async () => {
    const gate =
      createBudgetGate(
        seed(
          [],
        ),
        () =>
          NOW,
        0,
      );
    expect(
      await gate.allow(
        'live',
      ),
    ).toBe(
      false,
    );
    expect(
      await gate.allow(
        'backfill',
      ),
    ).toBe(
      false,
    );
  });
  it('counts only this task and this UTC month', async () => {
    const prisma =
      seed(
        [
          row(
            5_000_000,
          ),
          row(
            50_000_000,
            {
              task: 'moderate',
            },
          ),
          row(
            50_000_000,
            {
              createdAt:
                new Date(
                  '2026-10-31T23:59:59Z',
                ),
            },
          ),
        ],
      );
    expect(
      await createBudgetGate(
        prisma,
        () =>
          NOW,
        10,
      ).allow(
        'live',
      ),
    ).toBe(
      true,
    );
  });
  it('fails closed on a ledger read error', async () => {
    const prisma =
      {
        aiUsage:
          {
            aggregate:
              async () => {
                throw new Error(
                  'db down',
                );
              },
          },
      } as unknown as Parameters<
        typeof createBudgetGate
      >[0];
    expect(
      await createBudgetGate(
        prisma,
        () =>
          NOW,
        10,
      ).allow(
        'live',
      ),
    ).toBe(
      false,
    );
  });
});
