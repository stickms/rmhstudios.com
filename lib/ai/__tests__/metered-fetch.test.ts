// The metered fetch is what puts the DeepSeek bill into the `AiUsage` ledger for
// every client outside `runTask`, and `costMicros` is what prices it; both are
// money-path (docs/testing.md criteria).
import {
  describe,
  expect,
  it,
  vi,
} from 'vitest';

// provider.server imports Prisma, which throws at import without a DATABASE_URL.
vi.mock(
  '@/lib/prisma.server',
  () => ({
    prisma:
      {},
  }),
);

import {
  requestFacts,
  usageFromStream,
} from '../metered-fetch.server';
import { costMicros } from '../provider.server';

describe('requestFacts', () => {
  it('reads model, stream flag and prompt size from a chat body', () => {
    const body =
      JSON.stringify(
        {
          model:
            'deepseek-v4-flash',
          stream: true,
          messages:
            [
              {
                role: 'system',
                content:
                  'abcd',
              },
              {
                role: 'user',
                content:
                  'efgh',
              },
            ],
        },
      );
    expect(
      requestFacts(
        body,
      ),
    ).toEqual(
      {
        model:
          'deepseek-v4-flash',
        stream: true,
        promptChars: 8,
      },
    );
  });

  it('degrades to unknown for a body it cannot read', () => {
    expect(
      requestFacts(
        undefined,
      )
        .model,
    ).toBe(
      'unknown',
    );
    expect(
      requestFacts(
        'not json',
      )
        .stream,
    ).toBe(
      false,
    );
  });
});

describe('usageFromStream', () => {
  it('prefers the usage block a provider sends', () => {
    const sse =
      [
        'data: {"choices":[{"delta":{"content":"hello"}}]}',
        'data: {"choices":[],"usage":{"prompt_tokens":100,"completion_tokens":7,"prompt_cache_hit_tokens":64}}',
        'data: [DONE]',
      ].join(
        '\n',
      );
    expect(
      usageFromStream(
        sse,
        400,
      ),
    ).toEqual(
      {
        prompt_tokens: 100,
        completion_tokens: 7,
        prompt_cache_hit_tokens: 64,
      },
    );
  });

  it('estimates from characters when no usage was sent, reasoning included', () => {
    const sse =
      [
        'data: {"choices":[{"delta":{"reasoning_content":"abcd"}}]}',
        'data: {"choices":[{"delta":{"content":"efgh"}}]}',
        'data: {"choices":[{"delta":{"content":"ij',
      ].join(
        '\n',
      );
    expect(
      usageFromStream(
        sse,
        40,
      ),
    ).toEqual(
      {
        prompt_tokens: 10,
        completion_tokens: 2,
        prompt_cache_hit_tokens: 0,
      },
    );
  });
});

describe('costMicros with cache hits', () => {
  it('prices cache-hit prompt tokens at a tenth of the miss rate', () => {
    const miss =
      costMicros(
        'deepseek-v4-flash',
        1_000_000,
        0,
      );
    const allHit =
      costMicros(
        'deepseek-v4-flash',
        1_000_000,
        0,
        1_000_000,
      );
    expect(
      allHit,
    ).toBe(
      Math.ceil(
        miss /
          10,
      ),
    );
  });

  it('never counts more hits than prompt tokens', () => {
    expect(
      costMicros(
        'deepseek-v4-flash',
        10,
        0,
        1_000,
      ),
    ).toBe(
      costMicros(
        'deepseek-v4-flash',
        10,
        0,
        10,
      ),
    );
  });
});
