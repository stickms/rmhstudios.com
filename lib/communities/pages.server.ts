/**
 * Community wiki pages (F21) — service layer.
 *
 * `Community` had `CommunityAnnouncement` and nothing else: no rules page, no
 * FAQ, no collaboratively maintained reference. `GameGuide`/`GameGuideRevision`
 * already proved the shape for a collaboratively edited document with history,
 * so this is deliberately the same shape rather than a second revision system —
 * body-per-revision, an editor, an optional summary, and a rollback that is
 * itself a revision.
 *
 * Rollback-as-a-revision is the anti-vandalism story in one sentence: reverting
 * never destroys history, so a bad revert is as recoverable as bad vandalism.
 */

import { prisma } from '@/lib/prisma.server';
import { userDisplaySelect, resolveUser } from '@/lib/user-display';
import { logModAction } from '@/lib/communities/modlog.server';
import { pageAccess, type PageAccess, type WriteRefusal } from '@/lib/communities/page-access.server';
import {
  MAX_PAGE_BODY,
  MAX_PAGE_SLUG,
  MAX_PAGE_TITLE,
  MAX_REVISION_SUMMARY,
  canEditPage,
  isEditPolicy,
  isModerator,
  refusalReason,
  slugifyPageTitle,
  type CommunityRole,
  type EditPolicy,
  type EditorStanding,
  type PageRefusal,
} from '@/lib/communities/page-policy';

export class CommunityPageError extends Error {
  constructor(
    message: string,
    public readonly code: 'INVALID' | 'NOT_FOUND' | 'FORBIDDEN' | 'CONFLICT',
    /** Set when a community ban, a timeout or a site ban is the reason (the API adds its `code` and `endsAt`). */
    public readonly refusal?: WriteRefusal,
  ) {
    super(message);
    this.name = 'CommunityPageError';
  }
}

/* -------------------------------------------------------------------------- */
/* Wire shapes                                                                */
/* -------------------------------------------------------------------------- */

export interface CommunityPageDTO {
  id: string;
  communityId: string;
  slug: string;
  title: string;
  body: string;
  editPolicy: EditPolicy;
  pinned: boolean;
  updatedAt: string;
  /** Whether the *viewer* may edit this page, per `editPolicy`. */
  canEdit: boolean;
  /** Why not, when `canEdit` is false — so the UI explains instead of hiding. */
  refusal: PageRefusal | null;
  /** When a timeout or a temporary community ban ends (ISO); `null` otherwise or until a moderator lifts it. */
  refusalEndsAt: string | null;
}

export interface CommunityPageSummary {
  id: string;
  slug: string;
  title: string;
  pinned: boolean;
  updatedAt: string;
}

export interface RevisionDTO {
  id: string;
  body: string;
  summary: string | null;
  createdAt: string;
  editor: { id: string; name: string | null; handle: string | null; image: string | null } | null;
}

/* -------------------------------------------------------------------------- */
/* Standing                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Resolve a viewer's standing in a community: role, tenure and live strikes.
 *
 * "No strikes" means no strike that is still in force — permanent (`expiresAt`
 * null) or not yet expired. A strike from eight months ago that has since
 * lapsed does not bar someone from a wiki forever; that would make `trusted` a
 * life sentence rather than a trust signal.
 */
export async function getEditorStanding(
  communityId: string,
  userId: string | null,
  isSiteAdmin = false,
): Promise<EditorStanding> {
  if (!userId) return { role: null, joinedAt: null, activeStrikes: 0, isSiteAdmin };

  const now = new Date();
  const [member, activeStrikes] = await Promise.all([
    prisma.communityMember.findUnique({
      where: { communityId_userId: { communityId, userId } },
      select: { role: true, joinedAt: true },
    }),
    prisma.userStrike.count({
      where: { userId, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
    }),
  ]);

  return {
    role: (member?.role as CommunityRole | undefined) ?? null,
    joinedAt: member?.joinedAt ?? null,
    activeStrikes,
    isSiteAdmin,
  };
}

/* -------------------------------------------------------------------------- */
/* Reads                                                                      */
/* -------------------------------------------------------------------------- */

function toPolicy(raw: string): EditPolicy {
  return isEditPolicy(raw) ? raw : 'mods';
}

const REFUSAL_TEXT: Record<WriteRefusal['reason'], string> = {
  SIGNED_OUT: 'Sign in to edit pages',
  SITE_BANNED: 'Your account cannot edit pages right now',
  COMMUNITY_BANNED: 'You are banned from this community',
  TIMED_OUT: 'You are timed out of this community',
};

/** Throw the refusal a viewer's access gives for a write; nothing when writing is open. */
function assertWritable(access: Awaited<ReturnType<typeof pageAccess>>): asserts access is NonNullable<typeof access> {
  if (!access?.read) throw new CommunityPageError('Page not found', 'NOT_FOUND');
  if (access.writeRefusal) {
    throw new CommunityPageError(REFUSAL_TEXT[access.writeRefusal.reason], 'FORBIDDEN', access.writeRefusal);
  }
}

function toDTO(
  row: {
    id: string;
    communityId: string;
    slug: string;
    title: string;
    body: string;
    editPolicy: string;
    pinned: boolean;
    updatedAt: Date;
  },
  standing: EditorStanding,
  writeRefusal: WriteRefusal | null = null,
): CommunityPageDTO {
  const policy = toPolicy(row.editPolicy);
  const policyRefusal = refusalReason(policy, standing);
  const endsAt = writeRefusal && 'endsAt' in writeRefusal ? writeRefusal.endsAt : null;
  return {
    id: row.id,
    communityId: row.communityId,
    slug: row.slug,
    title: row.title,
    body: row.body,
    editPolicy: policy,
    pinned: row.pinned,
    updatedAt: row.updatedAt.toISOString(),
    canEdit: canEditPage(policy, standing) && writeRefusal === null,
    // A sanction or a signed-out viewer is the more useful thing to say than "not a member".
    refusal: writeRefusal ? writeRefusal.reason : policyRefusal,
    refusalEndsAt: endsAt ? endsAt.toISOString() : null,
  };
}

/**
 * Pinned pages first (the rules), then most recently touched.
 *
 * Reads take the `PageAccess` the caller resolved (`resolveWikiCommunity` / `pageAccess`) rather than a bare community
 * id, so a caller cannot reach the text without having asked who may see it; a viewer who may not read gets nothing.
 */
export async function listCommunityPages(access: PageAccess): Promise<CommunityPageSummary[]> {
  if (!access.read) return [];
  const rows = await prisma.communityPage.findMany({
    where: { communityId: access.communityId },
    orderBy: [{ pinned: 'desc' }, { updatedAt: 'desc' }],
    select: { id: true, slug: true, title: true, pinned: true, updatedAt: true },
    take: 100,
  });
  return rows.map((row) => ({ ...row, updatedAt: row.updatedAt.toISOString() }));
}

export async function getCommunityPage(
  access: PageAccess,
  slug: string,
  viewerId: string | null,
  isSiteAdmin = false,
): Promise<CommunityPageDTO | null> {
  if (!access.read) return null;
  const row = await prisma.communityPage.findUnique({
    where: { communityId_slug: { communityId: access.communityId, slug } },
  });
  if (!row) return null;
  const standing = await getEditorStanding(access.communityId, viewerId, isSiteAdmin);
  return toDTO(row, standing, access.writeRefusal);
}

/** One page's history, newest edit first. `null` when the page is not in the community the access is for. */
export async function listRevisions(pageId: string, access: PageAccess, limit = 50): Promise<RevisionDTO[] | null> {
  if (!access.read) return null;
  const page = await prisma.communityPage.findUnique({ where: { id: pageId }, select: { communityId: true } });
  if (!page || page.communityId !== access.communityId) return null;
  const rows = await prisma.communityPageRevision.findMany({
    where: { pageId },
    orderBy: { createdAt: 'desc' },
    take: Math.min(Math.max(limit, 1), 100),
    include: { editor: { select: userDisplaySelect } },
  });
  return rows.map((row) => {
    const editor = row.editor ? resolveUser(row.editor) : null;
    return {
      // `CommunityPageRevision.id` is a BigInt and `JSON.stringify` throws on
      // one — a 500 on the read path that no mocked-Prisma test would catch.
      id: row.id.toString(),
      body: row.body,
      summary: row.summary,
      createdAt: row.createdAt.toISOString(),
      editor: editor
        ? { id: editor.id, name: editor.name, handle: editor.handle, image: editor.image }
        : null,
    };
  });
}

/* -------------------------------------------------------------------------- */
/* Writes                                                                     */
/* -------------------------------------------------------------------------- */

function cleanTitle(raw: string): string {
  const title = raw.trim().slice(0, MAX_PAGE_TITLE);
  if (title.length < 2) throw new CommunityPageError('Give the page a title', 'INVALID');
  return title;
}

function cleanBody(raw: string): string {
  const body = raw.slice(0, MAX_PAGE_BODY);
  if (!body.trim()) throw new CommunityPageError('The page cannot be empty', 'INVALID');
  return body;
}

/**
 * Create a page. Only moderators may create one, whatever `editPolicy` says —
 * the policy governs editing an existing page, and letting any member mint new
 * pages turns a wiki into an unmoderated subdomain. The page and its mod-log row
 * are written together.
 */
export async function createCommunityPage(
  userId: string,
  communityId: string,
  input: { title: string; body: string; slug?: string; editPolicy?: string; pinned?: boolean },
  isSiteAdmin = false,
): Promise<CommunityPageDTO> {
  const access = await pageAccess(communityId, userId, isSiteAdmin);
  assertWritable(access);
  const standing = await getEditorStanding(communityId, userId, isSiteAdmin);
  if (!standing.isSiteAdmin && !isModerator(standing.role)) {
    throw new CommunityPageError('Only moderators can create pages', 'FORBIDDEN');
  }

  const title = cleanTitle(input.title);
  const body = cleanBody(input.body);
  const slug = (input.slug ? slugifyPageTitle(input.slug) : slugifyPageTitle(title)).slice(0, MAX_PAGE_SLUG);
  const editPolicy = input.editPolicy && isEditPolicy(input.editPolicy) ? input.editPolicy : 'mods';

  const existing = await prisma.communityPage.findUnique({
    where: { communityId_slug: { communityId, slug } },
    select: { id: true },
  });
  if (existing) throw new CommunityPageError('A page with that slug already exists', 'CONFLICT');

  const row = await prisma.$transaction(async (tx) => {
    const created = await tx.communityPage.create({
      data: { communityId, slug, title, body, editPolicy, pinned: !!input.pinned },
    });
    await logModAction(tx, {
      communityId,
      actorId: userId,
      action: 'wiki_page_created',
      targetType: 'page',
      targetId: created.id,
      detail: { slug, editPolicy, pinned: !!input.pinned },
    });
    return created;
  });
  return toDTO(row, standing, null);
}

const CONFLICT_TEXT = 'Someone else edited this page; reload to see their changes';

/**
 * Edit a page.
 *
 * The PREVIOUS body is snapshotted into a revision inside the same transaction
 * as the update, so history can never be missing an entry because a second
 * write raced the first. A no-op save writes no revision at all — a history
 * padded with identical entries is a history nobody reads.
 *
 * The write is conditional on `baseUpdatedAt`, the version the editor started
 * from: `updateMany({ where: { id, updatedAt } })` matching nothing means someone
 * saved in between, and the whole transaction (revision included) rolls back
 * with a `CONFLICT`.
 *
 * `editPolicy`, `pinned` and `slug` are moderator-only even on a page anyone
 * may edit: those are the settings that decide who edits, and a wiki where an
 * editor can widen their own permissions has no policy at all. A change to
 * either is a moderator action and is logged.
 */
export async function updateCommunityPage(
  userId: string,
  pageId: string,
  input: {
    title?: string;
    body?: string;
    summary?: string | null;
    editPolicy?: string;
    pinned?: boolean;
    baseUpdatedAt: string;
  },
  isSiteAdmin = false,
): Promise<CommunityPageDTO> {
  const page = await prisma.communityPage.findUnique({ where: { id: pageId } });
  if (!page) throw new CommunityPageError('Page not found', 'NOT_FOUND');

  const access = await pageAccess(page.communityId, userId, isSiteAdmin);
  assertWritable(access);
  const standing = await getEditorStanding(page.communityId, userId, isSiteAdmin);
  const policy = toPolicy(page.editPolicy);
  if (!canEditPage(policy, standing)) {
    throw new CommunityPageError('You cannot edit this page', 'FORBIDDEN');
  }

  const wantsSettings = input.editPolicy !== undefined || input.pinned !== undefined;
  if (wantsSettings && !standing.isSiteAdmin && !isModerator(standing.role)) {
    throw new CommunityPageError('Only moderators can change page settings', 'FORBIDDEN');
  }

  const base = new Date(input.baseUpdatedAt);
  if (Number.isNaN(base.getTime())) throw new CommunityPageError('Invalid version', 'INVALID');

  const nextTitle = input.title === undefined ? page.title : cleanTitle(input.title);
  const nextBody = input.body === undefined ? page.body : cleanBody(input.body);
  const bodyChanged = nextBody !== page.body;
  const nextPolicy = input.editPolicy && isEditPolicy(input.editPolicy) ? input.editPolicy : policy;
  const nextPinned = input.pinned === undefined ? page.pinned : input.pinned;
  const settingsChanged = nextPolicy !== policy || nextPinned !== page.pinned;

  const row = await prisma.$transaction(async (tx) => {
    const claimed = await tx.communityPage.updateMany({
      where: { id: pageId, updatedAt: base },
      data: { title: nextTitle, body: nextBody, editPolicy: nextPolicy, pinned: nextPinned },
    });
    if (claimed.count === 0) throw new CommunityPageError(CONFLICT_TEXT, 'CONFLICT');
    if (bodyChanged) {
      await tx.communityPageRevision.create({
        data: {
          pageId,
          editorId: userId,
          body: page.body,
          summary: input.summary?.slice(0, MAX_REVISION_SUMMARY) || null,
        },
      });
    }
    if (settingsChanged) {
      await logModAction(tx, {
        communityId: page.communityId,
        actorId: userId,
        action: 'wiki_policy_changed',
        targetType: 'page',
        targetId: pageId,
        detail: { slug: page.slug, editPolicy: nextPolicy, pinned: nextPinned },
      });
    }
    return tx.communityPage.findUniqueOrThrow({ where: { id: pageId } });
  });

  return toDTO(row, standing, null);
}

/**
 * Restore an earlier revision.
 *
 * The rollback is itself an edit: the current body is snapshotted first, so the
 * vandalised version stays in the record (moderators need to see what happened)
 * and an over-eager revert is undoable by the same mechanism. It takes the same
 * `baseUpdatedAt` check as an edit, and is logged in the community mod log.
 */
export async function rollbackCommunityPage(
  userId: string,
  pageId: string,
  revisionId: string,
  baseUpdatedAt: string,
  isSiteAdmin = false,
): Promise<CommunityPageDTO> {
  const page = await prisma.communityPage.findUnique({ where: { id: pageId } });
  if (!page) throw new CommunityPageError('Page not found', 'NOT_FOUND');

  const access = await pageAccess(page.communityId, userId, isSiteAdmin);
  assertWritable(access);
  const standing = await getEditorStanding(page.communityId, userId, isSiteAdmin);
  if (!canEditPage(toPolicy(page.editPolicy), standing)) {
    throw new CommunityPageError('You cannot edit this page', 'FORBIDDEN');
  }

  let revisionKey: bigint;
  try {
    revisionKey = BigInt(revisionId);
  } catch {
    throw new CommunityPageError('Revision not found', 'NOT_FOUND');
  }

  const revision = await prisma.communityPageRevision.findUnique({ where: { id: revisionKey } });
  if (!revision || revision.pageId !== pageId) {
    throw new CommunityPageError('Revision not found', 'NOT_FOUND');
  }

  const base = new Date(baseUpdatedAt);
  if (Number.isNaN(base.getTime())) throw new CommunityPageError('Invalid version', 'INVALID');

  const row = await prisma.$transaction(async (tx) => {
    const claimed = await tx.communityPage.updateMany({
      where: { id: pageId, updatedAt: base },
      data: { body: revision.body },
    });
    if (claimed.count === 0) throw new CommunityPageError(CONFLICT_TEXT, 'CONFLICT');
    await tx.communityPageRevision.create({
      data: {
        pageId,
        editorId: userId,
        body: page.body,
        summary: `Rolled back to revision ${revisionId}`.slice(0, MAX_REVISION_SUMMARY),
      },
    });
    await logModAction(tx, {
      communityId: page.communityId,
      actorId: userId,
      action: 'wiki_page_rolled_back',
      targetType: 'page',
      targetId: pageId,
      detail: { slug: page.slug, revision: revisionId },
    });
    return tx.communityPage.findUniqueOrThrow({ where: { id: pageId } });
  });

  return toDTO(row, standing, null);
}

/** Delete a page. Moderators only — history goes with it via the FK cascade; the mod-log row stays. */
export async function deleteCommunityPage(userId: string, pageId: string, isSiteAdmin = false): Promise<void> {
  const page = await prisma.communityPage.findUnique({
    where: { id: pageId },
    select: { id: true, communityId: true, slug: true },
  });
  if (!page) throw new CommunityPageError('Page not found', 'NOT_FOUND');

  const access = await pageAccess(page.communityId, userId, isSiteAdmin);
  assertWritable(access);
  const standing = await getEditorStanding(page.communityId, userId, isSiteAdmin);
  if (!standing.isSiteAdmin && !isModerator(standing.role)) {
    throw new CommunityPageError('Only moderators can delete pages', 'FORBIDDEN');
  }
  await prisma.$transaction(async (tx) => {
    await tx.communityPage.delete({ where: { id: pageId } });
    await logModAction(tx, {
      communityId: page.communityId,
      actorId: userId,
      action: 'wiki_page_deleted',
      targetType: 'page',
      targetId: pageId,
      detail: { slug: page.slug },
    });
  });
}
