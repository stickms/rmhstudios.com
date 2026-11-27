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
  /** RMH rows only: the daily public snapshot (see `api/read.server.ts`); the forecast reads these, never the live pair. */
  publishedCount?: number | null;
  publishedContributors?: number | null;
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

/** A keyed hash of an Admit member id and whether that member's history was ingested; never the id. */
export interface MedAdmitMemberRow {
  memberHash: string;
  state: string;
  attempts: number;
  updatedAt: Date;
}

/** A school's Admit forum thread for one cycle: counts and a hashed cursor, never text or a person. */
export interface MedAdmitForumThreadRow {
  id: string;
  schoolId: string;
  cycleYear: number;
  remoteCount: number;
  /** Posts consumed; the next read starts one before it so the anchor post is checked. */
  cursorOffset: number;
  /** HMAC of the last processed post's id, never the id. */
  cursorPostHash: string | null;
  postsProcessed: number;
  lastPostAt: Date | null;
  /** Set while the thread is parked (failing repeatedly); retried after 24 h. */
  parkedAt: Date | null;
  failCount: number;
  createdAt: Date;
  updatedAt: Date;
}

/** A stored forecast row as the job reads it back to skip an unchanged write. */
export interface MedForecastRow {
  schoolId: string;
  program: MedProgram;
  cycleYear: number;
  eventType: MedEventType;
  modelVersion: number;
  mode: string;
  source: MedSource;
  asOf: Date;
  curve: unknown;
  summary: unknown;
}

/** A school's secondary prompt (institutional text, no person column). */
export interface MedSecondaryPromptRow {
  id: string;
  schoolId: string;
  program: MedProgram;
  key: string;
  text: string;
  themes: string[];
  themesVersion: number;
}

/** A prompt seen in one cycle by one source. `sourceRef` is a school page or thread URL, never a post. */
export interface MedSecondaryObservationRow {
  id: string;
  promptId: string;
  cycleYear: number;
  source: 'ADMIT' | 'SDN' | 'SCHOOL';
  limitKind: 'WORDS' | 'CHARS' | null;
  limitValue: number | null;
  optional: boolean;
  sourceRef: string | null;
  firstSeenAt: Date;
  lastCheckedAt: Date;
}

/** When a school's page on one source was last read and what it gave. */
export interface MedSecondaryCheckRow {
  id: string;
  schoolId: string;
  source: 'ADMIT' | 'SDN' | 'SCHOOL';
  checkedAt: Date;
  status: 'OK' | 'EMPTY' | 'UNAVAILABLE';
  promptCount: number;
}

/** What a school's own admissions page said about rolling decisions (a curated import). */
export interface MedSchoolAdmissionsPolicyRow {
  id: string;
  schoolId: string;
  program: MedProgram;
  rolling: boolean;
  evidence: string;
  url: string;
  checkedOn: Date;
  source: 'ADMIT' | 'SDN' | 'SCHOOL';
}

/** A dated, sourced fact about a school (see `engine/school-facts.ts`). */
export interface MedSchoolFactRow {
  id: string;
  schoolId: string;
  program: MedProgram;
  cycleYear: number;
  kind: string;
  valueNum: number | null;
  valueText: string | null;
  valueJson: unknown;
  note: string | null;
  source: 'AAMC_MSAR_REPORT' | 'SCHOOL_PROFILE' | 'ADMIT';
  sourceUrl: string;
  sourceLabel: string;
  reportId: number | null;
  page: number | null;
  checkedOn: Date;
}

export interface MedSecondaryTurnaroundRow {
  id: string;
  schoolId: string;
  program: MedProgram;
  asOf: Date;
  members: number;
  p25Days: number;
  medianDays: number;
  p75Days: number;
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
    findMany(args?: { where?: Where; select?: Record<string, boolean> }): Promise<
      {
        cycleYear: number;
        dayZeroOn: Date;
      }[]
    >;
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
    findFirst(args?: { where?: Where; orderBy?: unknown; select?: Record<string, boolean> }): Promise<{
      cycleYear: number;
    } | null>;
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
    update(args: { where: Where; data: Data }): Promise<{
      id: string;
    }>;
    deleteMany(args: { where: Where }): Promise<{
      count: number;
    }>;
  };
  medForecast: {
    findMany(args?: { where?: Where; select?: Record<string, boolean> }): Promise<MedForecastRow[]>;
    upsert(args: { where: Where; create: Data; update: Data }): Promise<{
      id: string;
    }>;
  };
  medWaitCurve: {
    findMany(args?: { where?: Where; select?: Record<string, boolean> }): Promise<
      {
        schoolId: string;
        program: MedProgram;
        invited: number;
        members: number;
        curve: unknown;
      }[]
    >;
    upsert(args: { where: Where; create: Data; update: Data }): Promise<{
      id: string;
    }>;
    deleteMany(args: { where: Where }): Promise<{
      count: number;
    }>;
  };
  medRequestBudget: {
    findFirst(args?: { where?: Where }): Promise<{ key: string; day: Date; requests: number } | null>;
    upsert(args: { where: Where; create: Data; update: Data }): Promise<{ key: string }>;
  };
  medAdmitCycleTotal: {
    upsert(args: { where: Where; create: Data; update: Data }): Promise<{ id: string }>;
  };
  medAdmitMember: {
    findMany(args?: { where?: Where; select?: Record<string, boolean> }): Promise<MedAdmitMemberRow[]>;
    upsert(args: { where: Where; create: Data; update: Data }): Promise<{
      memberHash: string;
    }>;
    deleteMany(args: { where: Where }): Promise<{
      count: number;
    }>;
  };
  medAdmitForumThread: {
    findMany(args?: { where?: Where; orderBy?: unknown }): Promise<MedAdmitForumThreadRow[]>;
    create(args: { data: Data }): Promise<MedAdmitForumThreadRow>;
    update(args: { where: Where; data: Data }): Promise<MedAdmitForumThreadRow>;
    deleteMany(args: { where: Where }): Promise<{
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
  medSecondaryPrompt: {
    findMany(args?: { where?: Where; orderBy?: unknown }): Promise<MedSecondaryPromptRow[]>;
    create(args: { data: Data }): Promise<MedSecondaryPromptRow>;
    update(args: { where: Where; data: Data }): Promise<MedSecondaryPromptRow>;
  };
  medSecondaryObservation: {
    findMany(args?: { where?: Where; orderBy?: unknown }): Promise<MedSecondaryObservationRow[]>;
    create(args: { data: Data }): Promise<MedSecondaryObservationRow>;
    update(args: { where: Where; data: Data }): Promise<MedSecondaryObservationRow>;
  };
  medSchoolAdmissionsPolicy: {
    findMany(args?: { where?: Where; select?: Record<string, boolean> }): Promise<MedSchoolAdmissionsPolicyRow[]>;
    upsert(args: { where: Where; create: Data; update: Data }): Promise<MedSchoolAdmissionsPolicyRow>;
  };
  medSchoolFact: {
    findMany(args?: { where?: Where; select?: Record<string, boolean> }): Promise<MedSchoolFactRow[]>;
    upsert(args: { where: Where; create: Data; update: Data }): Promise<MedSchoolFactRow>;
    deleteMany(args: { where: Where }): Promise<{ count: number }>;
  };
  medSecondaryTurnaround: {
    findMany(args?: { where?: Where; select?: Record<string, boolean> }): Promise<MedSecondaryTurnaroundRow[]>;
    upsert(args: { where: Where; create: Data; update: Data }): Promise<MedSecondaryTurnaroundRow>;
    deleteMany(args: { where: Where }): Promise<{ count: number }>;
  };
  medSecondaryCheck: {
    findMany(args?: { where?: Where; orderBy?: unknown }): Promise<MedSecondaryCheckRow[]>;
    upsert(args: { where: Where; create: Data; update: Data }): Promise<MedSecondaryCheckRow>;
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
      timeout?: number;
      maxWait?: number;
    },
  ): Promise<T>;
}
