/**
 * Releases of a User Build (s04-04), the pure half: the version rule, the commit link and the order. Client-safe;
 * the writes and reads live in `releases.server.ts`.
 *
 * A release is stored as a `BuildVersion` row. Order is by creation time, newest first, and the newest is "Latest":
 * versions are labels the owner chooses, so they are never compared as semantic versions.
 */

export const VERSION_MAX = 20;

import { notice, type NoticePreview } from '@/lib/notifications/notice-keys';
export const CHANGELOG_MAX = 5000;
/** How many releases the build page and the public API carry. */
export const RELEASES_PAGE = 20;
/** Most members one release notifies (watchers and unlockers together). */
export const RELEASE_NOTIFY_CAP = 500;
/** Creates per member per hour. */
export const RELEASE_CREATE_LIMIT = { limit: 10, windowMs: 3_600_000 } as const;

const VERSION_RE = /^[0-9A-Za-z][0-9A-Za-z.+-]*$/;
const COMMIT_RE = /^[0-9a-fA-F]{7,40}$/;

/** 1 to 20 characters: an alphanumeric first, then letters, digits, `.`, `+` and `-`. */
export function isValidVersion(version: string): boolean {
  return version.length >= 1 && version.length <= VERSION_MAX && VERSION_RE.test(version);
}

/** 7 to 40 hexadecimal characters. */
export function isValidCommitHash(hash: string): boolean {
  return COMMIT_RE.test(hash);
}

/** The seven-character form shown beside a release. */
export function shortCommit(hash: string): string {
  return hash.slice(0, 7);
}

/**
 * The commit's page on GitHub when `repoUrl` is a github.com repository, else null (any other host, a malformed
 * URL, or no hash). The repository URL is the owner's text, so only the host and the first two path segments are
 * read and the link is rebuilt from them: a `javascript:` or look-alike host never yields a link.
 */
export function commitLink(repoUrl: string | null | undefined, hash: string | null | undefined): string | null {
  if (!repoUrl || !hash || !isValidCommitHash(hash)) return null;
  let url: URL;
  try {
    url = new URL(repoUrl);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (url.hostname !== 'github.com' && url.hostname !== 'www.github.com') return null;
  const [owner, rawRepo] = url.pathname.split('/').filter(Boolean);
  const repo = rawRepo?.replace(/\.git$/, '');
  if (!owner || !repo) return null;
  return `https://github.com/${owner}/${repo}/commit/${hash.toLowerCase()}`;
}

/** The shape every release leaves the server in. */
export interface ReleaseView {
  id: string;
  version: string;
  changelog: string | null;
  commitHash: string | null;
  createdAt: string;
}

/** Newest first; a tie on the instant falls back to the id so the order is stable. Does not mutate. */
export function sortReleases<T extends { createdAt: string; id: string }>(releases: readonly T[]): T[] {
  return [...releases].sort((a, b) => {
    const delta = Date.parse(b.createdAt) - Date.parse(a.createdAt);
    if (delta !== 0) return delta;
    return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
  });
}

/** The latest release and the earlier ones, in order. */
export function splitReleases<T extends { createdAt: string; id: string }>(
  releases: readonly T[],
): { latest: T | null; earlier: T[] } {
  const [latest = null, ...earlier] = sortReleases(releases);
  return { latest, earlier };
}

/** The line a watcher or an unlocker is told. */
export function releasePreview(title: string, version: string): NoticePreview {
  return notice('build-release', { title, version });
}
