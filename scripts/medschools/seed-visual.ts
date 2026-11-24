/**
 * Seeds a SCRATCH database with deterministic, synthetic fixtures for the RMH Med Schools visual check
 * (plan 2026-11-22 Task 12 Step 1, O6). Every figure below is a FIXTURE: invented, never a real count.
 *
 *   DATABASE_URL=postgresql://postgres:scratch@127.0.0.1:55432/scratch pnpm exec tsx scripts/medschools/seed-visual.ts
 *
 * Refuses to run unless DATABASE_URL points at localhost / 127.0.0.1 and the database name contains `scratch`.
 */
/* eslint-disable no-console -- a CLI: the report is its output. */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import schoolsJson from '../../data/medschools/schools.json';
import cyclesJson from '../../data/medschools/cycles.json';
import { seedRegistryIfEmpty, seedCycles } from '../../features/medschools/scrape/registry';
import { runForecast } from '../../features/medschools/scrape/run-forecast';
import { recordCheck, recordPrompts } from '../../features/medschools/scrape/secondaries-store';
import type { MedPrisma } from '../../features/medschools/scrape/types';
import type { NormalizedPrompt } from '../../features/medschools/engine/secondaries/types';

function guard(): string {
  const url = process.env.DATABASE_URL ?? '';
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new Error('seed-visual: DATABASE_URL is not a URL');
  }
  const db = u.pathname.replace(/^\//, '');
  if (!['localhost', '127.0.0.1'].includes(u.hostname) || !db.includes('scratch'))
    throw new Error(
      `seed-visual: refusing ${u.hostname}/${db}: needs a localhost host and a database name with "scratch"`,
    );
  return url;
}

const connectionString = guard();
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString, max: 3 }) });

/** mulberry32: the same sequence every run, so the screenshots are comparable. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DAY = 86_400_000;
const NOW = new Date();
const TODAY = Date.UTC(NOW.getUTCFullYear(), NOW.getUTCMonth(), NOW.getUTCDate());

const SLUGS = {
  MD: ['harvard', 'duke', 'michigan', 'johns-hopkins', 'stanford'],
  DO: ['philadelphia-com', 'kansas-city-university-com'],
};
const ALL = [...SLUGS.MD, ...SLUGS.DO];
const TYPES = ['SECONDARY', 'INTERVIEW', 'WAITLIST', 'REJECTION', 'ACCEPTANCE'] as const;
type Type = (typeof TYPES)[number];
/** Day-of-cycle window (June 1 = day 0) in which each type happens, and a per-day rate. */
const WINDOW: Record<Type, [number, number, number]> = {
  SECONDARY: [20, 150, 3],
  INTERVIEW: [60, 300, 4],
  WAITLIST: [140, 330, 1.2],
  REJECTION: [90, 330, 2],
  ACCEPTANCE: [150, 330, 1.5],
};

async function main() {
  const reg = await seedRegistryIfEmpty(prisma as never, schoolsJson as never);
  await seedCycles(
    prisma as never,
    // FIXTURE: 2025 is deliberately missing, so it reads as an estimated start.
    (cyclesJson as Array<{ cycleYear: number }>).filter((c) => c.cycleYear !== 2025) as never,
  );
  console.log('registry', reg);

  const schools = await prisma.medSchool.findMany({ where: { slug: { in: ALL } } });
  const byslug = new Map(schools.map((s) => [s.slug, s]));
  if (schools.length !== ALL.length) throw new Error('seed-visual: registry lacks a fixture school');

  // FIXTURE: clear what a previous run wrote for these schools, so a re-run is the same data.
  const ids = schools.map((s) => s.id);
  await prisma.medCycleCount.deleteMany({ where: { schoolId: { in: ids } } });
  await prisma.medCycleEvent.deleteMany({ where: { schoolId: { in: ids } } });
  await prisma.medSchoolStats.deleteMany({ where: { schoolId: { in: ids } } });
  await prisma.medInterviewQuestion.deleteMany({ where: { schoolId: { in: ids } } });
  await prisma.medInterviewProfile.deleteMany({ where: { schoolId: { in: ids } } });
  await prisma.medSdnThread.deleteMany({ where: { schoolId: { in: ids } } });

  // ---- counts: CycleTrack, Admit, SDN, REG over 2025-2027, a few PHD rows ----
  const counts: Array<{
    schoolId: string;
    program: 'REG' | 'PHD';
    cycleYear: number;
    date: Date;
    eventType: Type;
    source: 'CYCLETRACK' | 'ADMIT' | 'SDN' | 'RMH';
    count: number;
    contributors: number | null;
  }> = [];
  let seed = 7;
  for (const s of schools) {
    seed += 13;
    const rand = rng(seed);
    const scale = 0.5 + rand() * 1.5;
    for (const cycleYear of [2025, 2026, 2027]) {
      const zero = Date.UTC(cycleYear - 1, 5, 1);
      const last = cycleYear === 2027 ? Math.floor((TODAY - zero) / DAY) : 330;
      for (const type of TYPES) {
        const [from, to, rate] = WINDOW[type];
        for (let d = from; d <= Math.min(to, last); d++) {
          const bump = 0.4 + Math.abs(Math.sin(d / 23 + seed));
          const base = Math.round(rate * scale * bump * (rand() < 0.55 ? 1 : 0));
          if (base <= 0) continue;
          const date = new Date(zero + d * DAY);
          counts.push({
            schoolId: s.id,
            program: 'REG',
            cycleYear,
            date,
            eventType: type,
            source: 'CYCLETRACK',
            count: base,
            contributors: null,
          });
          if (rand() < 0.7)
            counts.push({
              schoolId: s.id,
              program: 'REG',
              cycleYear,
              date,
              eventType: type,
              source: 'ADMIT',
              count: Math.max(1, Math.round(base * (0.5 + rand()))),
              contributors: null,
            });
          if (rand() < 0.5)
            counts.push({
              schoolId: s.id,
              program: 'REG',
              cycleYear,
              date,
              eventType: type,
              source: 'SDN',
              count: Math.max(1, Math.round(base * (0.3 + rand() * 0.6))),
              contributors: null,
            });
          if (type === 'INTERVIEW' && rand() < 0.15)
            counts.push({
              schoolId: s.id,
              program: 'PHD',
              cycleYear,
              date,
              eventType: type,
              source: 'CYCLETRACK',
              count: 1 + Math.floor(rand() * 2),
              contributors: null,
            });
        }
      }
    }
  }
  // FIXTURE: today's interview invites (the `today` endpoint; CycleTrack primary, one tie, one Admit-only school).
  const todayCounts: Array<[string, 'CYCLETRACK' | 'ADMIT', number]> = [
    ['harvard', 'CYCLETRACK', 9],
    ['duke', 'CYCLETRACK', 6],
    ['michigan', 'CYCLETRACK', 6],
    ['johns-hopkins', 'CYCLETRACK', 4],
    ['philadelphia-com', 'ADMIT', 5],
    ['kansas-city-university-com', 'CYCLETRACK', 3],
  ];
  for (const [slug, source, count] of todayCounts) {
    const schoolId = byslug.get(slug)!.id;
    const i = counts.findIndex(
      (c) =>
        c.schoolId === schoolId &&
        c.cycleYear === 2027 &&
        c.eventType === 'INTERVIEW' &&
        c.source === source &&
        c.program === 'REG' &&
        c.date.getTime() === TODAY,
    );
    if (i >= 0) counts.splice(i, 1);
    counts.push({
      schoolId,
      program: 'REG',
      cycleYear: 2027,
      date: new Date(TODAY),
      eventType: 'INTERVIEW',
      source,
      count,
      contributors: null,
    });
  }
  // FIXTURE: an RMH row with contributors: 2, under the k floor, which must stay invisible.
  counts.push({
    schoolId: byslug.get('harvard')!.id,
    program: 'REG',
    cycleYear: 2027,
    date: new Date(TODAY),
    eventType: 'INTERVIEW',
    source: 'RMH',
    count: 99,
    contributors: 2,
  });
  // FIXTURE: one wave. Harvard's primary (CycleTrack) interview count for yesterday is many times its trailing median, so
  // the Activity chart draws a wave tick and the live feed marks the school's invites of that day "Part of a wave".
  const WAVE_ON = TODAY - DAY;
  const waveSchool = byslug.get('harvard')!.id;
  const w = counts.findIndex(
    (c) =>
      c.schoolId === waveSchool &&
      c.cycleYear === 2027 &&
      c.eventType === 'INTERVIEW' &&
      c.source === 'CYCLETRACK' &&
      c.program === 'REG' &&
      c.date.getTime() === WAVE_ON,
  );
  if (w >= 0) counts.splice(w, 1);
  counts.push({
    schoolId: waveSchool,
    program: 'REG',
    cycleYear: 2027,
    date: new Date(WAVE_ON),
    eventType: 'INTERVIEW',
    source: 'CYCLETRACK',
    count: 140,
    contributors: null,
  });
  await prisma.medCycleCount.createMany({ data: counts, skipDuplicates: true });
  console.log('counts', counts.length);

  // ---- live feed: ~40 events over three days, null-program ones, several sharing one occurredAt ----
  const rand = rng(99);
  const kinds = [
    'INTERVIEW',
    'INTERVIEW',
    'INTERVIEW',
    'SECONDARY',
    'ACCEPTANCE',
    'WAITLIST',
    'REJECTION',
    'WITHDRAWN',
    'HOLD',
  ] as const;
  const events: Array<{
    schoolId: string;
    cycleYear: number;
    program: 'REG' | 'PHD' | null;
    eventType: (typeof kinds)[number];
    occurredAt: Date;
    source: 'ADMIT' | 'SDN';
    dedupeHash: string;
    inState: boolean | null;
  }> = [];
  const tieAt = NOW.getTime() - 95 * 60_000;
  for (let i = 0; i < 40; i++) {
    const slug = ALL[Math.floor(rand() * ALL.length)]!;
    // The first 6 share one instant (ties); the rest spread back over ~60 hours.
    const at = i < 6 ? tieAt : NOW.getTime() - (i - 5) * (1 + rand() * 2.2) * 40 * 60_000;
    const p = rand();
    events.push({
      schoolId: byslug.get(slug)!.id,
      cycleYear: 2027,
      program: p < 0.3 ? null : p < 0.4 ? 'PHD' : 'REG',
      eventType: kinds[Math.floor(rand() * kinds.length)]!,
      occurredAt: new Date(at),
      source: rand() < 0.6 ? 'ADMIT' : 'SDN',
      dedupeHash: `fixture-event-${i}`,
      inState: rand() < 0.5 ? null : rand() < 0.5,
    });
  }
  // FIXTURE: three of Harvard's invites on the wave day (the feed marks each "Part of a wave").
  for (const [i, hour] of [14, 15, 16].entries())
    events.push({
      schoolId: byslug.get('harvard')!.id,
      cycleYear: 2027,
      program: 'REG',
      eventType: 'INTERVIEW',
      occurredAt: new Date(TODAY - DAY + hour * 3_600_000 + 17 * 60_000),
      source: 'ADMIT',
      dedupeHash: `fixture-wave-${i}`,
      inState: null,
    });
  await prisma.medCycleEvent.createMany({ data: events, skipDuplicates: true });
  console.log('events', events.length, 'null-program', events.filter((e) => e.program === null).length);

  // FIXTURE: timed Admit interview reports at Harvard across three cycles, so "when results arrive" has enough events to
  // draw (the chart needs 10 in all and 3 in a cycle; the live feed above is only a few hours deep). Weekday and hour are
  // skewed the way real invites are (weekday afternoons) so the bars are not flat.
  const arrivals: typeof events = [];
  const arand = rng(2027);
  for (const [cycleYear, count] of [
    [2027, 40],
    [2026, 55],
    [2025, 45],
  ] as const) {
    for (let i = 0; i < count; i++) {
      const day = Math.floor(arand() * 60);
      let at = Date.UTC(cycleYear - 1, 9, 1 + day, 14 + Math.floor(arand() * 6), Math.floor(arand() * 60));
      if (cycleYear === 2027 && at > NOW.getTime()) at = NOW.getTime() - Math.floor(arand() * 20) * 3_600_000;
      arrivals.push({
        schoolId: byslug.get('harvard')!.id,
        cycleYear,
        program: 'REG',
        eventType: 'INTERVIEW',
        occurredAt: new Date(at),
        source: 'ADMIT',
        dedupeHash: `fixture-arrival-${cycleYear}-${i}`,
        inState: null,
      });
    }
  }
  await prisma.medCycleEvent.createMany({ data: arrivals, skipDuplicates: true });
  console.log('arrival events', arrivals.length);

  // ---- stats, profiles, questions, threads ----
  for (const s of schools) {
    const r = rng(s.slug.length * 31);
    const gpa = 3.6 + r() * 0.3;
    const mcat = 508 + Math.floor(r() * 14);
    const row = {
      schoolId: s.id,
      cycleYear: 2027,
      gpaMedian: +gpa.toFixed(2),
      gpaLow: +(gpa - 0.25).toFixed(2),
      gpaHigh: +Math.min(4, gpa + 0.2).toFixed(2),
      mcatMedian: mcat,
      mcatLow: mcat - 6,
      mcatHigh: mcat + 5,
      interviewToAcceptancePct: +(20 + r() * 30).toFixed(1),
      applicationToInterviewPct: +(5 + r() * 15).toFixed(1),
      applicationCount: 4000 + Math.floor(r() * 6000),
      interviewCount: 300 + Math.floor(r() * 400),
      admittedCount: 100 + Math.floor(r() * 120),
      contributors: 40 + Math.floor(r() * 80),
    };
    await prisma.medSchoolStats.createMany({
      data: [
        { ...row, source: 'CYCLETRACK', residence: 'GLOBAL', program: 'REG' },
        { ...row, source: 'ADMIT', residence: 'GLOBAL', program: null },
        // FIXTURE: contributors: 2, below the floor; the page must not show this split.
        { ...row, source: 'CYCLETRACK', residence: 'IN_STATE', program: 'REG', contributors: 2 },
      ],
      skipDuplicates: true,
    });
    await prisma.medInterviewProfile.createMany({
      data: [
        {
          schoolId: s.id,
          source: 'ADMIT',
          format: 'Multiple mini interviews',
          fileType: 'Traditional',
          avgDifficulty: 2.4,
          interviewCount: 41,
          feedbackPositive: ['Fixture: the day was well organised.', 'Fixture: current students were candid.'],
          feedbackNegative: ['Fixture: long wait between stations.'],
          feedbackBefore: ['Fixture: read the mission statement.'],
          fetchedAt: NOW,
          interviewStyle: 'Open file',
          interviewLength: '45 minutes',
          avgStress: 2.9,
          inStateCount: 5,
          outOfStateCount: 2,
        },
        {
          schoolId: s.id,
          source: 'SDN',
          interviewCount: 28,
          feedbackPositive: [],
          feedbackNegative: [],
          feedbackBefore: [],
          fetchedAt: NOW,
          avgImpression: 0.62,
        },
      ],
      skipDuplicates: true,
    });
    await prisma.medInterviewQuestion.createMany({
      data: [
        'Fixture question: why this school and why now?',
        'Fixture question: describe a time you disagreed with a teammate.',
        'Fixture question: how would you spend a free afternoon on the wards?',
        'Fixture question: what does an ethical dilemma look like to you?',
      ].map((text, i) => ({
        schoolId: s.id,
        text,
        source: 'ADMIT' as const,
        votes: 12 - i * 3,
        cycleYear: 2027,
        dedupeHash: `fixture-q-${s.slug}-${i}`,
      })),
      skipDuplicates: true,
    });
    await prisma.medSdnThread.createMany({
      data: [2027, 2026].map((cycleYear, i) => ({
        threadId: 9_000_000 + s.slug.length * 100 + s.slug.charCodeAt(0) * 10 + i,
        slug: `fixture-${s.slug}-${cycleYear}`,
        schoolId: s.id,
        cycleYear,
        degree: s.degree,
        archive: cycleYear < 2027,
        repliesSeen: 120,
        lastActivityAt: NOW,
      })),
      skipDuplicates: true,
    });
  }

  // ---- tracker: 24 sharing members at one school, so the wait curve clears its floor of 20 (D6) ----
  // FIXTURE members, `visual-fixture-*` addresses; a re-run deletes them (their tracker rows cascade) and writes them again.
  const cycleYear = NOW.getUTCMonth() < 5 ? NOW.getUTCFullYear() : NOW.getUTCFullYear() + 1;
  const curveSchool = byslug.get('duke')!.id;
  await prisma.user.deleteMany({ where: { email: { startsWith: 'visual-fixture-' } } });
  const MEMBERS = 24;
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const mrand = rng(5150);
  for (let i = 0; i < MEMBERS; i++) {
    const user = await prisma.user.create({
      data: {
        name: `Fixture member ${i}`,
        email: `visual-fixture-${i}@example.test`,
        createdAt: new Date(TODAY - 60 * DAY),
      },
    });
    const completeAt = TODAY - (25 + i * 5) * DAY;
    const wait = 10 + Math.floor(mrand() * 70);
    const invited = i % 5 !== 4 && completeAt + wait * DAY < TODAY - DAY;
    const rejected = !invited && i % 5 === 4 && completeAt + 40 * DAY < TODAY - DAY;
    const milestones = [
      { type: 'SUBMITTED' as const, date: new Date(completeAt - 12 * DAY) },
      { type: 'COMPLETE' as const, date: new Date(completeAt) },
      // Secondary received a few days after complete, submitted 3 to 14 days later (the turnaround figure's input).
      { type: 'SECONDARY' as const, date: new Date(completeAt + 5 * DAY) },
      { type: 'SECONDARY_SUBMITTED' as const, date: new Date(completeAt + (8 + (i % 12)) * DAY) },
      ...(invited ? [{ type: 'INTERVIEW' as const, date: new Date(completeAt + wait * DAY) }] : []),
      ...(rejected ? [{ type: 'REJECTION' as const, date: new Date(completeAt + 40 * DAY) }] : []),
    ];
    await prisma.medTrackerCycle.create({
      data: {
        userId: user.id,
        cycleYear,
        shareAnonymously: true,
        applications: { create: { schoolId: curveSchool, program: 'REG', milestones: { create: milestones } } },
      },
    });
  }
  console.log('sharing members', MEMBERS, 'at duke; first complete', iso(TODAY - 25 * DAY));

  // ---- secondaries: FIXTURE prompts through the real store, so the marks are the engine's own ----
  // harvard: two cycles of regular and MD-PhD prompts with every mark (same, reworded, new, not seen), an optional one, a
  // character limit and a gap in the years; the school's own page and an admissions statement. duke: the same shape plus the
  // turnaround of its 24 members. michigan: only last cycle's list (not out yet). stanford: this cycle only (a first year, no
  // marks). johns-hopkins: nothing found. philadelphia-com (DO): regular and DO-PhD prompts.
  const siteCycle = cycleYear;
  const db = prisma as unknown as MedPrisma;
  const sids = ALL.map((slug) => byslug.get(slug)!.id);
  await prisma.medSecondaryPrompt.deleteMany({ where: { schoolId: { in: sids } } });
  await prisma.medSecondaryCheck.deleteMany({ where: { schoolId: { in: sids } } });
  await prisma.medSchoolAdmissionsPolicy.deleteMany({ where: { schoolId: { in: sids } } });
  const P = (
    year: number,
    program: 'REG' | 'PHD',
    text: string,
    limit: NormalizedPrompt['limit'] = { kind: 'WORDS', value: 250 },
    optional = false,
    sourceRef: string | null = null,
  ): NormalizedPrompt => ({ cycleYear: year, program, text, limit, optional, sourceRef });
  const T = {
    same: 'Describe your research experience and what you learned from it.',
    before: 'Describe a challenge you have faced and how you overcame it.',
    after: 'Tell us about a challenge you faced and how you overcame it.',
    added: 'Why are you interested in our medical school and what will you add to it?',
    dropped: 'Describe a hobby you pursue outside of school and what it taught you.',
    optional: 'Is there anything else you would like us to know about your application?',
    longer:
      'Please reflect on a time when your values were tested, describing the situation, the people involved, what you decided to do and why, how others responded, and what you would do differently if you faced the same choice today.',
    phd: 'Why do you want to pursue a combined MD-PhD degree and what is your research goal?',
    phd2: 'Describe the research that shaped your decision to seek an MD-PhD, and your role in it.',
  };
  const full = (
    cy: number,
    ref: string,
  ): { admit: NormalizedPrompt[]; sdn: NormalizedPrompt[]; school: NormalizedPrompt[] } => ({
    admit: [
      P(cy - 3, 'REG', T.dropped),
      P(cy - 2, 'REG', T.dropped),
      P(cy - 2, 'REG', T.same),
      P(cy - 1, 'REG', T.same),
      P(cy - 1, 'REG', T.before),
      P(cy - 1, 'REG', T.dropped),
      P(cy, 'REG', T.same),
      P(cy, 'REG', T.after),
      P(cy, 'REG', T.added, { kind: 'WORDS', value: 500 }),
      P(cy, 'REG', T.optional, { kind: 'CHARS', value: 1500 }, true),
      P(cy, 'REG', T.longer, { kind: 'WORDS', value: 1 }),
      P(cy - 1, 'PHD', T.phd, { kind: 'WORDS', value: 400 }),
      P(cy, 'PHD', T.phd, { kind: 'WORDS', value: 400 }),
      P(cy, 'PHD', T.phd2, { kind: 'WORDS', value: 300 }),
    ],
    sdn: [P(cy, 'REG', T.same), P(cy - 1, 'REG', T.before)],
    school: [P(cy, 'REG', T.added, { kind: 'WORDS', value: 500 }, false, ref)],
  });
  const writeFull = async (slug: string, ref: string) => {
    const id = byslug.get(slug)!.id;
    const f = full(siteCycle, ref);
    await recordPrompts(db, { schoolId: id, source: 'ADMIT', now: NOW, prompts: f.admit, siteCycle });
    await recordPrompts(db, { schoolId: id, source: 'SDN', now: NOW, prompts: f.sdn, siteCycle });
    await recordPrompts(db, { schoolId: id, source: 'SCHOOL', now: NOW, prompts: f.school, siteCycle });
    for (const source of ['ADMIT', 'SDN', 'SCHOOL'] as const)
      await recordCheck(db, { schoolId: id, source, now: NOW, status: 'OK', promptCount: 5 });
    await prisma.medSchoolAlias.upsert({
      where: { source_sourceKey: { source: 'ADMIT', sourceKey: slug } },
      create: { schoolId: id, source: 'ADMIT', sourceKey: slug },
      update: {},
    });
  };
  await writeFull('harvard', 'https://med.harvard.example.edu/secondary');
  await writeFull('duke', 'https://med.duke.example.edu/secondary');
  const only = async (slug: string, year: number, texts: [string, 'REG' | 'PHD'][]) =>
    recordPrompts(db, {
      schoolId: byslug.get(slug)!.id,
      source: 'ADMIT',
      now: NOW,
      prompts: texts.map(([t, program]) => P(year, program, t)),
      siteCycle,
    });
  await only('michigan', siteCycle - 1, [
    [T.before, 'REG'],
    [T.same, 'REG'],
  ]);
  await only('stanford', siteCycle, [
    [T.before, 'REG'],
    [T.same, 'REG'],
    [T.phd, 'PHD'],
  ]);
  await only('philadelphia-com', siteCycle, [
    [T.same, 'REG'],
    [T.phd, 'PHD'],
  ]);
  await only('philadelphia-com', siteCycle - 1, [[T.same, 'REG']]);
  await recordCheck(db, {
    schoolId: byslug.get('johns-hopkins')!.id,
    source: 'ADMIT',
    now: NOW,
    status: 'EMPTY',
    promptCount: 0,
  });
  for (const [slug, program, rolling, evidence] of [
    ['harvard', 'REG', true, 'Admissions decisions are made on a rolling basis beginning in October.'],
    ['harvard', 'PHD', false, 'MD-PhD applicants are notified of decisions on March 1.'],
    ['duke', 'REG', false, 'All applicants receive decisions on the same date in March.'],
  ] as const)
    await prisma.medSchoolAdmissionsPolicy.create({
      data: {
        schoolId: byslug.get(slug)!.id,
        program,
        rolling,
        evidence,
        url: `https://med.${slug}.example.edu/admissions`,
        checkedOn: new Date(Date.UTC(2026, 10, 23)),
        source: 'SCHOOL',
      },
    });
  console.log(
    'secondaries: fixture prompts for',
    ['harvard', 'duke', 'michigan', 'stanford', 'philadelphia-com'].join(', '),
  );

  // ---- the forecast job and the wait curves, run directly (what the worker's daily queue does) ----
  await prisma.medForecast.deleteMany({ where: { schoolId: { in: ids } } });
  await prisma.medWaitCurve.deleteMany({ where: { schoolId: { in: ids } } });
  await prisma.medSecondaryTurnaround.deleteMany({ where: { schoolId: { in: ids } } });
  const log = { info: console.log, warn: console.warn, error: console.error };
  const forecast = await runForecast({ prisma: prisma as never, db: prisma, log }, { trigger: 'MANUAL' });
  console.log('forecast', JSON.stringify(forecast));

  console.log('slugs MD:', SLUGS.MD.join(', '));
  console.log('slugs DO:', SLUGS.DO.join(', '));
  console.log('FIXTURE data only: nothing here is a real figure.');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
