/**
 * Profile-link shapes shared by the API routes, the settings panel and the
 * verification worker. Client-safe: zod + string helpers only.
 *
 * Links used to be a `{ label, url }` JSON blob on `UserProfile.links`
 * (`lib/profile-schema.ts`). They are rows now (`ProfileLink`) because
 * verification state needs somewhere to be stamped, re-checked from and — the
 * query an impersonation investigation actually runs — indexed by host.
 */

import { z } from 'zod';
import { httpUrl } from '@/lib/url-safety';

/** Same ceiling the JSON blob had, so promoting the data changes no limits. */
export const MAX_PROFILE_LINKS = 5;

/** `ProfileLink.url` is `VarChar(300)`; the schema must not exceed the column. */
export const MAX_LINK_URL_LENGTH = 300;
/** `ProfileLink.label` is `VarChar(60)`. */
export const MAX_LINK_LABEL_LENGTH = 60;
/** `ProfileLink.host` is `VarChar(200)`. */
export const MAX_LINK_HOST_LENGTH = 200;

export const profileLinkCreateSchema = z.object({
  url: httpUrl(MAX_LINK_URL_LENGTH),
  label: z.string().trim().min(1).max(MAX_LINK_LABEL_LENGTH).optional().nullable(),
});

export const profileLinkUpdateSchema = z.object({
  url: httpUrl(MAX_LINK_URL_LENGTH).optional(),
  label: z.string().trim().max(MAX_LINK_LABEL_LENGTH).optional().nullable(),
  position: z
    .number()
    .int()
    .min(0)
    .max(MAX_PROFILE_LINKS - 1)
    .optional(),
});

export type ProfileLinkCreateInput = z.infer<typeof profileLinkCreateSchema>;
export type ProfileLinkUpdateInput = z.infer<typeof profileLinkUpdateSchema>;

/** The wire shape every profile-link endpoint returns. */
export interface ProfileLinkDTO {
  id: string;
  url: string;
  label: string | null;
  host: string | null;
  position: number;
  /** ISO timestamp of the last successful `rel="me"` match, or null. */
  verifiedAt: string | null;
  lastCheckedAt: string | null;
}

/**
 * The host a link claims, lowercased and `www.`-stripped, or `null` when the
 * URL will not parse.
 *
 * Stored on the row so "which accounts claim this domain?" is one indexed
 * query. Normalising matters: `WWW.Example.com` and `example.com` are the same
 * claim, and an investigation that misses one of them is the investigation
 * failing.
 */
export function linkHost(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    return host.slice(0, MAX_LINK_HOST_LENGTH) || null;
  } catch {
    return null;
  }
}

/**
 * Normalise a user-typed URL for storage.
 *
 * Only the parts that carry no meaning are touched — the fragment (never sent
 * to a server, so it cannot participate in verification) and a trailing empty
 * query. The path is left exactly as typed: `/~alice` and `/%7Ealice` are the
 * same page to some servers and different pages to others, and guessing is
 * worse than storing what the user wrote.
 */
export function normalizeLinkUrl(url: string): string {
  try {
    const parsed = new URL(url.trim());
    parsed.hash = '';
    if (parsed.search === '?') parsed.search = '';
    return parsed.toString().slice(0, MAX_LINK_URL_LENGTH);
  } catch {
    return url.trim().slice(0, MAX_LINK_URL_LENGTH);
  }
}

/**
 * A short display form for a link: the host plus, when the path is not just
 * `/`, the first path segment. `https://example.com/blog/2026/x` reads as
 * `example.com/blog`.
 */
export function linkDisplayLabel(link: { label?: string | null; url: string }): string {
  if (link.label) return link.label;
  try {
    const parsed = new URL(link.url);
    const host = parsed.hostname.replace(/^www\./, '');
    const first = parsed.pathname.split('/').filter(Boolean)[0];
    return first ? `${host}/${first}` : host;
  } catch {
    return link.url;
  }
}
