/** S6 link warnings — pure helpers shared by the server check, the renderer and /out. */

export type LinkRisk = 'deny' | 'new' | 'ok';

/** A domain first seen on the site less than this long ago is "new". */
export const NEW_DOMAIN_MS = 72 * 3_600_000;

/** Never warned about as "new" (a DENY rule still wins). */
export const TRUSTED_DOMAINS = [
  'rmhstudios.com',
  'youtube.com',
  'youtu.be',
  'github.com',
  'wikipedia.org',
  'x.com',
  'twitter.com',
  'reddit.com',
  'twitch.tv',
  'spotify.com',
  'discord.com',
  'instagram.com',
  'tenor.com',
  'giphy.com',
  'imgur.com',
  'archive.org',
  'google.com',
  'bsky.app',
] as const;

export function normalizeHost(input: string): string | null {
  const host = input
    .trim()
    .toLowerCase()
    .replace(/^www\./, '')
    .replace(/\.$/, '');
  return /^[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?$/.test(host) && host.includes('.') ? host : null;
}

export function hostOfUrl(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:' ? normalizeHost(u.hostname) : null;
  } catch {
    return null;
  }
}

/** `a.b.evil.com` → [a.b.evil.com, b.evil.com, evil.com]. */
export function hostAndParents(host: string): string[] {
  const parts = host.split('.');
  const out: string[] = [];
  for (let i = 0; i < parts.length - 1; i++) out.push(parts.slice(i).join('.'));
  return out;
}

export function isTrusted(host: string): boolean {
  return hostAndParents(host).some((d) => (TRUSTED_DOMAINS as readonly string[]).includes(d));
}

export function outHref(url: string): string {
  return `/out?url=${encodeURIComponent(url)}`;
}

export const URL_IN_TEXT = /https?:\/\/[^\s<>"']+/gi;
