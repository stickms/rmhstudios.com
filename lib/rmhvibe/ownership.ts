/**
 * RMHVibe — who may write to a page. Client-safe (no server imports).
 *
 * Only a page's owner edits it in place; everyone else (signed out, another
 * user, or anyone on an unowned legacy page) gets a remix: a new page of their
 * own that records where it came from.
 */

export type VibeWritePlan =
  | {
      mode: 'create';
    }
  | {
      mode: 'edit';
      pageId: string;
    }
  | {
      mode: 'remix';
      sourcePageId: string;
      sourceVersionId:
        | string
        | null;
    };

export function canEditVibe(
  ownerId:
    | string
    | null,
  userId:
    | string
    | null,
): boolean {
  return (
    userId !==
      null &&
    ownerId ===
      userId
  );
}

export function planVibeWrite(input: {
  existing: {
    id: string;
    ownerId:
      | string
      | null;
  } | null;
  userId:
    | string
    | null;
  fromVersionId:
    | string
    | null;
}): VibeWritePlan {
  const {
    existing,
    userId,
    fromVersionId,
  } =
    input;
  if (
    !existing
  )
    return {
      mode: 'create',
    };
  if (
    canEditVibe(
      existing.ownerId,
      userId,
    )
  )
    return {
      mode: 'edit',
      pageId:
        existing.id,
    };
  return {
    mode: 'remix',
    sourcePageId:
      existing.id,
    sourceVersionId:
      fromVersionId,
  };
}
