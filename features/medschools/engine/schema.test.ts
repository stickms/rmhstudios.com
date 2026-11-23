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
const USER_OWNED = new Set(['MedTrackerCycle', 'MedSchoolList', 'MedUserPrefs', 'MedSchoolFollow', 'MedQaLimitRequest']);

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

    it('only the three owner models (and the phase 7 follow and the phase 6 limit request) carry userId', () => {
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

    it('MedProgramFilter is ALL | REG | PHD and MedMilestoneType has the nine types', () => {
      const vals = (e: string) =>
        (new RegExp(`enum ${e} \\{([\\s\\S]*?)\\}`).exec(schema())?.[1] ?? '').split(/\s+/).filter(Boolean);
      expect(vals('MedProgramFilter')).toEqual(['ALL', 'REG', 'PHD']);
      expect(vals('MedMilestoneType')).toEqual([
        'SUBMITTED',
        'COMPLETE',
        'SECONDARY',
        'INTERVIEW',
        'WAITLIST',
        'REJECTION',
        'ACCEPTANCE',
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
      expect(parseModels(schema()).find((m) => m.model === 'MedQaLimitRequest')?.fields.sort()).toEqual([
        'adminNote',
        'createdAt',
        'decidedAt',
        'decidedBy',
        'id',
        'note',
        'status',
        'userId',
      ]);
    });

    it('no Med model has a column that could hold a question or an answer (the scraped, anonymised interview questions excepted)', () => {
      const hits: string[] = [];
      for (const { model, fields } of parseModels(schema())) {
        if (model === 'MedInterviewQuestion') continue;
        for (const f of fields) if (/question|answer|prompt|query|chat|transcript/i.test(f)) hits.push(`${model}.${f}`);
      }
      expect(hits).toEqual([]);
    });
  });
});
