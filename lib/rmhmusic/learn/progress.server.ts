import { prisma } from '@/lib/prisma.server';
import { checkIn } from '@/lib/streak.server';
import { awardXp } from '@/lib/xp/engine.server';
import { isKnownLesson } from './content/path';
import {
  INPUTS,
  INSTRUMENTS,
  type Instrument,
  type LearnInput,
  type LessonCompleteInput,
  type ProfileInput,
  type VoiceRange,
} from './schemas';
import { isVoiceRange } from './voice/range';
import {
  clampMicGain,
  clampMicGate,
  DEFAULT_MIC_SETTINGS,
  normalizeMicSettings,
  type MicHum,
} from './input/mic-gain';
import { DEFAULT_PRACTICE_MODE, isPracticeMode, type PracticeMode } from './practice-mode';
import {
  DEFAULT_NEW_PER_DAY,
  DEFAULT_RETENTION,
  clampNewPerDay,
  clampRetention,
} from './srs/practice-settings';
import { isInstrumentId } from './audio/instruments/catalog';
import type { InstrumentId } from './audio/instruments/types';
import { mergeLessonResult } from './xp';
import { toLearnerShape, type LearnerShape } from './learner-shape';

export interface Profile {
  instrument: Instrument;
  input: LearnInput;
  latencyMs: number;
  dailyGoal: number;
  /** The chosen sound, or null to follow `instrument` (`resolveSound`). */
  sound: InstrumentId | null;
  /** A voice learner's range, or null until chosen (lessons in the range ask for it first). */
  voiceRange: VoiceRange | null;
  /** Learning or Test mode (`practice-mode.ts`). */
  practiceMode: PracticeMode;
  /** The manual microphone input gain, 1 to 16 (`input/mic-gain.ts`); used when `micAuto` is off. */
  micGain: number;
  /** Automatic microphone sensitivity: the gain and the cutoff follow the room and the notes. */
  micAuto: boolean;
  /** The manual cutoff: sound quieter than this level (RMS) is ignored; used when `micAuto` is off. */
  micGate: number;
  /** The mains-hum filter: off, 50 Hz or 60 Hz. */
  micHum: MicHum;
  /** The recall chance a card may fall to before it comes back, 0.80 to 0.95 (`srs/practice-settings.ts`). */
  retention: number;
  /** How many never-asked cards Practice may introduce a day, 0 to 50; due cards are never capped. */
  newPerDay: number;
}

export interface LessonProgressRow {
  lessonId: string;
  stars: number;
  bestScore: number;
  completedAt: string | null;
}

export const DEFAULT_PROFILE: Profile = {
  instrument: 'piano',
  input: 'screen',
  latencyMs: 0,
  dailyGoal: 1,
  sound: null,
  voiceRange: null,
  practiceMode: DEFAULT_PRACTICE_MODE,
  micGain: DEFAULT_MIC_SETTINGS.gain,
  micAuto: DEFAULT_MIC_SETTINGS.auto,
  micGate: DEFAULT_MIC_SETTINGS.gate,
  micHum: DEFAULT_MIC_SETTINGS.hum,
  retention: DEFAULT_RETENTION,
  newPerDay: DEFAULT_NEW_PER_DAY,
};

/** Thrown by `completeLesson` for an id that is not in the catalogue. */
export class UnknownLessonError extends Error {
  constructor(lessonId: string) {
    super(`Unknown lesson: ${lessonId}`);
    this.name = 'UnknownLessonError';
  }
}

function toProfile(row: {
  instrument: string;
  input: string;
  latencyMs: number;
  dailyGoal: number;
  sound?: string | null;
  voiceRange?: string | null;
  practiceMode?: string;
  micGain?: number;
  micAuto?: boolean;
  micGate?: number;
  micHum?: string;
  retention?: number;
  newPerDay?: number;
}): Profile {
  // Columns are plain strings; narrow them so a stale value never reaches the UI.
  return {
    instrument: (INSTRUMENTS as readonly string[]).includes(row.instrument)
      ? (row.instrument as Instrument)
      : DEFAULT_PROFILE.instrument,
    input: (INPUTS as readonly string[]).includes(row.input)
      ? (row.input as LearnInput)
      : DEFAULT_PROFILE.input,
    latencyMs: row.latencyMs,
    dailyGoal: row.dailyGoal,
    sound: isInstrumentId(row.sound) ? row.sound : null,
    voiceRange: isVoiceRange(row.voiceRange) ? row.voiceRange : null,
    practiceMode: isPracticeMode(row.practiceMode) ? row.practiceMode : DEFAULT_PRACTICE_MODE,
    ...(() => {
      const mic = normalizeMicSettings({ auto: row.micAuto, gain: row.micGain, gate: row.micGate, hum: row.micHum });
      return { micAuto: mic.auto, micGain: mic.gain, micGate: mic.gate, micHum: mic.hum };
    })(),
    retention: clampRetention(row.retention),
    newPerDay: clampNewPerDay(row.newPerDay),
  };
}

/**
 * The learner's instrument and range for the placeholders (`learner-shape.ts`): two columns by the
 * unique `userId`, read by the `/rmhmusic` layout route with its auth check. Never writes.
 */
export async function getLearnerShape(userId: string): Promise<LearnerShape> {
  const row = await prisma.musicLearnProfile.findUnique({
    where: { userId },
    select: { instrument: true, voiceRange: true },
  });
  return toLearnerShape(row);
}

/** The learner's profile, or the defaults when they have not saved one. Never writes. */
export async function getProfile(userId: string): Promise<Profile> {
  const row = await prisma.musicLearnProfile.findUnique({ where: { userId } });
  return row ? toProfile(row) : { ...DEFAULT_PROFILE };
}

export async function saveProfile(userId: string, input: ProfileInput): Promise<Profile> {
  const data = {
    instrument: input.instrument,
    input: input.input,
    latencyMs: input.latencyMs,
    dailyGoal: input.dailyGoal,
    // Absent: leave the stored sound alone; null: follow the instrument again.
    ...(input.sound !== undefined ? { sound: input.sound } : {}),
    ...(input.voiceRange !== undefined ? { voiceRange: input.voiceRange } : {}),
    ...(input.practiceMode !== undefined ? { practiceMode: input.practiceMode } : {}),
    ...(input.micGain !== undefined ? { micGain: clampMicGain(input.micGain) } : {}),
    ...(input.micAuto !== undefined ? { micAuto: input.micAuto } : {}),
    ...(input.micGate !== undefined ? { micGate: clampMicGate(input.micGate) } : {}),
    ...(input.micHum !== undefined ? { micHum: input.micHum } : {}),
    ...(input.retention !== undefined ? { retention: clampRetention(input.retention) } : {}),
    ...(input.newPerDay !== undefined ? { newPerDay: clampNewPerDay(input.newPerDay) } : {}),
  };
  const row = await prisma.musicLearnProfile.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  });
  return toProfile(row);
}

export async function listProgress(userId: string): Promise<LessonProgressRow[]> {
  const rows = await prisma.musicLearnLessonProgress.findMany({
    where: { userId },
    orderBy: { lessonId: 'asc' },
    select: { lessonId: true, stars: true, bestScore: true, completedAt: true },
  });
  return rows.map((r) => ({
    lessonId: r.lessonId,
    stars: r.stars,
    bestScore: r.bestScore,
    completedAt: r.completedAt ? r.completedAt.toISOString() : null,
  }));
}

/**
 * Record a lesson result. Stars and best score only ever rise, and XP is paid on
 * the stars gained (`mergeLessonResult`), so replaying a lesson cannot farm XP.
 *
 * The read-merge-write runs in one transaction that first makes sure the row
 * exists, then takes a row lock (`SELECT ... FOR UPDATE`). A concurrent
 * identical request waits on that lock, re-reads the committed row, sees the
 * stars already banked, and is paid 0 — two requests can never both be paid for
 * the same new star.
 */
export async function completeLesson(
  userId: string,
  input: LessonCompleteInput,
): Promise<{ stars: number; xpAwarded: number; progress: LessonProgressRow[] }> {
  if (!isKnownLesson(input.lessonId)) throw new UnknownLessonError(input.lessonId);
  const { lessonId } = input;

  const { stars, xpAwarded } = await prisma.$transaction(async (tx) => {
    await tx.musicLearnLessonProgress.createMany({
      data: [{ userId, lessonId }],
      skipDuplicates: true,
    });
    await tx.$queryRaw`SELECT "id" FROM "music_learn_lesson_progress" WHERE "userId" = ${userId} AND "lessonId" = ${lessonId} FOR UPDATE`;
    const prev = await tx.musicLearnLessonProgress.findUniqueOrThrow({
      where: { userId_lessonId: { userId, lessonId } },
    });
    const merged = mergeLessonResult(prev, input);
    await tx.musicLearnLessonProgress.update({
      where: { userId_lessonId: { userId, lessonId } },
      data: {
        stars: merged.stars,
        bestScore: merged.bestScore,
        // Set when stars first reach 1; never cleared.
        completedAt: prev.completedAt ?? (merged.stars >= 1 ? new Date() : null),
      },
    });
    return merged;
  });

  // Best-effort side effects, outside the transaction.
  if (xpAwarded > 0) await awardXp(userId, xpAwarded);
  try {
    await checkIn(userId);
  } catch {
    // A streak failure must never fail the lesson save.
  }

  return { stars, xpAwarded, progress: await listProgress(userId) };
}
