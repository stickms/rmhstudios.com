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
