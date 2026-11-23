/**
 * `medschools.forecast`: the daily derived job of phase 5 (spec §8, 06:40 UTC). For every active school it fits the
 * current cycle's interview, secondary, waitlist, rejection and acceptance series per program (REG and PHD, never ALL)
 * and upserts one `MedForecast` row each; then it rebuilds the aggregate wait curves (`run-wait-curves.ts`).
 *
 * A forecast is a function of the PUBLIC, floored primary series and nothing else: counts are read through
 * `floorWhere` (engine/floor.ts, the one definition the readers use) and turned into figures by `primarySeriesOf`, so a
 * suppressed, unpublished or same-day RMH figure never moves a band. No network, no model: a pure read, compute, write.
 *
 * The ledger, the persisted minimum interval and the stale-run close copy `run-rmh-publish.ts` (the enum has no
 * "derived" source, so the ledger row is `source = 'RMH'`, job `forecast`). Log lines carry counts only.
 */
import type { PrismaClient } from '@prisma/client';
import { cycleEndOn, dayOfCycle, defaultDayZero } from '../engine/cycle';
import { floorWhere } from '../engine/floor';
import { CHARTED_TYPES, resolveCycleYear, utcDayOf, type StoredCountRow } from '../engine/public-read';
import { MODEL_VERSION } from '../engine/stats/constants';
import { addDays } from '../engine/stats/days';
import { forecastCycle, type HistoryCycle } from '../engine/stats/forecast';
import { primarySeriesOf, seriesOfSource, toDayCounts } from '../engine/stats/input';
import { MIN_HISTORY_TOTAL } from '../engine/stats/constants';
import { fnv1a } from '../engine/stats/random';
import type { MedEventType, MedProgram, MedSource } from '../engine/types';
import { runWaitCurves } from './run-wait-curves';
import { brief, closeStaleRuns, lastRealRunWithin } from './run-support';
import type { Logger, MedPrisma } from './types';

export const FORECAST_JOB = 'forecast';
/** 06:40 UTC every day (spec §8). */
export const FORECAST_CRON = '40 6 * * *';
/** A non-manual run inside this window of an OK run is skipped; the cron is daily, so this only absorbs restarts. */
export const FORECAST_MIN_INTERVAL_MS = 20 * 3_600_000;
/** Cycles before the current one a forecast may learn from. */
const HISTORY_CYCLES = 4;
/** An MDApplicants series stands in for the SHAPE of a thin history cycle only above this many reports. */
const SHAPE_FALLBACK_MIN = 30;
const PROGRAMS: readonly MedProgram[] = ['REG', 'PHD'];

export interface ForecastDeps {
  /** The structural client: every read and write of the forecast tables. */
  prisma: MedPrisma;
  /** The real client: the wait curves are one raw statement. */
  db: PrismaClient;
  now?: () => Date;
  log: Logger;
  shouldStop?: () => boolean;
}

export interface ForecastSummary {
  runId: string;
  status: 'OK' | 'PARTIAL' | 'FAILED';
  outcome: 'ran' | 'skipped-min-interval';
  cycleYear: number | null;
  schools: number;
  /** Rows written, by mode. A row identical to the stored one is `unchanged` and not rewritten. */
  fitted: number;
  early: number;
  none: number;
  unchanged: number;
  curves: number;
  curvesRemoved: number;
}

/** A count row as the job reads it: the stored figures plus where it belongs. */
export interface ForecastCountRow extends StoredCountRow {
  program: MedProgram;
  cycleYear: number;
}

export interface ForecastRow {
  program: MedProgram;
  cycleYear: number;
  eventType: MedEventType;
  modelVersion: number;
  mode: 'FULL' | 'EARLY' | 'NONE';
  source: MedSource | null;
  asOf: string;
  curve: { days: number[]; p10: number[]; p50: number[]; p90: number[] };
  summary: {
    dayZeroOn: string;
    observed: number;
    meanShare: number | null;
    total: { p10: number; p50: number; p90: number } | null;
    halfDay: { p10: number; p50: number; p90: number } | null;
    basis: { cycleYear: number; source: MedSource; weight: number }[];
  };
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Fit one school: every program x charted event type that has a floored primary series in the current cycle.
 * `rows` holds the school's count rows for the current cycle and the cycles before it, already read through
 * `floorWhere`; the pure step is exported so the matrix test needs no database.
 */
export function fitSchool(args: {
  schoolId: string;
  rows: readonly ForecastCountRow[];
  cycleYear: number;
  today: string;
  dayZeroOf: (cycleYear: number) => string;
}): ForecastRow[] {
  const { schoolId, rows, cycleYear, today, dayZeroOf } = args;
  const asOf = addDays(today, -1);
  const dayZeroOn = dayZeroOf(cycleYear);
  const asOfDay = dayOfCycle(asOf, dayZeroOn);
  const endDay = dayOfCycle(cycleEndOn(cycleYear), dayZeroOn);
  const out: ForecastRow[] = [];
  for (const program of PROGRAMS) {
    for (const eventType of CHARTED_TYPES) {
      const of = (y: number) =>
        rows.filter((r) => r.program === program && r.eventType === eventType && r.cycleYear === y);
      const primary = primarySeriesOf(of(cycleYear), today);
      if (!primary) continue;
      const history: HistoryCycle[] = [];
      for (let k = 1; k <= HISTORY_CYCLES; k++) {
        const y = cycleYear - k;
        const hrows = of(y);
        let days = seriesOfSource(hrows, today, primary.source);
        let source: MedSource = primary.source;
        if (days.reduce((n, d) => n + d.count, 0) < MIN_HISTORY_TOTAL) {
          // A thin cycle may lend its SHAPE from MDApplicants; it is never added to a count of another source.
          const shape = seriesOfSource(hrows, today, 'MDAPPLICANTS');
          if (shape.reduce((n, d) => n + d.count, 0) < SHAPE_FALLBACK_MIN) continue;
          days = shape;
          source = 'MDAPPLICANTS';
        }
        history.push({ cycleYear: y, source, days: toDayCounts(days, dayZeroOf(y)) });
      }
      const result = forecastCycle({
        current: toDayCounts(primary.days, dayZeroOn),
        asOfDay,
        endDay,
        history,
        seed: fnv1a(`${schoolId}|${program}|${eventType}|${cycleYear}|${asOf}`),
      });
      out.push({
        program,
        cycleYear,
        eventType,
        modelVersion: MODEL_VERSION,
        mode: result.mode,
        source: primary.source,
        asOf,
        curve: {
          days: result.band.map((b) => b.day),
          p10: result.band.map((b) => b.p10),
          p50: result.band.map((b) => b.p50),
          p90: result.band.map((b) => b.p90),
        },
        summary: {
          dayZeroOn,
          observed: result.observed,
          meanShare: result.meanShare === null ? null : round2(result.meanShare),
          total: result.total,
          halfDay: result.halfDay,
          basis: result.basis
            .filter((b) => b.weight > 0)
            .map((b) => ({ cycleYear: b.cycleYear, source: b.source, weight: round2(b.weight) })),
        },
      });
    }
  }
  return out;
}

/** JSON with sorted keys, so a stored JSONB value (key order is the database's) compares to a fresh one. */
function stable(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stable(o[k])}`)
    .join(',')}}`;
}

const dayOf = (d: Date): string => d.toISOString().slice(0, 10);

export async function runForecast(
  deps: ForecastDeps,
  opts: { trigger: 'CRON' | 'MANUAL' },
): Promise<ForecastSummary | null> {
  const { prisma, db, log } = deps;
  const now = deps.now ?? (() => new Date());
  await closeStaleRuns(prisma, 'RMH', FORECAST_JOB, now, log);
  let run: { id: string };
  try {
    run = await prisma.medSourceRun.create({
      data: { source: 'RMH', job: FORECAST_JOB, trigger: opts.trigger, status: 'RUNNING', startedAt: now() },
    });
  } catch (e) {
    log.error(`forecast: could not open run: ${brief(e)}`);
    return null;
  }
  const close = async (summary: ForecastSummary, error: string | null): Promise<ForecastSummary> => {
    const { runId: _id, status, ...stats } = summary;
    try {
      await prisma.medSourceRun.update({ where: { id: run.id }, data: { status, finishedAt: now(), stats, error } });
    } catch (e) {
      log.error(`forecast: could not close run: ${brief(e)}`);
    }
    return summary;
  };
  const summary: ForecastSummary = {
    runId: run.id,
    status: 'OK',
    outcome: 'ran',
    cycleYear: null,
    schools: 0,
    fitted: 0,
    early: 0,
    none: 0,
    unchanged: 0,
    curves: 0,
    curvesRemoved: 0,
  };

  if (opts.trigger !== 'MANUAL') {
    let recent = true; // a ledger read error fails closed: the next cron tick tries again
    try {
      recent = await lastRealRunWithin(prisma, 'RMH', FORECAST_JOB, FORECAST_MIN_INTERVAL_MS, now());
    } catch (e) {
      log.warn(`forecast: could not read the last run: ${brief(e)}`);
    }
    if (recent) return close({ ...summary, outcome: 'skipped-min-interval' }, null);
  }

  let error: string | null = null;
  try {
    const at = now();
    const today = utcDayOf(at);
    const latest = await prisma.medCycleCount.findFirst({
      where: { eventType: 'INTERVIEW', ...floorWhere(at) },
      orderBy: { cycleYear: 'desc' },
      select: { cycleYear: true },
    });
    const cycleYear = resolveCycleYear({ latestWithData: latest?.cycleYear ?? null, now: at });
    summary.cycleYear = cycleYear;
    const years = Array.from({ length: HISTORY_CYCLES + 1 }, (_, k) => cycleYear - k);
    const cycles = await prisma.medCycle.findMany({
      where: { cycleYear: { in: years } },
      select: { cycleYear: true, dayZeroOn: true },
    });
    const zero = new Map(cycles.map((c) => [c.cycleYear, dayOf(c.dayZeroOn)]));
    const dayZeroOf = (y: number): string => zero.get(y) ?? defaultDayZero(y);
    const asOf = addDays(today, -1);
    const asOfDay = dayOfCycle(asOf, dayZeroOf(cycleYear));
    const endDay = dayOfCycle(cycleEndOn(cycleYear), dayZeroOf(cycleYear));

    // Before the cycle starts or after its last day there is nothing to forecast, and the rows the cycle ended with
    // stay as the record of what was predicted (D11): no write.
    if (asOfDay >= 0 && asOfDay < endDay) {
      const schools = await prisma.medSchool.findMany({ where: { active: true }, select: { id: true } });
      for (const school of schools) {
        if (deps.shouldStop?.()) {
          summary.status = 'PARTIAL';
          break;
        }
        const counts = await prisma.medCycleCount.findMany({
          where: {
            schoolId: school.id,
            cycleYear: { in: years },
            eventType: { in: [...CHARTED_TYPES] },
            ...floorWhere(at),
          },
          select: {
            program: true,
            cycleYear: true,
            eventType: true,
            source: true,
            date: true,
            count: true,
            contributors: true,
            publishedCount: true,
            publishedContributors: true,
          },
        });
        const rows: ForecastCountRow[] = counts.map((c) => ({
          program: c.program,
          cycleYear: c.cycleYear,
          eventType: c.eventType,
          source: c.source,
          date: dayOf(c.date),
          count: c.count,
          contributors: c.contributors,
          publishedCount: c.publishedCount ?? null,
          publishedContributors: c.publishedContributors ?? null,
        }));
        const fits = fitSchool({ schoolId: school.id, rows, cycleYear, today, dayZeroOf });
        const stored = await prisma.medForecast.findMany({
          where: { schoolId: school.id, cycleYear },
          select: {
            program: true,
            eventType: true,
            modelVersion: true,
            mode: true,
            source: true,
            asOf: true,
            curve: true,
            summary: true,
          },
        });
        const key = (p: string, t: string) => `${p}|${t}`;
        const prior = new Map(stored.map((r) => [key(r.program, r.eventType), r]));
        for (const f of fits) {
          const data = {
            modelVersion: f.modelVersion,
            mode: f.mode,
            source: f.source,
            asOf: new Date(`${f.asOf}T00:00:00.000Z`),
            curve: f.curve,
            summary: f.summary,
          };
          const had = prior.get(key(f.program, f.eventType));
          if (
            had &&
            had.modelVersion === f.modelVersion &&
            had.mode === f.mode &&
            had.source === f.source &&
            dayOf(had.asOf) === f.asOf &&
            stable(had.curve) === stable(f.curve) &&
            stable(had.summary) === stable(f.summary)
          ) {
            summary.unchanged += 1;
            continue;
          }
          await prisma.medForecast.upsert({
            where: {
              schoolId_program_cycleYear_eventType: {
                schoolId: school.id,
                program: f.program,
                cycleYear: f.cycleYear,
                eventType: f.eventType,
              },
            },
            create: {
              schoolId: school.id,
              program: f.program,
              cycleYear: f.cycleYear,
              eventType: f.eventType,
              ...data,
            },
            update: { ...data, computedAt: now() },
          });
          if (f.mode === 'FULL') summary.fitted += 1;
          else if (f.mode === 'EARLY') summary.early += 1;
          else summary.none += 1;
        }
        summary.schools += 1;
      }
    }
    log.info(
      `forecast: cycle=${cycleYear} schools=${summary.schools} fitted=${summary.fitted} early=${summary.early} none=${summary.none} unchanged=${summary.unchanged} endDay=${endDay}`,
    );
  } catch (e) {
    error = brief(e);
    summary.status = 'FAILED';
    log.error(`forecast: run failed: ${error}`);
    return close(summary, error);
  }

  // The wait curves come last: their failure makes the run PARTIAL and never hides the forecasts written above.
  if (summary.status === 'OK') {
    try {
      const r = await runWaitCurves({ prisma, db, asOf: addDays(utcDayOf(now()), -1), log });
      summary.curves = r.curves;
      summary.curvesRemoved = r.removed;
    } catch (e) {
      summary.status = 'PARTIAL';
      error = `wait curves: ${brief(e)}`;
      log.error(`forecast: ${error}`);
    }
  }
  return close(summary, error);
}
