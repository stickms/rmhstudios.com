/**
 * The Content-Security-Policy builder (redesign audit F5).
 *
 * Pure and dependency-light on purpose: the Nitro plugin that emits the header
 * (`server/nitro/security-headers.ts`) and the tests import it directly.
 *
 * The directive set mirrors the ENFORCED policy in `deploy/apache/rmhstudios.conf`
 * so that, when Apache's header is replaced by this one, nothing that works today
 * is blocked. Only `script-src` differs, and only in the one way the audit asked:
 *
 *   script-src 'self' 'nonce-<per request>' 'strict-dynamic'
 *              'sha256-<pre-paint head>' 'sha256-<pre-paint body>'
 *              'wasm-unsafe-eval' <ad hosts>
 *
 *  - The nonce covers every script the framework streams per request
 *    (TanStack Start's `$tsr` dehydration / `data-tsr-stream-part` scripts, which
 *    are dynamic and so cannot be hashed): `router.options.ssr.nonce`.
 *  - The two sha256 entries cover the generated pre-paint scripts (lib/prepaint),
 *    which are byte-identical on every request.
 *  - `'strict-dynamic'` lets those trusted scripts load the chunks, the ads loader
 *    and the game runtimes that `document.createElement('script')`, so no
 *    host allowlist is needed for first-party code in a CSP3 browser.
 *  - `'self'` and the ad hosts stay as the CSP2 fallback: a browser that does not
 *    understand `'strict-dynamic'` ignores it and falls back to the host list.
 *  - There is deliberately NO `'unsafe-inline'` and NO `'unsafe-eval'`. (Had the
 *    framework not supported a nonce, `'unsafe-inline'` could have stayed as a
 *    CSP2 fallback — browsers ignore it once a nonce or hash is present.)
 *
 * `style-src` keeps `'unsafe-inline'`: inline `style=""` attributes are
 * pervasive (framer-motion, Radix) and script injection is the threat this
 * slice addresses. See docs/csp.md.
 */
import { PREPAINT_BODY_SHA256, PREPAINT_SHA256 } from '../prepaint/generated';

/** Where violation reports are POSTed (lib/api/routes/csp-report.server.ts). */
export const CSP_REPORT_PATH = '/api/csp-report';
/** The Reporting API endpoint name used by `report-to` / `Reporting-Endpoints`. */
export const CSP_REPORT_GROUP = 'csp';

/** Response header value for the Reporting API endpoint map used by `report-to`. */
export const REPORTING_ENDPOINTS = `${CSP_REPORT_GROUP}="${CSP_REPORT_PATH}"`;

export const FRAME_ANCESTORS =
  "frame-ancestors 'self' https://discord.com https://*.discord.com https://*.discordsays.com";

const AD_SCRIPT_HOSTS = [
  'https://pagead2.googlesyndication.com',
  'https://tpc.googlesyndication.com',
  'https://partner.googleadservices.com',
  'https://adservice.google.com',
  'https://googleads.g.doubleclick.net',
];

/** The static hashes of the generated pre-paint scripts (head + body). */
export const PREPAINT_SCRIPT_HASHES = [
  `'sha256-${PREPAINT_SHA256}'`,
  `'sha256-${PREPAINT_BODY_SHA256}'`,
] as const;

export interface CspOptions {
  /** The per-request nonce (base64). Omit for a response that carries no framework scripts. */
  nonce?: string | null;
}

/** A nonce is base64 from random bytes; refuse anything else so a header can never be injected. */
export function isValidNonce(nonce: unknown): nonce is string {
  return typeof nonce === 'string' && /^[A-Za-z0-9+/]{16,64}={0,2}$/.test(nonce);
}

export function buildScriptSrc({ nonce }: CspOptions = {}): string {
  return [
    'script-src',
    "'self'",
    ...(isValidNonce(nonce) ? [`'nonce-${nonce}'`, "'strict-dynamic'"] : []),
    ...PREPAINT_SCRIPT_HASHES,
    "'wasm-unsafe-eval'",
    ...AD_SCRIPT_HOSTS,
  ].join(' ');
}

export function buildCspPolicy(opts: CspOptions = {}): string {
  return [
    "default-src 'self'",
    buildScriptSrc(opts),
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https://fonts.gstatic.com",
    "connect-src 'self' blob: https://cdn.rmhstudios.com https://tile.openstreetmap.org https://discord.com https://*.discord.com https://*.discordsays.com https://i.scdn.co https://pagead2.googlesyndication.com https://tpc.googlesyndication.com https://googleads.g.doubleclick.net https://ep1.adtrafficquality.google https://ep2.adtrafficquality.google https://csi.gstatic.com https://cdn.jsdelivr.net/gh/jdecked/",
    "media-src 'self' blob: https:",
    "worker-src 'self' blob:",
    "frame-src 'self' blob: https://www.youtube.com https://www.youtube-nocookie.com https://player.twitch.tv https://clips.twitch.tv https://open.spotify.com https://discord.com https://*.discordsays.com https://googleads.g.doubleclick.net https://tpc.googlesyndication.com https://www.google.com",
    'fenced-frame-src https://googleads.g.doubleclick.net https://tpc.googlesyndication.com',
    FRAME_ANCESTORS,
    "form-action 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    `report-uri ${CSP_REPORT_PATH}`,
    `report-to ${CSP_REPORT_GROUP}`,
  ].join('; ');
}
