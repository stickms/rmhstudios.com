import { describe, expect, it } from 'vitest';
import { buildSchoolView, type StoredPrompt } from '../engine/secondaries/view';
import { MAX_TEXT } from '../engine/secondaries/text';
import { THEMES_VERSION } from '../engine/secondaries/themes';
import type { NormalizedPrompt } from '../engine/secondaries/types';
import {
  recordCheck,
  recordPrompts,
  retagThemes,
  sanitizeSourceRef,
  storedObservationCount,
  type RecordInput,
} from './secondaries-store';
import { NEEDLES, assertNoLeak, createFakePrisma } from './test-support';
import type { MedSecondaryObservationRow, MedSecondaryPromptRow } from './types';

const NOW = new Date('2026-11-23T05:35:00Z');
const LATER = new Date('2026-11-26T05:35:00Z');
const SITE = 2027;

const prompt = (over: Partial<NormalizedPrompt> = {}): NormalizedPrompt => ({
  cycleYear: 2027,
  program: 'REG',
  text: 'Describe a challenge you have faced and how you responded.',
  limit: { kind: 'WORDS', value: 250 },
  optional: false,
  sourceRef: 'https://med.admit.org/secondary-essays/harvard',
  ...over,
});

const input = (over: Partial<RecordInput> = {}): RecordInput => ({
  schoolId: 's1',
  source: 'ADMIT',
  now: NOW,
  prompts: [prompt()],
  siteCycle: SITE,
  ...over,
});

function setup() {
  const fake = createFakePrisma();
  const prompts = () => fake.tables.medSecondaryPrompt as MedSecondaryPromptRow[];
  const obs = () => fake.tables.medSecondaryObservation as MedSecondaryObservationRow[];
  /** The rows as the read model takes them (what Task 11's service builds from Prisma). */
  const stored = (schoolId = 's1'): StoredPrompt[] =>
    prompts()
      .filter((p) => p.schoolId === schoolId)
      .map((p) => ({
        id: p.id,
        program: p.program,
        text: p.text,
        themes: p.themes,
        observations: obs()
          .filter((o) => o.promptId === p.id)
          .map((o) => ({
            cycleYear: o.cycleYear,
            source: o.source,
            limit: o.limitKind && o.limitValue ? { kind: o.limitKind, value: o.limitValue } : null,
            optional: o.optional,
            sourceRef: o.sourceRef,
            lastCheckedAt: o.lastCheckedAt,
          })),
      }));
  return { ...fake, prompts, obs, stored };
}

describe('recordPrompts', () => {
  it('creates one prompt with its key and themes and one observation', async () => {
    const t = setup();
    const r = await recordPrompts(t.prisma, input());
    expect(r).toEqual({ prompts: 1, created: 1, observed: 1, unchanged: 0, rejected: 0 });
    expect(t.prompts()).toHaveLength(1);
    expect(t.prompts()[0]).toMatchObject({
      schoolId: 's1',
      program: 'REG',
      key: 'describe a challenge you have faced and how you responded',
      text: 'Describe a challenge you have faced and how you responded.',
      themes: ['challenge'],
      themesVersion: THEMES_VERSION,
    });
    expect(t.obs()).toHaveLength(1);
    expect(t.obs()[0]).toMatchObject({
      cycleYear: 2027,
      source: 'ADMIT',
      limitKind: 'WORDS',
      limitValue: 250,
      optional: false,
      sourceRef: 'https://med.admit.org/secondary-essays/harvard',
      firstSeenAt: NOW,
      lastCheckedAt: NOW,
    });
  });

  it('recording the same input again is unchanged: no new rows, only lastCheckedAt moves', async () => {
    const t = setup();
    await recordPrompts(t.prisma, input());
    const again = await recordPrompts(t.prisma, input({ now: LATER }));
    expect(again).toEqual({ prompts: 1, created: 0, observed: 0, unchanged: 1, rejected: 0 });
    expect(t.prompts()).toHaveLength(1);
    expect(t.obs()).toHaveLength(1);
    expect(t.obs()[0]).toMatchObject({ firstSeenAt: NOW, lastCheckedAt: LATER });
  });

  it('never double counts: Admit and SDN seeing one prompt share a row and one cycle', async () => {
    const t = setup();
    await recordPrompts(t.prisma, input({ source: 'ADMIT' }));
    await recordPrompts(
      t.prisma,
      input({ source: 'SDN', prompts: [prompt({ sourceRef: 'https://www.studentdoctor.net/x' })] }),
    );
    expect(t.prompts()).toHaveLength(1);
    expect(
      t
        .obs()
        .map((o) => o.source)
        .sort(),
    ).toEqual(['ADMIT', 'SDN']);
    const [prog] = buildSchoolView(t.stored(), SITE);
    expect(prog?.prompts).toHaveLength(1);
    expect(prog?.prompts[0]?.cycles).toEqual([2027]);
    expect(prog?.prompts[0]?.sources).toEqual(['ADMIT', 'SDN']);
  });

  it('wording noise does not fork a prompt; a changed limit updates the observation', async () => {
    const t = setup();
    await recordPrompts(t.prisma, input());
    const r = await recordPrompts(
      t.prisma,
      input({
        now: LATER,
        prompts: [
          prompt({
            text: '1. DESCRIBE a challenge you have faced and how you responded.  (Optional) in 300 words or fewer',
            limit: null,
            optional: false,
          }),
        ],
      }),
    );
    expect(t.prompts()).toHaveLength(1);
    expect(r.created).toBe(0);
    expect(r.observed).toBe(1);
    expect(t.obs()).toHaveLength(1);
    expect(t.obs()[0]).toMatchObject({ limitKind: 'WORDS', limitValue: 300, optional: true, lastCheckedAt: LATER });
  });

  it("a newer cycle's wording becomes the display text; an older cycle's never overwrites it", async () => {
    const t = setup();
    await recordPrompts(
      t.prisma,
      input({
        prompts: [prompt({ cycleYear: 2026, text: 'describe a CHALLENGE you have faced and how you responded.' })],
      }),
    );
    expect(t.prompts()[0]?.text).toBe('describe a CHALLENGE you have faced and how you responded.');
    await recordPrompts(t.prisma, input({ prompts: [prompt({ cycleYear: 2027 })] }));
    expect(t.prompts()[0]?.text).toBe('Describe a challenge you have faced and how you responded.');
    await recordPrompts(
      t.prisma,
      input({
        prompts: [prompt({ cycleYear: 2025, text: 'Describe a challenge you have faced and how you responded?' })],
      }),
    );
    expect(t.prompts()[0]?.text).toBe('Describe a challenge you have faced and how you responded.');
    expect(t.prompts()).toHaveLength(1);
  });

  it('collapses two inputs with one key, program and cycle: the first wins', async () => {
    const t = setup();
    const r = await recordPrompts(
      t.prisma,
      input({
        prompts: [
          prompt({ limit: { kind: 'WORDS', value: 250 } }),
          prompt({ text: '2. Describe a challenge you have faced and how you responded. (400 words)', limit: null }),
        ],
      }),
    );
    expect(r.prompts).toBe(1);
    expect(t.obs()).toHaveLength(1);
    expect(t.obs()[0]?.limitValue).toBe(250);
  });

  it('rejects an empty text or key, a cycle outside the range, a text that is too long and an unknown program', async () => {
    const t = setup();
    const r = await recordPrompts(
      t.prisma,
      input({
        prompts: [
          prompt({ text: '' }),
          prompt({ text: '(250 words)' }),
          prompt({ text: '??? ...' }),
          prompt({ cycleYear: 2028 }),
          prompt({ cycleYear: 2004 }),
          prompt({ text: 'x '.repeat(MAX_TEXT) }),
          prompt({ program: 'XX' as unknown as 'REG' }),
        ],
      }),
    );
    expect(r).toEqual({ prompts: 0, created: 0, observed: 0, unchanged: 0, rejected: 7 });
    expect(t.prompts()).toHaveLength(0);
    expect(t.obs()).toHaveLength(0);
  });

  it('the same text in REG and PHD is two prompts, and in two schools two prompts', async () => {
    const t = setup();
    await recordPrompts(t.prisma, input({ prompts: [prompt({ program: 'REG' }), prompt({ program: 'PHD' })] }));
    await recordPrompts(t.prisma, input({ schoolId: 's2' }));
    expect(t.prompts()).toHaveLength(3);
    expect(
      t
        .prompts()
        .map((p) => `${p.schoolId}/${p.program}`)
        .sort(),
    ).toEqual(['s1/PHD', 's1/REG', 's2/REG']);
  });

  it('never deletes: a prompt a later run does not list keeps its observation and its lastCheckedAt', async () => {
    const t = setup();
    const other = prompt({ text: 'Why are you interested in our school and our mission?' });
    await recordPrompts(t.prisma, input({ prompts: [prompt(), other] }));
    await recordPrompts(t.prisma, input({ now: LATER, prompts: [prompt()] }));
    expect(t.prompts()).toHaveLength(2);
    expect(t.obs()).toHaveLength(2);
    const missing = t.prompts().find((p) => p.text.startsWith('Why are you'));
    expect(t.obs().find((o) => o.promptId === missing?.id)?.lastCheckedAt).toEqual(NOW);
    expect(t.writes.some((w) => JSON.stringify(w).includes('"delete'))).toBe(false);
  });

  it('a forum-sourced sighting adds but never changes or re-checks an existing observation', async () => {
    const t = setup();
    await recordPrompts(t.prisma, input({ source: 'SDN' }));
    const r = await recordPrompts(
      t.prisma,
      input({
        source: 'SDN',
        origin: 'forum',
        now: LATER,
        prompts: [
          prompt({ limit: { kind: 'WORDS', value: 999 }, sourceRef: 'https://forums.studentdoctor.net/threads/a.1/' }),
        ],
      }),
    );
    expect(r).toMatchObject({ created: 0, observed: 0, unchanged: 1 });
    expect(t.obs()[0]).toMatchObject({
      limitValue: 250,
      lastCheckedAt: NOW,
      sourceRef: 'https://med.admit.org/secondary-essays/harvard',
    });
    // A prompt only a forum saw is still stored.
    const fresh = await recordPrompts(
      t.prisma,
      input({
        source: 'SDN',
        origin: 'forum',
        prompts: [
          prompt({
            text: 'What does diversity mean to you and your community?',
            sourceRef: 'https://forums.studentdoctor.net/threads/a.1/',
          }),
        ],
      }),
    );
    expect(fresh).toMatchObject({ created: 1, observed: 1 });
  });

  it('a page value replaces what a forum sighting stored', async () => {
    const t = setup();
    await recordPrompts(
      t.prisma,
      input({
        source: 'SDN',
        origin: 'forum',
        prompts: [prompt({ limit: null, sourceRef: 'https://forums.studentdoctor.net/threads/a.1/' })],
      }),
    );
    await recordPrompts(
      t.prisma,
      input({ source: 'SDN', now: LATER, prompts: [prompt({ sourceRef: 'https://www.studentdoctor.net/page' })] }),
    );
    expect(t.obs()).toHaveLength(1);
    expect(t.obs()[0]).toMatchObject({
      limitValue: 250,
      sourceRef: 'https://www.studentdoctor.net/page',
      lastCheckedAt: LATER,
    });
  });

  it('keeps a limit out of range out of the row', async () => {
    const t = setup();
    await recordPrompts(t.prisma, input({ prompts: [prompt({ limit: { kind: 'WORDS', value: 0 } })] }));
    expect(t.obs()[0]).toMatchObject({ limitKind: null, limitValue: null });
  });
});

describe('sourceRef and anonymization', () => {
  it('stores only an https URL with no query, fragment or userinfo', () => {
    expect(sanitizeSourceRef('https://forums.studentdoctor.net/threads/a-b.5/')).toBe(
      'https://forums.studentdoctor.net/threads/a-b.5/',
    );
    for (const bad of [
      'https://forums.studentdoctor.net/threads/a-b.5/?user=hostile_author_zq',
      'https://forums.studentdoctor.net/threads/a-b.5/#post-123',
      'http://forums.studentdoctor.net/threads/a-b.5/',
      'https://user:pw@forums.studentdoctor.net/threads/a-b.5/',
      'https://forums.studentdoctor.net/goto/post?id=9931',
      'javascript:alert(1)',
      'not a url',
      '',
      null,
      undefined,
    ]) {
      expect(sanitizeSourceRef(bad), String(bad)).toBeNull();
    }
  });

  it('a post permalink in sourceRef never rides in, and no write holds a needle', async () => {
    const t = setup();
    await recordPrompts(
      t.prisma,
      input({
        source: 'SDN',
        prompts: [
          prompt({ sourceRef: 'https://forums.studentdoctor.net/threads/a-b.5/?u=hostile_author_zq' }),
          prompt({
            text: 'Why are you interested in our school and our mission?',
            sourceRef: 'https://forums.studentdoctor.net/posts/9931/#MentionedUserZQ',
          }),
        ],
      }),
    );
    expect(t.obs().map((o) => o.sourceRef)).toEqual([null, null]);
    assertNoLeak(t.writes, [...NEEDLES, 'MentionedUserZQ']);
  });
});

describe('recordCheck, storedObservationCount and retagThemes', () => {
  it('upserts one check row per school and source', async () => {
    const t = setup();
    await recordCheck(t.prisma, { schoolId: 's1', source: 'ADMIT', now: NOW, status: 'OK', promptCount: 4 });
    await recordCheck(t.prisma, { schoolId: 's1', source: 'ADMIT', now: LATER, status: 'UNAVAILABLE', promptCount: 0 });
    await recordCheck(t.prisma, { schoolId: 's1', source: 'SDN', now: NOW, status: 'EMPTY', promptCount: 0 });
    const rows = t.tables.medSecondaryCheck as {
      source: string;
      status: string;
      checkedAt: Date;
      promptCount: number;
    }[];
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.source === 'ADMIT')).toMatchObject({
      status: 'UNAVAILABLE',
      checkedAt: LATER,
      promptCount: 0,
    });
  });

  it("counts a school's stored observations per source", async () => {
    const t = setup();
    expect(await storedObservationCount(t.prisma, 's1', 'ADMIT')).toBe(0);
    await recordPrompts(t.prisma, input({ source: 'ADMIT' }));
    await recordPrompts(t.prisma, input({ source: 'SDN' }));
    expect(await storedObservationCount(t.prisma, 's1', 'ADMIT')).toBe(1);
    expect(await storedObservationCount(t.prisma, 's2', 'ADMIT')).toBe(0);
    expect(await storedObservationCount(t.prisma, 's1', 'SCHOOL')).toBe(0);
  });

  it('re-tags only older theme versions, and again is a no-op', async () => {
    const t = setup();
    await recordPrompts(t.prisma, input());
    const row = t.prompts()[0] as MedSecondaryPromptRow;
    row.themes = ['other'];
    row.themesVersion = 0;
    await recordPrompts(
      t.prisma,
      input({ schoolId: 's2', prompts: [prompt({ text: 'Why are you interested in our school and our mission?' })] }),
    );
    expect(await retagThemes(t.prisma)).toBe(1);
    expect(t.prompts()[0]).toMatchObject({ themes: ['challenge'], themesVersion: THEMES_VERSION });
    expect(await retagThemes(t.prisma)).toBe(0);
  });
});
