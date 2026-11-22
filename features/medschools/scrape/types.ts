/**
 * Shared contracts for the med schools pipelines.
 *
 * `MedPrisma` is structural, like `RunPrisma` in `lib/homes/scrape/run.ts`: it
 * narrows the generated client to the calls the pipelines make so tests drive
 * them with an in-memory fake. The real client is assigned with
 * `prisma as unknown as MedPrisma`.
 */
import type { MedEventType, MedProgram, MedSource } from '../engine/types';

export type Logger = {
  info(l: string): void;
  warn(l: string): void;
  error(l: string): void;
};

type Where = Record<string, unknown>;
type Data = Record<string, unknown>;

export interface MedSchoolRow {
  id: string;
  slug: string;
  name: string;
  shortName: string;
  degree: string;
  city: string;
  state: string;
  country: string;
  active: boolean;
}

export interface MedSchoolAliasRow {
  id: string;
  schoolId: string;
  source: MedSource;
  sourceKey: string;
}

export interface MedCycleCountRow {
  id: string;
  schoolId: string;
  program: MedProgram;
  cycleYear: number;
  date: Date;
  eventType: MedEventType;
  source: MedSource;
  count: number;
  contributors: number | null;
}

export interface MedCycleEventRow {
  id: string;
  schoolId: string;
  cycleYear: number;
  program: MedProgram | null;
  eventType: MedEventType;
  occurredAt: Date;
  source: MedSource;
  dedupeHash: string;
  inState: boolean | null;
}

export interface MedInterviewQuestionRow {
  id: string;
  schoolId: string;
  text: string;
  source: MedSource;
  votes: number | null;
  cycleYear: number | null;
  dedupeHash: string;
}

export interface MedInterviewProfileRow {
  id: string;
  schoolId: string;
  source: MedSource;
  format: string | null;
  fileType: string | null;
  avgDifficulty: number | null;
  interviewCount: number | null;
  feedbackPositive: string[];
  feedbackNegative: string[];
  feedbackBefore: string[];
  fetchedAt: Date;
  interviewStyle: string | null;
  interviewLength: string | null;
  avgStress: number | null;
  avgImpression: number | null;
  inStateCount: number | null;
  outOfStateCount: number | null;
}

/** A public thread id and slug, not a person; `cursorPostHash` is an HMAC, never a raw post id. */
export interface MedSdnThreadRow {
  threadId: number;
  slug: string;
  schoolId: string;
  cycleYear: number;
  degree: string;
  archive: boolean;
  repliesSeen: number;
  repliesDone: number;
  lastActivityAt: Date | null;
  cursorPage: number;
  cursorPostHash: string | null;
  postsProcessed: number;
  /** Set while the thread is parked (gone, or failing repeatedly); retried on the discovery tick after 24 h. */
  parkedAt: Date | null;
  /** Consecutive failed walks across runs; reset on success. */
  failCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface MedSchoolStatsRow {
  id: string;
  schoolId: string;
  source: MedSource;
  residence: string;
  program: MedProgram | null;
  cycleYear: number;
}

export interface MedAliasMissRow {
  id: string;
  source: MedSource;
  sourceKey: string;
  firstSeenAt: Date;
  lastSeenAt: Date;
  seenCount: number;
  resolvedSchoolId: string | null;
  ignored: boolean;
}

export interface MedSourceRunRow {
  id: string;
  source: MedSource;
  job: string;
  trigger: string;
  startedAt: Date;
  finishedAt: Date | null;
  status: string;
  stats: unknown;
  error: string | null;
}

export interface MedPrisma {
  medSchool: {
    count(args?: { where?: Where }): Promise<number>;
    findMany(args?: { where?: Where; select?: Record<string, boolean>; orderBy?: unknown }): Promise<MedSchoolRow[]>;
    upsert(args: { where: Where; create: Data; update: Data }): Promise<MedSchoolRow>;
    findUnique(args: { where: Where }): Promise<MedSchoolRow | null>;
  };
  medSchoolAlias: {
    findMany(args?: { where?: Where; select?: Record<string, boolean> }): Promise<MedSchoolAliasRow[]>;
    upsert(args: { where: Where; create: Data; update: Data }): Promise<MedSchoolAliasRow>;
    create(args: { data: Data }): Promise<MedSchoolAliasRow>;
  };
  medSchoolAliasMiss: {
    findMany(args?: { where?: Where; orderBy?: unknown }): Promise<MedAliasMissRow[]>;
    findFirst(args?: { where?: Where }): Promise<MedAliasMissRow | null>;
    update(args: { where: Where; data: Data }): Promise<MedAliasMissRow>;
    upsert(args: { where: Where; create: Data; update: Data }): Promise<{
      id: string;
    }>;
  };
  medCycle: {
    count(args?: { where?: Where }): Promise<number>;
    upsert(args: {
      where: {
        cycleYear: number;
      };
      create: Data;
      update: Data;
    }): Promise<{
      cycleYear: number;
    }>;
  };
  medCycleCount: {
    count(args?: { where?: Where }): Promise<number>;
    findMany(args?: {
      where?: Where;
      select?: Record<string, boolean>;
      orderBy?: unknown;
    }): Promise<MedCycleCountRow[]>;
    createMany(args: { data: Data[]; skipDuplicates?: boolean }): Promise<{
      count: number;
    }>;
    update(args: {
      where: {
        id: string;
      };
      data: Data;
    }): Promise<MedCycleCountRow>;
    deleteMany(args: { where: Where }): Promise<{
      count: number;
    }>;
  };
  medCycleEvent: {
    findMany(args?: {
      where?: Where;
      select?: Record<string, boolean>;
      orderBy?: unknown;
    }): Promise<MedCycleEventRow[]>;
    createMany(args: { data: Data[]; skipDuplicates?: boolean }): Promise<{
      count: number;
    }>;
  };
  medInterviewQuestion: {
    findMany(args?: { where?: Where; select?: Record<string, boolean> }): Promise<MedInterviewQuestionRow[]>;
    createMany(args: { data: Data[]; skipDuplicates?: boolean }): Promise<{
      count: number;
    }>;
    update(args: { where: Where; data: Data }): Promise<MedInterviewQuestionRow>;
    deleteMany(args: { where: Where }): Promise<{
      count: number;
    }>;
  };
  medInterviewProfile: {
    findFirst(args?: { where?: Where }): Promise<MedInterviewProfileRow | null>;
    upsert(args: { where: Where; create: Data; update: Data }): Promise<{
      id: string;
    }>;
  };
  medSchoolStats: {
    findFirst(args?: { where?: Where }): Promise<MedSchoolStatsRow | null>;
    create(args: { data: Data }): Promise<{
      id: string;
    }>;
    update(args: { where: Where; data: Data }): Promise<{
      id: string;
    }>;
    upsert(args: { where: Where; create: Data; update: Data }): Promise<{
      id: string;
    }>;
  };
  medSdnThread: {
    findMany(args?: { where?: Where; select?: Record<string, boolean>; orderBy?: unknown }): Promise<MedSdnThreadRow[]>;
    upsert(args: { where: Where; create: Data; update: Data }): Promise<MedSdnThreadRow>;
    update(args: { where: Where; data: Data }): Promise<MedSdnThreadRow>;
  };
  aiUsage: {
    aggregate(args: {
      where: Where;
      _sum: {
        costMicros: true;
      };
    }): Promise<{
      _sum: {
        costMicros: number | null;
      };
    }>;
  };
  medSourceRun: {
    create(args: { data: Data }): Promise<{
      id: string;
    }>;
    update(args: {
      where: {
        id: string;
      };
      data: Data;
    }): Promise<{
      id: string;
    }>;
    findFirst(args?: { where?: Where; orderBy?: unknown }): Promise<MedSourceRunRow | null>;
    findMany(args?: { where?: Where; orderBy?: unknown; take?: number }): Promise<MedSourceRunRow[]>;
  };
  /** Runs `fn` against a transaction client; the fake rolls its tables back if `fn` throws. */
  $transaction<T>(
    fn: (tx: MedPrisma) => Promise<T>,
    options?: {
      isolationLevel?: 'Serializable';
    },
  ): Promise<T>;
}
