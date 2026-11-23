import { describe, expect, it, vi } from 'vitest';
import { SDN_HOSTILE_NEEDLES, assertNoLeak, createFakePrisma } from '../test-support';
import type { MedSecondaryObservationRow, MedSecondaryPromptRow } from '../types';
import type { BudgetGate } from './budget';
import type { ExtractPost, SdnAi } from './extract';
import { SECONDARY_POST_PREFILTER, createPromptSink, promptsSchema, type PromptSinkContext } from './secondaries';

const OFF_PEAK = new Date('2026-11-21T12:00:00Z'); // a Saturday
const PEAK = new Date('2026-11-24T02:00:00Z'); // a Tuesday, 02:00 UTC
const THREAD = 'https://forums.studentdoctor.net/threads/2026-2027-harvard.123/';
const GOOD = 'Why are you interested in our school? (250 words)';

const post = (text: string): ExtractPost & { postHash: string; eventKey(): string } => ({
  text,
  postedAt: new Date('2026-11-20T10:00:00Z'),
  postHash: 'HASHZQ-should-never-reach-the-model',
  eventKey: () => 'KEYZQ-should-never-reach-the-model',
});

function setup(
  opts: {
    answers?: (string | Error)[];
    now?: Date;
    allow?: boolean;
    configured?: boolean;
    reserve?: () => boolean;
  } = {},
) {
  const fake = createFakePrisma();
  const users: string[] = [];
  const queue = [...(opts.answers ?? [])];
  const run = vi.fn(async (_system: string, user: string): Promise<string> => {
    users.push(user);
    const next = queue.length > 1 ? queue.shift() : queue[0];
    if (next instanceof Error) throw next;
    return next ?? '{"prompts":[]}';
  });
  const ai: SdnAi = { configured: () => opts.configured ?? true, run };
  const budget: BudgetGate = { allow: async () => opts.allow ?? true };
  const sink = createPromptSink({ ai, budget, prisma: fake.prisma, now: () => opts.now ?? OFF_PEAK });
  const reserve = vi.fn(opts.reserve ?? (() => true));
  const ctx: PromptSinkContext = {
    cycleYear: 2027,
    schoolId: 's1',
    threadUrl: THREAD,
    kind: 'live',
    containsHandle: (t) => t.includes('hostile_author_zq'),
    reserve,
  };
  const prompts = () => fake.tables.medSecondaryPrompt as MedSecondaryPromptRow[];
  const obs = () => fake.tables.medSecondaryObservation as MedSecondaryObservationRow[];
  return { ...fake, sink, ctx, run, users, reserve, prompts, obs };
}

const answer = (...rows: { postRef: number; text: string; program?: 'REG' | 'PHD' }[]) =>
  JSON.stringify({ prompts: rows });

describe('promptsSchema', () => {
  const ok = { prompts: [{ postRef: 0, text: GOOD, program: 'REG' }] };
  it('accepts a valid answer and an empty one', () => {
    expect(promptsSchema.safeParse(ok).success).toBe(true);
    expect(promptsSchema.safeParse({ prompts: [] }).success).toBe(true);
  });
  it.each([
    ['an extra key', { prompts: [{ postRef: 0, text: GOOD, author: 'x' }] }],
    ['an extra top-level key', { prompts: [], note: 'x' }],
    ['text under 20 characters', { prompts: [{ postRef: 0, text: 'Why us? (250)' }] }],
    ['text over 600 characters', { prompts: [{ postRef: 0, text: 'x'.repeat(601) }] }],
    ['a non-integer postRef', { prompts: [{ postRef: 0.5, text: GOOD }] }],
    ['a negative postRef', { prompts: [{ postRef: -1, text: GOOD }] }],
    ['an unknown program', { prompts: [{ postRef: 0, text: GOOD, program: 'MD' }] }],
    [
      'more than 8 prompts for one post',
      { prompts: Array.from({ length: 9 }, (_, i) => ({ postRef: 0, text: `${GOOD} ${i}` })) },
    ],
  ])('rejects %s', (_n, value) => {
    expect(promptsSchema.safeParse(value).success).toBe(false);
  });
  it('allows 8 per post across several posts', () => {
    const rows = [0, 1].flatMap((postRef) => Array.from({ length: 8 }, (_, i) => ({ postRef, text: `${GOOD} ${i}` })));
    expect(promptsSchema.safeParse({ prompts: rows }).success).toBe(true);
  });
});

describe('the prefilter', () => {
  it('passes posts about prompts and limits and drops the rest', () => {
    for (const t of [
      'Harvard secondaries are out',
      'the essay prompt is below',
      'a 250 word limit',
      'prompts: why us',
      '1000 characters',
    ])
      expect(SECONDARY_POST_PREFILTER.test(t), t).toBe(true);
    for (const t of ['got an interview invite today', 'accepted!!', 'what is the stats for MD'])
      expect(SECONDARY_POST_PREFILTER.test(t), t).toBe(false);
  });
  it('does not send a post that fails it', async () => {
    const t = setup({ answers: [answer({ postRef: 0, text: GOOD })] });
    const r = await t.sink.extract([post('got an interview invite today')], t.ctx);
    expect(t.run).not.toHaveBeenCalled();
    expect(r).toMatchObject({ stored: 0, llmCalls: 0 });
  });
});

describe('createPromptSink', () => {
  it('stores a good answer as an SDN observation whose sourceRef is the thread, never a post', async () => {
    const t = setup({ answers: [answer({ postRef: 1, text: GOOD })] });
    const posts = [post('other secondaries chatter'), post(`Harvard secondary prompt: ${GOOD}`)];
    const r = await t.sink.extract(posts, t.ctx);
    expect(r).toMatchObject({ stored: 1, rejected: 0, llmCalls: 1, dropped: 0 });
    expect(t.prompts()).toHaveLength(1);
    expect(t.prompts()[0]).toMatchObject({
      schoolId: 's1',
      program: 'REG',
      text: 'Why are you interested in our school?',
    });
    expect(t.obs()).toHaveLength(1);
    expect(t.obs()[0]).toMatchObject({
      cycleYear: 2027,
      source: 'SDN',
      limitKind: 'WORDS',
      limitValue: 250,
      sourceRef: THREAD,
    });
  });

  it('the user turn holds only ref, postedOn and text: no hash, key, author or id', async () => {
    const t = setup({ answers: [answer({ postRef: 0, text: GOOD })] });
    await t.sink.extract([post(`secondary prompt: ${GOOD}`)], t.ctx);
    expect(t.users).toHaveLength(1);
    const payload = JSON.parse(t.users[0]!.slice(t.users[0]!.indexOf('['), t.users[0]!.lastIndexOf(']') + 1)) as Record<
      string,
      unknown
    >[];
    expect(payload).toHaveLength(1);
    expect(Object.keys(payload[0]!).sort()).toEqual(['postedOn', 'ref', 'text']);
    expect(t.users[0]).not.toContain('ZQ');
  });

  const HOSTILE = [
    ['an email', 'Why are you interested in our school? Mail zq.person@example.com (250 words)'],
    ['an https URL', 'Why are you interested in our school? See https://example.org/prompts (250 words)'],
    ['a www URL', 'Why are you interested in our school? See www.example.org/prompts (250 words)'],
    ['an @handle', 'Why are you interested in our school @handle_zq77 (250 words)'],
    ['a phone number', 'Why are you interested in our school? Call 555-123-4567 (250 words)'],
    ['an honorific and a name', 'Dr. Smith wants to know why you are interested in our school'],
    ['a page handle', 'Why are you interested in our school hostile_author_zq (250 words)'],
    ['a first-person narrative', 'I wrote about my grandmother and they asked why.'],
    ['a first-person aside', "I'm still waiting on this one: why are you interested in us"],
    ['a quote marker', '> Why are you interested in our school and our mission?'],
    ['a quoted reply', 'John said: Why are you interested in our school and our mission?'],
    ['a bbcode quote', '[quote="Name"]Why are you interested in our school and our mission?[/quote]'],
    ['shouting', 'WHY ARE YOU INTERESTED IN OUR SCHOOL AND OUR MISSION'],
  ] as const;

  it.each(HOSTILE)('rejects, never redacts, %s (quoted in its post, still rejected)', async (_n, text) => {
    const t = setup({ answers: [answer({ postRef: 0, text })] });
    const r = await t.sink.extract([post(`Secondary prompts so far: ${text}`)], t.ctx);
    expect(r).toMatchObject({ stored: 0, rejected: 1 });
    expect(t.prompts()).toHaveLength(0);
    expect(t.obs()).toHaveLength(0);
    assertNoLeak(t.writes, [...SDN_HOSTILE_NEEDLES, 'zq.person', '555-123', 'grandmother', 'Smith']);
  });

  it('rejects a prompt the post does not quote (a paraphrase or an invention)', async () => {
    const t = setup({
      answers: [answer({ postRef: 0, text: 'Describe a challenge you have faced and how you responded.' })],
    });
    const r = await t.sink.extract([post(`The secondary prompts are about our mission: ${GOOD}`)], t.ctx);
    expect(r).toMatchObject({ stored: 0, rejected: 1 });
  });

  it('rejects an answer that names a post that is not in the chunk', async () => {
    const t = setup({ answers: [answer({ postRef: 7, text: GOOD })] });
    const r = await t.sink.extract([post(`secondary: ${GOOD}`)], t.ctx);
    expect(r).toMatchObject({ stored: 0, rejected: 1 });
  });

  it('a duplicate prompt in one answer is one observation', async () => {
    const t = setup({ answers: [answer({ postRef: 0, text: GOOD }, { postRef: 0, text: GOOD })] });
    await t.sink.extract([post(`secondary: ${GOOD}`)], t.ctx);
    expect(t.obs()).toHaveLength(1);
  });

  it('a combined-degree prompt is PHD only when its words or the post say so', async () => {
    const phd = 'Why are you applying to the MD-PhD program? (500 words)';
    const t = setup({
      answers: [
        answer(
          { postRef: 0, text: phd },
          { postRef: 1, text: 'Describe your research experience. (300 words)', program: 'PHD' },
          { postRef: 2, text: 'Describe your teamwork experience. (300 words)', program: 'PHD' },
        ),
      ],
    });
    await t.sink.extract(
      [
        post(`secondary: ${phd}`),
        post('MD-PhD secondary: Describe your research experience. (300 words)'),
        post('secondary: Describe your teamwork experience. (300 words)'),
      ],
      t.ctx,
    );
    const byText = Object.fromEntries(t.prompts().map((p) => [p.text.slice(0, 12), p.program]));
    expect(byText['Why are you ']).toBe('PHD');
    expect(t.prompts().filter((p) => p.program === 'PHD')).toHaveLength(2);
    expect(t.prompts().find((p) => p.text.startsWith('Describe your teamwork'))?.program).toBe('REG');
  });

  it('a malformed answer is retried once, then counted and dropped, never thrown', async () => {
    const t = setup({ answers: ['not json at all', '{"prompts": [{"postRef": "x"}]}'] });
    const r = await t.sink.extract([post(`secondary: ${GOOD}`)], t.ctx);
    expect(r).toMatchObject({ stored: 0, llmCalls: 2, dropped: 1 });
    expect(t.run).toHaveBeenCalledTimes(2);
    expect(t.prompts()).toHaveLength(0);
  });

  it('a malformed first answer followed by a good one stores', async () => {
    const t = setup({ answers: ['oops', answer({ postRef: 0, text: GOOD })] });
    const r = await t.sink.extract([post(`secondary: ${GOOD}`)], t.ctx);
    expect(r).toMatchObject({ stored: 1, llmCalls: 2, dropped: 0 });
  });

  describe('gates', () => {
    it('makes no model call at DeepSeek peak', async () => {
      const t = setup({ now: PEAK, answers: [answer({ postRef: 0, text: GOOD })] });
      const r = await t.sink.extract([post(`secondary: ${GOOD}`)], t.ctx);
      expect(t.run).not.toHaveBeenCalled();
      expect(r).toMatchObject({ stored: 0, llmCalls: 0, stop: 'peak' });
    });
    it("makes no call when the run's cap is spent", async () => {
      const t = setup({ reserve: () => false, answers: [answer({ postRef: 0, text: GOOD })] });
      const r = await t.sink.extract([post(`secondary: ${GOOD}`)], t.ctx);
      expect(t.run).not.toHaveBeenCalled();
      expect(r.stop).toBe('cap');
    });
    it("makes no call when its own budget share is spent, and counts nothing against the run's cap", async () => {
      const t = setup({ allow: false });
      const r = await t.sink.extract([post(`secondary: ${GOOD}`)], t.ctx);
      expect(t.run).not.toHaveBeenCalled();
      expect(t.reserve).not.toHaveBeenCalled();
      expect(r.stop).toBe('budget');
    });
    it('reports an outage when AI is not configured or the provider throws', async () => {
      const off = setup({ configured: false });
      expect((await off.sink.extract([post(`secondary: ${GOOD}`)], off.ctx)).stop).toBe('outage');
      const down = setup({ answers: [new Error('provider down')] });
      expect((await down.sink.extract([post(`secondary: ${GOOD}`)], down.ctx)).stop).toBe('outage');
    });
  });

  it('a forum sighting never overrides a page observation of the same prompt', async () => {
    const t = setup({ answers: [answer({ postRef: 0, text: 'Why are you interested in our school? (300 words)' })] });
    t.tables.medSecondaryPrompt!.push({
      id: 'p1',
      schoolId: 's1',
      program: 'REG',
      key: 'why are you interested in our school',
      text: 'Why are you interested in our school?',
      themes: ['why-school'],
      themesVersion: 1,
    });
    t.tables.medSecondaryObservation!.push({
      id: 'o1',
      promptId: 'p1',
      cycleYear: 2027,
      source: 'SDN',
      limitKind: 'WORDS',
      limitValue: 250,
      optional: false,
      sourceRef: 'https://www.studentdoctor.net/page',
      firstSeenAt: OFF_PEAK,
      lastCheckedAt: OFF_PEAK,
    });
    await t.sink.extract([post('secondary: Why are you interested in our school? (300 words)')], t.ctx);
    expect(t.obs()).toHaveLength(1);
    expect(t.obs()[0]).toMatchObject({ limitValue: 250, sourceRef: 'https://www.studentdoctor.net/page' });
  });
});
