/**
 * Developer API permission scopes.
 *
 * Every scoped endpoint declares the single scope it requires; a key may act on
 * that endpoint only if its granted scopes satisfy that requirement. Scopes are
 * `<action>:<resource>` (e.g. `read:profile`, `write:posts`). Two wildcards are
 * supported for convenience and stored literally on the key:
 *   - `*`        — full access to everything
 *   - `read:*`   — every read scope (and likewise `write:*`, `manage:*`)
 *
 * This module is the single source of truth for the scope catalog. It is pure
 * (no server imports) so it can be shared by the API wrapper, the key-management
 * UI, the OpenAPI generator, and unit tests.
 */

export type ScopeAction = 'read' | 'write' | 'manage';

export interface ScopeDetail {
  /** The scope id, e.g. `read:profile`. */
  id: string;
  /** `read` is non-mutating; `write`/`manage` mutate state. */
  action: ScopeAction;
  /** Human-readable group for the dashboard + docs. */
  group: string;
  /** One-line description shown in the key-creation UI and the wiki. */
  description: string;
  /**
   * Granted only when a key lists this scope literally: `*` and the action wildcard (`manage:*`) do not
   * satisfy it, so no existing wildcard key gains the power the day the scope ships. (s10-13)
   */
  explicit?: true;
}

/**
 * The full catalog. Order is the display order in the dashboard and docs.
 */
export const SCOPES: ScopeDetail[] = [
  {
    id: 'read:profile',
    action: 'read',
    group: 'Account',
    description: 'Read your account summary, tier, and stats.',
  },
  {
    id: 'read:posts',
    action: 'read',
    group: 'Posts',
    description: 'Read your own posts.',
  },
  {
    id: 'write:posts',
    action: 'write',
    group: 'Posts',
    description: 'Create and delete posts on your account.',
  },
  {
    id: 'read:feed',
    action: 'read',
    group: 'Feed',
    description: 'Read the public global feed.',
  },
  {
    id: 'read:users',
    action: 'read',
    group: 'Users',
    description: 'Read public user profiles and the social graph.',
  },
  {
    id: 'write:follows',
    action: 'write',
    group: 'Users',
    description: 'Follow and unfollow other users.',
  },
  {
    id: 'write:likes',
    action: 'write',
    group: 'Engagement',
    description: 'Like and unlike posts.',
  },
  {
    id: 'write:comments',
    action: 'write',
    group: 'Engagement',
    description: 'Comment on posts.',
  },
  {
    id: 'read:notifications',
    action: 'read',
    group: 'Account',
    description: 'Read your notifications.',
  },
  {
    id: 'read:bookmarks',
    action: 'read',
    group: 'Account',
    description: 'Read your bookmarks.',
  },
  {
    id: 'write:bookmarks',
    action: 'write',
    group: 'Account',
    description: 'Add and remove bookmarks.',
  },
  {
    id: 'write:media',
    action: 'write',
    group: 'Media',
    description: 'Upload images for use in posts.',
  },
  {
    id: 'read:builds',
    action: 'read',
    group: 'Content',
    description: 'Read the public builds marketplace.',
  },
  {
    id: 'read:content',
    action: 'read',
    group: 'Content',
    description: 'Read blog posts and news articles.',
  },
  {
    id: 'read:leaderboards',
    action: 'read',
    group: 'Content',
    description: 'Read public game leaderboards.',
  },
  // X13 — Slice It's chart metadata and boards. Its own scope rather than
  // folding into `read:leaderboards`: a chart's metadata is not a leaderboard,
  // and a community stat site should be grantable one without the other.
  {
    id: 'read:slice-it',
    action: 'read',
    group: 'Content',
    description: 'Read Slice It! charts, leaderboards and public player stats.',
  },
  // Playtime and achievements are a member's own activity, so they sit behind
  // their own scope; the public game catalogue needs no scope at all.
  {
    id: 'read:games',
    action: 'read',
    group: 'Games',
    description: 'Read your game playtime and achievements, and the playtime other members share with you.',
  },
  // Flashcards are the member's own study material; reviews are writable only with the explicit `write:study-reviews`.
  {
    id: 'read:study',
    action: 'read',
    group: 'Study',
    description: 'Read your flashcard decks, authored cards and due counts.',
  },
  {
    id: 'write:study',
    action: 'write',
    group: 'Study',
    description: 'Create, edit and delete your flashcard decks and cards. Reviews cannot be written.',
  },
  {
    id: 'manage:webhooks',
    action: 'manage',
    group: 'Webhooks',
    description: 'Create and manage webhook subscriptions.',
  },

  // Sprint 07
  // s07-10 api-events
  {
    id: 'read:events',
    action: 'read',
    group: 'Events',
    description: 'Read events you can see and your RSVPs.',
  },
  {
    id: 'write:events',
    action: 'write',
    group: 'Events',
    description: 'RSVP to events and cancel your RSVP.',
  },

  // s07-11 api-communities
  {
    id: 'read:communities',
    action: 'read',
    group: 'Communities',
    description: 'Read communities you can see, their rules and posts, and your memberships.',
  },
  {
    id: 'write:communities',
    action: 'write',
    group: 'Communities',
    description: 'Post into communities you are a member of.',
  },

  // s07-12 api-reading
  {
    id: 'read:reading',
    action: 'read',
    group: 'Reading',
    description: 'Read your highlights, notes, shelves and reading goal.',
  },
  {
    id: 'write:reading',
    action: 'write',
    group: 'Reading',
    description: 'Edit, publish, unpublish and delete your highlights and notes, and edit your shelves.',
  },

  // Sprint 08
  // s08-02 api-tournaments
  {
    id: 'read:tournaments',
    action: 'read',
    group: 'Tournaments',
    description: 'Read public tournaments and brackets, and your own entries and matches.',
  },
  {
    id: 'write:tournaments',
    action: 'write',
    group: 'Tournaments',
    description:
      'Check yourself in and report, confirm or withdraw your match results. Never registers or moves coins.',
  },

  // s08-03 api-scheduled
  {
    id: 'read:scheduled',
    action: 'read',
    group: 'Scheduled',
    description: 'Read your drafts, scheduled posts and time capsules.',
  },
  {
    id: 'write:scheduled',
    action: 'write',
    group: 'Scheduled',
    description:
      'Save, change, discard and publish your drafts and scheduled posts. Community posts also need write:communities; time capsules are never changed.',
  },

  // s08-14 api-search
  {
    id: 'read:search',
    action: 'read',
    group: 'Search',
    description: 'Search public posts and people by keyword. Each search counts as 3 requests against the daily quota.',
  },

  // Sprint 09
  // s09-08 api-feeds
  {
    id: 'read:feeds',
    action: 'read',
    group: 'Feeds',
    description:
      'Read your feeds, lists, saved searches and keyword alerts, and page the posts of a feed or list. Reading posts also needs read:posts.',
  },
  {
    id: 'write:feeds',
    action: 'write',
    group: 'Feeds',
    description: 'Replace the members of your lists. Feeds are created, renamed and deleted on the site.',
  },

  // s09-09 api-practice
  {
    id: 'read:practice',
    action: 'read',
    group: 'Practice',
    description:
      'Read your own typing, music practice and focus-session history. Read-only: practice cannot be written through the API.',
  },

  // Sprint 10
  // s10-12 api-events
  {
    id: 'manage:events',
    action: 'manage',
    group: 'Events',
    description: 'Create, edit and cancel events you host, and post updates to the people coming.',
  },

  // s10-13 api-moderation
  {
    id: 'manage:moderation',
    action: 'manage',
    group: 'Moderation',
    description:
      'Moderate communities where you are a moderator: the mod queue and timeouts and bans. Not included in `*` or `manage:*`: a key must list it itself.',
    explicit: true,
  },

  // s10-14 api-rmhtube
  {
    id: 'read:rmhtube',
    action: 'read',
    group: 'RMHTube',
    description: 'Read your Watch later list and watch statistics, and upcoming watch parties.',
  },
  {
    id: 'write:rmhtube',
    action: 'write',
    group: 'RMHTube',
    description: 'Add to and remove from Watch later, and say whether you are going to a watch party.',
  },

  // Sprint 12
  // s12-12 api-reviews
  {
    id: 'write:study-reviews',
    action: 'write',
    group: 'Study',
    description:
      'Grade your flashcard reviews from your own tools; they count on your schedule and statistics. Not included in `*` or `write:*`: a key must list it itself.',
    explicit: true,
  },

  // s12-13 api-characters
  {
    id: 'read:characters',
    action: 'read',
    group: 'RMHCharacters',
    description: 'Read your characters and the summaries of your parties.',
  },

  // Sprint 13
  // s13-10 api-ladder
  {
    id: 'read:ladder',
    action: 'read',
    group: 'RMHLadder',
    description:
      'Read your RMHLadder applications, their dates and notes, and their timelines. Never offers, pay, resumes or contacts. Not included in `*` or `read:*`, and not in a new key’s default grant: a key must list it itself.',
    explicit: true,
  },
  {
    id: 'write:ladder',
    action: 'write',
    group: 'RMHLadder',
    description:
      'Change an application’s status, dates and notes, and add a job you found yourself. Not included in `*` or `write:*`: a key must list it itself.',
    explicit: true,
  },
];

export const ALL_SCOPES: string[] = SCOPES.map((s) => s.id);

const SCOPE_BY_ID = new Map(SCOPES.map((s) => [s.id, s]));

/** The scopes a wildcard or "select all" covers: every catalog scope that is not explicit-only. */
export const WILDCARD_SCOPES: string[] = SCOPES.filter((s) => !s.explicit).map((s) => s.id);

/**
 * Read-only scopes — the safe default grant for a new key. An explicit scope is never in it: a private read
 * (RMHLadder, s13-10) must be chosen by name, not inherited from the default grant.
 */
export const READ_SCOPES: string[] = SCOPES.filter((s) => s.action === 'read' && !s.explicit).map((s) => s.id);

/** Default scopes applied when a key is created without an explicit selection. */
export const DEFAULT_SCOPES: string[] = [...READ_SCOPES];

/** True if `id` is a real catalog scope or a recognised wildcard. */
export function isValidScope(id: string): boolean {
  if (id === '*') return true;
  if (id === 'read:*' || id === 'write:*' || id === 'manage:*') return true;
  return SCOPE_BY_ID.has(id);
}

/**
 * Sanitize a caller-supplied scope list: keep only recognised scopes/wildcards,
 * trim, and de-duplicate while preserving order. Invalid entries are dropped.
 */
export function normalizeScopes(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input) {
    if (typeof raw !== 'string') continue;
    const id = raw.trim();
    if (!isValidScope(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/**
 * Does a key's granted scopes satisfy a required scope? `*` grants everything;
 * an action wildcard (`read:*`) grants every scope with that action. Except a scope marked `explicit`,
 * which only a literal entry grants.
 */
export function hasScope(granted: readonly string[], required: string): boolean {
  if (granted.includes(required)) return true;
  // An explicit scope is never implied by a wildcard (`explicit` on ScopeDetail).
  if (SCOPE_BY_ID.get(required)?.explicit) return false;
  if (granted.includes('*')) return true;
  const action = required.split(':')[0];
  return granted.includes(`${action}:*`);
}

/** Group the catalog for rendering (dashboard + docs), preserving order. */
export function scopesByGroup(): {
  group: string;
  scopes: ScopeDetail[];
}[] {
  const groups: {
    group: string;
    scopes: ScopeDetail[];
  }[] = [];
  for (const scope of SCOPES) {
    let bucket = groups.find((g) => g.group === scope.group);
    if (!bucket) {
      bucket = {
        group: scope.group,
        scopes: [],
      };
      groups.push(bucket);
    }
    bucket.scopes.push(scope);
  }
  return groups;
}
