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
}

/**
 * The full catalog. Order is the display order in the dashboard and docs.
 */
export const SCOPES: ScopeDetail[] = [
  { id: 'read:profile', action: 'read', group: 'Account', description: 'Read your account summary, tier, and stats.' },
  { id: 'read:posts', action: 'read', group: 'Posts', description: 'Read your own posts.' },
  { id: 'write:posts', action: 'write', group: 'Posts', description: 'Create and delete posts on your account.' },
  { id: 'read:feed', action: 'read', group: 'Feed', description: 'Read the public global feed.' },
  { id: 'read:users', action: 'read', group: 'Users', description: 'Read public user profiles and the social graph.' },
  { id: 'write:follows', action: 'write', group: 'Users', description: 'Follow and unfollow other users.' },
  { id: 'write:likes', action: 'write', group: 'Engagement', description: 'Like and unlike posts.' },
  { id: 'write:comments', action: 'write', group: 'Engagement', description: 'Comment on posts.' },
  { id: 'read:notifications', action: 'read', group: 'Account', description: 'Read your notifications.' },
  { id: 'read:bookmarks', action: 'read', group: 'Account', description: 'Read your bookmarks.' },
  { id: 'write:bookmarks', action: 'write', group: 'Account', description: 'Add and remove bookmarks.' },
  { id: 'write:media', action: 'write', group: 'Media', description: 'Upload images for use in posts.' },
  { id: 'read:builds', action: 'read', group: 'Content', description: 'Read the public builds marketplace.' },
  { id: 'read:content', action: 'read', group: 'Content', description: 'Read blog posts and news articles.' },
  { id: 'read:leaderboards', action: 'read', group: 'Content', description: 'Read public game leaderboards.' },
  { id: 'manage:webhooks', action: 'manage', group: 'Webhooks', description: 'Create and manage webhook subscriptions.' },
];

export const ALL_SCOPES: string[] = SCOPES.map((s) => s.id);

const SCOPE_BY_ID = new Map(SCOPES.map((s) => [s.id, s]));

/** Read-only scopes — the safe default grant for a new key. */
export const READ_SCOPES: string[] = SCOPES.filter((s) => s.action === 'read').map((s) => s.id);

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
 * an action wildcard (`read:*`) grants every scope with that action.
 */
export function hasScope(granted: readonly string[], required: string): boolean {
  if (granted.includes('*')) return true;
  if (granted.includes(required)) return true;
  const action = required.split(':')[0];
  return granted.includes(`${action}:*`);
}

/** Group the catalog for rendering (dashboard + docs), preserving order. */
export function scopesByGroup(): { group: string; scopes: ScopeDetail[] }[] {
  const groups: { group: string; scopes: ScopeDetail[] }[] = [];
  for (const scope of SCOPES) {
    let bucket = groups.find((g) => g.group === scope.group);
    if (!bucket) {
      bucket = { group: scope.group, scopes: [] };
      groups.push(bucket);
    }
    bucket.scopes.push(scope);
  }
  return groups;
}
