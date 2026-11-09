/**
 * Live Spaces — client-safe view types. Shared by `lib/spaces.server.ts`
 * (which builds them), the API routes, the room page, and the room UI. Kept in
 * a plain (non-`.server`) module so client components can import the shapes
 * without pulling in Prisma.
 */

/** The kinds of thing a space can pin. Shared by the create API's validation and the hub. */
export const SPACE_PINNED_KINDS = ['post', 'url', 'tube_room'] as const;
export type SpacePinnedKind = (typeof SPACE_PINNED_KINDS)[number];

export interface SpacePinned {
  kind: SpacePinnedKind;
  /** Post id / URL / room id/code, depending on `kind`. */
  ref: string;
}

/** Longest `ref` a pin may carry. */
export const SPACE_PIN_REF_MAX = 500;

/**
 * Read a stored or received pin. Anything that is not a well-formed pin of a
 * current kind reads as "no pin" (null), so a row written by an older version of
 * the site (for example a kind that was since removed) never reaches the UI.
 */
export function parseSpacePinned(value: unknown): SpacePinned | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (typeof v.ref !== 'string' || v.ref.length === 0 || v.ref.length > SPACE_PIN_REF_MAX) {
    return null;
  }
  if (!(SPACE_PINNED_KINDS as readonly unknown[]).includes(v.kind)) return null;
  return { kind: v.kind as SpacePinnedKind, ref: v.ref };
}

/** Minimal user display shape rendered in a space (host, message author). */
export interface SpaceUser {
  id: string;
  name: string | null;
  image: string | null;
  username: string | null;
  handle: string | null;
  isVerified: boolean;
  isAdmin: boolean;
}

export interface SpaceMessageView {
  id: string;
  body: string;
  createdAt: string;
  author: {
    id: string;
    name: string | null;
    image: string | null;
    username: string | null;
    handle: string | null;
  };
}

export type SpaceStatus = 'SCHEDULED' | 'LIVE' | 'ENDED';

export interface SpaceView {
  id: string;
  hostId: string;
  communityId: string | null;
  title: string;
  status: SpaceStatus;
  scheduledAt: string | null;
  startedAt: string | null;
  endedAt: string | null;
  pinned: SpacePinned | null;
  recordChat: boolean;
  createdAt: string;
  host: SpaceUser;
  community: {
    id: string;
    slug: string;
    name: string;
    icon: string | null;
    color: string | null;
  } | null;
  /** Only present (and non-null) for ENDED spaces with `recordChat`. */
  transcript?: SpaceMessageView[] | null;
  /**
   * Best-effort live audience count. The authoritative count is ephemeral in
   * the socket hub (a separate process), so the DB-backed readers leave this
   * `null`; the live room UI fills it from the socket `space:state` event.
   */
  audienceCount?: number | null;
}

/** A live space as surfaced in the "Live now" rail. */
export type LiveSpaceSummary = SpaceView;
