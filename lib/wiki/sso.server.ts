/**
 * Signing in to wiki.rmhstudios.com with an rmhstudios.com account.
 *
 * The wiki (MediaWiki, `deploy/mediawiki/`) has no passwords for readers. Its
 * "Log in" opens Special:RMHStudiosLogin, which remembers a random `state` in the
 * visitor's wiki session and sends them to `GET /api/wiki/sso?state=…`. The site
 * signs them in if they are not already, then sends them back with a pass made
 * here: who they are, whether they are a site admin, and that state, signed with
 * a key both sides derive from BETTER_AUTH_SECRET. The wiki's half is
 * `deploy/mediawiki/extensions/RMHStudiosLogin/includes/Pass.php`; the format must
 * match it byte for byte (`./__tests__/sso.server.test.ts` holds a pass it accepts).
 *
 * Setup and operations: `docs/wiki.md`.
 */
import { createHmac } from 'node:crypto';

/** The label the wiki's key is derived under. Same string as `RMH_WIKI_LOGIN_LABEL` in deploy/mediawiki/env.php. */
export const WIKI_LOGIN_LABEL = 'rmhstudios wiki sign-in v1';

/** How long a pass is good for: a redirect, not a session. */
export const WIKI_PASS_TTL_SECONDS = 120;

export interface WikiPassClaims {
  /** The site's user id; the wiki links its account to this, so a handle change keeps the account. */
  sub: string;
  /** The site handle, which becomes the wiki user name on first sign-in. */
  name: string;
  /** Site admins are the wiki's administrators. */
  admin: boolean;
  /** The value the wiki stored in the visitor's session before sending them here. */
  state: string;
}

/** The wiki's public origin. */
export function wikiPublicUrl(): string {
  return (process.env.WIKI_PUBLIC_URL || 'https://wiki.rmhstudios.com').replace(/\/+$/, '');
}

/** HMAC-SHA256(key = secret, message = label), hex: PHP's `hash_hmac('sha256', $label, $secret)`. */
export function wikiLoginKey(secret: string): string {
  return createHmac('sha256', secret).update(WIKI_LOGIN_LABEL).digest('hex');
}

const base64url = (bytes: Buffer | string) => Buffer.from(bytes).toString('base64url');

/** `base64url(json).base64url(hmac-sha256(that, key))`. */
export function signWikiPass(claims: WikiPassClaims, key: string, nowSeconds: number): string {
  const body = base64url(
    JSON.stringify({
      v: 1,
      sub: claims.sub,
      name: claims.name,
      admin: claims.admin,
      state: claims.state,
      exp: nowSeconds + WIKI_PASS_TTL_SECONDS,
    }),
  );
  return `${body}.${base64url(createHmac('sha256', key).update(body).digest())}`;
}
