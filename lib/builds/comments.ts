/**
 * Build comments, the pure half (s06-14): the edit window, who may do what to a comment, and what a reader sees of
 * each state. Client-safe: no Prisma, no server imports. The server computes the rights per comment and the client
 * only reads them.
 */

/** The author may edit within this long of posting (the database clock decides, see `editComment`). */
export const COMMENT_EDIT_WINDOW_MS =
  30 *
  60_000;

/** The entity type used by the report flow. */
export const BUILD_COMMENT_REPORT_TYPE =
  'build-comment';

/**
 * Every server path that reads build comments (their text, their count or who wrote them). Each applies
 * `visibleComment()` or maintains the count through the delete path; `build-comment-read-paths.test.ts` scans them.
 */
export const BUILD_COMMENT_READ_PATHS =
  [
    // The list endpoint (the only loader: the build page fetches comments through it).
    'lib/api/routes/user-builds.$id.comments.server.ts',
    // The service the list and the mutations share.
    'lib/builds/comments.server.ts',
    // The insights "comments per day" series counts live comments only.
    'lib/builds/insights.server.ts',
  ] as const;

/** Moderation reads a reported comment's text whatever its state (an admin judges what was written); source-scanned too. */
export const BUILD_COMMENT_MODERATION_PATHS =
  [
    'lib/moderation/triage.server.ts',
  ] as const;

/** `/api/v1/builds*` exposes only the `commentCount` column, which delete maintains; it lists no comment text. */
export const BUILD_COMMENT_COUNT_ONLY_PATHS =
  [
    'app/routes/api/v1/builds.ts',
    'app/routes/api/v1/builds/$slug.ts',
  ] as const;

export type CommentState =
  /** Shown as written. */
  | 'visible'
  /** The creator hid it: collapsed behind "Show" for everyone but its author. */
  | 'hidden'
  /** The creator hid it and the viewer wrote it: shown normally, with a note. */
  | 'hidden-own'
  /** Deleted but it has replies: the text is replaced. */
  | 'deleted';

export interface CommentFacts {
  userId: string;
  createdAt: Date;
  deletedAt: Date | null;
  hiddenAt: Date | null;
}

export interface CommentViewer {
  /** `null` when signed out. */
  userId:
    | string
    | null;
  isAdmin: boolean;
  /** The build's creator. */
  buildOwnerId: string;
}

export interface CommentRights {
  canEdit: boolean;
  canDelete: boolean;
  canHide: boolean;
  canReport: boolean;
}

export function withinEditWindow(
  createdAt: Date,
  now: Date,
): boolean {
  return (
    now.getTime() -
      createdAt.getTime() <=
    COMMENT_EDIT_WINDOW_MS
  );
}

/** What the viewer may do to this comment. A deleted comment has no actions. */
export function commentRights(
  c: CommentFacts,
  v: CommentViewer,
  now: Date,
): CommentRights {
  if (
    c.deletedAt ||
    !v.userId
  )
    return {
      canEdit: false,
      canDelete: false,
      canHide: false,
      canReport: false,
    };
  const author =
    c.userId ===
    v.userId;
  return {
    canEdit:
      author &&
      withinEditWindow(
        c.createdAt,
        now,
      ),
    canDelete:
      author ||
      v.isAdmin,
    canHide:
      v.userId ===
        v.buildOwnerId &&
      !author,
    canReport:
      !author,
  };
}

/**
 * What a reader sees of a comment, or `null` when it is not listed at all. A deleted comment with no live replies
 * disappears; with replies it stays as a placeholder (the text is never sent). A hidden comment keeps its text so
 * "Show" can reveal it, except that its author sees it normally.
 */
export function visibleComment(
  c: CommentFacts,
  viewerId:
    | string
    | null,
  hasLiveReplies: boolean,
): {
  state: CommentState;
  showContent: boolean;
} | null {
  if (
    c.deletedAt
  )
    return hasLiveReplies
      ? {
          state:
            'deleted',
          showContent: false,
        }
      : null;
  if (
    c.hiddenAt
  ) {
    return viewerId !==
      null &&
      viewerId ===
        c.userId
      ? {
          state:
            'hidden-own',
          showContent: true,
        }
      : {
          state:
            'hidden',
          showContent: true,
        };
  }
  return {
    state:
      'visible',
    showContent: true,
  };
}

/** The refusals a member gets for commenting. None gives a reason beyond "closed" (a lock) or a bare "cannot". */
export type CommentRefusal =
  | 'locked'
  | 'restricted';

export const COMMENT_REFUSAL_MESSAGE: Record<
  CommentRefusal,
  string
> =
  {
    locked:
      'Comments are closed',
    restricted:
      'You cannot comment here',
  };
