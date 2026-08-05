/**
 * IndexNow — push freshly-published URLs to the participating search engines
 * (Bing, Yandex, Seznam, Naver) instead of waiting for the next crawl.
 *
 * Discovery on this site is otherwise entirely crawler-pull: `/sitemap.xml` is
 * served with `max-age=3600, stale-while-revalidate=86400`, so a post published
 * now is found whenever a crawler next happens by. One POST makes it seconds.
 *
 * ## The contract this module has to keep
 *
 * Indexing is never worth failing a publish over, so `pingIndexNow` is
 * **fire-and-forget**: it returns `void`, it cannot throw, and it must never be
 * awaited on a request path. Every failure mode — unset key, malformed URL,
 * DNS failure, a 500 from the endpoint, a hung socket — is swallowed. A caller
 * that `await`s this is a bug: it would put a third party's availability in
 * front of the user's response.
 *
 * ## Operator setup (REQUIRED — this is inert until both steps are done)
 *
 *  1. Generate a key: 8–128 hex characters, e.g. `openssl rand -hex 16`.
 *  2. Set `INDEXNOW_KEY` in the environment (see `.env.example`).
 *  3. Publish the key file at `https://rmhstudios.com/<key>.txt`, containing
 *     **exactly the key** and nothing else. That file is how the endpoint
 *     verifies we own the domain; without it every submission is rejected.
 *     The file is not committed here on purpose — the key is a secret-shaped
 *     value that belongs in the deploy, not in git. Drop it into `public/`
 *     on the VPS (or serve it from Apache) once the key is chosen.
 *
 * Until `INDEXNOW_KEY` is set this module is a no-op, so shipping it before the
 * operator steps are done changes nothing.
 *
 * ## Rules worth not violating
 *
 *  - Only submit URLs that are **publicly reachable right now**. Submitting
 *    404s or `noindex` pages gets the whole domain rate-limited or ignored.
 *  - Don't submit on every edit — submit on the transition that makes content
 *    public, and skip trivial changes.
 *  - Google does not consume IndexNow. This is additive; the sitemap still has
 *    to be right.
 */

import { SITE_URL } from '@/lib/seo';

/** The IndexNow endpoint. Submissions are shared between participating engines. */
const ENDPOINT = 'https://api.indexnow.org/indexnow';

/** Protocol ceiling for a single submission. */
const MAX_URLS = 10_000;

/**
 * Don't let a hung endpoint hold a socket (and a pending timer) open forever in
 * a long-lived web process. There is nothing to retry — the sitemap is the
 * durable path — so a slow ping is simply abandoned.
 */
const TIMEOUT_MS = 5_000;

/** `rmhstudios.com` — derived from SITE_URL so the two can't drift apart. */
const HOST = new URL(SITE_URL).host;

/**
 * Normalize one entry to an absolute, same-host URL string, or `null` if it
 * isn't one. Callers pass site-relative paths (`/blog/my-post`); absolute URLs
 * are accepted too but anything pointing off-host is dropped, because IndexNow
 * rejects a submission whose `urlList` doesn't match the declared `host`.
 */
function toSubmittableUrl(pathOrUrl: string): string | null {
  try {
    const url = new URL(pathOrUrl, SITE_URL);
    if (url.host !== HOST) return null;
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * Notify IndexNow that these URLs are new or changed.
 *
 * Accepts site-relative paths (`/blog/my-post`) or absolute same-host URLs.
 * Off-host, malformed and duplicate entries are dropped silently.
 *
 * Returns immediately — the request is detached. Call it AFTER the write that
 * made the content public has committed, and never with `await`.
 */
export function pingIndexNow(pathsOrUrls: readonly string[]): void {
  try {
    const key = process.env.INDEXNOW_KEY;
    if (!key) return;

    const urlList = [
      ...new Set(pathsOrUrls.map(toSubmittableUrl).filter((url): url is string => url !== null)),
    ].slice(0, MAX_URLS);
    if (urlList.length === 0) return;

    void fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        host: HOST,
        key,
        keyLocation: `${SITE_URL}/${key}.txt`,
        urlList,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
      .then((res) => {
        // 200 (accepted) and 202 (accepted, key validation pending) are both
        // success. Anything else is worth one line in the log — a 403 means the
        // key file is missing or wrong, which is invisible otherwise.
        if (!res.ok && res.status !== 202) {
          console.warn(`IndexNow: ${res.status} for ${urlList.length} url(s)`);
        }
      })
      .catch(() => {
        // Network error, timeout, abort. Nothing to do and nothing to report:
        // the sitemap still carries these URLs.
      });
  } catch {
    // Unreachable in practice (nothing above throws synchronously), but this
    // function's whole value is that a publish never fails because of it.
  }
}
