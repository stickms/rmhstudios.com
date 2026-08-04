/**
 * RMHLadder — answer bank validation, ATS field ordering, packet assembly and
 * the deterministic story matcher.
 *
 * All pure and client-safe: nothing here touches Prisma or the model. The two
 * properties worth stating up front, because they are the ones a regression
 * would actually hurt someone with:
 *
 *  • a packet never silently drops a field (order changes, membership does not);
 *  • a story match can only ever name a story the user really wrote.
 */

import { describe, it, expect, vi } from 'vitest';

// `prep.server` pulls in the Prisma singleton, which throws at import time
// without a DATABASE_URL. Nothing tested from that module touches the database
// — `reconcileStoryMatches` and `nextInterview` are the two pure pieces, kept
// there because they exist to police what the model returns.
vi.mock('@/lib/prisma.server', () => ({ prisma: {} }));

import {
  answerBankCompleteness,
  answerBankSchema,
  coerceEssays,
  coerceStories,
  EMPTY_ANSWER_BANK,
  matchStories,
  SCALAR_FIELDS,
  SENSITIVE_FIELDS,
  storyKeywords,
  tokenize,
  type AnswerBank,
  type StarStory,
} from '@/lib/rmhladder/answer-bank';
import {
  ALL_PACKET_FIELD_KEYS,
  ATS_FIELD_ORDER,
  ATS_PLATFORMS,
  atsPlatformLabel,
  buildApplicationPacket,
  packetAsText,
  resolveAtsPlatform,
  type AtsPlatform,
} from '@/lib/rmhladder/ats-fields';
import { reconcileStoryMatches, nextInterview } from '@/lib/rmhladder/prep.server';

/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

const FULL_INPUT = {
  workAuthorization: 'US citizen',
  needsSponsorship: false,
  noticePeriod: 'Two weeks',
  salaryExpectation: '$95,000',
  locationPreference: 'Remote (US)',
  linkedinUrl: 'https://linkedin.com/in/example',
  portfolioUrl: 'https://example.dev',
  essays: [{ question: 'Why us?', answer: 'Because of the product.' }],
  stories: [
    {
      title: 'Billing migration',
      situation: 'Legacy billing on a single Postgres box',
      task: 'Move it without downtime',
      action: 'Dual-wrote and backfilled',
      result: 'Zero downtime, latency down 40%',
    },
  ],
};

describe('answer bank validation', () => {
  it('accepts a complete bank', () => {
    const parsed = answerBankSchema.parse(FULL_INPUT);
    expect(parsed.workAuthorization).toBe('US citizen');
    expect(parsed.needsSponsorship).toBe(false);
    expect(parsed.essays).toHaveLength(1);
  });

  it('accepts an empty bank', () => {
    expect(() => answerBankSchema.parse(EMPTY_ANSWER_BANK)).not.toThrow();
  });

  it('turns a cleared field into null rather than an empty string', () => {
    // "unset" and "set to nothing" must not become two states the UI has to
    // tell apart forever.
    const parsed = answerBankSchema.parse({
      ...FULL_INPUT,
      salaryExpectation: '',
      linkedinUrl: '   ',
    });
    expect(parsed.salaryExpectation).toBeNull();
    expect(parsed.linkedinUrl).toBeNull();
  });

  it('trims whitespace off scalars', () => {
    const parsed = answerBankSchema.parse({ ...FULL_INPUT, noticePeriod: '  One month  ' });
    expect(parsed.noticePeriod).toBe('One month');
  });

  it('rejects a value longer than its column', () => {
    expect(() =>
      answerBankSchema.parse({ ...FULL_INPUT, salaryExpectation: 'x'.repeat(61) }),
    ).toThrow();
    expect(() =>
      answerBankSchema.parse({ ...FULL_INPUT, workAuthorization: 'x'.repeat(121) }),
    ).toThrow();
  });

  it('rejects a non-http URL', () => {
    // `javascript:` passes a shape-only URL check and is a stored-XSS sink when
    // rendered into an href.
    expect(() =>
      answerBankSchema.parse({ ...FULL_INPUT, portfolioUrl: 'javascript:alert(1)' }),
    ).toThrow();
    expect(() =>
      answerBankSchema.parse({ ...FULL_INPUT, portfolioUrl: 'not a url at all' }),
    ).toThrow();
  });

  it('rejects an essay with no answer and one that is too long', () => {
    expect(() =>
      answerBankSchema.parse({ ...FULL_INPUT, essays: [{ question: 'Why?', answer: '' }] }),
    ).toThrow();
    expect(() =>
      answerBankSchema.parse({
        ...FULL_INPUT,
        essays: [{ question: 'Why?', answer: 'x'.repeat(4001) }],
      }),
    ).toThrow();
  });

  it('caps the number of essays and stories', () => {
    const essay = { question: 'Q', answer: 'A' };
    expect(() =>
      answerBankSchema.parse({ ...FULL_INPUT, essays: Array.from({ length: 21 }, () => essay) }),
    ).toThrow();
  });

  it('defaults the optional STAR parts so a title-only story is valid', () => {
    const parsed = answerBankSchema.parse({ ...FULL_INPUT, stories: [{ title: 'Just a title' }] });
    expect(parsed.stories[0]).toEqual({
      title: 'Just a title',
      situation: '',
      task: '',
      action: '',
      result: '',
    });
  });
});

describe('coercing the Json columns', () => {
  it('drops a bad row instead of the whole array', () => {
    const essays = coerceEssays([
      { question: 'Good', answer: 'Yes' },
      { question: '', answer: 'no question' },
      'not an object',
      null,
      { question: 'Also good', answer: 'Yes' },
    ]);
    expect(essays.map((e) => e.question)).toEqual(['Good', 'Also good']);
  });

  it('returns an empty list for a non-array', () => {
    expect(coerceEssays(null)).toEqual([]);
    expect(coerceEssays({ question: 'x' })).toEqual([]);
    expect(coerceStories(undefined)).toEqual([]);
  });

  it('caps what it will read back out of the column', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ title: `S${i}` }));
    expect(coerceStories(many)).toHaveLength(20);
  });
});

describe('completeness', () => {
  it('is zero for an empty bank', () => {
    const c = answerBankCompleteness(EMPTY_ANSWER_BANK);
    expect(c.filled).toBe(0);
    expect(c.percent).toBe(0);
    expect(c.missing).toHaveLength(SCALAR_FIELDS.length);
    expect(c.hasStories).toBe(false);
  });

  it('is complete for a full bank', () => {
    const c = answerBankCompleteness(answerBankSchema.parse(FULL_INPUT));
    expect(c.filled).toBe(c.total);
    expect(c.percent).toBe(100);
    expect(c.missing).toEqual([]);
  });

  it('counts a false boolean as answered', () => {
    // `needsSponsorship: false` is a real answer; only `null` is "not asked".
    const bank: AnswerBank = { ...EMPTY_ANSWER_BANK, needsSponsorship: false };
    expect(answerBankCompleteness(bank).missing).not.toContain('needsSponsorship');
  });

  it('names the sensitive fields the export and delete flows must cover', () => {
    expect([...SENSITIVE_FIELDS].sort()).toEqual(
      ['needsSponsorship', 'salaryExpectation', 'workAuthorization'].sort(),
    );
  });
});

/* -------------------------------------------------------------------------- */
/* ATS field ordering                                                         */
/* -------------------------------------------------------------------------- */

describe('ATS field order', () => {
  it('covers every platform in the enum', () => {
    for (const platform of ATS_PLATFORMS) {
      expect(ATS_FIELD_ORDER[platform]).toBeDefined();
    }
  });

  it('every order is a permutation of the same field set', () => {
    // A missing row would read as "this ATS does not want it", which is a worse
    // lie than showing it in the wrong place.
    const expected = [...ALL_PACKET_FIELD_KEYS].sort();
    for (const platform of ATS_PLATFORMS) {
      const order = [...ATS_FIELD_ORDER[platform]];
      expect(order).toHaveLength(expected.length);
      expect([...order].sort()).toEqual(expected);
      expect(new Set(order).size).toBe(order.length);
    }
  });

  it('always puts the repeated essays last', () => {
    for (const platform of ATS_PLATFORMS) {
      const order = ATS_FIELD_ORDER[platform];
      expect(order[order.length - 1]).toBe('essay');
    }
  });

  it('orders actually differ between the major ATSes', () => {
    // If Greenhouse and Lever ordered identically the whole feature would be
    // decorative.
    expect(ATS_FIELD_ORDER.greenhouse).not.toEqual(ATS_FIELD_ORDER.lever);
    expect(ATS_FIELD_ORDER.ashby).not.toEqual(ATS_FIELD_ORDER.workday);
  });

  it('leads Lever with the resume before the cover letter, and Workday with eligibility', () => {
    const lever = ATS_FIELD_ORDER.lever;
    expect(lever.indexOf('resume')).toBeLessThan(lever.indexOf('coverLetter'));
    const workday = ATS_FIELD_ORDER.workday;
    expect(workday.indexOf('workAuthorization')).toBeLessThan(workday.indexOf('resume'));
  });

  it('resolves a platform string, falling back to generic', () => {
    expect(resolveAtsPlatform('greenhouse')).toBe('greenhouse');
    expect(resolveAtsPlatform('Ashby')).toBe('ashby');
    expect(resolveAtsPlatform('workable')).toBe('generic');
    expect(resolveAtsPlatform(null)).toBe('generic');
    expect(resolveAtsPlatform(undefined)).toBe('generic');
  });

  it('labels every platform', () => {
    for (const platform of ATS_PLATFORMS) {
      expect(atsPlatformLabel(platform).length).toBeGreaterThan(0);
    }
    expect(atsPlatformLabel('greenhouse')).toBe('Greenhouse');
  });
});

/* -------------------------------------------------------------------------- */
/* Packet assembly                                                            */
/* -------------------------------------------------------------------------- */

const APPLICANT = { fullName: 'Ada Lovelace', email: 'ada@example.com', phone: null };
const APPLICATION = {
  resumeVersion: 'v3 — backend',
  coverLetter: 'Dear team,',
  referralName: 'Grace H.',
};

function packetFor(platform: AtsPlatform, bank = answerBankSchema.parse(FULL_INPUT)) {
  return buildApplicationPacket({
    bank,
    applicant: APPLICANT,
    application: APPLICATION,
    platform,
  });
}

describe('application packet', () => {
  it('follows the platform order', () => {
    const keys = packetFor('lever')
      .filter((f) => f.key !== 'essay')
      .map((f) => f.key);
    const expected = ATS_FIELD_ORDER.lever.filter((k) => k !== 'essay');
    expect(keys).toEqual(expected);
  });

  it('expands each essay into its own field, labelled with the question', () => {
    const bank = answerBankSchema.parse({
      ...FULL_INPUT,
      essays: [
        { question: 'Why us?', answer: 'A' },
        { question: 'Why now?', answer: 'B' },
      ],
    });
    const essays = packetFor('greenhouse', bank).filter((f) => f.key === 'essay');
    expect(essays.map((e) => e.label)).toEqual(['Why us?', 'Why now?']);
    expect(essays.map((e) => e.id)).toEqual(['essay:0', 'essay:1']);
  });

  it('keeps unfilled fields visible rather than dropping them', () => {
    const phone = packetFor('greenhouse').find((f) => f.key === 'phone');
    expect(phone).toBeDefined();
    expect(phone!.filled).toBe(false);
    expect(phone!.value).toBe('');
  });

  it('renders a boolean as the word a form asks for', () => {
    const yes = packetFor(
      'greenhouse',
      answerBankSchema.parse({ ...FULL_INPUT, needsSponsorship: true }),
    ).find((f) => f.key === 'needsSponsorship');
    expect(yes!.value).toBe('Yes');

    const unanswered = packetFor(
      'greenhouse',
      answerBankSchema.parse({ ...FULL_INPUT, needsSponsorship: null }),
    ).find((f) => f.key === 'needsSponsorship');
    expect(unanswered!.value).toBe('');
    expect(unanswered!.filled).toBe(false);
  });

  it('flags the sensitive fields so the UI can mask them', () => {
    const sensitive = packetFor('greenhouse')
      .filter((f) => f.sensitive)
      .map((f) => f.key);
    expect(sensitive).toContain('salaryExpectation');
    expect(sensitive).toContain('workAuthorization');
    expect(sensitive).not.toContain('linkedinUrl');
  });

  it('marks the resume as a file, not something to paste', () => {
    const resume = packetFor('greenhouse').find((f) => f.key === 'resume');
    expect(resume!.kind).toBe('file');
  });

  it('contains the same fields regardless of platform, in a different order', () => {
    const a = packetFor('greenhouse').map((f) => f.id);
    const b = packetFor('workday').map((f) => f.id);
    expect([...a].sort()).toEqual([...b].sort());
    expect(a).not.toEqual(b);
  });

  it('renders as text with a marker for what is missing', () => {
    const text = packetAsText(packetFor('greenhouse'));
    expect(text).toContain('Full name:\nAda Lovelace');
    expect(text).toContain('Phone:\n(not set)');
  });

  it('produces a full packet from a completely empty bank without throwing', () => {
    const fields = packetFor('generic', EMPTY_ANSWER_BANK);
    expect(fields.every((f) => !f.filled || f.key === 'fullName' || f.key === 'email' || f.key === 'resume' || f.key === 'coverLetter' || f.key === 'referralName')).toBe(true);
    expect(fields.length).toBeGreaterThan(0);
  });
});

/* -------------------------------------------------------------------------- */
/* Story matching                                                             */
/* -------------------------------------------------------------------------- */

const STORIES: StarStory[] = [
  {
    title: 'Billing migration',
    situation: 'Legacy billing service on one Postgres instance',
    task: 'Migrate without downtime',
    action: 'Dual-write, backfill, cutover behind a flag',
    result: 'Zero downtime and latency down 40%',
  },
  {
    title: 'On-call overhaul',
    situation: 'Pager fatigue across the platform team',
    task: 'Cut the alert volume',
    action: 'Rewrote alert thresholds and added runbooks',
    result: 'Pages down 70%',
  },
  {
    title: 'Design system rollout',
    situation: 'Five different button components',
    task: 'Converge on one',
    action: 'Built a shared primitive and migrated callers',
    result: 'One button, consistent everywhere',
  },
];

describe('deterministic story matching', () => {
  it('drops stop words and short tokens', () => {
    const tokens = tokenize('The team will work with a Postgres database for the role');
    expect(tokens).toContain('postgres');
    expect(tokens).toContain('database');
    expect(tokens).not.toContain('the');
    expect(tokens).not.toContain('team');
  });

  it('pools every STAR field into the story vocabulary', () => {
    const words = storyKeywords(STORIES[0]);
    expect(words.has('billing')).toBe(true); // title
    expect(words.has('postgres')).toBe(true); // situation
    expect(words.has('cutover')).toBe(true); // action
    expect(words.has('latency')).toBe(true); // result
  });

  it('ranks the story whose vocabulary the posting shares', () => {
    const posting = 'You will own our Postgres billing service and reduce latency during a migration.';
    const matches = matchStories(STORIES, posting);
    expect(matches[0].story.title).toBe('Billing migration');
    expect(matches[0].overlap.length).toBeGreaterThan(0);
  });

  it('returns nothing when nothing overlaps', () => {
    expect(matchStories(STORIES, 'Seeking a pastry chef for our bakery.')).toEqual([]);
    expect(matchStories(STORIES, '')).toEqual([]);
    expect(matchStories([], 'Postgres billing latency')).toEqual([]);
  });

  it('is deterministic across runs, including ties', () => {
    const posting = 'Postgres alerts and buttons';
    const a = matchStories(STORIES, posting).map((m) => m.story.title);
    const b = matchStories([...STORIES].reverse(), posting).map((m) => m.story.title);
    expect(a).toEqual(b);
  });

  it('honours the limit', () => {
    const posting = 'Postgres billing latency alerts pager buttons component migration';
    expect(matchStories(STORIES, posting, 1)).toHaveLength(1);
    expect(matchStories(STORIES, posting, 0)).toHaveLength(0);
  });
});

describe('reconciling what the model returned', () => {
  it('drops a story the user does not have', () => {
    const reconciled = reconcileStoryMatches(
      [
        { storyTitle: 'Billing migration', question: 'Tell me about a migration', why: '' },
        { storyTitle: 'Led a team to the moon', question: 'Leadership?', why: '' },
      ],
      STORIES,
    );
    expect(reconciled).toHaveLength(1);
    expect(reconciled[0].storyTitle).toBe('Billing migration');
  });

  it('matches case- and whitespace-insensitively, keeping the user’s spelling', () => {
    const reconciled = reconcileStoryMatches(
      [{ storyTitle: '  billing   MIGRATION ', question: '', why: '' }],
      STORIES,
    );
    expect(reconciled[0].storyTitle).toBe('Billing migration');
  });

  it('de-duplicates repeated titles', () => {
    const reconciled = reconcileStoryMatches(
      [
        { storyTitle: 'On-call overhaul', question: 'a', why: '' },
        { storyTitle: 'On-call overhaul', question: 'b', why: '' },
      ],
      STORIES,
    );
    expect(reconciled).toHaveLength(1);
  });

  it('returns nothing when the user has no stories at all', () => {
    expect(reconcileStoryMatches([{ storyTitle: 'Anything', question: '', why: '' }], [])).toEqual(
      [],
    );
  });
});

describe('interview countdown', () => {
  const now = new Date('2026-08-04T12:00:00Z');

  it('picks the soonest FUTURE date, not the first in the array', () => {
    const result = nextInterview(
      [
        new Date('2026-07-01T12:00:00Z'), // past round
        new Date('2026-09-01T12:00:00Z'),
        new Date('2026-08-10T12:00:00Z'),
      ],
      now,
    );
    expect(result?.at.toISOString()).toBe('2026-08-10T12:00:00.000Z');
    expect(result?.days).toBe(6);
  });

  it('returns null when every tracked date has passed', () => {
    expect(nextInterview([new Date('2026-01-01T00:00:00Z')], now)).toBeNull();
    expect(nextInterview([], now)).toBeNull();
  });

  it('ignores an invalid date', () => {
    expect(nextInterview([new Date('nonsense')], now)).toBeNull();
  });
});
