import { noticeFallbackText } from '@/lib/notifications/notice-keys';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// The reminder sweep against an in-memory flashcard_reminder table that evaluates the same compare-and-set
// filters the real queries use, so "once per local day" and "two workers send once" are tested, not assumed.

interface Row {
  userId: string;
  enabled: boolean;
  localTime: string;
  timeZone: string;
  nextAt: Date | null;
  lastSentDay: string | null;
  sentSinceReview: number;
  paused: boolean;
  updatedAt: Date;
}
type Where = Record<string, unknown>;

const state = vi.hoisted(() => ({
  rows: [] as Row[],
  due: {} as Record<string, number>,
  fresh: {} as Record<string, number>,
  banned: {} as Record<string, Date>,
  freshWheres: [] as unknown[],
  countWheres: [] as unknown[],
  notifications: [] as Record<string, unknown>[],
}));

function matches(row: Row, where: Where): boolean {
  return Object.entries(where).every(([key, cond]) => {
    if (key === 'OR') return (cond as Where[]).some((w) => matches(row, w));
    const value = (row as unknown as Where)[key];
    if (cond instanceof Date) return value instanceof Date && value.getTime() === cond.getTime();
    if (cond && typeof cond === 'object') {
      const c = cond as { lt?: string; lte?: Date; gt?: number; gte?: number };
      if (c.lt !== undefined && !(typeof value === 'string' && value < c.lt)) return false;
      if (c.lte !== undefined && !(value instanceof Date && value.getTime() <= c.lte.getTime())) return false;
      if (c.gt !== undefined && !((value as number) > c.gt)) return false;
      if (c.gte !== undefined && !((value as number) >= c.gte)) return false;
      return true;
    }
    return value === cond;
  });
}
function apply(row: Row, data: Where) {
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === 'object' && !(v instanceof Date) && 'increment' in v) {
      (row as unknown as Where)[k] = ((row as unknown as Where)[k] as number) + (v as { increment: number }).increment;
    } else (row as unknown as Where)[k] = v;
  }
}

vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    flashcardReminder: {
      findUnique: vi.fn(
        async ({ where }: { where: { userId: string } }) => state.rows.find((r) => r.userId === where.userId) ?? null,
      ),
      findMany: vi.fn(async ({ where, take }: { where: Where; take: number }) =>
        state.rows.filter((r) => matches(r, where)).slice(0, take),
      ),
      updateMany: vi.fn(async ({ where, data }: { where: Where; data: Where }) => {
        const hit = state.rows.filter((r) => matches(r, where));
        hit.forEach((r) => apply(r, data));
        return { count: hit.length };
      }),
      upsert: vi.fn(async ({ where, create, update }: { where: { userId: string }; create: Where; update: Where }) => {
        let row = state.rows.find((r) => r.userId === where.userId);
        if (row) apply(row, update);
        else {
          row = {
            enabled: false,
            nextAt: null,
            lastSentDay: null,
            sentSinceReview: 0,
            paused: false,
            updatedAt: new Date(0),
            ...create,
          } as Row;
          state.rows.push(row);
        }
        return row;
      }),
    },
    user: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => ({
        bannedUntil: state.banned[where.id] ?? null,
      })),
    },
    flashcard: {
      count: vi.fn(async ({ where }: { where: { deck: { userId: string } } }) => {
        state.freshWheres.push(where);
        return state.fresh[where.deck.userId] ?? 0;
      }),
    },
    flashcardReview: {
      count: vi.fn(async ({ where }: { where: { userId: string } }) => {
        state.countWheres.push(where);
        return state.due[where.userId] ?? 0;
      }),
    },
  },
}));
vi.mock('@/lib/notifications.server', () => ({
  createNotification: vi.fn(async (n: Record<string, unknown>) => {
    state.notifications.push(n);
  }),
}));

const { runDueReminderSweep, saveReminder, markReviewed, getReminder, exportStudyReminder } =
  await import('@/lib/study/reminders.server');

const T0 = new Date('2026-11-21T17:59:30Z'); // 17:59 in London (UTC+0)
const SIX_PM = new Date('2026-11-21T18:00:00Z');

async function enable(userId = 'u1', time = '18:00', timeZone = 'Europe/London') {
  return saveReminder(userId, { enabled: true, time, timeZone }, T0.getTime());
}
const row = (userId = 'u1') => state.rows.find((r) => r.userId === userId)!;

beforeEach(() => {
  state.rows = [];
  state.due = {};
  state.fresh = {};
  state.banned = {};
  state.freshWheres = [];
  state.countWheres = [];
  state.notifications = [];
});

describe('saving the setting', () => {
  it('stores the next instant for the chosen local time', async () => {
    const saved = await enable();
    expect(saved.nextAt).toBe('2026-11-21T18:00:00.000Z');
    expect(await getReminder('u1')).toMatchObject({ enabled: true, time: '18:00', paused: false });
  });
  it('has no next instant while off', async () => {
    const saved = await saveReminder('u1', { enabled: false, time: '18:00', timeZone: 'UTC' }, T0.getTime());
    expect(saved.nextAt).toBeNull();
    expect(row().nextAt).toBeNull();
  });
  it('returns null for a member who never saved one', async () => {
    expect(await getReminder('nobody')).toBeNull();
  });
});

describe('the sweep', () => {
  it('notifies a member with due cards once, and a second run does nothing', async () => {
    await enable();
    state.due.u1 = 3;
    expect(await runDueReminderSweep(new Date(SIX_PM.getTime() + 5_000))).toEqual({ read: 1, sent: 1 });
    expect(state.notifications).toHaveLength(1);
    expect(state.notifications[0]).toMatchObject({
      userId: 'u1',
      type: 'SYSTEM',
      entityType: 'study_due',
      link: '/study',
      preview: expect.objectContaining({ fallback: '3 flashcards are due' }),
    });
    expect(row().lastSentDay).toBe('2026-11-21');
    expect(row().nextAt?.toISOString()).toBe('2026-11-22T18:00:00.000Z');
    expect(await runDueReminderSweep(new Date(SIX_PM.getTime() + 20_000))).toEqual({ read: 0, sent: 0 });
    expect(state.notifications).toHaveLength(1);
  });

  it('sends once when two workers read the same row (the claim is a compare-and-set)', async () => {
    await enable();
    state.due.u1 = 1;
    const now = new Date(SIX_PM.getTime() + 1_000);
    await Promise.all([runDueReminderSweep(now), runDueReminderSweep(now)]);
    expect(state.notifications).toHaveLength(1);
    expect(noticeFallbackText(state.notifications[0]!.preview as never)).toBe('1 flashcard is due');
  });

  it('does not send before the member local time', async () => {
    await enable();
    state.due.u1 = 2;
    expect(await runDueReminderSweep(T0)).toEqual({ read: 0, sent: 0 });
    expect(state.notifications).toHaveLength(0);
  });

  it('skips a member with nothing due and still advances nextAt', async () => {
    await enable();
    const now = new Date(SIX_PM.getTime() + 1_000);
    expect(await runDueReminderSweep(now)).toEqual({ read: 1, sent: 0 });
    expect(state.notifications).toHaveLength(0);
    expect(row().nextAt?.toISOString()).toBe('2026-11-22T18:00:00.000Z');
    expect(row().sentSinceReview).toBe(0);
  });

  it('counts only reviewable cards in decks the member owns', async () => {
    await enable();
    state.due.u1 = 1;
    await runDueReminderSweep(new Date(SIX_PM.getTime() + 1_000));
    expect(state.countWheres[0]).toMatchObject({
      userId: 'u1',
      card: { NOT: { kind: { in: ['cloze', 'occlusion'] }, sourceId: null }, deck: { userId: 'u1' } },
    });
  });

  it('counts never-reviewed cards like the deck page, so a new deck is reminded about', async () => {
    await enable();
    state.fresh.u1 = 5;
    expect(await runDueReminderSweep(new Date(SIX_PM.getTime() + 1_000))).toEqual({ read: 1, sent: 1 });
    expect(state.notifications[0]).toMatchObject({
      preview: expect.objectContaining({ fallback: '5 flashcards are due' }),
    });
    expect(state.freshWheres[0]).toMatchObject({
      NOT: { kind: { in: ['cloze', 'occlusion'] }, sourceId: null },
      deck: { userId: 'u1' },
      reviews: { none: { userId: 'u1' } },
    });
  });

  it('adds scheduled and never-reviewed cards together', async () => {
    await enable();
    state.due.u1 = 2;
    state.fresh.u1 = 3;
    await runDueReminderSweep(new Date(SIX_PM.getTime() + 1_000));
    expect(state.notifications[0]).toMatchObject({
      preview: expect.objectContaining({ fallback: '5 flashcards are due' }),
    });
  });

  it('sends nothing to a banned member, and still advances nextAt', async () => {
    await enable();
    state.due.u1 = 4;
    state.banned.u1 = new Date('2027-01-01T00:00:00Z');
    expect(await runDueReminderSweep(new Date(SIX_PM.getTime() + 1_000))).toEqual({ read: 1, sent: 0 });
    expect(row().nextAt?.toISOString()).toBe('2026-11-22T18:00:00.000Z');
  });

  it('moves nextAt on without sending when the day was already sent (time edited later the same day)', async () => {
    await enable();
    state.due.u1 = 4;
    row().lastSentDay = '2026-11-21';
    expect(await runDueReminderSweep(new Date(SIX_PM.getTime() + 1_000))).toEqual({ read: 1, sent: 0 });
    expect(state.notifications).toHaveLength(0);
    expect(row().nextAt?.toISOString()).toBe('2026-11-22T18:00:00.000Z');
  });

  it('skips a reminder the worker missed by more than three hours, and moves on', async () => {
    await enable();
    state.due.u1 = 4;
    expect(await runDueReminderSweep(new Date('2026-11-21T22:00:00Z'))).toEqual({ read: 1, sent: 0 });
    expect(state.notifications).toHaveLength(0);
    expect(row().lastSentDay).toBe('2026-11-21');
  });

  it('ignores a member who turned it off', async () => {
    await enable();
    await saveReminder('u1', { enabled: false, time: '18:00', timeZone: 'Europe/London' }, T0.getTime());
    state.due.u1 = 2;
    expect(await runDueReminderSweep(new Date(SIX_PM.getTime() + 1_000))).toEqual({ read: 0, sent: 0 });
  });

  it('keeps going when one member fails', async () => {
    await enable('u1');
    await enable('u2');
    state.due.u1 = 1;
    state.due.u2 = 1;
    const { prisma } = await import('@/lib/prisma.server');
    vi.mocked(prisma.flashcardReview.count).mockRejectedValueOnce(new Error('db'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await runDueReminderSweep(new Date(SIX_PM.getTime() + 1_000));
    spy.mockRestore();
    expect(res.sent).toBe(1);
    expect(state.notifications).toHaveLength(1);
  });
});

describe('pausing and resuming', () => {
  async function day(n: number) {
    // The nth day's 18:00 in London (November, UTC+0).
    const when = new Date(SIX_PM.getTime() + n * 86_400_000 + 1_000);
    return runDueReminderSweep(when);
  }

  it('pauses after fourteen reminders with no review, and sends no fifteenth', async () => {
    await enable();
    state.due.u1 = 5;
    for (let n = 0; n < 14; n++) expect((await day(n)).sent).toBe(1);
    expect(state.notifications).toHaveLength(14);
    expect(row()).toMatchObject({ paused: true, sentSinceReview: 14, nextAt: null });
    expect((await day(14)).read).toBe(0);
    expect(state.notifications).toHaveLength(14);
    expect(await getReminder('u1')).toMatchObject({ paused: true, nextAt: null });
  });

  it('a review resets the counter, so reminders never reach the pause', async () => {
    await enable();
    state.due.u1 = 5;
    for (let n = 0; n < 10; n++) await day(n);
    expect(row().sentSinceReview).toBe(10);
    await markReviewed('u1');
    expect(row().sentSinceReview).toBe(0);
    for (let n = 10; n < 20; n++) await day(n);
    expect(row().paused).toBe(false);
    expect(row().sentSinceReview).toBe(10);
  });

  it('resume clears the pause and the counter and schedules the next send', async () => {
    await enable();
    state.due.u1 = 5;
    for (let n = 0; n < 14; n++) await day(n);
    const resumed = await saveReminder(
      'u1',
      { enabled: true, time: '18:00', timeZone: 'Europe/London', resume: true },
      new Date('2026-12-06T09:00:00Z').getTime(),
    );
    expect(resumed).toMatchObject({ paused: false, nextAt: '2026-12-06T18:00:00.000Z' });
    expect(row().sentSinceReview).toBe(0);
  });

  it('changing the time while paused keeps it paused', async () => {
    await enable();
    row().paused = true;
    row().nextAt = null;
    const saved = await saveReminder('u1', { enabled: true, time: '19:00', timeZone: 'Europe/London' }, T0.getTime());
    expect(saved).toMatchObject({ paused: true, nextAt: null });
  });

  it('turning it on again from off starts fresh', async () => {
    await enable();
    row().paused = true;
    row().sentSinceReview = 14;
    await saveReminder('u1', { enabled: false, time: '18:00', timeZone: 'Europe/London' }, T0.getTime());
    const on = await saveReminder('u1', { enabled: true, time: '18:00', timeZone: 'Europe/London' }, T0.getTime());
    expect(on.paused).toBe(false);
    expect(row().sentSinceReview).toBe(0);
  });
});

describe('export', () => {
  it('includes the setting, and null when there is none', async () => {
    expect(await exportStudyReminder('u1')).toBeNull();
    await enable();
    expect(await exportStudyReminder('u1')).toMatchObject({
      enabled: true,
      time: '18:00',
      timeZone: 'Europe/London',
      paused: false,
    });
  });
});
