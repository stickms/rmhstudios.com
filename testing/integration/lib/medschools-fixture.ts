/**
 * A minimal FIXTURE data set for the RMH Med Schools black-box test, written straight to Postgres.
 *
 * Every figure is invented. One active MD school under a test-only slug carries: CycleTrack and Admit interview counts
 * in the current cycle, an RMH count row of 99 on 2 contributors (under the k floor, so it must never surface), ADMIT
 * and SDN events including a null-program one and several that share one `occurredAt`, an IN_STATE stats row on 2
 * contributors (under the floor), a GLOBAL stats row and an interview profile whose split is 5 and 2.
 *
 * Cleanup is one `delete from med_school`: every other row cascades from it. The seed is idempotent (it deletes first),
 * so a database that already holds `scripts/medschools/seed-visual.ts` data works too: its rows are never touched.
 */
import { db } from './client';

export const MEDSCHOOL_FIXTURE_SLUG = 'it-medschools-fixture';
const SCHOOL_ID = 'it-medschools-fixture-school';
const DAY = 86_400_000;

/** The entry year the site resolves as current (secondaries open June 1; mirrors `cycleYearOf(now, 'SECONDARY')`). */
function currentCycle(now: Date): number {
  return now.getUTCMonth() < 5 ? now.getUTCFullYear() : now.getUTCFullYear() + 1;
}

export async function removeMedSchoolsFixture(): Promise<void> {
  await db().query('delete from med_school where slug = $1 or id = $2', [MEDSCHOOL_FIXTURE_SLUG, SCHOOL_ID]);
}

export async function seedMedSchoolsFixture(now: Date = new Date()): Promise<void> {
  await removeMedSchoolsFixture();
  const q = (text: string, values: unknown[] = []) => db().query(text, values);
  const cycle = currentCycle(now);
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const day = (ago: number) => new Date(today - ago * DAY).toISOString().slice(0, 10);

  await q(
    `insert into med_school (id, slug, name, "shortName", degree, city, state, active, "updatedAt")
     values ($1, $2, 'Fixture University School of Medicine', 'Fixture', 'MD', 'Durham', 'NC', true, now())`,
    [SCHOOL_ID, MEDSCHOOL_FIXTURE_SLUG],
  );

  const counts: Array<[string, string, number, number | null, number]> = [
    ['CYCLETRACK', 'INTERVIEW', 4, null, 0],
    ['CYCLETRACK', 'INTERVIEW', 6, null, 1],
    ['CYCLETRACK', 'ACCEPTANCE', 2, null, 2],
    ['ADMIT', 'INTERVIEW', 3, null, 0],
    ['ADMIT', 'INTERVIEW', 5, null, 2],
    ['ADMIT', 'SECONDARY', 7, null, 3],
    ['RMH', 'INTERVIEW', 99, 2, 0],
  ];
  for (const [i, [source, eventType, count, contributors, ago]] of counts.entries()) {
    await q(
      `insert into med_cycle_count (id, "schoolId", program, "cycleYear", date, "eventType", source, count, contributors)
       values ($1, $2, 'REG', $3, $4::date, $5::"MedEventType", $6::"MedSource", $7, $8)`,
      [`it-medschools-count-${i}`, SCHOOL_ID, cycle, day(ago), eventType, source, count, contributors],
    );
  }

  // Three events share one occurredAt (cursor ties); one has no program.
  const at = (ago: number, hour: number) => new Date(today - ago * DAY + hour * 3_600_000 + 42_000).toISOString();
  const events: Array<[string, string, string | null, string]> = [
    ['ADMIT', 'INTERVIEW', 'REG', at(0, 1)],
    ['SDN', 'INTERVIEW', 'REG', at(0, 1)],
    ['ADMIT', 'ACCEPTANCE', 'PHD', at(0, 1)],
    ['ADMIT', 'INTERVIEW', null, at(1, 5)],
    ['SDN', 'SECONDARY', null, at(2, 9)],
    ['SDN', 'REJECTION', 'REG', at(3, 12)],
  ];
  for (const [i, [source, eventType, program, occurredAt]] of events.entries()) {
    await q(
      `insert into med_cycle_event (id, "schoolId", "cycleYear", program, "eventType", "occurredAt", source, "dedupeHash")
       values ($1, $2, $3, $4::"MedProgram", $5::"MedEventType", $6::timestamp, $7::"MedSource", $8)`,
      [`it-medschools-event-${i}`, SCHOOL_ID, cycle, program, eventType, occurredAt, source, `fixture-event-it-${i}`],
    );
  }

  for (const [i, [residence, contributors]] of [
    ['GLOBAL', null],
    ['IN_STATE', 2],
  ].entries()) {
    await q(
      `insert into med_school_stats (id, "schoolId", source, residence, program, "cycleYear", "gpaMedian", contributors)
       values ($1, $2, 'CYCLETRACK', $3::"MedResidence", null, $4, 3.9, $5)`,
      [`it-medschools-stats-${i}`, SCHOOL_ID, residence, cycle, contributors],
    );
  }

  await q(
    `insert into med_interview_profile
       (id, "schoolId", source, format, "feedbackPositive", "feedbackNegative", "feedbackBefore", "fetchedAt",
        "inStateCount", "outOfStateCount")
     values ('it-medschools-profile', $1, 'ADMIT', 'Panel', '{}', '{}', '{}', now(), 5, 2)`,
    [SCHOOL_ID],
  );
}

/* ───────────────────────── the private tracker fixture (phase 4) ───────────────────────── */

/**
 * Two schools for `medschools-private.test.ts`, kept apart from the public fixture above so that file's "no RMH series"
 * assertions stay true: an MD school and a DO school with no counts or events of their own, plus filler schools the list
 * cap test needs (200 items need more than the two schools a list can hold three programs of).
 */
export const PRIVATE_MD_SLUG = 'it-medschools-private-md';
export const PRIVATE_DO_SLUG = 'it-medschools-private-do';
export const PRIVATE_MD_ID = 'it-medschools-private-md-school';
export const PRIVATE_DO_ID = 'it-medschools-private-do-school';
const FILLER_PREFIX = 'it-medschools-private-filler-';

export async function removeTrackerFixture(userIds: readonly string[] = []): Promise<void> {
  const q = (text: string, values: unknown[] = []) => db().query(text, values);
  // Tracker cycles and lists hang off the user, not the school, so they go by user id (the schools cascade the rest).
  if (userIds.length > 0) {
    await q('delete from med_tracker_cycle where "userId" = any($1)', [userIds]);
    await q('delete from med_school_list where "userId" = any($1)', [userIds]);
    await q('delete from med_user_prefs where "userId" = any($1)', [userIds]);
  }
  await q('delete from med_school where slug = any($1) or id = any($2) or slug like $3', [
    [PRIVATE_MD_SLUG, PRIVATE_DO_SLUG],
    [PRIVATE_MD_ID, PRIVATE_DO_ID],
    `${FILLER_PREFIX}%`,
  ]);
}

export async function seedTrackerFixture(userIds: readonly string[] = []): Promise<void> {
  await removeTrackerFixture(userIds);
  const q = (text: string, values: unknown[] = []) => db().query(text, values);
  for (const [id, slug, name, degree] of [
    [PRIVATE_MD_ID, PRIVATE_MD_SLUG, 'Tracker Fixture School of Medicine', 'MD'],
    [PRIVATE_DO_ID, PRIVATE_DO_SLUG, 'Tracker Fixture College of Osteopathic Medicine', 'DO'],
  ] as const) {
    await q(
      `insert into med_school (id, slug, name, "shortName", degree, city, state, active, "updatedAt")
       values ($1, $2, $3, $4, $5::"MedDegree", 'Durham', 'NC', true, now())`,
      [id, slug, name, name.split(' ')[0], degree],
    );
  }
}

/** Inactive schools used only to fill a list to its cap; never reachable from a public page. */
export async function seedFillerSchools(n: number): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < n; i += 1) {
    const id = `${FILLER_PREFIX}${i}`;
    await db().query(
      `insert into med_school (id, slug, name, "shortName", degree, city, state, active, "updatedAt")
       values ($1, $1, $2, $2, 'MD', 'Durham', 'NC', false, now())`,
      [id, `Filler ${i}`],
    );
    ids.push(id);
  }
  return ids;
}

/** Anonymous RMH events at a school (the rows the public figures are built from). */
export async function rmhEventCount(schoolId: string): Promise<number> {
  const r = await db().query(
    `select count(*)::int as n from med_cycle_event where "schoolId" = $1 and source = 'RMH'`,
    [schoolId],
  );
  return r.rows[0].n;
}

export interface RmhCountRow {
  date: string;
  eventType: string;
  count: number;
  contributors: number | null;
  publishedCount: number | null;
  publishedContributors: number | null;
}

export async function rmhCountRows(schoolId: string): Promise<RmhCountRow[]> {
  const r = await db().query(
    `select to_char(date, 'YYYY-MM-DD') as date, "eventType"::text as "eventType", count, contributors,
            "publishedCount", "publishedContributors"
     from med_cycle_count where "schoolId" = $1 and source = 'RMH' order by date, "eventType"`,
    [schoolId],
  );
  return r.rows;
}

/**
 * The cells a from-scratch recompute of the RMH events gives (`date|type|program|cycle -> n`) and the cells the count
 * rows hold (zero rows, which the daily job removes, left out); equal when the writer kept them in step.
 */
export async function rmhRecompute(schoolId: string): Promise<{ fromEvents: string[]; fromCounts: string[] }> {
  const ev = await db().query(
    `select to_char("occurredAt"::date, 'YYYY-MM-DD') as day, "eventType"::text as t, program::text as p, "cycleYear" as c,
            count(*)::int as n
     from med_cycle_event where "schoolId" = $1 and source = 'RMH' group by 1, 2, 3, 4 order by 1, 2, 3, 4`,
    [schoolId],
  );
  const ct = await db().query(
    `select to_char(date, 'YYYY-MM-DD') as day, "eventType"::text as t, program::text as p, "cycleYear" as c,
            count, contributors
     from med_cycle_count where "schoolId" = $1 and source = 'RMH' and count > 0 order by 1, 2, 3, 4`,
    [schoolId],
  );
  return {
    fromEvents: ev.rows.map((r) => `${r.day}|${r.t}|${r.p}|${r.c}|${r.n}|${r.n}`),
    fromCounts: ct.rows.map((r) => `${r.day}|${r.t}|${r.p}|${r.c}|${r.count}|${r.contributors}`),
  };
}
