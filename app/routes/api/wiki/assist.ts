import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { assertAiBudget } from '@/lib/ai/budget.server';
import {
  isAiConfigured,
  streamTask,
} from '@/lib/ai/provider.server';
import {
  WIKI_WRITE,
  asData,
  systemFor,
} from '@/lib/ai/prompts';
import { isAppError } from '@/lib/errors/codes';
import { prisma } from '@/lib/prisma.server';
import { wikiAssistBody } from '@/lib/wiki/wiki-schema';
import { wikiPublicUrl } from '@/lib/wiki/sso.server';

/**
 * POST /api/wiki/assist — "Edit with AI" on the wiki's edit page (docs/wiki.md).
 *
 * The reader describes the page in their own words (what it should say, its
 * sections, facts, tone) and DeepSeek writes the whole page in wikitext. The
 * response is `text/event-stream` of `{"delta":"…"}` frames closed by `[DONE]`,
 * so the words appear in the edit box as they are written; a page is thousands
 * of tokens, and a blocking call would sit past a proxy timeout before the first
 * one. That stream is why this stays a route file rather than a registered
 * endpoint. Nothing is saved here: the text lands in the wiki's edit box, and
 * the reader saves the page or not.
 *
 * Who: anyone signed in to rmhstudios.com, which is who can edit the wiki. It
 * costs money, so it takes the shared AI rate limit and the monthly AI
 * allowance (`assertAiBudget`), metered in `AiUsage` under the reader's id.
 * Suspended accounts are refused, as they are at the wiki's sign-in.
 *
 * Cross-origin: the request comes from wiki.rmhstudios.com, the same site as
 * rmhstudios.com, so the browser sends the site's session cookie with it. Only
 * the wiki's origin is answered with CORS headers, on every response (the 401
 * and 429 `defineHandler` writes included), so the wiki can tell "sign in" from
 * "slow down". A request from any other origin is refused before it reaches
 * the model.
 *
 * The instruction and the page are framed as data (`asData`): readers paste
 * text from anywhere, and the page is whatever its last editor left in it.
 */

/** Origins whose pages may call this: the wiki, and the site itself (no CORS needed there). */
function allowedOrigin(
  request: Request,
):
  | string
  | null {
  const origin =
    request.headers.get(
      'origin',
    );
  if (
    !origin
  )
    return null;
  return origin ===
    wikiPublicUrl()
    ? origin
    : null;
}

function withCors(
  response: Response,
  request: Request,
): Response {
  const origin =
    allowedOrigin(
      request,
    );
  if (
    !origin
  )
    return response;
  const res =
    new Response(
      response.body,
      response,
    );
  res.headers.set(
    'Access-Control-Allow-Origin',
    origin,
  );
  res.headers.set(
    'Access-Control-Allow-Credentials',
    'true',
  );
  res.headers.set(
    'Access-Control-Allow-Methods',
    'POST, OPTIONS',
  );
  res.headers.set(
    'Access-Control-Allow-Headers',
    'Content-Type',
  );
  res.headers.set(
    'Access-Control-Max-Age',
    '600',
  );
  res.headers.append(
    'Vary',
    'Origin',
  );
  return res;
}

/** A browser on any other site, or another subdomain, never reaches the model. */
function foreignOrigin(
  request: Request,
): boolean {
  const origin =
    request.headers.get(
      'origin',
    );
  if (
    !origin
  )
    return false;
  const site =
    new URL(
      request.url,
    )
      .origin;
  return (
    origin !==
      site &&
    origin !==
      wikiPublicUrl()
  );
}

const assist =
  defineHandler(
    {
      auth: 'required',
      rateLimit:
        'ai',
      body: wikiAssistBody,
      label:
        'POST /api/wiki/assist',
    },
    async ({
      request,
      userId,
      body,
    }) => {
      if (
        foreignOrigin(
          request,
        )
      )
        return Response.json(
          {
            error:
              'forbidden',
          },
          {
            status: 403,
          },
        );
      if (
        !isAiConfigured()
      )
        return Response.json(
          {
            error:
              'AI_UNAVAILABLE',
          },
          {
            status: 503,
          },
        );

      const user =
        await prisma.user.findUnique(
          {
            where:
              {
                id: userId,
              },
            select:
              {
                bannedUntil: true,
              },
          },
        );
      if (
        user?.bannedUntil &&
        user.bannedUntil >
          new Date()
      ) {
        return Response.json(
          {
            error:
              'suspended',
          },
          {
            status: 403,
          },
        );
      }

      // Everything that can refuse must refuse here, while a status code is still
      // possible: once the stream's 200 is flushed, a 402 cannot follow it.
      await assertAiBudget(
        userId,
      );

      const encoder =
        new TextEncoder();
      const stream =
        new ReadableStream(
          {
            async start(
              controller,
            ) {
              const send =
                (
                  payload: unknown,
                ) => {
                  try {
                    controller.enqueue(
                      encoder.encode(
                        `data: ${JSON.stringify(payload)}\n\n`,
                      ),
                    );
                  } catch {
                    // The reader closed the editor mid-stream; the generator's
                    // `finally` still meters what was produced.
                  }
                };
              try {
                for await (const delta of streamTask(
                  WIKI_WRITE.task,
                  systemFor(
                    WIKI_WRITE,
                  ),
                  asData(
                    JSON.stringify(
                      {
                        instruction:
                          body.instruction,
                        title:
                          body.title,
                        content:
                          body.content,
                      },
                    ),
                  ),
                  {
                    userId,
                    promptId:
                      WIKI_WRITE.id,
                    promptVer:
                      WIKI_WRITE.version,
                  },
                )) {
                  send(
                    {
                      delta,
                    },
                  );
                }
              } catch (err) {
                // The status line is gone, so a failure is an in-band frame. The
                // upstream message is never echoed.
                console.error(
                  '[api] POST /api/wiki/assist stream failed:',
                  err,
                );
                send(
                  {
                    error:
                      isAppError(
                        err,
                      )
                        ? err.code
                        : 'AI_UNAVAILABLE',
                  },
                );
              } finally {
                try {
                  controller.enqueue(
                    encoder.encode(
                      'data: [DONE]\n\n',
                    ),
                  );
                } catch {
                  /* already closed */
                }
                controller.close();
              }
            },
          },
        );

      return new Response(
        stream,
        {
          headers:
            {
              'Content-Type':
                'text/event-stream',
              'Cache-Control':
                'no-cache, no-transform',
              Connection:
                'keep-alive',
              'X-Accel-Buffering':
                'no',
            },
        },
      );
    },
  );

/** The CORS preflight: no session and no body, only whether the wiki may call. */
const preflight =
  defineHandler(
    {
      auth: 'none',
      label:
        'OPTIONS /api/wiki/assist',
    },
    async () =>
      new Response(
        null,
        {
          status: 204,
        },
      ),
  );

export const Route =
  createFileRoute(
    '/api/wiki/assist',
  )(
    {
      server:
        {
          handlers:
            {
              POST: async (ctx: {
                request: Request;
                params: Record<
                  string,
                  string
                >;
              }) =>
                withCors(
                  await assist(
                    ctx,
                  ),
                  ctx.request,
                ),
              OPTIONS:
                async (ctx: {
                  request: Request;
                  params: Record<
                    string,
                    string
                  >;
                }) =>
                  withCors(
                    await preflight(
                      ctx,
                    ),
                    ctx.request,
                  ),
            },
        },
    },
  );
