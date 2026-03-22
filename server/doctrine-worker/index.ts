/**
 * Doctrine Engine — Background Worker
 *
 * Long-lived Node.js process that runs scheduled tasks:
 * - Puzzle generation (daily at midnight UTC)
 * - Reputation decay (weekly on Mondays)
 * - Sahur mode activation checks (every 60 seconds)
 *
 * Runs as a separate Docker service or dev process.
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

// ─── Prisma Client (standalone for worker process) ──────────────

function createPrisma() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL required');
  const adapter = new PrismaPg({ connectionString, max: 3 });
  return new PrismaClient({ adapter });
}

const prisma = createPrisma();

// ─── Puzzle Generation ──────────────────────────────────────────

function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function getSeedForDate(date: string, mode: string): number {
  let hash = 0;
  const input = `${date}:${mode}:doctrine`;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) - hash + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

const MODES = ['ALIBI', 'SPECTRUM', 'OUTCAST', 'CHAINLINK', 'IMPOSTOR'] as const;

async function generateDailyPuzzles() {
  const tomorrow = new Date();
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const dateStr = tomorrow.toISOString().slice(0, 10);
  const date = new Date(dateStr + 'T00:00:00Z');
  const resetDate = new Date(date);
  resetDate.setUTCDate(resetDate.getUTCDate() + 1);

  const dayOfWeek = date.getUTCDay();
  const difficultyMap: Record<number, number> = { 1: 1, 2: 2, 3: 3, 4: 3, 5: 4, 6: 4, 0: 5 };
  const difficulty = difficultyMap[dayOfWeek] ?? 3;

  for (const mode of MODES) {
    const existing = await prisma.doctrinePuzzle.findUnique({
      where: { mode_date: { mode, date } },
    });
    if (existing) continue;

    const seed = getSeedForDate(dateStr, mode.toLowerCase());
    // Minimal puzzle data placeholder — the puzzle-engine lib generates full content on demand
    await prisma.doctrinePuzzle.create({
      data: {
        mode,
        date,
        seed,
        data: { generated: true, seed },
        difficulty,
        resetsAt: resetDate,
        isSahur: false,
      },
    });
    console.log(`[puzzle-gen] Created ${mode} puzzle for ${dateStr}`);
  }

  // Generate Sahur special puzzle
  const sahurExisting = await prisma.doctrinePuzzle.findFirst({
    where: { mode: 'SAHUR_SPECIAL', date },
  });
  if (!sahurExisting) {
    const seed = getSeedForDate(dateStr, 'sahur_special');
    await prisma.doctrinePuzzle.create({
      data: {
        mode: 'SAHUR_SPECIAL',
        date,
        seed,
        data: { generated: true, seed },
        difficulty: Math.min(5, difficulty + 1) as 1 | 2 | 3 | 4 | 5,
        resetsAt: resetDate,
        isSahur: true,
      },
    });
    console.log(`[puzzle-gen] Created SAHUR_SPECIAL puzzle for ${dateStr}`);
  }
}

// ─── Reputation Decay ───────────────────────────────────────────

const WEEKLY_DECAY_RATE = 0.05;

async function applyReputationDecay() {
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  const inactiveUsers = await prisma.doctrineReputation.findMany({
    where: { lastActiveAt: { lt: oneWeekAgo }, totalXp: { gt: 0 } },
  });

  let decayed = 0;
  for (const rep of inactiveUsers) {
    const newXp = Math.floor(rep.totalXp * (1 - WEEKLY_DECAY_RATE));
    const delta = newXp - rep.totalXp;

    await prisma.doctrineReputation.update({
      where: { id: rep.id },
      data: { totalXp: newXp },
    });

    await prisma.doctrineReputationLedger.create({
      data: {
        reputationId: rep.id,
        action: 'WEEKLY_DECAY',
        xpDelta: delta,
        reason: `Weekly inactivity decay (-${WEEKLY_DECAY_RATE * 100}%)`,
      },
    });

    decayed++;
  }

  if (decayed > 0) {
    console.log(`[reputation-decay] Applied decay to ${decayed} inactive users`);
  }
}

// ─── Sahur Mode Activation Check ────────────────────────────────

function isSahurHour(timezone: string): boolean {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false,
    });
    const parts = formatter.formatToParts(new Date());
    const hour = parseInt(parts.find(p => p.type === 'hour')!.value);
    return hour === 3;
  } catch {
    return false;
  }
}

async function checkSahurActivation() {
  // Get unique timezones from users
  const users = await prisma.user.findMany({
    where: { doctrineTimezone: { not: undefined } },
    select: { doctrineTimezone: true },
    distinct: ['doctrineTimezone'],
  });

  const timezones = [...new Set(users.map(u => u.doctrineTimezone).filter(Boolean))];
  const today = new Date().toISOString().slice(0, 10);

  for (const tz of timezones) {
    if (!tz) continue;
    if (isSahurHour(tz)) {
      // Check if session already exists
      const existing = await prisma.doctrineSahurSession.findUnique({
        where: { dateKey_timezone: { dateKey: today, timezone: tz } },
      });

      if (!existing) {
        await prisma.doctrineSahurSession.create({
          data: { dateKey: today, timezone: tz },
        });
        console.log(`[sahur] Activated Sahur for timezone: ${tz}`);
      }
    }
  }
}

// ─── Scheduler ──────────────────────────────────────────────────

function getMillisUntilMidnightUTC(): number {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setUTCDate(midnight.getUTCDate() + 1);
  midnight.setUTCHours(0, 0, 0, 0);
  return midnight.getTime() - now.getTime();
}

function isMonday(): boolean {
  return new Date().getUTCDay() === 1;
}

// Initial run
async function startup() {
  console.log('[doctrine-worker] Starting...');

  // Generate tomorrow's puzzles immediately
  try {
    await generateDailyPuzzles();
  } catch (e) {
    console.error('[puzzle-gen] Failed:', e);
  }

  // Schedule daily puzzle generation at midnight UTC
  setTimeout(function schedulePuzzles() {
    generateDailyPuzzles().catch(e => console.error('[puzzle-gen] Failed:', e));
    // Reschedule for next midnight
    setTimeout(schedulePuzzles, getMillisUntilMidnightUTC());
  }, getMillisUntilMidnightUTC());

  // Sahur check every 60 seconds
  setInterval(() => {
    checkSahurActivation().catch(e => console.error('[sahur] Check failed:', e));
  }, 60_000);

  // Reputation decay check every hour (only applies on Mondays)
  setInterval(() => {
    if (isMonday()) {
      applyReputationDecay().catch(e => console.error('[reputation-decay] Failed:', e));
    }
  }, 3_600_000);

  console.log('[doctrine-worker] All tasks scheduled');
}

startup();

// ─── Graceful shutdown ──────────────────────────────────────────

async function shutdown(signal: string) {
  console.log(`[doctrine-worker] ${signal} received, shutting down...`);
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
