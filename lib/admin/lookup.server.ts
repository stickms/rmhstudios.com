/**
 * The server half of the admin lookup: one unique-key question per candidate kind, run in
 * parallel, and one audit row per lookup. Read-only. It never touches a direct or group message
 * model (the candidate list has no such kind), and it never selects an e-mail address, an IP or a
 * session.
 */
import { prisma } from '@/lib/prisma.server';
import {
  logAdminAction,
  recordAdminActionIn,
} from '@/lib/admin-audit.server';
import { mapWithConcurrency } from '@/lib/async-pool';
import { checkRateLimit } from '@/lib/rate-limit.server';
import {
  resolveUser,
  userDisplaySelect,
} from '@/lib/user-display';
import { isDeletedAccount } from '@/lib/account-lifecycle';
import { REPORT_ENTITY_TYPES } from '@/lib/moderation/report-constants';
import {
  auditDetail,
  batchAuditDetail,
  classifyLookup,
  excerpt,
  idShapeOf,
  inputKindOf,
  planLookup,
  type LookupBatchResponse,
  type LookupCandidate,
  type LookupInputKind,
  type LookupKind,
  type LookupResponse,
  type LookupResult,
  type LookupState,
} from '@/lib/admin/lookup';

type Resolver =
  (
    c: LookupCandidate,
    now: Date,
  ) => Promise<LookupResult | null>;

const iso =
  (
    d:
      | Date
      | null
      | undefined,
  ) =>
    d
      ? d.toISOString()
      : null;

function states(
  ...list: Array<
    | LookupState
    | false
    | {
        state: LookupState;
        until: string;
      }
    | null
  >
): LookupResult['states'] {
  return list.flatMap(
    (
      s,
    ) =>
      s
        ? [
            typeof s ===
            'string'
              ? {
                  state:
                    s,
                }
              : s,
          ]
        : [],
  );
}

/** `false` when the key cannot be this kind's id, so no query is made for it. */
function keyFits(
  c: LookupCandidate,
): boolean {
  if (
    c.by !==
    'id'
  )
    return true;
  const shape =
    idShapeOf(
      c.key,
    );
  return c.kind ===
    'outbox'
    ? shape ===
        'bigint'
    : shape ===
        'cuid' ||
        shape ===
          'uuid';
}

const userWhere =
  (
    c: LookupCandidate,
  ) => {
    switch (
      c.by
    ) {
      case 'email':
        return {
          email:
            c.key,
        };
      case 'handle':
        return {
          handle:
            c.key,
        };
      case 'user-key':
        return {
          OR: [
            {
              id: c.key,
            },
            {
              handle:
                c.key.toLowerCase(),
            },
          ],
        };
      default:
        return {
          id: c.key,
        };
    }
  };

const user: Resolver =
  async (
    c,
    now,
  ) => {
    const u =
      await prisma.user.findFirst(
        {
          where:
            userWhere(
              c,
            ),
          select:
            {
              ...userDisplaySelect,
              createdAt: true,
              bannedUntil: true,
              banReason: true,
            },
        },
      );
    if (
      !u
    )
      return null;
    const deleted =
      isDeletedAccount(
        u,
      );
    const banned =
      !deleted &&
      u.bannedUntil !==
        null &&
      u.bannedUntil >
        now;
    return {
      kind: 'user',
      id: u.id,
      label:
        u.handle
          ? `@${u.handle}`
          : (u.name ??
            u.username ??
            u.id),
      createdAt:
        iso(
          u.createdAt,
        ),
      states:
        states(
          deleted &&
            'deleted',
          banned &&
            u.bannedUntil && {
              state:
                'banned',
              until:
                u.bannedUntil.toISOString(),
            },
          u.isBot &&
            'bot',
          u.isAdmin &&
            'admin',
        ),
      publicPath:
        deleted
          ? null
          : `/u/${u.handle ?? u.id}`,
      adminTool:
        {
          tool: 'users',
          ...((u.handle ??
          u.username)
            ? {
                q:
                  u.handle ??
                  u.username ??
                  '',
              }
            : {}),
          open: u.id,
        },
      relatedQuery:
        null,
    };
  };

const post: Resolver =
  async (
    c,
    now,
  ) => {
    const p =
      await prisma.rMHark.findUnique(
        {
          where:
            {
              id: c.key,
            },
          select:
            {
              id: true,
              content: true,
              createdAt: true,
              deletedAt: true,
              audience: true,
              expiresAt: true,
              user: {
                select:
                  {
                    handle: true,
                  },
              },
              community:
                {
                  select:
                    {
                      isPrivate: true,
                    },
                },
            },
        },
      );
    if (
      !p
    )
      return null;
    const isPrivate =
      p.audience ===
        'PRIVATE' ||
      p
        .community
        ?.isPrivate ===
        true;
    return {
      kind: 'post',
      id: p.id,
      label:
        excerpt(
          p.content,
        ),
      createdAt:
        iso(
          p.createdAt,
        ),
      states:
        states(
          p.deletedAt !==
            null &&
            'deleted',
          isPrivate &&
            'private',
          p.expiresAt !==
            null &&
            p.expiresAt <=
              now &&
            'expired',
        ),
      publicPath:
        p.deletedAt ===
          null &&
        p.audience ===
          'PUBLIC' &&
        !isPrivate &&
        p
          .user
          .handle
          ? `/u/${p.user.handle}/post/${p.id}`
          : null,
      adminTool:
        {
          tool: 'reports',
          status:
            'PENDING',
          type: 'rmhark',
        },
      relatedQuery:
        null,
    };
  };

const comment: Resolver =
  async (
    c,
  ) => {
    const m =
      await prisma.rMHarkComment.findUnique(
        {
          where:
            {
              id: c.key,
            },
          select:
            {
              id: true,
              content: true,
              createdAt: true,
              deletedAt: true,
              hiddenAt: true,
              rmheetId: true,
              rmhark:
                {
                  select:
                    {
                      audience: true,
                      deletedAt: true,
                      user: {
                        select:
                          {
                            handle: true,
                          },
                      },
                      community:
                        {
                          select:
                            {
                              isPrivate: true,
                            },
                        },
                    },
                },
            },
        },
      );
    if (
      !m
    )
      return null;
    const parentOpen =
      m
        .rmhark
        .deletedAt ===
        null &&
      m
        .rmhark
        .audience ===
        'PUBLIC' &&
      m
        .rmhark
        .community
        ?.isPrivate !==
        true;
    const handle =
      m
        .rmhark
        .user
        .handle;
    return {
      kind: 'comment',
      id: m.id,
      label:
        excerpt(
          m.content,
        ),
      createdAt:
        iso(
          m.createdAt,
        ),
      states:
        states(
          m.deletedAt !==
            null &&
            'deleted',
          m.hiddenAt !==
            null &&
            'hidden',
        ),
      publicPath:
        m.deletedAt ===
          null &&
        m.hiddenAt ===
          null &&
        parentOpen &&
        handle
          ? `/u/${handle}/post/${m.rmheetId}`
          : null,
      adminTool:
        {
          tool: 'reports',
          status:
            'PENDING',
          type: 'comment',
        },
      relatedQuery:
        m.rmheetId,
    };
  };

const community: Resolver =
  async (
    c,
  ) => {
    const row =
      await prisma.community.findUnique(
        {
          where:
            c.by ===
            'slug'
              ? {
                  slug: c.key,
                }
              : {
                  id: c.key,
                },
          select:
            {
              id: true,
              slug: true,
              name: true,
              isPrivate: true,
              createdAt: true,
            },
        },
      );
    if (
      !row
    )
      return null;
    return {
      kind: 'community',
      id: row.id,
      label:
        row.name,
      createdAt:
        iso(
          row.createdAt,
        ),
      states:
        states(
          row.isPrivate &&
            'private',
        ),
      publicPath:
        row.isPrivate
          ? null
          : `/c/${row.slug}`,
      adminTool:
        null,
      relatedQuery:
        null,
    };
  };

const event: Resolver =
  async (
    c,
  ) => {
    const e =
      await prisma.event.findUnique(
        {
          where:
            {
              id: c.key,
            },
          select:
            {
              id: true,
              title: true,
              createdAt: true,
              canceledAt: true,
              visibility: true,
            },
        },
      );
    if (
      !e
    )
      return null;
    return {
      kind: 'event',
      id: e.id,
      label:
        e.title,
      createdAt:
        iso(
          e.createdAt,
        ),
      states:
        states(
          e.canceledAt !==
            null &&
            'cancelled',
          e.visibility ===
            'PRIVATE' &&
            'private',
          e.visibility ===
            'DRAFT' &&
            'draft',
        ),
      publicPath:
        null,
      adminTool:
        null,
      relatedQuery:
        null,
    };
  };

const tournament: Resolver =
  async (
    c,
  ) => {
    const t =
      await prisma.tournament.findUnique(
        {
          where:
            {
              id: c.key,
            },
          select:
            {
              id: true,
              name: true,
              createdAt: true,
              status: true,
              visibility: true,
            },
        },
      );
    if (
      !t
    )
      return null;
    return {
      kind: 'tournament',
      id: t.id,
      label:
        t.name,
      createdAt:
        iso(
          t.createdAt,
        ),
      states:
        states(
          t.status ===
            'CANCELLED' &&
            'cancelled',
          t.visibility !==
            'public' &&
            'unlisted',
        ),
      publicPath: `/tournaments/${t.id}`,
      adminTool:
        null,
      relatedQuery:
        null,
    };
  };

const build: Resolver =
  async (
    c,
  ) => {
    const b =
      await prisma.userBuild.findUnique(
        {
          where:
            c.by ===
            'slug'
              ? {
                  slug: c.key,
                }
              : {
                  id: c.key,
                },
          select:
            {
              id: true,
              slug: true,
              title: true,
              createdAt: true,
              visibility: true,
              publishedAt: true,
            },
        },
      );
    if (
      !b
    )
      return null;
    return {
      kind: 'build',
      id: b.id,
      label:
        b.title,
      createdAt:
        iso(
          b.createdAt,
        ),
      states:
        states(
          b.visibility ===
            'PRIVATE' &&
            'private',
          b.visibility ===
            'UNLISTED' &&
            'unlisted',
          b.publishedAt ===
            null &&
            'draft',
        ),
      publicPath:
        b.visibility ===
          'PUBLIC' &&
        b.publishedAt !==
          null
          ? `/builds/${b.slug}`
          : null,
      adminTool:
        {
          tool: 'builds',
        },
      relatedQuery:
        null,
    };
  };

const replay: Resolver =
  async (
    c,
  ) => {
    const r =
      await prisma.gameReplay.findUnique(
        {
          where:
            {
              id: c.key,
            },
          select:
            {
              id: true,
              game: true,
              createdAt: true,
              visibility: true,
            },
        },
      );
    if (
      !r
    )
      return null;
    return {
      kind: 'replay',
      id: r.id,
      label:
        r.game,
      createdAt:
        iso(
          r.createdAt,
        ),
      states:
        states(
          r.visibility !==
            'public' &&
            'unlisted',
        ),
      publicPath: `/replays/${r.id}`,
      adminTool:
        null,
      relatedQuery:
        null,
    };
  };

/** Reported kinds the lookup can open in turn. A reported direct message is never one of them. */
const LOOKUP_REPORTED: ReadonlySet<string> =
  new Set(
    [
      'rmhark',
      'comment',
      'user',
      'build',
    ],
  );

const report: Resolver =
  async (
    c,
  ) => {
    const r =
      await prisma.contentReport.findUnique(
        {
          where:
            {
              id: c.key,
            },
          select:
            {
              id: true,
              entityType: true,
              entityId: true,
              status: true,
              withdrawnAt: true,
              createdAt: true,
            },
        },
      );
    if (
      !r
    )
      return null;
    const open =
      r.status ===
        'PENDING' ||
      r.status ===
        'REVIEWING';
    const type =
      REPORT_ENTITY_TYPES.find(
        (
          t,
        ) =>
          t ===
          r.entityType,
      );
    return {
      kind: 'report',
      id: r.id,
      label: `${r.entityType} ${r.entityId}`,
      createdAt:
        iso(
          r.createdAt,
        ),
      states:
        states(
          r.withdrawnAt !==
            null &&
            'withdrawn',
          open
            ? 'pending'
            : 'resolved',
        ),
      publicPath:
        null,
      adminTool:
        {
          tool: 'reports',
          status:
            r.status,
          ...(type
            ? {
                type,
              }
            : {}),
        },
      relatedQuery:
        LOOKUP_REPORTED.has(
          r.entityType,
        )
          ? r.entityId
          : null,
    };
  };

/** A moderator note resolves to its subject; the note's text is never read. */
const note: Resolver =
  async (
    c,
  ) => {
    const n =
      await prisma.moderatorNote.findUnique(
        {
          where:
            {
              id: c.key,
            },
          select:
            {
              id: true,
              createdAt: true,
              deletedAt: true,
              subjectId: true,
              subject:
                {
                  select:
                    userDisplaySelect,
                },
            },
        },
      );
    if (
      !n
    )
      return null;
    const subject =
      resolveUser(
        n.subject,
      );
    const handle =
      subject.handle;
    return {
      kind: 'note',
      id: n.id,
      label:
        handle
          ? `@${handle}`
          : (subject.name ??
            n.subjectId),
      createdAt:
        iso(
          n.createdAt,
        ),
      states:
        states(
          n.deletedAt !==
            null &&
            'deleted',
        ),
      publicPath:
        null,
      adminTool:
        {
          tool: 'users',
          ...(handle
            ? {
                q: handle,
              }
            : {}),
          open: n.subjectId,
        },
      relatedQuery:
        n.subjectId,
    };
  };

const outbox: Resolver =
  async (
    c,
  ) => {
    const o =
      await prisma.outboxEvent.findUnique(
        {
          where:
            {
              id: BigInt(
                c.key,
              ),
            },
          select:
            {
              id: true,
              topic: true,
              createdAt: true,
              deliveredAt: true,
              deadAt: true,
            },
        },
      );
    if (
      !o
    )
      return null;
    return {
      kind: 'outbox',
      id: o.id.toString(),
      label:
        o.topic,
      createdAt:
        iso(
          o.createdAt,
        ),
      states:
        states(
          o.deadAt !==
            null &&
            'dead',
          o.deliveredAt !==
            null &&
            'delivered',
        ),
      publicPath:
        null,
      adminTool:
        {
          tool: 'outbox',
          topic:
            o.topic,
        },
      relatedQuery:
        null,
    };
  };

const jam: Resolver =
  async (
    c,
  ) => {
    const j =
      await prisma.gameJam.findUnique(
        {
          where:
            {
              slug: c.key,
            },
          select:
            {
              id: true,
              slug: true,
              title: true,
              createdAt: true,
            },
        },
      );
    if (
      !j
    )
      return null;
    return {
      kind: 'jam',
      id: j.id,
      label:
        j.title,
      createdAt:
        iso(
          j.createdAt,
        ),
      states:
        [],
      publicPath: `/jams/${j.slug}`,
      adminTool:
        null,
      relatedQuery:
        null,
    };
  };

const library: Resolver =
  async (
    c,
  ) => {
    const d =
      await prisma.libraryDocument.findUnique(
        {
          where:
            {
              slug: c.key,
            },
          select:
            {
              id: true,
              slug: true,
              title: true,
              createdAt: true,
              hidden: true,
              reported: true,
            },
        },
      );
    if (
      !d
    )
      return null;
    return {
      kind: 'library',
      id: d.id,
      label:
        d.title,
      createdAt:
        iso(
          d.createdAt,
        ),
      states:
        states(
          d.hidden &&
            'hidden',
          d.reported &&
            'reported',
        ),
      publicPath:
        d.hidden
          ? null
          : `/library/${d.slug}`,
      adminTool:
        {
          tool: 'library',
        },
      relatedQuery:
        null,
    };
  };

const news: Resolver =
  async (
    c,
  ) => {
    const a =
      await prisma.newsArticle.findUnique(
        {
          where:
            {
              slug: c.key,
            },
          select:
            {
              id: true,
              slug: true,
              title: true,
              createdAt: true,
              status: true,
            },
        },
      );
    if (
      !a
    )
      return null;
    const live =
      a.status ===
      'PUBLISHED';
    return {
      kind: 'news',
      id: a.id,
      label:
        a.title,
      createdAt:
        iso(
          a.createdAt,
        ),
      states:
        states(
          !live &&
            'draft',
        ),
      publicPath:
        live
          ? `/news/${a.slug}`
          : null,
      adminTool:
        null,
      relatedQuery:
        null,
    };
  };

const blog: Resolver =
  async (
    c,
  ) => {
    const b =
      await prisma.blogPost.findUnique(
        {
          where:
            {
              slug: c.key,
            },
          select:
            {
              id: true,
              slug: true,
              title: true,
              createdAt: true,
              status: true,
            },
        },
      );
    if (
      !b
    )
      return null;
    const live =
      b.status ===
      'published';
    return {
      kind: 'blog',
      id: b.id,
      label:
        b.title,
      createdAt:
        iso(
          b.createdAt,
        ),
      states:
        states(
          b.status ===
            'draft' &&
            'draft',
          b.status ===
            'scheduled' &&
            'pending',
        ),
      publicPath:
        live
          ? `/blog/${b.slug}`
          : null,
      adminTool:
        {
          tool: 'blog',
        },
      relatedQuery:
        null,
    };
  };

const RESOLVERS: Record<
  LookupKind,
  Resolver
> =
  {
    user,
    post,
    comment,
    community,
    event,
    tournament,
    build,
    replay,
    report,
    note,
    outbox,
    jam,
    library,
    news,
    blog,
  };

/** Classify one pasted string and ask each candidate kind its one unique-key question in parallel. No audit row. */
async function resolveLookup(
  raw: string,
): Promise<{
  response: LookupResponse;
  inputKind: LookupInputKind;
  found: LookupResult[];
}> {
  const input =
    classifyLookup(
      raw,
    );
  const inputKind =
    inputKindOf(
      input,
    );
  const candidates =
    planLookup(
      input,
    );
  const asked =
    candidates.filter(
      keyFits,
    );
  const now =
    new Date();
  const found =
    (
      await Promise.all(
        asked.map(
          (
            c,
          ) =>
            RESOLVERS[
              c
                .kind
            ](
              c,
              now,
            ),
        ),
      )
    ).filter(
      (
        r,
      ): r is LookupResult =>
        r !==
        null,
    );
  const outcome: LookupResponse['outcome'] =
    found.length >
    0
      ? 'found'
      : input.type ===
          'foreign-link'
        ? 'foreign-link'
        : input.type ===
            'unknown-path'
          ? 'unknown-path'
          : input.type ===
              'junk'
            ? 'unrecognised'
            : 'not-found';
  return {
    response:
      {
        outcome,
        inputKind,
        results:
          found,
        tried:
          candidates.map(
            (
              c,
            ) =>
              c.kind,
          ),
      },
    inputKind,
    found,
  };
}

/**
 * Classify what was pasted, ask each candidate kind its one unique-key question in parallel, and
 * audit the lookup. A key that cannot be a kind's id never reaches the database for that kind.
 */
export async function runAdminLookup(
  adminId: string,
  raw: string,
): Promise<LookupResponse> {
  const {
    response,
    inputKind,
    found,
  } =
    await resolveLookup(
      raw,
    );
  const only =
    found.length ===
    1
      ? found[0]
      : undefined;
  await logAdminAction(
    adminId,
    'admin.lookup',
    {
      ...(only
        ? {
            targetType:
              only.kind,
            targetId:
              only.id,
          }
        : {}),
      detail:
        auditDetail(
          inputKind,
          found,
        ),
    },
  );
  return response;
}

/** At most this many items are resolved at once, so a batch cannot fan out 50 resolver sets. */
export const BATCH_CONCURRENCY = 5;

/**
 * Resolve a batch (the caller has already trimmed, de-duplicated and capped it), five items at a
 * time, and write ONE audit row for the whole batch inside a transaction: the item count, the input
 * kinds and how many matched, never an input (an e-mail address is personal data).
 */
export async function runAdminLookupBatch(
  adminId: string,
  items: readonly string[],
): Promise<LookupBatchResponse> {
  const resolved =
    await mapWithConcurrency(
      items,
      BATCH_CONCURRENCY,
      async (
        item,
      ) => {
        try {
          return await resolveLookup(
            item,
          );
        } catch {
          // One failing item must not fail the batch. The error is not logged: a database error can
          // quote the query, and the query may hold an e-mail address.
          const input =
            classifyLookup(
              item,
            );
          return {
            response:
              {
                outcome:
                  'error',
                inputKind:
                  inputKindOf(
                    input,
                  ),
                results:
                  [],
                tried:
                  [],
              } satisfies LookupResponse,
            inputKind:
              inputKindOf(
                input,
              ),
            found:
              [] as LookupResult[],
          };
        }
      },
    );
  await prisma.$transaction(
    async (
      tx,
    ) => {
      await recordAdminActionIn(
        tx,
        adminId,
        'admin.lookup.batch',
        {
          detail:
            batchAuditDetail(
              resolved.map(
                (
                  r,
                ) => ({
                  inputKind:
                    r.inputKind,
                  found:
                    r
                      .found
                      .length,
                }),
              ),
            ),
        },
      );
    },
  );
  return {
    groups:
      resolved.map(
        (
          r,
          i,
        ) => ({
          input:
            items[
              i
            ] ??
            '',
          ...r.response,
        }),
      ),
  };
}

/**
 * Charge a batch against the per-admin lookup budget (60 a minute) one unit per item, so a 50-item
 * batch uses 50. The counter is a fixed window with no refund, so a batch the budget cannot cover
 * takes what is left and is refused whole (no results, 429 with the seconds until the window
 * resets); a retry inside the window would be refused anyway, so nothing is lost by the draw.
 * Returns the seconds to wait, else null.
 */
export async function chargeLookupBudget(
  adminId: string,
  count: number,
): Promise<number | null> {
  for (
    let i = 0;
    i <
    count;
    i++
  ) {
    const r =
      await checkRateLimit(
        adminId,
        {
          limit: 60,
          windowMs: 60_000,
          prefix:
            'admin-lookup-items',
        },
      );
    if (
      !r.allowed
    )
      return r.retryAfter;
  }
  return null;
}
