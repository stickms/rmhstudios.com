import { beforeEach, describe, expect, it, vi } from 'vitest';
import { lessonRunBody } from '@/lib/rmhtype/lessons-schema';

// Progress is stored per lesson id, so Dvorak lesson 1 (`dv-l01`) and QWERTY lesson 1 (`l01`) are different rows.

interface Row {
  userId: string;
  lessonId: string;
  stars: number;
  bestWpm: number;
  bestAccuracy: number;
  attempts: number;
  completedAt: Date | null;
}
const table = vi.hoisted(() => ({ rows: new Map<string, unknown>(), writes: [] as string[] }));

vi.mock('@/lib/prisma.server', () => {
  const key = (w: { userId_lessonId: { userId: string; lessonId: string } }) =>
    `${w.userId_lessonId.userId}:${w.userId_lessonId.lessonId}`;
  const model = {
    findUnique: vi.fn(async ({ where }: { where: Parameters<typeof key>[0] }) => table.rows.get(key(where)) ?? null),
    upsert: vi.fn(
      async ({ where, create, update }: { where: Parameters<typeof key>[0]; create: Row; update: Partial<Row> }) => {
        table.writes.push(key(where));
        const existing = table.rows.get(key(where)) as Row | undefined;
        const row = existing ? { ...existing, ...update } : create;
        table.rows.set(key(where), row);
        return row;
      },
    ),
    findMany: vi.fn(async ({ where }: { where: { userId: string } }) =>
      [...table.rows.values()].filter((r) => (r as Row).userId === where.userId),
    ),
  };
  return {
    prisma: {
      rmhTypeLessonProgress: model,
      $transaction: async (fn: (tx: unknown) => unknown) => fn({ rmhTypeLessonProgress: model }),
    },
  };
});

const { recordLessonRun, getLessonProgress } = await import('@/lib/rmhtype/lessons.server');

const good = { wpm: 30, accuracy: 100 };

beforeEach(() => {
  table.rows.clear();
  table.writes.length = 0;
});

describe('lesson progress across layouts', () => {
  it('accepts dv-l01 and stores the id unchanged', async () => {
    expect(lessonRunBody.safeParse({ lessonId: 'dv-l01', ...good }).success).toBe(true);
    const saved = await recordLessonRun('u1', { lessonId: 'dv-l01', ...good });
    expect(saved?.progress.lessonId).toBe('dv-l01');
    expect(saved?.progress.stars).toBe(3);
    expect((await getLessonProgress('u1')).map((r) => r.lessonId)).toEqual(['dv-l01']);
  });

  it('refuses an id no course has', async () => {
    for (const lessonId of ['dv-l99', 'xx-l01', 'az-l20', 'l99', 'dv-', '']) {
      expect(await recordLessonRun('u1', { lessonId, ...good }), lessonId).toBeNull();
    }
    expect(table.writes).toEqual([]);
  });

  it('never touches l01 rows when saving dv-l01', async () => {
    await recordLessonRun('u1', { lessonId: 'l01', ...good });
    const before = structuredClone(table.rows.get('u1:l01'));
    await recordLessonRun('u1', { lessonId: 'dv-l01', wpm: 5, accuracy: 50 });
    expect(table.rows.get('u1:l01')).toEqual(before);
    expect(table.writes).toEqual(['u1:l01', 'u1:dv-l01']);
    expect((table.rows.get('u1:l01') as Row).stars).toBe(3);
  });

  it('recommends the next lesson in the saved lesson’s own layout', async () => {
    await recordLessonRun('u1', { lessonId: 'l01', ...good });
    const dv = await recordLessonRun('u1', { lessonId: 'dv-l01', ...good });
    expect(dv?.nextLessonId).toBe('dv-l02');
    const qw = await recordLessonRun('u1', { lessonId: 'l02', ...good });
    expect(qw?.nextLessonId).toBe('l03');
  });
});
