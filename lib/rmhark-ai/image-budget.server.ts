/**
 * Global daily spend guard for AI image generation.
 *
 * A single row per UTC day holds the count of generations attempted that day.
 * Shared across the web process and the bot-worker process via the DB, so the
 * cap holds no matter who is generating. Fails closed: any DB error denies the
 * request rather than risk overspending the (small) xAI credit balance.
 */

import { prisma } from '@/lib/prisma.server';

const DEFAULT_DAILY_CAP = 50;

/** Resolved global daily cap (env `XAI_IMAGE_DAILY_CAP`, else 50). */
export function imageDailyCap(): number {
  const raw = Number(process.env.XAI_IMAGE_DAILY_CAP);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_DAILY_CAP;
}

/** UTC day key, e.g. "2026-06-22". */
export function todayKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Atomically reserve one image-generation unit from today's global budget.
 * Returns true if the day was under cap (and a slot was reserved), false if at
 * or over cap. Fails closed (false) on any DB error.
 */
export async function tryConsumeImageBudget(): Promise<boolean> {
  const day = todayKey();
  const cap = imageDailyCap();
  try {
    // Ensure today's row exists (no-op update if present)...
    await prisma.imageGenBudget.upsert({
      where: { day },
      create: { day, count: 0 },
      update: {},
    });
    // ...then conditionally increment ONLY while under cap. updateMany returns
    // the number of rows it changed: 1 => we were under cap and reserved a
    // slot; 0 => already at cap.
    const res = await prisma.imageGenBudget.updateMany({
      where: { day, count: { lt: cap } },
      data: { count: { increment: 1 } },
    });
    return res.count === 1;
  } catch (err) {
    console.error('image budget check failed (failing closed):', err);
    return false;
  }
}
