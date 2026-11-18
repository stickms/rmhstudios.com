/**
 * Account consolidation, as a Better Auth plugin (design:
 * docs/superpowers/specs/2026-11-16-account-consolidation-design.md).
 *
 * 1. **Recent sign-in rule.** Connecting or removing a sign-in method, changing
 *    the email and starting a merge need a session created in the last ten
 *    minutes (`FRESH_SESSION_MS`). A stolen, older session cannot add a way in.
 * 2. **Empty-account merge.** A brand-new account with no history (see
 *    `account-history.server.ts`) can hand its sign-in methods to an existing
 *    account and be closed:
 *
 *      GET  /api/auth/account-merge/eligibility   may this account be merged away?
 *      POST /api/auth/account-merge/start         (as B) open an intent, sign B out
 *      GET  /api/auth/account-merge/pending       (as A) what would move
 *      POST /api/auth/account-merge/confirm       (as A) move it, close B
 *      POST /api/auth/account-merge/cancel        drop the intent
 *
 * The rules themselves are pure and tested in `merge-rules.ts`.
 */
import {
  createHash,
  randomBytes,
} from 'node:crypto';
import type { BetterAuthPlugin } from 'better-auth';
import {
  APIError,
  createAuthEndpoint,
  createAuthMiddleware,
  getSessionFromCtx,
} from 'better-auth/api';
import {
  deleteSessionCookie,
  expireCookie,
} from 'better-auth/cookies';
import { prisma } from '@/lib/prisma.server';
import { logAdminAction } from '@/lib/admin-audit.server';
import { userChipSelect } from '@/lib/user-display';
import { findAccountHistory } from '@/lib/auth/account-history.server';
import { notifySignInChange } from '@/lib/auth/security-notice.server';
import {
  CREDENTIAL_PROVIDER_ID,
  SESSION_NOT_FRESH,
} from '@/lib/auth/providers';
import {
  MERGE_COOKIE,
  MERGE_INTENT_PREFIX,
  MERGE_INTENT_TTL_MS,
  checkMergeConfirm,
  isFreshSession,
  mergeEligibility,
  parseMergeIntent,
  type MergeIntent,
} from '@/lib/auth/merge-rules';

/** Endpoints that change how an account signs in. */
const NEEDS_RECENT_SIGN_IN =
  new Set(
    [
      '/link-social',
      '/unlink-account',
      '/change-email',
      '/link/steam',
      '/account-merge/start',
    ],
  );

function sha256(
  value: string,
): string {
  return createHash(
    'sha256',
  )
    .update(
      value,
    )
    .digest(
      'hex',
    );
}

function toMillis(
  value:
    | Date
    | string
    | number,
): number {
  return new Date(
    value,
  ).getTime();
}

async function eligibilityFor(
  userId: string,
) {
  const accounts =
    await prisma.account.findMany(
      {
        where:
          {
            userId,
          },
        select:
          {
            providerId: true,
          },
      },
    );
  const history =
    await findAccountHistory(
      userId,
    );
  return mergeEligibility(
    accounts,
    history,
  );
}

export function consolidation() {
  return {
    id: 'account-consolidation',

    hooks:
      {
        before:
          [
            {
              matcher:
                (
                  ctx,
                ) =>
                  NEEDS_RECENT_SIGN_IN.has(
                    ctx.path ??
                      '',
                  ),
              handler:
                createAuthMiddleware(
                  async (
                    ctx,
                  ) => {
                    // Read the session row, never the cookie cache: a revoked session
                    // must not pass because its cookie copy is still signed.
                    const session =
                      await getSessionFromCtx(
                        ctx,
                        {
                          disableCookieCache: true,
                        },
                      );
                    if (
                      !session
                    )
                      return; // the endpoint answers 401 itself
                    if (
                      !isFreshSession(
                        toMillis(
                          session
                            .session
                            .createdAt,
                        ),
                        Date.now(),
                      )
                    ) {
                      throw new APIError(
                        'FORBIDDEN',
                        {
                          code: SESSION_NOT_FRESH,
                          message:
                            'Sign in again to change how you sign in.',
                        },
                      );
                    }
                  },
                ),
            },
          ],
      },

    endpoints:
      {
        accountMergeEligibility:
          createAuthEndpoint(
            '/account-merge/eligibility',
            {
              method:
                'GET',
            },
            async (
              ctx,
            ) => {
              const session =
                await getSessionFromCtx(
                  ctx,
                );
              if (
                !session
              )
                throw new APIError(
                  'UNAUTHORIZED',
                );
              return ctx.json(
                await eligibilityFor(
                  session
                    .user
                    .id,
                ),
              );
            },
          ),

        accountMergeStart:
          createAuthEndpoint(
            '/account-merge/start',
            {
              method:
                'POST',
            },
            async (
              ctx,
            ) => {
              const session =
                await getSessionFromCtx(
                  ctx,
                  {
                    disableCookieCache: true,
                  },
                );
              if (
                !session
              )
                throw new APIError(
                  'UNAUTHORIZED',
                );
              const fromUserId =
                session
                  .user
                  .id;

              const eligibility =
                await eligibilityFor(
                  fromUserId,
                );
              if (
                !eligibility.eligible
              ) {
                throw new APIError(
                  'BAD_REQUEST',
                  {
                    code: 'MERGE_NOT_ELIGIBLE',
                    message:
                      eligibility.reason,
                  },
                );
              }

              // One open intent per account: a new start replaces the old one.
              await prisma.verification.deleteMany(
                {
                  where:
                    {
                      identifier:
                        {
                          startsWith:
                            MERGE_INTENT_PREFIX,
                        },
                      value:
                        {
                          contains: `"${fromUserId}"`,
                        },
                    },
                },
              );

              const token =
                randomBytes(
                  32,
                ).toString(
                  'base64url',
                );
              const now =
                Date.now();
              const intent: MergeIntent =
                {
                  fromUserId,
                  createdAt:
                    now,
                  expiresAt:
                    now +
                    MERGE_INTENT_TTL_MS,
                };
              await prisma.verification.create(
                {
                  data: {
                    identifier: `${MERGE_INTENT_PREFIX}${sha256(token)}`,
                    value:
                      JSON.stringify(
                        intent,
                      ),
                    expiresAt:
                      new Date(
                        intent.expiresAt,
                      ),
                  },
                },
              );

              const cookie =
                ctx.context.createAuthCookie(
                  MERGE_COOKIE,
                  {
                    maxAge:
                      MERGE_INTENT_TTL_MS /
                      1000,
                  },
                );
              await ctx.setSignedCookie(
                cookie.name,
                token,
                ctx
                  .context
                  .secret,
                {
                  ...cookie.attributes,
                  httpOnly: true,
                  sameSite:
                    'lax',
                  path: '/',
                },
              );

              // B is done: end every session it has, here and on other devices, so
              // nothing can be added to it while the merge is open.
              await prisma.session.deleteMany(
                {
                  where:
                    {
                      userId:
                        fromUserId,
                    },
                },
              );
              deleteSessionCookie(
                ctx,
              );

              return ctx.json(
                {
                  ok: true,
                },
              );
            },
          ),

        accountMergePending:
          createAuthEndpoint(
            '/account-merge/pending',
            {
              method:
                'GET',
            },
            async (
              ctx,
            ) => {
              const session =
                await getSessionFromCtx(
                  ctx,
                );
              if (
                !session
              )
                throw new APIError(
                  'UNAUTHORIZED',
                );
              const intent =
                await readIntent(
                  ctx,
                );
              if (
                !intent ||
                Date.now() >=
                  intent
                    .intent
                    .expiresAt
              )
                return ctx.json(
                  {
                    pending:
                      null,
                  },
                );
              if (
                intent
                  .intent
                  .fromUserId ===
                session
                  .user
                  .id
              )
                return ctx.json(
                  {
                    pending:
                      null,
                  },
                );

              const from =
                await prisma.user.findUnique(
                  {
                    where:
                      {
                        id: intent
                          .intent
                          .fromUserId,
                      },
                    select:
                      {
                        ...userChipSelect,
                        accounts:
                          {
                            select:
                              {
                                providerId: true,
                              },
                          },
                      },
                  },
                );
              if (
                !from
              )
                return ctx.json(
                  {
                    pending:
                      null,
                  },
                );
              return ctx.json(
                {
                  pending:
                    {
                      name: from.name,
                      image:
                        from.image,
                      methods:
                        from.accounts
                          .map(
                            (
                              a,
                            ) =>
                              a.providerId,
                          )
                          .filter(
                            (
                              p,
                            ) =>
                              p !==
                              CREDENTIAL_PROVIDER_ID,
                          ),
                      expiresAt:
                        intent
                          .intent
                          .expiresAt,
                    },
                },
              );
            },
          ),

        accountMergeConfirm:
          createAuthEndpoint(
            '/account-merge/confirm',
            {
              method:
                'POST',
            },
            async (
              ctx,
            ) => {
              const session =
                await getSessionFromCtx(
                  ctx,
                  {
                    disableCookieCache: true,
                  },
                );
              if (
                !session
              )
                throw new APIError(
                  'UNAUTHORIZED',
                );
              const toUserId =
                session
                  .user
                  .id;
              const stored =
                await readIntent(
                  ctx,
                );

              const verdict =
                checkMergeConfirm(
                  {
                    intent:
                      stored?.intent ??
                      null,
                    targetUserId:
                      toUserId,
                    targetSessionCreatedAt:
                      toMillis(
                        session
                          .session
                          .createdAt,
                      ),
                    now: Date.now(),
                  },
                );
              if (
                !verdict.ok
              ) {
                throw new APIError(
                  verdict.error ===
                    'stale_sign_in'
                    ? 'FORBIDDEN'
                    : 'BAD_REQUEST',
                  {
                    code:
                      verdict.error ===
                      'stale_sign_in'
                        ? SESSION_NOT_FRESH
                        : `MERGE_${verdict.error.toUpperCase()}`,
                    message:
                      verdict.error,
                  },
                );
              }
              const {
                intent,
                identifier,
              } =
                stored!;
              const fromUserId =
                intent.fromUserId;

              // The intent is single-use from here on, whatever happens next.
              await prisma.verification.deleteMany(
                {
                  where:
                    {
                      identifier,
                    },
                },
              );
              expireCookie(
                ctx,
                ctx.context.createAuthCookie(
                  MERGE_COOKIE,
                ),
              );

              // Still empty? Checked again, not trusted from the start.
              const eligibility =
                await eligibilityFor(
                  fromUserId,
                );
              if (
                !eligibility.eligible
              ) {
                throw new APIError(
                  'BAD_REQUEST',
                  {
                    code: 'MERGE_NOT_ELIGIBLE',
                    message:
                      eligibility.reason,
                  },
                );
              }

              const moved =
                await prisma.$transaction(
                  async (
                    tx,
                  ) => {
                    // Lock B for the rest of the transaction.
                    const locked =
                      await tx.$queryRaw<
                        Array<{
                          id: string;
                        }>
                      >`
              SELECT id FROM "user" WHERE id = ${fromUserId} FOR UPDATE`;
                    if (
                      locked.length ===
                      0
                    )
                      return null;
                    // B's sessions were ended at the start. One now means someone signed
                    // in to B since, so it is in use: refuse rather than close it.
                    if (
                      (await tx.session.count(
                        {
                          where:
                            {
                              userId:
                                fromUserId,
                            },
                        },
                      )) >
                      0
                    )
                      return null;

                    const methods =
                      await tx.account.findMany(
                        {
                          where:
                            {
                              userId:
                                fromUserId,
                              providerId:
                                {
                                  not: CREDENTIAL_PROVIDER_ID,
                                },
                            },
                          select:
                            {
                              providerId: true,
                            },
                        },
                      );
                    await tx.account.updateMany(
                      {
                        where:
                          {
                            userId:
                              fromUserId,
                            providerId:
                              {
                                not: CREDENTIAL_PROVIDER_ID,
                              },
                          },
                        data: {
                          userId:
                            toUserId,
                        },
                      },
                    );
                    await tx.passkey.updateMany(
                      {
                        where:
                          {
                            userId:
                              fromUserId,
                          },
                        data: {
                          userId:
                            toUserId,
                        },
                      },
                    );
                    await tx.user.delete(
                      {
                        where:
                          {
                            id: fromUserId,
                          },
                      },
                    );
                    return methods.map(
                      (
                        m,
                      ) =>
                        m.providerId,
                    );
                  },
                );
              if (
                !moved
              ) {
                throw new APIError(
                  'CONFLICT',
                  {
                    code: 'MERGE_SOURCE_CHANGED',
                    message:
                      'source_changed',
                  },
                );
              }

              await logAdminAction(
                toUserId,
                'account.merge',
                {
                  targetType:
                    'user',
                  targetId:
                    fromUserId,
                  detail: `moved ${moved.join(', ')} from empty account ${fromUserId}`,
                },
              );
              await notifySignInChange(
                toUserId,
                {
                  kind: 'merged',
                  providerIds:
                    moved,
                },
              );

              return ctx.json(
                {
                  ok: true,
                  moved,
                },
              );
            },
          ),

        accountMergeCancel:
          createAuthEndpoint(
            '/account-merge/cancel',
            {
              method:
                'POST',
            },
            async (
              ctx,
            ) => {
              const stored =
                await readIntent(
                  ctx,
                );
              if (
                stored
              )
                await prisma.verification.deleteMany(
                  {
                    where:
                      {
                        identifier:
                          stored.identifier,
                      },
                  },
                );
              expireCookie(
                ctx,
                ctx.context.createAuthCookie(
                  MERGE_COOKIE,
                ),
              );
              return ctx.json(
                {
                  ok: true,
                },
              );
            },
          ),
      },

    rateLimit:
      [
        {
          pathMatcher:
            (
              path,
            ) =>
              path.startsWith(
                '/account-merge/',
              ) &&
              !path.endsWith(
                '/eligibility',
              ),
          window: 60,
          max: 10,
        },
      ],
  } satisfies BetterAuthPlugin;
}

/** What `readIntent` needs from an endpoint context. */
interface CookieReader {
  context: {
    secret: string;
    createAuthCookie: (
      name: string,
    ) => {
      name: string;
    };
  };
  getSignedCookie: (
    name: string,
    secret: string,
  ) => Promise<unknown>;
}

/** The intent this browser holds, if any: signed cookie → hashed lookup. */
async function readIntent(
  ctx: CookieReader,
): Promise<{
  intent: MergeIntent;
  identifier: string;
} | null> {
  const cookie =
    ctx.context.createAuthCookie(
      MERGE_COOKIE,
    );
  const token =
    await ctx.getSignedCookie(
      cookie.name,
      ctx
        .context
        .secret,
    );
  if (
    typeof token !==
      'string' ||
    token.length ===
      0
  )
    return null;
  const identifier = `${MERGE_INTENT_PREFIX}${sha256(token)}`;
  const row =
    await prisma.verification.findFirst(
      {
        where:
          {
            identifier,
          },
      },
    );
  if (
    !row
  )
    return null;
  const intent =
    parseMergeIntent(
      row.value,
    );
  return intent
    ? {
        intent,
        identifier,
      }
    : null;
}
