/**
 * Page guard for the SDN hosts. Cloudflare can answer 200 with a challenge page, so a status check is not enough;
 * a page that is not what we asked for is a failure on the session (three halt the source).
 * Detection per ruling Q18: "Just a moment" in the title or body, or the cf-mitigated header; never the
 * /cdn-cgi/challenge-platform/ string, which every page embeds.
 */
import type { PoliteClient, PoliteResult } from '../../http';

export class SdnPageError extends Error {
  readonly status: number | undefined;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'SdnPageError';
    this.status = status;
  }
}

const OWN_MARKER = /message--post|structItem--thread|<channel[\s>]|interview-feedback-data|schools-database-data/i;
const TITLE_CHALLENGE = /<title>\s*(?:Just a moment|Attention Required! \| Cloudflare|Access denied)/i;
const BODY_CHALLENGE =
  /Just a moment|_cf_chl_opt|Enable JavaScript and cookies to continue|Error 1020|Access denied \|[^<]*used Cloudflare/i;

/** `headers` is optional because the polite client does not surface them; pass `cf-mitigated` when a caller has it. */
export function isCloudflareChallenge(res: {
  status: number;
  body: string;
  headers?: Record<string, string>;
}): boolean {
  if (res.headers?.['cf-mitigated']) return true;
  if (TITLE_CHALLENGE.test(res.body)) return true;
  // A real page may say "just a moment" in a post; only a body without the site's own markup counts.
  return BODY_CHALLENGE.test(res.body) && !OWN_MARKER.test(res.body);
}

/** The polite client already counts 429, 5xx and transport failures (status 0) on the session. */
const hostCounted = (status: number): boolean => status === 0 || status === 429 || status >= 500;

/**
 * Returns the body of a good page. Anything the host did not count is counted here exactly once: a challenge
 * (the host saw a 200, so only we know) and any 4xx other than 404 and 429 (a 403 or 410 from a WAF is a block, and
 * an unnoticed block would never halt). 429, 5xx and transport failures are only thrown: counting them again would
 * halve the halt threshold (Q21). A 404 only throws; it is a missing page, not a block.
 */
export function assertPage(res: PoliteResult, session: PoliteClient, what: string): string {
  if (res.status === 404) throw new SdnPageError(`${what}: not found`, 404);
  if (isCloudflareChallenge(res)) {
    if (!hostCounted(res.status)) session.noteFailure(`${what}: cloudflare challenge`);
    throw new SdnPageError(`${what}: cloudflare challenge`, res.status);
  }
  if (!res.ok) {
    if (!hostCounted(res.status)) session.noteFailure(`${what}: http ${res.status}`);
    throw new SdnPageError(`${what}: http ${res.status}`, res.status);
  }
  return res.body;
}
