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
} from '@/lib/communities/page-policy';

export class CommunityPageError extends Error {
  constructor(
    message: string,
    public readonly code: 'INVALID' | 'NOT_FOUND' | 'FORBIDDEN' | 'CONFLICT',
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
  refusal: ReturnType<typeof refusalReason>;
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
): CommunityPageDTO {
  const policy = toPolicy(row.editPolicy);
  return {
    id: row.id,
    communityId: row.communityId,
    slug: row.slug,
    title: row.title,
    body: row.body,
    editPolicy: policy,
    pinned: row.pinned,
    updatedAt: row.updatedAt.toISOString(),
    canEdit: canEditPage(policy, standing),
    refusal: refusalReason(policy, standing),
  };
}

/** Pinned pages first (the rules), then most recently touched. */
export async function listCommunityPages(communityId: string): Promise<CommunityPageSummary[]> {
  const rows = await prisma.communityPage.findMany({
    where: { communityId },
    orderBy: [{ pinned: 'desc' }, { updatedAt: 'desc' }],
    select: { id: true, slug: true, title: true, pinned: true, updatedAt: true },
    take: 100,
  });
  return rows.map((row) => ({ ...row, updatedAt: row.updatedAt.toISOString() }));
}

export async function getCommunityPage(
  communityId: string,
  slug: string,
  viewerId: string | null,
  isSiteAdmin = false,
): Promise<CommunityPageDTO | null> {
  const row = await prisma.communityPage.findUnique({
    where: { communityId_slug: { communityId, slug } },
  });
  if (!row) return null;
  const standing = await getEditorStanding(communityId, viewerId, isSiteAdmin);
  return toDTO(row, standing);
}

export async function listRevisions(pageId: string, limit = 50): Promise<RevisionDTO[]> {
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
 * pages turns a wiki into an unmoderated subdomain.
 */
export async function createCommunityPage(
  userId: string,
  communityId: string,
  input: { title: string; body: string; slug?: string; editPolicy?: string; pinned?: boolean },
  isSiteAdmin = false,
): Promise<CommunityPageDTO> {
  const standing = await getEditorStanding(communityId, userId, isSiteAdmin);
  if (!standing.isSiteAdmin && !isModerator(standing.role)) {
    throw new CommunityPageError('Only moderators can create pages', 'FORBIDDEN');
  }

  const title = cleanTitle(input.title);
  const body = cleanBody(input.body);
  const slug = (input.slug ? slugifyPageTitle(input.slug) : slugifyPageTitle(title)).slice(
    0,
    MAX_PAGE_SLUG,
  );
  const editPolicy = input.editPolicy && isEditPolicy(input.editPolicy) ? input.editPolicy : 'mods';

  const existing = await prisma.communityPage.findUnique({
    where: { communityId_slug: { communityId, slug } },
    select: { id: true },
  });
  if (existing) throw new CommunityPageError('A page with that slug already exists', 'CONFLICT');

  const row = await prisma.communityPage.create({
    data: { communityId, slug, title, body, editPolicy, pinned: !!input.pinned },
  });
  return toDTO(row, standing);
}

/**
 * Edit a page.
 *
 * The PREVIOUS body is snapshotted into a revision inside the same transaction
 * as the update, so history can never be missing an entry because a second
 * write raced the first. A no-op save writes no revision at all — a history
 * padded with identical entries is a history nobody reads.
 *
 * `editPolicy`, `pinned` and `slug` are moderator-only even on a page anyone
 * may edit: those are the settings that decide who edits, and a wiki where an
 * editor can widen their own permissions has no policy at all.
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
  },
  isSiteAdmin = false,
): Promise<CommunityPageDTO> {
  const page = await prisma.communityPage.findUnique({ where: { id: pageId } });
  if (!page) throw new CommunityPageError('Page not found', 'NOT_FOUND');

  const standing = await getEditorStanding(page.communityId, userId, isSiteAdmin);
  const policy = toPolicy(page.editPolicy);
  if (!canEditPage(policy, standing)) {
    throw new CommunityPageError('You cannot edit this page', 'FORBIDDEN');
  }

  const wantsSettings = input.editPolicy !== undefined || input.pinned !== undefined;
  if (wantsSettings && !standing.isSiteAdmin && !isModerator(standing.role)) {
    throw new CommunityPageError('Only moderators can change page settings', 'FORBIDDEN');
  }

  const nextTitle = input.title === undefined ? page.title : cleanTitle(input.title);
  const nextBody = input.body === undefined ? page.body : cleanBody(input.body);
  const bodyChanged = nextBody !== page.body;

  const row = await prisma.$transaction(async (tx) => {
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
    return tx.communityPage.update({
      where: { id: pageId },
      data: {
        title: nextTitle,
        body: nextBody,
        ...(input.editPolicy && isEditPolicy(input.editPolicy)
          ? { editPolicy: input.editPolicy }
          : {}),
        ...(input.pinned === undefined ? {} : { pinned: input.pinned }),
      },
    });
  });

  return toDTO(row, standing);
}

/**
 * Restore an earlier revision.
 *
 * The rollback is itself an edit: the current body is snapshotted first, so the
 * vandalised version stays in the record (moderators need to see what happened)
 * and an over-eager revert is undoable by the same mechanism.
 */
export async function rollbackCommunityPage(
  userId: string,
  pageId: string,
  revisionId: string,
  isSiteAdmin = false,
): Promise<CommunityPageDTO> {
  const page = await prisma.communityPage.findUnique({ where: { id: pageId } });
  if (!page) throw new CommunityPageError('Page not found', 'NOT_FOUND');

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

  const row = await prisma.$transaction(async (tx) => {
    await tx.communityPageRevision.create({
      data: {
        pageId,
        editorId: userId,
        body: page.body,
        summary: `Rolled back to revision ${revisionId}`.slice(0, MAX_REVISION_SUMMARY),
      },
    });
    return tx.communityPage.update({ where: { id: pageId }, data: { body: revision.body } });
  });

  return toDTO(row, standing);
}

/** Delete a page. Moderators only — history goes with it via the FK cascade. */
export async function deleteCommunityPage(
  userId: string,
  pageId: string,
  isSiteAdmin = false,
): Promise<void> {
  const page = await prisma.communityPage.findUnique({
    where: { id: pageId },
    select: { id: true, communityId: true },
  });
  if (!page) throw new CommunityPageError('Page not found', 'NOT_FOUND');

  const standing = await getEditorStanding(page.communityId, userId, isSiteAdmin);
  if (!standing.isSiteAdmin && !isModerator(standing.role)) {
    throw new CommunityPageError('Only moderators can delete pages', 'FORBIDDEN');
  }
  await prisma.communityPage.delete({ where: { id: pageId } });
}
