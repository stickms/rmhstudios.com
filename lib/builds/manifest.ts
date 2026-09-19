/**
 * The build manifest and its permission model (B1). Pure and client-safe.
 *
 * ## What this turns a build into
 *
 * Today a User Build is a hosted page: `UserBuild`, `BuildVersion`,
 * `BuildUnlock` and a `/builds` route, with `rmhcode` publishing to it. What
 * makes it a page rather than an app is that it cannot use the platform — no
 * storage, no leaderboard, no presence, no identity — because there is no way
 * for it to ASK, and therefore no way for a member to decide.
 *
 * A manifest is that way. It is deliberately modelled on an OAuth consent
 * screen rather than on a package.json: the interesting part is not the
 * metadata, it is that a human reads a list of requests and agrees to it.
 *
 * ## The load-bearing rule
 *
 * **A build never receives a credential and never draws a confirmation.**
 * Everything that costs a member something is rendered by the platform shell,
 * outside the build's frame, where the build cannot restyle it, cover it or
 * pre-click it. `coins:spend` is a request to ASK, not a permission to spend.
 *
 * This is the decision the whole pillar rests on, which is why it is in the
 * first commit rather than a later one: capabilities before a permission model
 * is how a platform gets an incident instead of an ecosystem, and `/breaches`
 * exists because this repo already believes in writing those up honestly.
 */

import { z } from 'zod';

/**
 * What a build can ask for.
 *
 * Small on purpose. Every entry here is a promise the platform then has to
 * keep, and a capability that exists but is never granted is worse than one
 * that does not exist — it reads as available and behaves as broken.
 */
export const CAPABILITIES = [
  /** Per-build, per-member key/value with a quota. The `GameSave` shape. */
  'storage',
  /** Post and read scores for this build. */
  'leaderboard',
  /** Read-only "who else is in here". Never a member list of the site. */
  'presence',
  /** Display name, avatar, handle. NEVER email, NEVER the session. */
  'identity',
  /** Ask the platform to ask the member to spend coins. See the rule above. */
  'coins:spend',
  /** Send this member a notification about this build, subject to their prefs. */
  'notifications',
  /** Join whatever party the member is already in (P1). */
  'party',
] as const;
export type Capability = (typeof CAPABILITIES)[number];

/**
 * Capabilities a member must approve explicitly, every one of them individually.
 *
 * `identity` is not here: a display name and an avatar are what the build would
 * see anyway from a page the member is looking at, and prompting for it trains
 * people to click through prompts — which is what makes the prompts that matter
 * stop working.
 */
export const CONSENT_REQUIRED: ReadonlySet<Capability> = new Set([
  'storage',
  'leaderboard',
  'presence',
  'coins:spend',
  'notifications',
  'party',
]);

/**
 * Capabilities that need a human to look at the build before it is published.
 *
 * Exactly one today, and it should stay a short list: a review queue that
 * everything lands in is a review queue nobody reads.
 */
export const HUMAN_REVIEW_REQUIRED: ReadonlySet<Capability> = new Set(['coins:spend']);

/** A manifest, as a build author writes it. */
export const manifestSchema = z.object({
  /** Manifest format version, so this can change without breaking published builds. */
  manifestVersion: z.literal(1),
  /** Must match the build's own slug — checked at publish, not here. */
  slug: z.string().min(1).max(64).regex(/^[a-z0-9][a-z0-9-]*$/),
  name: z.string().trim().min(1).max(100),
  /** Semver-ish. Not parsed: it is a label, and the platform never orders by it. */
  version: z.string().min(1).max(20),
  /** The file the shell loads. Relative, no scheme, no traversal. */
  entry: z.string().min(1).max(200),
  capabilities: z.array(z.enum(CAPABILITIES)).max(CAPABILITIES.length).default([]),
  /**
   * Hosts the build may talk to, beyond its own origin.
   *
   * An explicit list, never a wildcard: `*` is not a narrower policy than
   * "anything", it is the same policy written in a way that looks considered.
   */
  connectHosts: z.array(z.string().min(1).max(200)).max(10).default([]),
  /** Per-session cap the member sets; the author's number is only a suggestion. */
  suggestedCoinCap: z.number().int().min(0).max(100_000).optional(),
});

export type BuildManifest = z.infer<typeof manifestSchema>;

/** Why a manifest was rejected. */
export type ManifestProblem =
  | 'malformed'
  | 'slug-mismatch'
  | 'entry-escapes'
  | 'entry-absolute'
  | 'wildcard-host'
  | 'bad-host'
  | 'duplicate-capability';

/**
 * Validate a manifest against the build it claims to be.
 *
 * Returns the problems rather than throwing on the first, so an author fixing
 * a manifest sees everything wrong with it in one go instead of playing
 * twenty questions with a publish endpoint.
 */
export function validateManifest(raw: unknown, buildSlug: string): ManifestProblem[] {
  const parsed = manifestSchema.safeParse(raw);
  if (!parsed.success) return ['malformed'];
  const m = parsed.data;
  const problems: ManifestProblem[] = [];

  if (m.slug !== buildSlug) problems.push('slug-mismatch');

  // The entry point is the one string in here that becomes a path. A leading
  // slash would escape the build's directory; `..` would climb out of it.
  if (m.entry.startsWith('/') || /^[a-z]+:/i.test(m.entry)) problems.push('entry-absolute');
  if (m.entry.split('/').includes('..')) problems.push('entry-escapes');

  for (const host of m.connectHosts) {
    if (host.includes('*')) {
      problems.push('wildcard-host');
      continue;
    }
    // A host, not a URL: no scheme, no path, no credentials.
    if (!/^[a-z0-9.-]+(:\d{1,5})?$/i.test(host)) problems.push('bad-host');
  }

  if (new Set(m.capabilities).size !== m.capabilities.length) {
    problems.push('duplicate-capability');
  }

  return problems;
}

/** Capabilities this manifest needs a member to approve, in a stable order. */
export function consentList(m: BuildManifest): Capability[] {
  return CAPABILITIES.filter((c) => m.capabilities.includes(c) && CONSENT_REQUIRED.has(c));
}

/** Does publishing this manifest need a human to look at it first? */
export function needsHumanReview(m: BuildManifest): boolean {
  return m.capabilities.some((c) => HUMAN_REVIEW_REQUIRED.has(c));
}

/**
 * The Content-Security-Policy a build's frame is served with.
 *
 * Built from the manifest so a build can only reach what it declared, and
 * written here rather than in the route so there is one string to review.
 *
 * Three parts are not negotiable and are not derived from anything the author
 * wrote:
 *
 *   - `default-src 'self'` — the build's own origin, which is a per-build
 *     sandbox origin and never the site's.
 *   - `frame-ancestors` names the site, so a build cannot be embedded
 *     somewhere that strips the shell's confirmation UI off the top of it.
 *   - no `form-action` beyond self, so a build cannot post a member's typing
 *     to a host it did not declare by rendering a plain form.
 */
export function cspFor(m: BuildManifest, siteOrigin: string): string {
  const connect = ["'self'", ...m.connectHosts.map((h) => `https://${h}`)].join(' ');
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    `connect-src ${connect}`,
    "form-action 'self'",
    `frame-ancestors ${siteOrigin}`,
    "base-uri 'none'",
    "object-src 'none'",
  ].join('; ');
}

/**
 * The sandbox attribute for the build's iframe.
 *
 * `allow-same-origin` is present because a build needs storage and a worker,
 * and it is only safe because the frame's origin is the BUILD's, not the
 * site's — that separation is what the whole attribute rests on. There is
 * deliberately no `allow-top-navigation`: a build that can navigate the top
 * frame can replace the site with a copy of the site.
 */
export const BUILD_SANDBOX = [
  'allow-scripts',
  'allow-same-origin',
  'allow-forms',
  'allow-popups',
  'allow-popups-to-escape-sandbox',
].join(' ');
