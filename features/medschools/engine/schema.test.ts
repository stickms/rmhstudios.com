import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const PERSON_LIKE = /user.*name|author|avatar|display/i;

interface Parsed {
  model: string;
  fields: string[];
  body: string;
}

function parseModels(schemaText: string): Parsed[] {
  const out: Parsed[] = [];
  const re = /^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm;
  for (const m of schemaText.matchAll(re)) {
    const body = m[2] ?? '';
    const fields: string[] = [];
    for (const raw of body.split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('//') || line.startsWith('@@')) continue;
      // Relation fields are not columns; the scalar FK beside them is.
      if (line.includes('@relation') || /\[\]/.test(line)) continue;
      const name = line.split(/\s+/)[0];
      if (name) fields.push(name);
    }
    out.push({ model: m[1] ?? '', fields, body });
  }
  return out;
}

/**
 * The only models that may carry their owner's `userId`. A name list, not a prefix: `MedTrackerApplication`,
 * `MedTrackerMilestone` and `MedSchoolListItem` reach their owner only through a parent.
 */
const USER_OWNED = new Set([
  'MedTrackerCycle',
  'MedSchoolList',
  'MedUserPrefs',
  'MedSchoolFollow',
  'MedQaLimitRequest',
  'MedApplicantProfile',
]);

/** `Model.field` for every column that could hold a person identifier. */
function forbiddenColumns(schemaText: string): string[] {
  const hits: string[] = [];
  for (const { model, fields } of parseModels(schemaText)) {
    const allowsUserId = USER_OWNED.has(model);
    for (const f of fields) {
      if (PERSON_LIKE.test(f) || (f === 'userId' && !allowsUserId)) hits.push(`${model}.${f}`);
    }
  }
  return hits;
}

const schema = () => readFileSync('prisma/schema/medschools.prisma', 'utf8');

describe('medschools anonymization schema', () => {
  it('medschools.prisma has no person-like columns', () => {
    expect(forbiddenColumns(schema())).toEqual([]);
  });

  it('the checker catches the columns it exists to catch', () => {
    const bad = `
model MedCycleEvent {
  id String @id
  authorName String
  username String
  avatarUrl String
  displayName String
  userId String
}
model MedTrackerCycle {
  id String @id
  userId String
}
model MedSchoolList {
  id String @id
  userId String
}
model MedUserPrefs {
  userId String @id
}
model MedSchoolListItem {
  id String @id
  userId String
}
model MedTrackerMilestone {
  id String @id
  userId String
}
model MedTrackerApplication {
  id String @id
  userId String
}
`;
    const hits = forbiddenColumns(bad);
    expect(hits).toEqual([
      'MedCycleEvent.authorName',
      'MedCycleEvent.username',
      'MedCycleEvent.avatarUrl',
      'MedCycleEvent.displayName',
      'MedCycleEvent.userId',
      'MedSchoolListItem.userId',
      'MedTrackerMilestone.userId',
      'MedTrackerApplication.userId',
    ]);
    expect(hits).not.toContain('MedTrackerCycle.userId');
    expect(hits).not.toContain('MedSchoolList.userId');
    expect(hits).not.toContain('MedUserPrefs.userId');
  });

  it("MedCycleEvent has exactly the spec's columns", () => {
    const m = parseModels(schema()).find((x) => x.model === 'MedCycleEvent');
    expect(m?.fields).toEqual([
      'id',
      'schoolId',
      'cycleYear',
      'program',
      'eventType',
      'occurredAt',
      'source',
      'dedupeHash',
      'inState',
      'ingestedAt',
    ]);
  });

  it('MedCycleCount unique key is (school, program, cycle, date, type, source)', () => {
    const m = parseModels(schema()).find((x) => x.model === 'MedCycleCount');
    const line = m?.body.split('\n').find((l) => l.includes('@@unique'));
    expect(line).toBeDefined();
    const fields = /\[([^\]]+)\]/
      .exec(line ?? '')?.[1]
      ?.split(',')
      .map((s) => s.trim());
    expect(fields).toEqual(['schoolId', 'program', 'cycleYear', 'date', 'eventType', 'source']);
  });

  it('MedAdmitMember holds only a hashed member id and progress, and passes the person-like check', () => {
    const m = parseModels(schema()).find((x) => x.model === 'MedAdmitMember');
    expect(m?.fields).toEqual(['memberHash', 'state', 'attempts', 'createdAt', 'updatedAt']);
    // a hash column is fine; a raw id or a person column is not
    expect(forbiddenColumns(schema()).filter((c) => c.startsWith('MedAdmitMember.'))).toEqual([]);
    expect(forbiddenColumns('model MedAdmitMember {\n  memberUserId String @id\n  authorHash String\n}')).toEqual([
      'MedAdmitMember.authorHash',
    ]);
  });

  it('MedAdmitForumThread holds counts and a hashed cursor only: no post text, id or person column', () => {
    const m = parseModels(schema()).find((x) => x.model === 'MedAdmitForumThread');
    expect(m?.fields).toEqual([
      'id',
      'schoolId',
      'cycleYear',
      'remoteCount',
      'cursorOffset',
      'cursorPostHash',
      'postsProcessed',
      'lastPostAt',
      'parkedAt',
      'failCount',
      'createdAt',
      'updatedAt',
    ]);
    expect(forbiddenColumns(schema()).filter((c) => c.startsWith('MedAdmitForumThread.'))).toEqual([]);
    expect(m?.body).toMatch(/@@unique\(\[schoolId, cycleYear\]\)/);
  });

  it('new Admit columns pass the person-like check', () => {
    const text = schema();
    expect(text).toContain('model MedInterviewQuestion');
    expect(text).toContain('model MedInterviewProfile');
    expect(forbiddenColumns(text)).toEqual([]);
  });

  it('MedSchoolStats unique includes source and residence', () => {
    const m = parseModels(schema()).find((x) => x.model === 'MedSchoolStats');
    const line = m?.body.split('\n').find((l) => l.includes('@@unique'));
    const fields = /\[([^\]]+)\]/
      .exec(line ?? '')?.[1]
      ?.split(',')
      .map((s) => s.trim());
    expect(fields).toEqual(['schoolId', 'program', 'cycleYear', 'source', 'residence']);
    expect(m?.body).toMatch(/\bprogram\s+MedProgram\?/);
  });

  it('MedEventType has WITHDRAWN and HOLD', () => {
    const body = /enum MedEventType \{([\s\S]*?)\}/.exec(schema())?.[1] ?? '';
    const values = body
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    expect(values).toEqual(expect.arrayContaining(['WITHDRAWN', 'HOLD']));
  });

  it('MedInterviewQuestion.dedupeHash is unique', () => {
    const m = parseModels(schema()).find((x) => x.model === 'MedInterviewQuestion');
    expect(m?.body).toMatch(/dedupeHash\s+String\s+@unique/);
  });

  it('MedSdnThread exists with no person-like column', () => {
    const m = parseModels(schema()).find((x) => x.model === 'MedSdnThread');
    expect(m).toBeDefined();
    expect(m?.fields).toEqual([
      'threadId',
      'slug',
      'schoolId',
      'cycleYear',
      'degree',
      'archive',
      'repliesSeen',
      'repliesDone',
      'lastActivityAt',
      'cursorPage',
      'cursorPostHash',
      'postsProcessed',
      'parkedAt',
      'failCount',
      'createdAt',
      'updatedAt',
    ]);
    expect(forbiddenColumns(schema())).toEqual([]);
  });

  it('MedSdnThread has cursorPostHash and no postId column', () => {
    const m = parseModels(schema()).find((x) => x.model === 'MedSdnThread');
    expect(m?.fields).toContain('cursorPostHash');
    expect(m?.fields.some((f) => /^post(Id)?$|postId/i.test(f))).toBe(false);
  });

  it('MedInterviewProfile has the SDN columns', () => {
    const m = parseModels(schema()).find((x) => x.model === 'MedInterviewProfile');
    expect(m?.fields).toEqual([
      'id',
      'schoolId',
      'source',
      'format',
      'fileType',
      'avgDifficulty',
      'interviewCount',
      // feedback* are String[] columns; parseModels skips list fields
      'fetchedAt',
      'interviewStyle',
      'interviewLength',
      'avgStress',
      'avgImpression',
      'inStateCount',
      'outOfStateCount',
    ]);
  });

  it('no MedInterviewDate model exists', () => {
    expect(schema()).not.toMatch(/model\s+MedInterviewDate\b/);
  });

  describe('phase 4: private tracker, lists and preferences', () => {
    const model = (name: string) => parseModels(schema()).find((x) => x.model === name);
    const uniques = (name: string) =>
      (model(name)?.body.split('\n') ?? [])
        .filter((l) => l.includes('@@unique'))
        .map(
          (l) =>
            /\[([^\]]+)\]/
              .exec(l)?.[1]
              ?.split(',')
              .map((x) => x.trim()) ?? [],
        );

    it('only the three owner models (and the phase 7 follow, the phase 6 limit request and the phase D stats) carry userId', () => {
      for (const m of parseModels(schema())) {
        const has = m.fields.includes('userId');
        expect(has, m.model).toBe(USER_OWNED.has(m.model) && m.model !== 'MedSchoolFollow');
      }
      for (const name of ['MedTrackerApplication', 'MedTrackerMilestone', 'MedSchoolListItem']) {
        expect(model(name)?.fields, name).not.toContain('userId');
      }
    });

    it('pins the uniques the contributors = count maths rests on (D4)', () => {
      expect(uniques('MedTrackerCycle')).toContainEqual(['userId', 'cycleYear']);
      expect(uniques('MedTrackerApplication')).toContainEqual(['cycleId', 'schoolId', 'program']);
      expect(uniques('MedTrackerMilestone')).toContainEqual(['applicationId', 'type']);
    });

    it('a tracker application always has a program', () => {
      expect(model('MedTrackerApplication')?.body).toMatch(/\bprogram\s+MedProgram\s/);
      expect(model('MedTrackerApplication')?.body).not.toMatch(/\bprogram\s+MedProgram\?/);
    });

    it('sharing defaults off', () => {
      expect(model('MedTrackerCycle')?.body).toMatch(/shareAnonymously\s+Boolean\s+@default\(false\)/);
    });

    it('a list item program is a non-null ANY | REG | PHD enum with a plain unique (Q10)', () => {
      const body = /enum MedListProgram \{([\s\S]*?)\}/.exec(schema())?.[1] ?? '';
      expect(
        body
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean),
      ).toEqual(['ANY', 'REG', 'PHD']);
      expect(model('MedSchoolListItem')?.body).toMatch(/\bprogram\s+MedListProgram\s/);
      expect(uniques('MedSchoolListItem')).toContainEqual(['listId', 'schoolId', 'program']);
    });

    it('MedProgramFilter is ALL | REG | PHD and MedMilestoneType has the eleven types', () => {
      const vals = (e: string) =>
        (new RegExp(`enum ${e} \\{([\\s\\S]*?)\\}`).exec(schema())?.[1] ?? '').split(/\s+/).filter(Boolean);
      expect(vals('MedProgramFilter')).toEqual(['ALL', 'REG', 'PHD']);
      expect(vals('MedMilestoneType')).toEqual([
        'SUBMITTED',
        'COMPLETE',
        'SECONDARY',
        'SECONDARY_SUBMITTED',
        'INTERVIEW',
        'WAITLIST',
        'REJECTION',
        'ACCEPTANCE',
        'MATRICULATED',
        'WITHDRAWN',
        'HOLD',
      ]);
    });

    it('MedCycleEvent gains no column for the tracker (no link back to a milestone)', () => {
      expect(model('MedCycleEvent')?.fields.some((f) => /milestone|tracker|user/i.test(f))).toBe(false);
      expect(model('MedTrackerMilestone')?.fields.some((f) => /hash|event/i.test(f))).toBe(false);
    });

    it('the migration is additive and has no partial index (Q10)', () => {
      const dir = readdirSync('prisma/migrations').find((d) => d.endsWith('_medschools_tracker'));
      expect(dir).toBeDefined();
      const sql = readFileSync(`prisma/migrations/${dir}/migration.sql`, 'utf8');
      expect(sql).toContain('CREATE TABLE "med_tracker_cycle"');
      expect(sql).toContain('CREATE TABLE "med_school_list_item"');
      expect(sql).not.toMatch(/WHERE\s+"program"/i);
      expect(sql).not.toMatch(/\bDROP\b/i);
    });
  });
  describe('phase 5: forecasts and wait curves (aggregate only)', () => {
    const model = (name: string) => parseModels(schema()).find((x) => x.model === name);
    const uniques = (name: string) =>
      (model(name)?.body.split('\n') ?? [])
        .filter((l) => l.includes('@@unique'))
        .map(
          (l) =>
            /\[([^\]]+)\]/
              .exec(l)?.[1]
              ?.split(',')
              .map((x) => x.trim()) ?? [],
        );
    const migration = () => {
      const dir = readdirSync('prisma/migrations').find((d) => d.endsWith('_medschools_forecast'));
      expect(dir).toBeDefined();
      return readFileSync(`prisma/migrations/${dir}/migration.sql`, 'utf8');
    };

    it('both models exist and carry no person column or userId', () => {
      for (const name of ['MedForecast', 'MedWaitCurve']) {
        const m = model(name);
        expect(m, name).toBeDefined();
        expect(
          m?.fields.some(
            (f) => PERSON_LIKE.test(f) || f === 'userId' || /^member$|memberId|applicationId|cycleId/i.test(f),
          ),
        ).toBe(false);
        expect(USER_OWNED.has(name)).toBe(false);
      }
    });

    it('pins the uniques the job upserts on', () => {
      expect(uniques('MedForecast')).toContainEqual(['schoolId', 'program', 'cycleYear', 'eventType']);
      expect(uniques('MedWaitCurve')).toContainEqual(['schoolId', 'program']);
    });

    it('MedWaitCurve has exactly the aggregate columns', () => {
      expect(model('MedWaitCurve')?.fields).toEqual([
        'id',
        'schoolId',
        'program',
        'asOf',
        'computedAt',
        'members',
        'invited',
        'maxDay',
        'curve',
      ]);
    });

    it('the migration creates both tables and the enum and drops nothing', () => {
      const sql = migration();
      expect(sql).toContain('CREATE TABLE "med_forecast"');
      expect(sql).toContain('CREATE TABLE "med_wait_curve"');
      expect(sql).toContain('CREATE TYPE "MedForecastMode"');
      expect(sql).not.toMatch(/\bDROP\b/i);
    });
  });

  describe('phase 6: Q&A keeps nothing', () => {
    it('has no MedAsk or MedQa model, except the limit request (R19: a reason and a reply, no question)', () => {
      const names = parseModels(schema())
        .filter((m) => /^Med(Ask|Qa|Qna|Chat|Conversation)/i.test(m.model))
        .map((m) => m.model);
      expect(names).toEqual(['MedQaLimitRequest']);
      expect(
        parseModels(schema())
          .find((m) => m.model === 'MedQaLimitRequest')
          ?.fields.sort(),
      ).toEqual([
        'adminNote',
        'createdAt',
        'decidedAt',
        'decidedBy',
        'id',
        'note',
        'revokeNote',
        'revokedAt',
        'revokedBy',
        'status',
        'userId',
      ]);
    });

    it('no Med model has a column that could hold a question or an answer (the scraped, anonymised interview questions and the secondary prompts excepted)', () => {
      const hits: string[] = [];
      for (const { model, fields } of parseModels(schema())) {
        // The anonymised interview questions and the secondary-application prompts (institutional text, no person) are
        // the two places a "question" or "prompt" column is the point; the secondaries tests pin their exact columns.
        if (model === 'MedInterviewQuestion' || /^MedSecondary/.test(model)) continue;
        for (const f of fields) if (/question|answer|prompt|query|chat|transcript/i.test(f)) hits.push(`${model}.${f}`);
      }
      expect(hits).toEqual([]);
    });
  });
  describe('secondaries: institutional prompts, no person and no drafts', () => {
    const model = (name: string) => parseModels(schema()).find((x) => x.model === name);
    const uniques = (name: string) =>
      (model(name)?.body.split('\n') ?? [])
        .filter((l) => l.includes('@@unique'))
        .map(
          (l) =>
            /\[([^\]]+)\]/
              .exec(l)?.[1]
              ?.split(',')
              .map((x) => x.trim()) ?? [],
        );
    const vals = (e: string) =>
      (new RegExp(`enum ${e} \\{([\\s\\S]*?)\\}`).exec(schema())?.[1] ?? '')
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith('//'));
    const migration = () => {
      const dir = readdirSync('prisma/migrations').find((d) => d.endsWith('_medschools_secondaries'));
      expect(dir).toBeDefined();
      return readFileSync(`prisma/migrations/${dir}/migration.sql`, 'utf8');
    };
    const NAMES = ['MedSecondaryPrompt', 'MedSecondaryObservation', 'MedSecondaryCheck'];

    it('the three models exist, carry no person column or userId, and are not user-owned', () => {
      for (const name of NAMES) {
        const m = model(name);
        expect(m, name).toBeDefined();
        expect(
          m?.fields.some((f) => PERSON_LIKE.test(f) || f === 'userId' || /handle|post|author|draft|note/i.test(f)),
        ).toBe(false);
        expect(USER_OWNED.has(name)).toBe(false);
      }
    });

    it('pins the uniques the store upserts on', () => {
      expect(uniques('MedSecondaryPrompt')).toContainEqual(['schoolId', 'program', 'key']);
      expect(uniques('MedSecondaryObservation')).toContainEqual(['promptId', 'cycleYear', 'source']);
      expect(uniques('MedSecondaryCheck')).toContainEqual(['schoolId', 'source']);
    });

    it('pins every column (nothing person-shaped, and no draft or note, can be added silently)', () => {
      expect(model('MedSecondaryPrompt')?.fields).toEqual([
        'id',
        'schoolId',
        'program',
        'key',
        'text',
        // (`themes String[]` is skipped by `parseModels`, which treats every `[]` line as a relation.)
        'themesVersion',
        'createdAt',
        'updatedAt',
      ]);
      expect(model('MedSecondaryObservation')?.fields).toEqual([
        'id',
        'promptId',
        'cycleYear',
        'source',
        'limitKind',
        'limitValue',
        'optional',
        'sourceRef',
        'firstSeenAt',
        'lastCheckedAt',
      ]);
      expect(model('MedSecondaryCheck')?.fields).toEqual([
        'id',
        'schoolId',
        'source',
        'checkedAt',
        'status',
        'promptCount',
      ]);
    });

    it('the admissions-policy and turnaround tables are institutional text and counts: no person column, pinned', () => {
      for (const name of ['MedSchoolAdmissionsPolicy', 'MedSecondaryTurnaround']) {
        const m = model(name);
        expect(m, name).toBeDefined();
        expect(
          m?.fields.some((f) => PERSON_LIKE.test(f) || f === 'userId' || /handle|post|author|member\b/i.test(f)),
        ).toBe(false);
        expect(USER_OWNED.has(name)).toBe(false);
      }
      expect(model('MedSchoolAdmissionsPolicy')?.fields).toEqual([
        'id',
        'schoolId',
        'program',
        'rolling',
        'evidence',
        'url',
        'checkedOn',
        'source',
      ]);
      expect(model('MedSecondaryTurnaround')?.fields).toEqual([
        'id',
        'schoolId',
        'program',
        'asOf',
        'computedAt',
        'members',
        'p25Days',
        'medianDays',
        'p75Days',
      ]);
      expect(uniques('MedSchoolAdmissionsPolicy')).toContainEqual(['schoolId', 'program']);
      expect(uniques('MedSecondaryTurnaround')).toContainEqual(['schoolId', 'program']);
    });

    it('themes is a plain string array', () => {
      expect(model('MedSecondaryPrompt')?.body).toMatch(/\bthemes\s+String\[\]/);
    });

    it('the enums are exact: three sources (ADMIT, SDN, SCHOOL), not a value on MedSource', () => {
      expect(vals('MedPromptSource')).toEqual(['ADMIT', 'SDN', 'SCHOOL']);
      expect(vals('MedLimitKind')).toEqual(['WORDS', 'CHARS']);
      expect(vals('MedCheckStatus')).toEqual(['OK', 'EMPTY', 'UNAVAILABLE']);
      expect(vals('MedSource')).not.toContain('SCHOOL');
    });

    it('the migration creates the three tables and enums, adds the private milestone, and drops nothing', () => {
      const sql = migration();
      for (const t of ['med_secondary_prompt', 'med_secondary_observation', 'med_secondary_check']) {
        expect(sql).toContain(`CREATE TABLE "${t}"`);
      }
      for (const e of ['MedPromptSource', 'MedLimitKind', 'MedCheckStatus'])
        expect(sql).toContain(`CREATE TYPE "${e}"`);
      expect(sql).toContain(`ALTER TYPE "MedMilestoneType" ADD VALUE 'SECONDARY_SUBMITTED'`);
      expect(sql).not.toMatch(/\bDROP\b/i);
    });

    it('the migration sorts after every other medschools migration', () => {
      const dirs = readdirSync('prisma/migrations').filter((d) => /^\d{14}_/.test(d));
      const mine = dirs.find((d) => d.endsWith('_medschools_secondaries')) ?? '';
      // The school-pages and turnaround tables are this feature's own follow-up and sort after it, on purpose.
      const others = dirs.filter(
        (d) =>
          d.includes('medschools') &&
          d !== mine &&
          !d.endsWith('_medschools_school_pages_turnaround') &&
          !d.endsWith('_medschools_matriculated') &&
          !d.endsWith('_medschools_school_facts') &&
          !d.endsWith('_medschools_admit_curriculum') &&
          !d.endsWith('_medschools_mdphd_sources') &&
          !d.endsWith('_medschools_applicant_stats') &&
          !d.endsWith('_medschools_retire_drew_ucla'),
      );
      for (const o of others) expect(mine > o, o).toBe(true);
    });
  });
  describe('school facts: institutional, sourced, no person', () => {
    const body = () => parseModels(schema()).find((x) => x.model === 'MedSchoolFact');
    it('is institutional data: no person column, no relation to User, not user-owned (nothing to erase)', () => {
      const m = body();
      expect(m).toBeDefined();
      expect(
        m?.fields.some((f) => PERSON_LIKE.test(f) || f === 'userId' || /handle|post|author|member\b/i.test(f)),
      ).toBe(false);
      expect(m?.body).not.toMatch(/\bUser\b/);
      expect(USER_OWNED.has('MedSchoolFact')).toBe(false);
    });

    it('pins its columns and its unique key', () => {
      const m = body();
      expect(m?.fields).toEqual([
        'id',
        'schoolId',
        'program',
        'cycleYear',
        'kind',
        'valueNum',
        'valueText',
        'valueJson',
        'note',
        'source',
        'sourceUrl',
        'sourceLabel',
        'reportId',
        'page',
        'checkedOn',
      ]);
      expect(m?.body).toContain('@@unique([schoolId, program, cycleYear, kind, source])');
      expect(schema()).toMatch(
        /enum MedFactSource \{\s*AAMC_MSAR_REPORT\s*SCHOOL_PROFILE\s*ADMIT\s*SCHOOL_PAGE\s*NIH_REPORTER\s*\}/,
      );
    });

    it('the migration is additive', () => {
      const dir = readdirSync('prisma/migrations').find((d) => d.endsWith('_medschools_school_facts')) ?? '';
      const sql = readFileSync(`prisma/migrations/${dir}/migration.sql`, 'utf8');
      expect(sql).toContain('CREATE TABLE "med_school_fact"');
      expect(sql).not.toMatch(/\bDROP\b|\bALTER TABLE "(?!med_school_fact)/i);
    });

    it('the Admit curriculum migration only adds the ADMIT enum value', () => {
      const dir = readdirSync('prisma/migrations').find((d) => d.endsWith('_medschools_admit_curriculum')) ?? '';
      const sql = readFileSync(`prisma/migrations/${dir}/migration.sql`, 'utf8')
        .split('\n')
        .filter((l) => !l.startsWith('--') && l.trim() !== '')
        .join(' ');
      expect(sql).toBe(`ALTER TYPE "MedFactSource" ADD VALUE 'ADMIT';`);
      expect(dir > '20261208090000_medschools_school_facts').toBe(true);
    });

    it('the MD-PhD migration only adds the SCHOOL_PAGE and NIH_REPORTER enum values', () => {
      const dir = readdirSync('prisma/migrations').find((d) => d.endsWith('_medschools_mdphd_sources')) ?? '';
      const sql = readFileSync(`prisma/migrations/${dir}/migration.sql`, 'utf8')
        .split('\n')
        .filter((l) => !l.startsWith('--') && l.trim() !== '')
        .join(' ');
      expect(sql).toBe(
        `ALTER TYPE "MedFactSource" ADD VALUE 'SCHOOL_PAGE'; ALTER TYPE "MedFactSource" ADD VALUE 'NIH_REPORTER';`,
      );
      expect(dir > '20261209090000_medschools_admit_curriculum').toBe(true);
    });

    it('the fact kinds a source may write are validated strings, and Admit rank is none of them', async () => {
      const { CURRICULUM_KIND_IDS, FACT_KIND_IDS, FACT_SOURCES } = await import('./school-facts');
      expect(FACT_SOURCES).toContain('ADMIT');
      expect(CURRICULUM_KIND_IDS).toEqual([
        'CURRICULUM_PRECLINICAL_GRADING',
        'CURRICULUM_PRECLINICAL_LENGTH',
        'CURRICULUM_CLERKSHIP_GRADING',
        'CURRICULUM_SHELF_EXAMS',
        'CURRICULUM_MSPE',
        'CURRICULUM_LECTURE_ATTENDANCE',
        'AOA_CHAPTER',
        'HOME_HOSPITALS',
      ]);
      for (const k of CURRICULUM_KIND_IDS) expect(FACT_KIND_IDS as string[]).not.toContain(k);
      expect(CURRICULUM_KIND_IDS.join(' ')).not.toMatch(/RANK/);
    });
  });
  describe('phase D: private applicant stats', () => {
    const model = (name: string) => parseModels(schema()).find((x) => x.model === name);

    it('pins every column of the four stats models (nothing can be added silently)', () => {
      expect(model('MedApplicantProfile')?.fields).toEqual([
        'userId',
        'gpaCumulative',
        'gpaScience',
        'gpaPostbacc',
        'postbaccType',
        'gpaGraduate',
        'graduateType',
        // (`missions String[]` is skipped by `parseModels`, which treats every `[]` line as a relation.)
        'publications',
        'presentations',
        'onboardedAt',
        'createdAt',
        'updatedAt',
      ]);
      expect(model('MedApplicantProfile')?.body).toMatch(/missions\s+String\[\]\s+@default\(\[\]\)/);
      expect(model('MedMcatAttempt')?.fields).toEqual([
        'id',
        'profileId',
        'year',
        'month',
        'day',
        'total',
        'cpbs',
        'cars',
        'bbls',
        'psbb',
        'position',
      ]);
      expect(model('MedApplicantHours')?.fields).toEqual(['id', 'profileId', 'category', 'hours', 'note']);
      expect(model('MedApplicantActivity')?.fields).toEqual([
        'id',
        'profileId',
        'category',
        'title',
        'hours',
        'note',
        'position',
      ]);
    });

    it('only the profile carries userId; the children reach it through the profile and cascade', () => {
      for (const name of ['MedMcatAttempt', 'MedApplicantHours', 'MedApplicantActivity']) {
        expect(model(name)?.fields, name).not.toContain('userId');
        expect(USER_OWNED.has(name)).toBe(false);
        expect(model(name)?.body, name).toMatch(/references: \[userId\], onDelete: Cascade/);
      }
      expect(model('MedApplicantProfile')?.body).toMatch(/onDelete: Cascade/);
    });

    it('home state stays on the preferences, not on the stats', () => {
      expect(model('MedApplicantProfile')?.fields.some((f) => /state|residen/i.test(f))).toBe(false);
    });

    it('the migration creates the four tables and drops nothing', () => {
      const dir = readdirSync('prisma/migrations').find((d) => d.endsWith('_medschools_applicant_stats'));
      expect(dir).toBeDefined();
      const sql = readFileSync(`prisma/migrations/${dir}/migration.sql`, 'utf8');
      for (const t of ['med_applicant_profile', 'med_mcat_attempt', 'med_applicant_hours', 'med_applicant_activity']) {
        expect(sql).toContain(`CREATE TABLE "${t}"`);
      }
      expect(sql).not.toMatch(/\bDROP\b|\bALTER TABLE "med_(?!applicant|mcat)/i);
    });
  });
});
