/**
 * The admin email composer drafts its subject and body through the compose
 * box's own endpoint, POST /api/rmharks/ai-generate (modes `email-subject` and
 * `email-body`). Those modes spend model calls on the site's account, so they
 * are admin-only, as the announcement modes are.
 */
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { handlersOf } from '@/lib/__tests__/api-handlers-of';

const h =
  vi.hoisted(
    () => ({
      admin: false,
      draftEmailSubject:
        vi.fn(
          async () =>
            'A subject',
        ),
      draftEmailBody:
        vi.fn(
          async () =>
            'A body',
        ),
    }),
  );

vi.mock(
  '@/lib/auth',
  () => ({
    auth: {
      api: {
        getSession:
          async () => ({
            user: {
              id: 'u1',
              isAdmin:
                h.admin,
            },
            session:
              {},
          }),
      },
    },
  }),
);
vi.mock(
  '@/lib/rate-limit.server',
  () => ({
    withRateLimitAsync:
      async () =>
        null,
  }),
);
vi.mock(
  '@/lib/rate-limit',
  async (
    orig,
  ) => ({
    ...(await orig<object>()),
    rateLimit:
      () => ({
        allowed: true,
        retryAfter: 0,
      }),
  }),
);
vi.mock(
  '@/lib/rmhark-ai/generate.server',
  () => ({
    isRmharkAIConfigured:
      () =>
        true,
    generateReply:
      vi.fn(),
    generatePost:
      vi.fn(),
    generateAnnouncementTitle:
      vi.fn(),
    generateAnnouncementBody:
      vi.fn(),
  }),
);
vi.mock(
  '@/lib/email/ai.server',
  () => ({
    draftEmailSubject:
      h.draftEmailSubject,
    draftEmailBody:
      h.draftEmailBody,
  }),
);
vi.mock(
  '@/lib/prisma.server',
  () => ({
    prisma:
      {},
  }),
);

import { route as Route } from '@/lib/feed/api/rmharks.ai-generate.server';

type Handler =
  (a: {
    request: Request;
    params: Record<
      string,
      string
    >;
  }) => Promise<Response>;
const post =
  (
    body: unknown,
  ) =>
    handlersOf<Handler>(
      Route,
    ).POST(
      {
        request:
          new Request(
            'https://rmhstudios.com/api/rmharks/ai-generate',
            {
              method:
                'POST',
              headers:
                {
                  'content-type':
                    'application/json',
                  'cf-connecting-ip':
                    '10.0.0.1',
                  cookie:
                    'better-auth.session_token=t',
                },
              body: JSON.stringify(
                body,
              ),
            },
          ),
        params:
          {},
      },
    );

describe('ai-generate email modes', () => {
  beforeEach(
    () => {
      h.admin = false;
      h.draftEmailSubject.mockClear();
      h.draftEmailBody.mockClear();
    },
  );

  it('refuses a non-admin without spending a call', async () => {
    const res =
      await post(
        {
          mode: 'email-body',
          body: 'hi',
          category:
            'announcements',
        },
      );
    expect(
      res.status,
    ).toBe(
      403,
    );
    expect(
      h.draftEmailBody,
    ).not.toHaveBeenCalled();
  });

  it('drafts the subject and the body for an admin', async () => {
    h.admin = true;
    const subject =
      await post(
        {
          mode: 'email-subject',
          body: 'hi',
          category:
            'product',
        },
      );
    expect(
      await subject.json(),
    ).toEqual(
      {
        content:
          'A subject',
      },
    );
    const body =
      await post(
        {
          mode: 'email-body',
          subject:
            'S',
          category:
            'service',
        },
      );
    expect(
      await body.json(),
    ).toEqual(
      {
        content:
          'A body',
      },
    );
    expect(
      h.draftEmailBody,
    ).toHaveBeenCalledWith(
      {
        subject:
          'S',
        body: undefined,
        category:
          'service',
      },
    );
  });

  it('takes an email-length draft, beyond the 1,000 characters a post is held to', async () => {
    h.admin = true;
    const res =
      await post(
        {
          mode: 'email-body',
          body: 'x'.repeat(
            5_000,
          ),
          category:
            'announcements',
        },
      );
    expect(
      res.status,
    ).toBe(
      200,
    );
  });

  it('rejects an unknown category', async () => {
    h.admin = true;
    const res =
      await post(
        {
          mode: 'email-body',
          body: 'x',
          category:
            'spam',
        },
      );
    expect(
      res.status,
    ).toBe(
      400,
    );
  });
});
