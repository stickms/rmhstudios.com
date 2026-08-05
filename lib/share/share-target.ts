/**
 * Web Share Target — the page half of the POST/multipart handoff (F14).
 *
 * ── Why any of this exists ──────────────────────────────────────────────────
 *
 * A `GET` share target is a plain navigation: the OS puts the shared title/text/
 * url in the query string and the browser loads `/share?title=…`. That form
 * **cannot carry files**, which is the whole gap — RMH's primary post type is
 * media, and until now sharing a photo from the OS share sheet had no way in.
 *
 * A `POST` + `multipart/form-data` target can carry files, but it is no longer a
 * navigation the server can answer usefully: the browser POSTs the form to
 * `/share` and there is no session-bearing, SSR-rendered page on the other side
 * that could hold onto a 30 MB video. The platform's answer is that the **service
 * worker** intercepts the POST, keeps the payload locally, and redirects to a
 * normal GET the app can render. That is what `public/sw-share-target.js` does,
 * and this module is the page-side counterpart that picks the payload back up.
 *
 * ── The handoff ─────────────────────────────────────────────────────────────
 *
 *   1. OS share sheet → `POST /share` (multipart).
 *   2. SW reads the FormData, writes a manifest + one entry per file into the
 *      {@link SHARE_TARGET_CACHE} Cache Storage bucket, and answers with a 303
 *      to `/share?pending=<id>`.
 *   3. The browser follows that redirect as an ordinary navigation, so `/share`
 *      renders as a normal signed-in page.
 *   4. This module reads the payload back out of the same-origin cache and
 *      **deletes it** — a share is consumed exactly once.
 *
 * Cache Storage is used rather than IndexedDB because the SW already has a
 * `Response` per file for free (`new Response(file)`) and because the page and
 * the worker address the same bucket by name with no messaging handshake, so a
 * payload survives the SW being killed between the POST and the navigation.
 *
 * ── Cache name ──────────────────────────────────────────────────────────────
 *
 * {@link SHARE_TARGET_CACHE} deliberately does **not** start with `rmh-`:
 * `sw.js`'s `activate` handler deletes every `rmh-`-prefixed cache that is not
 * in its `keep` set, so an `rmh-share-…` name would be wiped by the next
 * activation — i.e. by the next deploy, mid-share. Do not "fix" the naming
 * inconsistency without also adding the name to that `keep` set.
 *
 * Client-safe (touches `caches`/`fetch`, never Prisma or `node:*`). The mirror
 * of these constants lives in `public/sw-share-target.js`; the unit test in
 * `lib/__tests__/share-target.test.ts` asserts the two copies agree, because a
 * silent divergence means shares vanish with no error anywhere.
 */

/** Cache Storage bucket the SW stages shared payloads in. See the note above. */
export const SHARE_TARGET_CACHE = 'share-target-v1';

/** The manifest/file key namespace inside that cache. Never a real route. */
export const SHARE_TARGET_KEY_PREFIX = '/__share-target/';

/** Search param the SW redirect carries the staged payload id in. */
export const SHARE_PENDING_PARAM = 'pending';

/**
 * How long a staged payload stays readable.
 *
 * The gap between the POST and the redirected GET is milliseconds; anything
 * older is a payload whose navigation never happened (the user backed out, the
 * tab was killed). Five minutes is generous for that and short enough that a
 * shared photo is not sitting in Cache Storage for the rest of the day.
 */
export const SHARE_TARGET_TTL_MS = 5 * 60 * 1000;

/** Hard ceiling on staged files, mirroring the composer's own image cap. */
export const SHARE_TARGET_MAX_FILES = 4;

/** One staged file, as the manifest describes it. */
export interface SharedFileMeta {
  name: string;
  type: string;
  size: number;
}

/** The manifest object stored at `${SHARE_TARGET_KEY_PREFIX}<id>`. */
export interface SharedPayloadManifest {
  id: string;
  title: string;
  text: string;
  url: string;
  files: SharedFileMeta[];
  /** `Date.now()` at stage time — the TTL is enforced on read, not by a timer. */
  stagedAt: number;
}

/** A staged payload with its files rehydrated. */
export interface SharedPayload {
  title: string;
  text: string;
  url: string;
  files: File[];
}

/** Cache key for a payload's manifest. */
export function shareManifestKey(id: string): string {
  return `${SHARE_TARGET_KEY_PREFIX}${encodeURIComponent(id)}`;
}

/** Cache key for the `index`-th file of a payload. */
export function shareFileKey(id: string, index: number): string {
  return `${SHARE_TARGET_KEY_PREFIX}${encodeURIComponent(id)}/f/${index}`;
}

/**
 * Merge the shared fields into one composer draft.
 *
 * Extracted from the route so the GET path (query params) and the POST path
 * (multipart fields) build the draft through the same function — the two used to
 * be the same three lines in one place and would have become two spellings the
 * moment the POST path was added. De-duplicates a URL that some apps repeat in
 * both `text` and `url`.
 */
export function buildShareDraft(
  { title, text, url }: { title?: string; text?: string; url?: string },
  maxLength = 500,
): string {
  const t = title?.trim() ?? '';
  const x = text?.trim() ?? '';
  const u = url?.trim() ?? '';
  const parts: string[] = [];
  if (t && t !== x) parts.push(t);
  if (x) parts.push(x);
  if (u && !x.includes(u)) parts.push(u);
  return parts.join('\n\n').trim().slice(0, maxLength);
}

/** True when a manifest is still inside its TTL. */
export function isFreshManifest(manifest: SharedPayloadManifest, now = Date.now()): boolean {
  const age = now - manifest.stagedAt;
  // A negative age is a clock that moved backwards, not a fresh payload; treat
  // it as valid rather than silently dropping a share the user just made.
  return age < SHARE_TARGET_TTL_MS && age > -SHARE_TARGET_TTL_MS;
}

/** Media types the share target accepts. Anything else is dropped on read. */
export function isAcceptedShareType(type: string): boolean {
  return type.startsWith('image/') || type.startsWith('video/');
}

/**
 * Read a staged payload and consume it.
 *
 * Returns `null` when Cache Storage is unavailable (SSR, private mode, a browser
 * with no SW), when the id is unknown, or when the payload has expired. Never
 * throws: a share that cannot be recovered must degrade to an empty composer,
 * not to an error page.
 */
export async function consumeSharedPayload(id: string): Promise<SharedPayload | null> {
  if (!id || typeof caches === 'undefined') return null;
  try {
    const cache = await caches.open(SHARE_TARGET_CACHE);
    const manifestResponse = await cache.match(shareManifestKey(id));
    if (!manifestResponse) return null;

    const manifest = (await manifestResponse.json()) as SharedPayloadManifest;
    // Delete first, unconditionally. A payload that has been handed to a page is
    // spent whether or not the page manages to use it, and a read path that only
    // cleans up on success leaks every failed share into storage forever.
    void purgeSharedPayload(id, manifest.files?.length ?? 0);

    if (!isFreshManifest(manifest)) return null;

    const files: File[] = [];
    const metas = Array.isArray(manifest.files) ? manifest.files.slice(0, SHARE_TARGET_MAX_FILES) : [];
    for (let i = 0; i < metas.length; i++) {
      const meta = metas[i];
      if (!isAcceptedShareType(meta?.type ?? '')) continue;
      const fileResponse = await cache.match(shareFileKey(id, i));
      if (!fileResponse) continue;
      const blob = await fileResponse.blob();
      files.push(new File([blob], meta.name || `shared-${i}`, { type: meta.type }));
    }

    return {
      title: typeof manifest.title === 'string' ? manifest.title : '',
      text: typeof manifest.text === 'string' ? manifest.text : '',
      url: typeof manifest.url === 'string' ? manifest.url : '',
      files,
    };
  } catch {
    return null;
  }
}

/** Delete a payload's manifest and file entries. Best-effort, never throws. */
export async function purgeSharedPayload(id: string, fileCount: number): Promise<void> {
  if (typeof caches === 'undefined') return;
  try {
    const cache = await caches.open(SHARE_TARGET_CACHE);
    await cache.delete(shareManifestKey(id));
    const bound = Math.min(Math.max(fileCount, 0), SHARE_TARGET_MAX_FILES);
    for (let i = 0; i < bound; i++) await cache.delete(shareFileKey(id, i));
  } catch {
    /* storage evicted or unavailable — nothing to clean up */
  }
}
