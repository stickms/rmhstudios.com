/**
 * s06-01 FR-7: every path that enforces a ban or timeout reads `activeSanction`, and the paths that matter are listed.
 * Also: a timed-out member's developer-API comment on a community post is refused.
 */
import { readFileSync } from 'node:fs';
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { handlersOf } from '@/lib/__tests__/api-handlers-of';
import { BAN_ENFORCEMENT_PATHS } from '@/lib/communities/bans';

const h =
  vi.hoisted(
    () => ({
      sanction:
        null as null | {
          kind:
            | 'ban'
            | 'timeout';
          endsAt: Date | null;
        },
      created: 0,
      communityId:
        'c1' as
          | string
          | null,
    }),
  );

vi.mock(
  '@/lib/communities/bans.server',
  () => ({
    activeSanction:
      async () =>
        h.sanction,
  }),
);
vi.mock(
  '@/lib/social/engagement.server',
  () => ({
    createComment:
      async () => {
        h.created += 1;
        return {
          ok: true,
          found: true,
          comment:
            {
              id: 'c',
              content:
                'x',
              createdAt:
                new Date(),
              parentId:
                null,
              user: {},
            },
        };
      },
  }),
);
vi.mock(
  '@/lib/feed/audience.server',
  () => ({
    canReadThread:
      async () =>
        true,
  }),
);
vi.mock(
  '@/lib/api/serializers.server',
  () => ({
    apiAuthorSelect:
      {},
    serializeAuthor:
      () => ({}),
    parsePage:
      () => ({
        limit: 1,
        cursor:
          null,
      }),
    page: () => ({}),
  }),
);
vi.mock(
  '@/lib/prisma.server',
  () => ({
    prisma:
      {
        rMHark:
          {
            findUnique:
              async () => ({
                communityId:
                  h.communityId,
              }),
          },
      },
  }),
);
vi.mock(
  '@/lib/api/with-developer-api.server',
  () => ({
    apiOptions:
      () =>
        new Response(
          null,
        ),
    withDeveloperApi:
      async (
        _req: Request,
        fn: (c: {
          userId: string;
          json: (
            b: unknown,
            s?: number,
          ) => Response;
          error: (
            c: string,
            m: string,
            s: number,
          ) => Response;
        }) => Promise<Response>,
      ) =>
        fn(
          {
            userId:
              'u1',
            json: (
              b,
              s = 200,
            ) =>
              Response.json(
                b,
                {
                  status:
                    s,
                },
              ),
            error:
              (
                code,
                m,
                s,
              ) =>
                Response.json(
                  {
                    error:
                      {
                        code,
                        message:
                          m,
                      },
                  },
                  {
                    status:
                      s,
                  },
                ),
          },
        ),
  }),
);

import { Route as V1Comments } from '../../../app/routes/api/v1/posts/$id/comments';

type Handler =
  (a: {
    request: Request;
    params: Record<
      string,
      string
    >;
  }) => Promise<Response>;
const post =
  () =>
    handlersOf<Handler>(
      V1Comments,
    )
      .POST!(
      {
        request:
          new Request(
            'https://x.test/x',
            {
              method:
                'POST',
              headers:
                {
                  'content-type':
                    'application/json',
                },
              body: JSON.stringify(
                {
                  content:
                    'hello',
                },
              ),
            },
          ),
        params:
          {
            id: 'p1',
          },
      },
    );

beforeEach(
  () => {
    h.sanction =
      null;
    h.created = 0;
    h.communityId =
      'c1';
  },
);

describe('BAN_ENFORCEMENT_PATHS', () => {
  it('lists join, invite accept, join request, the gate and the v1 comment route', () => {
    for (const p of [
      'communities.$slug.join.server.ts',
      'invites.server.ts',
      'communities.$slug.join-request.server.ts',
      'gate.server.ts',
      'posts/$id/comments.ts',
    ]) {
      expect(
        BAN_ENFORCEMENT_PATHS.some(
          (
            x,
          ) =>
            x.endsWith(
              p,
            ),
        ),
        p,
      ).toBe(
        true,
      );
    }
  });

  it.each(
    [
      ...BAN_ENFORCEMENT_PATHS,
    ],
  )(
    '%s imports and calls activeSanction',
    (
      path,
    ) => {
      const src =
        readFileSync(
          path,
          'utf8',
        );
      expect(
        src,
      ).toMatch(
        /import\s*\{[^}]*\bactiveSanction\b[^}]*\}\s*from\s*'@\/lib\/communities\/bans\.server'/,
      );
      expect(
        src,
      ).toMatch(
        /activeSanction\(/,
      );
    },
  );
});

describe('developer API comment on a community post', () => {
  it('refuses a timed-out member with the end time and writes nothing', async () => {
    h.sanction =
      {
        kind: 'timeout',
        endsAt:
          new Date(
            Date.now() +
              3_600_000,
          ),
      };
    const res =
      await post();
    expect(
      res.status,
    ).toBe(
      403,
    );
    const body =
      (await res.json()) as {
        error: {
          code: string;
          message: string;
        };
      };
    expect(
      body
        .error
        .code,
    ).toBe(
      'forbidden',
    );
    expect(
      body
        .error
        .message,
    ).toContain(
      'timed out',
    );
    expect(
      h.created,
    ).toBe(
      0,
    );
  });

  it('allows an unsanctioned member, and ignores sanctions for a post outside a community', async () => {
    expect(
      (
        await post()
      )
        .status,
    ).toBe(
      201,
    );
    h.communityId =
      null;
    h.sanction =
      {
        kind: 'ban',
        endsAt:
          null,
      };
    expect(
      (
        await post()
      )
        .status,
    ).toBe(
      201,
    );
    expect(
      h.created,
    ).toBe(
      2,
    );
  });
});
