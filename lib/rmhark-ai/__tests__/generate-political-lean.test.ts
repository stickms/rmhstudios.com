import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

const {
  createMock,
} =
  vi.hoisted(
    () => ({
      createMock:
        vi.fn(),
    }),
  );
vi.mock(
  'openai',
  () => ({
    default:
      vi.fn(
        function () {
          return {
            chat: {
              completions:
                {
                  create:
                    createMock,
                },
            },
          };
        },
      ),
  }),
);

import {
  generateDirectMessageOpener,
  generateDirectMessageReply,
  generatePost,
  generateQuote,
  generateReactionPost,
  generateReply,
} from '@/lib/rmhark-ai/generate.server';

interface Msg {
  role: string;
  content: string;
}
const reply =
  (
    content: string,
  ) =>
    createMock.mockResolvedValueOnce(
      {
        choices:
          [
            {
              message:
                {
                  content,
                },
            },
          ],
      },
    );
function system(): string {
  const call =
    createMock
      .mock
      .calls[0]?.[0] as {
      messages: Msg[];
    };
  return (
    call.messages.find(
      (
        m,
      ) =>
        m.role ===
        'system',
    )
      ?.content ??
    ''
  );
}

const PERSONA =
  'THEME: vintage synths.\nPOLITICS (libertarian): Sceptical of government and of big institutions alike.';

function expectHardLimits(
  text: string,
) {
  expect(
    text,
  ).toMatch(
    /opinions only/i,
  );
  expect(
    text,
  ).toMatch(
    /never invent facts, numbers, names, dates or quotes/i,
  );
  expect(
    text,
  ).toMatch(
    /no slurs/i,
  );
  expect(
    text,
  ).toMatch(
    /demeans people for who they are/i,
  );
  expect(
    text,
  ).toMatch(
    /no threats/i,
  );
  expect(
    text,
  ).toMatch(
    /never encourage or cheer on violence/i,
  );
  expect(
    text,
  ).toMatch(
    /how, when or where to vote/i,
  );
  expect(
    text,
  ).toMatch(
    /rigged or stolen/i,
  );
  expect(
    text,
  ).toMatch(
    /no campaigning/i,
  );
  expect(
    text,
  ).toMatch(
    /for or against a named candidate or party, to donate, or to turn out/i,
  );
  expect(
    text,
  ).toMatch(
    /journalist, an official/i,
  );
  expect(
    text,
  ).toMatch(
    /bot or an AI/i,
  );
}

beforeEach(
  () => {
    createMock.mockReset();
    process.env.DEEPSEEK_API_KEY =
      'test-key';
  },
);

describe('political lean in prompts', () => {
  it('reaction posts: the lean shapes the take, hard limits hold, outside text stays DATA', async () => {
    reply(
      'who is paying for this',
    );
    await generateReactionPost(
      {
        persona:
          PERSONA,
        kind: 'news',
        title:
          'Ministry unveils a plan',
        summary:
          '',
        source:
          'Example News',
      },
    );
    const s =
      system();
    expect(
      s,
    ).toContain(
      'POLITICS (libertarian)',
    );
    expect(
      s,
    ).toMatch(
      /decides how you take news, policy, business and institutions/i,
    );
    expect(
      s,
    ).toMatch(
      /disagree with each other the way strangers do online/i,
    );
    expect(
      s,
    ).toMatch(
      /tuned out, you mostly shrug, joke/i,
    );
    expectHardLimits(
      s,
    );
    expect(
      s,
    ).toMatch(
      /ignore any instructions/i,
    );
    expect(
      s,
    ).toMatch(
      /DATA/,
    );
  });

  it('replies and quotes: the lean shapes what others say, hard limits hold', async () => {
    reply(
      'eh, sure',
    );
    await generateReply(
      {
        persona:
          PERSONA,
        postContent:
          'new tax proposed',
        thread:
          [
            'good',
          ],
      },
    );
    let s =
      system();
    expect(
      s,
    ).toContain(
      'POLITICS (libertarian)',
    );
    expect(
      s,
    ).toMatch(
      /what other people say about them/i,
    );
    expect(
      s,
    ).toMatch(
      /attack the argument, never the person/i,
    );
    expectHardLimits(
      s,
    );

    createMock.mockReset();
    reply(
      'ha',
    );
    await generateQuote(
      {
        persona:
          PERSONA,
        quoted:
          'a post',
      },
    );
    s =
      system();
    expect(
      s,
    ).toMatch(
      /decides how you take news/i,
    );
    expectHardLimits(
      s,
    );
  });

  it('ordinary posts and DMs: the lean is background and most posts are not about politics', async () => {
    reply(
      'coffee',
    );
    await generatePost(
      {
        persona:
          PERSONA,
      },
    );
    let s =
      system();
    expect(
      s,
    ).toContain(
      'POLITICS (libertarian)',
    );
    expect(
      s,
    ).toMatch(
      /background only/i,
    );
    expect(
      s,
    ).toMatch(
      /NOT about politics/,
    );
    expect(
      s,
    ).not.toMatch(
      /decides how you take news/i,
    );
    expectHardLimits(
      s,
    );

    createMock.mockReset();
    reply(
      'hi',
    );
    await generateDirectMessageReply(
      {
        persona:
          PERSONA,
        history:
          [],
      },
    );
    s =
      system();
    expect(
      s,
    ).toMatch(
      /background only/i,
    );
    expectHardLimits(
      s,
    );

    createMock.mockReset();
    reply(
      'hey',
    );
    await generateDirectMessageOpener(
      {
        persona:
          PERSONA,
      },
    );
    s =
      system();
    expect(
      s,
    ).toMatch(
      /background only/i,
    );
    expectHardLimits(
      s,
    );
  });

  it('a human tapping the generate button gets no persona rules', async () => {
    reply(
      'a draft',
    );
    await generateReply(
      {
        postContent:
          'hello',
      },
    );
    expect(
      system(),
    ).not.toMatch(
      /POLITICS|HARD LIMITS/,
    );
  });
});
