import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { MAX_SAVE_BYTES } from '@/lib/game-saves/registry';
import type { SaveTx } from '@/lib/game-saves/snapshots.server';

// A member's saves and their history. The rules under test: a snapshot is taken only past six hours, ten are kept,
// another member's snapshot is a 404, a backup for the wrong game or over the size limit is refused, and a delete
// leaves a snapshot behind. Prisma is replaced by a small in-memory fake that honours the where/orderBy/skip the
// module uses.

interface SaveRow {
  userId: string;
  gameId: string;
  saveData: unknown;
  updatedAt: Date;
}
interface SnapRow {
  id: bigint;
  userId: string;
  gameId: string;
  saveData: unknown;
  sizeBytes: number;
  reason: string;
  createdAt: Date;
}

const db =
  vi.hoisted(
    () => ({
      saves:
        [] as SaveRow[],
      snaps:
        [] as SnapRow[],
      nextId:
        1n,
      clock: 0,
    }),
  );

const fake =
  vi.hoisted(
    () => {
      const matchSave =
        (w: {
          userId_gameId?: {
            userId: string;
            gameId: string;
          };
          userId?: string;
          gameId?: string;
        }) =>
          db.saves.filter(
            (
              s,
            ) =>
              w.userId_gameId
                ? s.userId ===
                    w
                      .userId_gameId
                      .userId &&
                  s.gameId ===
                    w
                      .userId_gameId
                      .gameId
                : (w.userId ===
                    undefined ||
                    s.userId ===
                      w.userId) &&
                  (w.gameId ===
                    undefined ||
                    s.gameId ===
                      w.gameId),
          );
      const matchSnap =
        (w: {
          id?:
            | bigint
            | {
                in: bigint[];
              };
          userId?: string;
          gameId?: string;
        }) =>
          db.snaps.filter(
            (
              s,
            ) =>
              (w.id ===
                undefined ||
                (typeof w.id ===
                'bigint'
                  ? s.id ===
                    w.id
                  : w.id.in.includes(
                      s.id,
                    ))) &&
              (w.userId ===
                undefined ||
                s.userId ===
                  w.userId) &&
              (w.gameId ===
                undefined ||
                s.gameId ===
                  w.gameId),
          );
      const newestFirst =
        (
          rows: SnapRow[],
        ) =>
          [
            ...rows,
          ].sort(
            (
              a,
              b,
            ) =>
              b.createdAt.getTime() -
                a.createdAt.getTime() ||
              Number(
                b.id -
                  a.id,
              ),
          );

      const client =
        {
          gameSave:
            {
              findUnique:
                async ({
                  where,
                }: {
                  where: Parameters<
                    typeof matchSave
                  >[0];
                }) =>
                  matchSave(
                    where,
                  )[0] ??
                  null,
              upsert:
                async ({
                  where,
                  create,
                  update,
                }: {
                  where: Parameters<
                    typeof matchSave
                  >[0];
                  create: {
                    userId: string;
                    gameId: string;
                    saveData: unknown;
                  };
                  update: {
                    saveData: unknown;
                  };
                }) => {
                  const existing =
                    matchSave(
                      where,
                    )[0];
                  db.clock += 1;
                  if (
                    existing
                  ) {
                    existing.saveData =
                      update.saveData;
                    existing.updatedAt =
                      new Date(
                        2026,
                        0,
                        1,
                        0,
                        0,
                        db.clock,
                      );
                    return existing;
                  }
                  const row =
                    {
                      ...create,
                      updatedAt:
                        new Date(
                          2026,
                          0,
                          1,
                          0,
                          0,
                          db.clock,
                        ),
                    };
                  db.saves.push(
                    row,
                  );
                  return row;
                },
              deleteMany:
                async ({
                  where,
                }: {
                  where: Parameters<
                    typeof matchSave
                  >[0];
                }) => {
                  const gone =
                    matchSave(
                      where,
                    );
                  db.saves =
                    db.saves.filter(
                      (
                        s,
                      ) =>
                        !gone.includes(
                          s,
                        ),
                    );
                  return {
                    count:
                      gone.length,
                  };
                },
            },
          gameSaveSnapshot:
            {
              create:
                async ({
                  data,
                }: {
                  data: Omit<
                    SnapRow,
                    | 'id'
                    | 'createdAt'
                  > & {
                    createdAt?: Date;
                  };
                }) => {
                  db.clock += 1;
                  const row =
                    {
                      ...data,
                      id: db.nextId++,
                      createdAt:
                        data.createdAt ??
                        new Date(
                          2026,
                          0,
                          1,
                          0,
                          0,
                          db.clock,
                        ),
                    };
                  db.snaps.push(
                    row,
                  );
                  return row;
                },
              findFirst:
                async ({
                  where,
                }: {
                  where: Parameters<
                    typeof matchSnap
                  >[0];
                }) =>
                  newestFirst(
                    matchSnap(
                      where,
                    ),
                  )[0] ??
                  null,
              findMany:
                async ({
                  where,
                  skip = 0,
                }: {
                  where: Parameters<
                    typeof matchSnap
                  >[0];
                  skip?: number;
                }) =>
                  newestFirst(
                    matchSnap(
                      where,
                    ),
                  ).slice(
                    skip,
                  ),
              deleteMany:
                async ({
                  where,
                }: {
                  where: Parameters<
                    typeof matchSnap
                  >[0];
                }) => {
                  const gone =
                    matchSnap(
                      where,
                    );
                  db.snaps =
                    db.snaps.filter(
                      (
                        s,
                      ) =>
                        !gone.includes(
                          s,
                        ),
                    );
                  return {
                    count:
                      gone.length,
                  };
                },
            },
        };
      return {
        ...client,
        $transaction:
          async <
            T,
          >(
            fn: (
              tx: typeof client,
            ) => Promise<T>,
          ) =>
            fn(
              client,
            ),
      };
    },
  );

vi.mock(
  '@/lib/prisma.server',
  () => ({
    prisma:
      fake,
  }),
);

const {
  snapshotIfDue,
  snapshotBeforeWrite,
  restore,
  deleteSave,
  getSnapshot,
} =
  await import('@/lib/game-saves/snapshots.server');
const {
  SNAPSHOT_KEEP,
  SNAPSHOT_INTERVAL_MS,
  toBackupFile,
} =
  await import('@/lib/game-saves/backup');

const USER =
  'user-a';
const OTHER =
  'user-b';
const GAME =
  'void-breaker';
const NOW =
  new Date(
    '2026-03-01T12:00:00Z',
  );

function seedSave(
  saveData: unknown = {
    level: 1,
  },
  userId = USER,
  gameId = GAME,
) {
  db.saves.push(
    {
      userId,
      gameId,
      saveData,
      updatedAt:
        new Date(
          '2026-03-01T11:00:00Z',
        ),
    },
  );
}
function seedSnapshot(
  createdAt: Date,
  userId = USER,
  gameId = GAME,
  saveData: unknown = {
    old: true,
  },
) {
  db.snaps.push(
    {
      id: db.nextId++,
      userId,
      gameId,
      saveData,
      sizeBytes: 12,
      reason:
        'auto',
      createdAt,
    },
  );
}

beforeEach(
  () => {
    db.saves =
      [];
    db.snaps =
      [];
    db.nextId =
      1n;
    db.clock = 0;
  },
);

// The fake implements only the calls these functions make, not Prisma's whole delegate types.
const fakeTx = fake as unknown as SaveTx;

describe('automatic snapshots', () => {
  it('keeps the old blob when the member has no snapshot yet', async () => {
    seedSave(
      {
        level: 7,
      },
    );
    expect(
      await snapshotIfDue(
        fakeTx,
        USER,
        GAME,
        NOW,
      ),
    ).toBe(
      true,
    );
    expect(
      db.snaps,
    ).toHaveLength(
      1,
    );
    expect(
      db
        .snaps[0],
    ).toMatchObject(
      {
        saveData:
          {
            level: 7,
          },
        reason:
          'auto',
        gameId:
          GAME,
        userId:
          USER,
      },
    );
    expect(
      db
        .snaps[0]
        ?.sizeBytes,
    ).toBe(
      JSON.stringify(
        {
          level: 7,
        },
      )
        .length,
    );
  });

  it('takes none while the newest snapshot is under six hours old', async () => {
    seedSave();
    seedSnapshot(
      new Date(
        NOW.getTime() -
          SNAPSHOT_INTERVAL_MS +
          60_000,
      ),
    );
    expect(
      await snapshotIfDue(
        fakeTx,
        USER,
        GAME,
        NOW,
      ),
    ).toBe(
      false,
    );
    expect(
      db.snaps,
    ).toHaveLength(
      1,
    );
  });

  it('takes one once the newest snapshot is six hours old', async () => {
    seedSave();
    seedSnapshot(
      new Date(
        NOW.getTime() -
          SNAPSHOT_INTERVAL_MS,
      ),
    );
    expect(
      await snapshotIfDue(
        fakeTx,
        USER,
        GAME,
        NOW,
      ),
    ).toBe(
      true,
    );
    expect(
      db.snaps,
    ).toHaveLength(
      2,
    );
  });

  it('takes none for a first save, when there is nothing to keep', async () => {
    expect(
      await snapshotIfDue(
        fakeTx,
        USER,
        GAME,
        NOW,
      ),
    ).toBe(
      false,
    );
    expect(
      db.snaps,
    ).toHaveLength(
      0,
    );
  });

  it("does not count another member's or another game's snapshots", async () => {
    seedSave();
    seedSnapshot(
      new Date(
        NOW.getTime() -
          60_000,
      ),
      OTHER,
    );
    seedSnapshot(
      new Date(
        NOW.getTime() -
          60_000,
      ),
      USER,
      'neon-driftway',
    );
    expect(
      await snapshotIfDue(
        fakeTx,
        USER,
        GAME,
        NOW,
      ),
    ).toBe(
      true,
    );
  });
});

describe('retention', () => {
  it('keeps exactly ten per game, dropping the oldest', async () => {
    seedSave();
    for (
      let i = 0;
      i <
      14;
      i += 1
    )
      await snapshotBeforeWrite(
        fakeTx,
        USER,
        GAME,
        'auto',
      );
    const mine =
      db.snaps.filter(
        (
          s,
        ) =>
          s.userId ===
            USER &&
          s.gameId ===
            GAME,
      );
    expect(
      mine,
    ).toHaveLength(
      SNAPSHOT_KEEP,
    );
    expect(
      Math.min(
        ...mine.map(
          (
            s,
          ) =>
            Number(
              s.id,
            ),
        ),
      ),
    ).toBe(
      5,
    );
  });

  it("never prunes another game's or member's snapshots", async () => {
    seedSave();
    for (
      let i = 0;
      i <
      12;
      i += 1
    )
      seedSnapshot(
        new Date(
          2026,
          0,
          1,
          i,
        ),
        OTHER,
      );
    for (
      let i = 0;
      i <
      12;
      i += 1
    )
      seedSnapshot(
        new Date(
          2026,
          0,
          1,
          i,
        ),
        USER,
        'neon-driftway',
      );
    await snapshotBeforeWrite(
      fakeTx,
      USER,
      GAME,
      'auto',
    );
    expect(
      db.snaps.filter(
        (
          s,
        ) =>
          s.userId ===
          OTHER,
      ),
    ).toHaveLength(
      12,
    );
    expect(
      db.snaps.filter(
        (
          s,
        ) =>
          s.gameId ===
          'neon-driftway',
      ),
    ).toHaveLength(
      12,
    );
  });
});

describe('restore', () => {
  it("is a not-found for another member's snapshot and changes nothing", async () => {
    seedSave(
      {
        level: 1,
      },
    );
    seedSnapshot(
      new Date(
        '2026-03-01T01:00:00Z',
      ),
      OTHER,
      GAME,
      {
        stolen: true,
      },
    );
    const foreign =
      String(
        db
          .snaps[0]
          ?.id,
      );
    expect(
      await restore(
        USER,
        GAME,
        {
          snapshotId:
            foreign,
        },
      ),
    ).toEqual(
      {
        ok: false,
        error:
          'not-found',
      },
    );
    expect(
      db
        .saves[0]
        ?.saveData,
    ).toEqual(
      {
        level: 1,
      },
    );
    expect(
      db.snaps,
    ).toHaveLength(
      1,
    );
  });

  it('is a not-found for a snapshot of another game', async () => {
    seedSave();
    seedSnapshot(
      new Date(
        '2026-03-01T01:00:00Z',
      ),
      USER,
      'neon-driftway',
    );
    expect(
      await restore(
        USER,
        GAME,
        {
          snapshotId:
            String(
              db
                .snaps[0]
                ?.id,
            ),
        },
      ),
    ).toEqual(
      {
        ok: false,
        error:
          'not-found',
      },
    );
  });

  it('writes the snapshot back and keeps the replaced save as before-restore', async () => {
    seedSave(
      {
        level: 9,
      },
    );
    seedSnapshot(
      new Date(
        '2026-03-01T01:00:00Z',
      ),
      USER,
      GAME,
      {
        level: 2,
      },
    );
    const result =
      await restore(
        USER,
        GAME,
        {
          snapshotId:
            String(
              db
                .snaps[0]
                ?.id,
            ),
        },
      );
    expect(
      result.ok,
    ).toBe(
      true,
    );
    expect(
      db
        .saves[0]
        ?.saveData,
    ).toEqual(
      {
        level: 2,
      },
    );
    expect(
      db.snaps.find(
        (
          s,
        ) =>
          s.reason ===
          'before-restore',
      )
        ?.saveData,
    ).toEqual(
      {
        level: 9,
      },
    );
  });

  it('restores a backup file for the same game', async () => {
    seedSave(
      {
        level: 9,
      },
    );
    const backup =
      toBackupFile(
        GAME,
        '2026-02-01T00:00:00.000Z',
        {
          level: 3,
        },
      );
    expect(
      (
        await restore(
          USER,
          GAME,
          {
            backup,
          },
        )
      )
        .ok,
    ).toBe(
      true,
    );
    expect(
      db
        .saves[0]
        ?.saveData,
    ).toEqual(
      {
        level: 3,
      },
    );
    expect(
      db.snaps.map(
        (
          s,
        ) =>
          s.reason,
      ),
    ).toEqual(
      [
        'before-restore',
      ],
    );
  });

  it('creates the save when the member has none, with nothing to snapshot', async () => {
    const backup =
      toBackupFile(
        GAME,
        '2026-02-01T00:00:00.000Z',
        {
          level: 3,
        },
      );
    expect(
      (
        await restore(
          USER,
          GAME,
          {
            backup,
          },
        )
      )
        .ok,
    ).toBe(
      true,
    );
    expect(
      db.saves,
    ).toHaveLength(
      1,
    );
    expect(
      db.snaps,
    ).toHaveLength(
      0,
    );
  });

  it("refuses another game's backup and writes nothing", async () => {
    seedSave(
      {
        level: 1,
      },
    );
    const backup =
      toBackupFile(
        'neon-driftway',
        '2026-02-01T00:00:00.000Z',
        {
          level: 3,
        },
      );
    expect(
      await restore(
        USER,
        GAME,
        {
          backup,
        },
      ),
    ).toEqual(
      {
        ok: false,
        error:
          'wrong-game',
      },
    );
    expect(
      db
        .saves[0]
        ?.saveData,
    ).toEqual(
      {
        level: 1,
      },
    );
    expect(
      db.snaps,
    ).toHaveLength(
      0,
    );
  });

  it('refuses an oversized backup', async () => {
    seedSave(
      {
        level: 1,
      },
    );
    const backup =
      toBackupFile(
        GAME,
        '2026-02-01T00:00:00.000Z',
        {
          blob: 'x'.repeat(
            MAX_SAVE_BYTES,
          ),
        },
      );
    expect(
      await restore(
        USER,
        GAME,
        {
          backup,
        },
      ),
    ).toEqual(
      {
        ok: false,
        error:
          'too-large',
      },
    );
    expect(
      db
        .saves[0]
        ?.saveData,
    ).toEqual(
      {
        level: 1,
      },
    );
  });

  it('refuses a body that is not a backup, and a backup whose save is not an object', async () => {
    expect(
      await restore(
        USER,
        GAME,
        {
          backup:
            {
              saveData:
                {
                  a: 1,
                },
            },
        },
      ),
    ).toEqual(
      {
        ok: false,
        error:
          'wrong-format',
      },
    );
    expect(
      await restore(
        USER,
        GAME,
        {
          backup:
            {
              ...toBackupFile(
                GAME,
                new Date(),
                {},
              ),
              saveData:
                [
                  1,
                ],
            },
        },
      ),
    ).toEqual(
      {
        ok: false,
        error:
          'bad-save',
      },
    );
  });
});

describe('delete', () => {
  it('removes the save and leaves a before-delete snapshot that can be restored', async () => {
    seedSave(
      {
        level: 5,
      },
    );
    await deleteSave(
      USER,
      GAME,
    );
    expect(
      db.saves,
    ).toHaveLength(
      0,
    );
    expect(
      db.snaps,
    ).toHaveLength(
      1,
    );
    expect(
      db
        .snaps[0],
    ).toMatchObject(
      {
        reason:
          'before-delete',
        saveData:
          {
            level: 5,
          },
      },
    );

    expect(
      (
        await restore(
          USER,
          GAME,
          {
            snapshotId:
              String(
                db
                  .snaps[0]
                  ?.id,
              ),
          },
        )
      )
        .ok,
    ).toBe(
      true,
    );
    expect(
      db
        .saves[0]
        ?.saveData,
    ).toEqual(
      {
        level: 5,
      },
    );
  });

  it('is a no-op when there is no save', async () => {
    await deleteSave(
      USER,
      GAME,
    );
    expect(
      db.snaps,
    ).toHaveLength(
      0,
    );
  });
});

describe('getSnapshot', () => {
  it('is scoped to the member and the game', async () => {
    seedSnapshot(
      new Date(),
      OTHER,
    );
    const id =
      String(
        db
          .snaps[0]
          ?.id,
      );
    expect(
      await getSnapshot(
        OTHER,
        GAME,
        id,
      ),
    ).not.toBeNull();
    expect(
      await getSnapshot(
        USER,
        GAME,
        id,
      ),
    ).toBeNull();
    expect(
      await getSnapshot(
        OTHER,
        'neon-driftway',
        id,
      ),
    ).toBeNull();
  });
});
