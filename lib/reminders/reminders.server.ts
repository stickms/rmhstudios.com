/**
 * Reminders (plan U7). Server-only.
 *
 * A reminder is a notification the user scheduled for themselves. Firing goes
 * through `createNotification`, so it lands in the notification centre, the
 * unread badge and (if the device subscribed) Web Push like any other — no
 * second delivery path.
 */

import { prisma } from '@/lib/prisma.server';
import { adjustNotifUnread, createNotification } from '@/lib/notifications.server';
import {
  MAX_PENDING_REMINDERS,
  MAX_REMINDER_AHEAD_MS,
  type CreateReminderInput,
  type ReminderKind,
  type ReminderView,
} from '@/lib/reminders/schema';

const VIEW_SELECT = {
  id: true,
  kind: true,
  targetId: true,
  label: true,
  url: true,
  note: true,
  remindAt: true,
} as const;

type Row = {
  id: string;
  kind: string;
  targetId: string;
  label: string;
  url: string;
  note: string | null;
  remindAt: Date;
};

function toView(r: Row): ReminderView {
  return { ...r, kind: r.kind as ReminderKind, remindAt: r.remindAt.toISOString() };
}

export type SetReminderResult =
  { ok: true; reminder: ReminderView } | { ok: false; status: number; error: string };

/** Create or move the user's reminder for one target. */
export async function setReminder(
  userId: string,
  input: CreateReminderInput,
  now = new Date(),
): Promise<SetReminderResult> {
  const remindAt = new Date(input.remindAt);
  if (remindAt.getTime() < now.getTime() + 30_000) {
    return { ok: false, status: 400, error: 'Pick a time in the future' };
  }
  if (remindAt.getTime() > now.getTime() + MAX_REMINDER_AHEAD_MS) {
    return { ok: false, status: 400, error: 'Pick a time within a year' };
  }

  const key = { userId_kind_targetId: { userId, kind: input.kind, targetId: input.targetId } };
  const existing = await prisma.reminder.findUnique({ where: key, select: { firedAt: true } });
  // Moving a pending reminder doesn't change the count; only a new one can hit the cap.
  if (!existing || existing.firedAt) {
    const pending = await prisma.reminder.count({ where: { userId, firedAt: null } });
    if (pending >= MAX_PENDING_REMINDERS) {
      return { ok: false, status: 429, error: 'Too many pending reminders' };
    }
  }

  const data = {
    label: input.label,
    url: input.url,
    note: input.note || null,
    remindAt,
    firedAt: null,
  };
  const row = await prisma.reminder.upsert({
    where: key,
    create: { userId, kind: input.kind, targetId: input.targetId, ...data },
    update: data,
    select: VIEW_SELECT,
  });

  // Snoozing a notification takes it out of the unread pile until it comes back.
  if (input.kind === 'notification') {
    const res = await prisma.notification.updateMany({
      where: { id: input.targetId, userId, read: false },
      data: { read: true },
    });
    if (res.count > 0) void adjustNotifUnread(userId, -res.count);
  }

  return { ok: true, reminder: toView(row) };
}

export async function listPendingReminders(userId: string): Promise<ReminderView[]> {
  const rows = await prisma.reminder.findMany({
    where: { userId, firedAt: null },
    orderBy: { remindAt: 'asc' },
    take: MAX_PENDING_REMINDERS,
    select: VIEW_SELECT,
  });
  return rows.map(toView);
}

export async function deleteReminder(userId: string, id: string): Promise<boolean> {
  const res = await prisma.reminder.deleteMany({ where: { id, userId } });
  return res.count > 0;
}

/** Fired rows older than this are deleted by the next sweep. */
const FIRED_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const FIRE_BATCH = 500;

/**
 * Deliver every due reminder. Called each minute by the jobs worker.
 *
 * Each row is CLAIMED (conditional `firedAt` stamp) before it is delivered, so
 * pg-boss's at-least-once delivery — or two workers — can never fire one twice.
 */
export async function fireDueReminders(now = new Date()): Promise<number> {
  const due = await prisma.reminder.findMany({
    where: { firedAt: null, remindAt: { lte: now } },
    orderBy: { remindAt: 'asc' },
    take: FIRE_BATCH,
    select: { id: true, userId: true, label: true, url: true, note: true },
  });
  let fired = 0;
  for (const r of due) {
    const claim = await prisma.reminder.updateMany({
      where: { id: r.id, firedAt: null },
      data: { firedAt: now },
    });
    if (claim.count === 0) continue;
    await createNotification({
      userId: r.userId,
      type: 'SYSTEM',
      entityType: 'reminder',
      entityId: r.id,
      preview: r.note ? `${r.label} — ${r.note}` : r.label,
      link: r.url,
    });
    fired += 1;
  }

  await prisma.reminder
    .deleteMany({ where: { firedAt: { lt: new Date(now.getTime() - FIRED_RETENTION_MS) } } })
    .catch(() => {});
  return fired;
}
