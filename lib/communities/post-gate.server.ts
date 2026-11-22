/**
 * The one place a post into a community is checked before it is stored (server-only).
 *
 * The site's create path (`lib/feed/api/rmharks.server.ts`) and the developer API's
 * `POST /api/v1/posts` with a `communityId` both call `prepareCommunityPost`, so the two cannot drift:
 * membership, an active ban or timeout (s06-01), `gateCommunityContent` (flair, image descriptions, verification,
 * AutoMod), the removal log and the challenge window. It returns a plain value; the caller stores the post
 * (held posts carry the AutoMod marker) and files the mod-queue entry, because only it knows how it stores content.
 */
import { refusalBody } from '@/lib/errors/codes';
import { prisma } from '@/lib/prisma.server';
import { gateCommunityContent, logRemoved } from '@/lib/communities/gate.server';
import { activeSanction } from '@/lib/communities/bans.server';
import { denyCode, denyText } from '@/lib/communities/bans';
import { derivePostKind } from '@/lib/communities/automod';
import { challengeEntryError } from '@/lib/communities/challenge.server';

/** The JSON body a refusal carries; the site and the API both send it as is (the API wraps it in its envelope). */
export interface CommunityPostRefusal {
  status: 400 | 403 | 404 | 409 | 422;
  code: string | null;
  body: {
    error: string;
    code?: string;
    endsAt?: string | null;
    missing?: number[];
    missingGif?: true;
  };
}

export type PreparedCommunityPost =
  | {
      ok: false;
      refusal: CommunityPostRefusal;
    }
  | {
      ok: true;
      /** An AutoMod hold: store the post as held (soft-deleted with `HELD_BY`) and queue it for the mods. */
      held: boolean;
      /** The rule that held the post (`'AutoMod'` when none). */
      holdRule: string;
      /** A rule that flagged a visible post (or a held challenge entry) for the mods, or null. */
      flagRule: string | null;
    };

export interface PrepareCommunityPostInput {
  communityId: string;
  userId: string;
  content: string;
  imageUrls?: readonly string[] | undefined;
  imageAlts?: readonly string[] | undefined;
  gifUrl?: string | null | undefined;
  gifAlt?: string | null | undefined;
  flairId?: string | null | undefined;
  challengeId?: string | null | undefined;
  hasPoll?: boolean;
  isQuote?: boolean;
}

export async function prepareCommunityPost(args: PrepareCommunityPostInput): Promise<PreparedCommunityPost> {
  const { communityId, userId, content, imageUrls, imageAlts, gifUrl, gifAlt, flairId, challengeId } = args;

  // Posting into a community requires membership.
  const member = await prisma.communityMember.findUnique({
    where: {
      communityId_userId: {
        communityId,
        userId,
      },
    },
    select: {
      id: true,
    },
  });
  if (!member) {
    return {
      ok: false,
      refusal: {
        status: 403,
        code: null,
        body: {
          ...refusalBody('COMMUNITY_POST_JOIN_REQUIRED'),
        },
      },
    };
  }

  // A ban or timeout refuses first, with the end time (s06-01). The gate reads it again as its step 0.
  const sanction = await activeSanction(communityId, userId);
  if (sanction) {
    const code = denyCode(sanction.kind);
    return {
      ok: false,
      refusal: {
        status: 403,
        code,
        body: {
          error: denyText(sanction.kind, sanction.endsAt),
          code,
          endsAt: sanction.endsAt ? sanction.endsAt.toISOString() : null,
        },
      },
    };
  }

  // Flair, image descriptions, verification, AutoMod. One call; the outcome decides below.
  const gate = await gateCommunityContent({
    communityId,
    userId,
    target: 'post',
    content,
    postKind: derivePostKind({
      content,
      gifUrl,
      imageUrls,
      hasPoll: !!args.hasPoll,
      isQuote: !!args.isQuote,
    }),
    flairId,
    imageUrls,
    imageAlts,
    gifUrl,
    gifAlt,
  });
  if (gate.kind === 'deny') {
    return {
      ok: false,
      refusal: {
        status: gate.status,
        code: gate.code,
        body: {
          error: gate.error,
          code: gate.code,
          ...(gate.endsAt !== undefined
            ? {
                endsAt: gate.endsAt,
              }
            : {}),
          ...(gate.missing
            ? {
                missing: gate.missing,
              }
            : {}),
          ...(gate.missingGif
            ? {
                missingGif: true as const,
              }
            : {}),
        },
      },
    };
  }
  if (gate.kind === 'remove') {
    await logRemoved({
      communityId,
      entityType: 'rmhark',
      postId: null,
      authorId: userId,
      ruleName: gate.ruleName,
      content,
    });
    return {
      ok: false,
      refusal: {
        status: 422,
        code: 'automod_removed',
        body: {
          error: `Your post was removed by this community's AutoMod rule "${gate.ruleName}".`,
          code: 'automod_removed',
        },
      },
    };
  }
  if (challengeId) {
    const challengeError = await challengeEntryError(communityId, challengeId, userId);
    if (challengeError) {
      return {
        ok: false,
        refusal: {
          status: 409,
          code: 'challenge_closed',
          body: {
            error: challengeError,
            code: 'challenge_closed',
          },
        },
      };
    }
  }

  // A challenge entry is never invisible: a hold becomes a flag so the mods still see it
  // without the entry vanishing from the contest.
  if (gate.kind === 'hold' && !challengeId) {
    return {
      ok: true,
      held: true,
      holdRule: gate.ruleName,
      flagRule: null,
    };
  }
  if (gate.kind === 'hold')
    return {
      ok: true,
      held: false,
      holdRule: 'AutoMod',
      flagRule: gate.ruleName,
    };
  return {
    ok: true,
    held: false,
    holdRule: 'AutoMod',
    flagRule: gate.kind === 'allow' && gate.flag ? gate.flag.ruleName : null,
  };
}
