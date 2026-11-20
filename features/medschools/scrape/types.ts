/**
 * Shared contracts for the med schools pipelines.
 *
 * `MedPrisma` is structural, like `RunPrisma` in `lib/homes/scrape/run.ts`: it
 * narrows the generated client to the calls the pipelines make so tests drive
 * them with an in-memory fake. The real client is assigned with
 * `prisma as unknown as MedPrisma`.
 */
import type {
  MedEventType,
  MedProgram,
  MedSource,
} from '../engine/types';

export type Logger =
  {
    info(
      l: string,
    ): void;
    warn(
      l: string,
    ): void;
    error(
      l: string,
    ): void;
  };

type Where =
  Record<
    string,
    unknown
  >;
type Data =
  Record<
    string,
    unknown
  >;

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
  contributors:
    | number
    | null;
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
  error:
    | string
    | null;
}

export interface MedPrisma {
  medSchool: {
    count(args?: {
      where?: Where;
    }): Promise<number>;
    findMany(args?: {
      where?: Where;
      select?: Record<
        string,
        boolean
      >;
      orderBy?: unknown;
    }): Promise<
      MedSchoolRow[]
    >;
    upsert(args: {
      where: Where;
      create: Data;
      update: Data;
    }): Promise<MedSchoolRow>;
  };
  medSchoolAlias: {
    findMany(args?: {
      where?: Where;
      select?: Record<
        string,
        boolean
      >;
    }): Promise<
      MedSchoolAliasRow[]
    >;
    upsert(args: {
      where: Where;
      create: Data;
      update: Data;
    }): Promise<MedSchoolAliasRow>;
  };
  medSchoolAliasMiss: {
    upsert(args: {
      where: Where;
      create: Data;
      update: Data;
    }): Promise<{
      id: string;
    }>;
  };
  medCycle: {
    count(args?: {
      where?: Where;
    }): Promise<number>;
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
    count(args?: {
      where?: Where;
    }): Promise<number>;
    findMany(args?: {
      where?: Where;
      select?: Record<
        string,
        boolean
      >;
      orderBy?: unknown;
    }): Promise<
      MedCycleCountRow[]
    >;
    createMany(args: {
      data: Data[];
      skipDuplicates?: boolean;
    }): Promise<{
      count: number;
    }>;
    update(args: {
      where: {
        id: string;
      };
      data: Data;
    }): Promise<MedCycleCountRow>;
    deleteMany(args: {
      where: Where;
    }): Promise<{
      count: number;
    }>;
  };
  medSchoolStats: {
    upsert(args: {
      where: Where;
      create: Data;
      update: Data;
    }): Promise<{
      id: string;
    }>;
  };
  medSourceRun: {
    create(args: {
      data: Data;
    }): Promise<{
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
    findFirst(args?: {
      where?: Where;
      orderBy?: unknown;
    }): Promise<MedSourceRunRow | null>;
  };
}
