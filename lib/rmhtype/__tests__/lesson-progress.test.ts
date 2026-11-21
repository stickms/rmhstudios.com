import { beforeEach, describe, expect, it, vi } from 'vitest';
import { lessonRunBody } from '@/lib/rmhtype/lessons-schema';
import { lessonById, starsFor } from '@/lib/rmhtype/lessons';

// A member's progress is theirs to lose: the server recomputes stars from the
// numbers it is given, rejects numbers no keyboard can produce, and never lets a
// worse run lower a best.

interface Row {
  userId: string;
  lessonId: string;
  bestWpm: number;
  bestAccuracy: number;
  stars: number;
  attempts: number;
  completedAt: Date | null;
}
const table = vi.hoisted(() => ({
  rows: new Map<string, unknown>(),
}));

vi.mock('@/lib/prisma.server', () => {
  const key = (w: {
    userId_lessonId: {
      userId: string;
      lessonId: string;
    };
  }) => `${w.userId_lessonId.userId}:${w.userId_lessonId.lessonId}`;
  const model = {
    findUnique: vi.fn(async ({ where }: { where: Parameters<typeof key>[0] }) => table.rows.get(key(where)) ?? null),
    upsert: vi.fn(
      async ({ where, create, update }: { where: Parameters<typeof key>[0]; create: Row; update: Partial<Row> }) => {
        const existing = table.rows.get(key(where)) as Row | undefined;
        const row = existing
          ? {
              ...existing,
              ...update,
            }
          : create;
        table.rows.set(key(where), row);
        return row;
      },
    ),
    findMany: vi.fn(
      async ({
        where,
      }: {
        where: {
          userId: string;
        };
      }) => [...table.rows.values()].filter((r) => (r as Row).userId === where.userId),
    ),
  };
  return {
    prisma: {
      rmhTypeLessonProgress: model,
      $transaction: async (fn: (tx: unknown) => unknown) =>
        fn({
          rmhTypeLessonProgress: model,
        }),
    },
  };
});

const { recordLessonRun, getLessonProgress, exportLessonProgress } = await import('@/lib/rmhtype/lessons.server');

const lesson = lessonById('l01')!;
const [, , three] = lesson.targets.wpm;

beforeEach(() => table.rows.clear());

describe('recordLessonRun', () => {
  it('recomputes stars on the server from speed and accuracy', async () => {
    const hit = await recordLessonRun('u1', {
      lessonId: 'l01',
      wpm: three,
      accuracy: 100,
    });
    expect(hit?.runStars).toBe(3);
    expect(hit?.progress.stars).toBe(3);
    expect(hit?.runStars).toBe(starsFor(three, 100, lesson));
    expect(hit?.progress.completedAt).not.toBeNull();

    const miss = await recordLessonRun('u2', {
      lessonId: 'l01',
      wpm: three,
      accuracy: 10,
    });
    expect(miss?.runStars).toBe(0);
    expect(miss?.progress.completedAt).toBeNull();
  });

  it('rejects a lesson that is not in the curriculum', async () => {
    expect(
      await recordLessonRun('u1', {
        lessonId: 'l99',
        wpm: 20,
        accuracy: 99,
      }),
    ).toBeNull();
    expect(table.rows.size).toBe(0);
  });

  it('never lowers a best, and counts attempts', async () => {
    await recordLessonRun('u1', {
      lessonId: 'l01',
      wpm: three,
      accuracy: 100,
    });
    const worse = await recordLessonRun('u1', {
      lessonId: 'l01',
      wpm: 3,
      accuracy: 50,
    });
    expect(worse?.progress).toMatchObject({
      bestWpm: three,
      bestAccuracy: 100,
      stars: 3,
      attempts: 2,
    });
    expect(worse?.runStars).toBe(0);
    const mixed = await recordLessonRun('u1', {
      lessonId: 'l01',
      wpm: three + 5,
      accuracy: 60,
    });
    expect(mixed?.progress).toMatchObject({
      bestWpm: three + 5,
      bestAccuracy: 100,
      stars: 3,
      attempts: 3,
    });
  });

  it('keeps the first completion date', async () => {
    const first = await recordLessonRun('u1', {
      lessonId: 'l01',
      wpm: three,
      accuracy: 100,
    });
    const again = await recordLessonRun('u1', {
      lessonId: 'l01',
      wpm: three,
      accuracy: 100,
    });
    expect(again?.progress.completedAt).toBe(first?.progress.completedAt);
  });

  it('recommends the next lesson after the run, and keeps members apart', async () => {
    expect(
      (
        await recordLessonRun('u1', {
          lessonId: 'l01',
          wpm: three,
          accuracy: 100,
        })
      )?.nextLessonId,
    ).toBe('l02');
    expect(
      (
        await recordLessonRun('u2', {
          lessonId: 'l01',
          wpm: 0,
          accuracy: 0,
        })
      )?.nextLessonId,
    ).toBe('l01');
    expect(await getLessonProgress('u1')).toHaveLength(1);
    expect(await exportLessonProgress('u3')).toEqual([]);
  });
});

describe('lessonRunBody', () => {
  const ok = {
    lessonId: 'l01',
    wpm: 20,
    accuracy: 95,
  };

  it('accepts a normal run and drops a client-supplied star count', () => {
    const parsed = lessonRunBody.safeParse({
      ...ok,
      stars: 3,
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success && 'stars' in parsed.data).toBe(false);
  });

  it.each([
    [
      'speed above 250',
      {
        ...ok,
        wpm: 251,
      },
    ],
    [
      'negative speed',
      {
        ...ok,
        wpm: -1,
      },
    ],
    [
      'accuracy above 100',
      {
        ...ok,
        accuracy: 100.5,
      },
    ],
    [
      'negative accuracy',
      {
        ...ok,
        accuracy: -1,
      },
    ],
    [
      'non-finite speed',
      {
        ...ok,
        wpm: Number.POSITIVE_INFINITY,
      },
    ],
    [
      'an empty lesson id',
      {
        ...ok,
        lessonId: '',
      },
    ],
    [
      'an over-long lesson id',
      {
        ...ok,
        lessonId: 'x'.repeat(33),
      },
    ],
  ])('rejects %s', (_name, body) => {
    expect(lessonRunBody.safeParse(body).success).toBe(false);
  });

  it('accepts the bounds themselves', () => {
    expect(
      lessonRunBody.safeParse({
        ...ok,
        wpm: 250,
        accuracy: 100,
      }).success,
    ).toBe(true);
    expect(
      lessonRunBody.safeParse({
        ...ok,
        wpm: 0,
        accuracy: 0,
      }).success,
    ).toBe(true);
  });
});
