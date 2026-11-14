/**
 * Server-side client for the MediaWiki behind wiki.rmhstudios.com.
 *
 * The wiki is a separate product (the `mediawiki` compose service) with its own
 * accounts. Site admins do not get a second account there: the site signs in to
 * MediaWiki's Action API with one bot password (`MEDIAWIKI_BOT_USER` /
 * `MEDIAWIKI_BOT_PASSWORD`, issued by the image's `wiki-bootstrap`), and
 * `/api/admin/wiki/**` puts the site's own admin check in front of it. The
 * password and the session it opens never reach a browser.
 *
 * Every page the site manages is in the main namespace and is identified by its
 * page id. MediaWiki's title is the page's address (`/wiki/Page_title`), so a
 * page has no separate path.
 *
 * Setup and operations: `docs/wiki.md`.
 */

export interface WikiPageSummary {
  id: number;
  title: string;
  /** Timestamp of the latest revision (ISO 8601, UTC). */
  updatedAt: string;
}

export interface WikiPage extends WikiPageSummary {
  /** Id of the latest revision, which an update names as its base. */
  revisionId: number;
  /** Wikitext of the latest revision. */
  content: string;
}

export interface WikiPageInput {
  title: string;
  content: string;
  /** Edit summary shown in the page history; empty lets MediaWiki write one. */
  summary: string;
}

export interface WikiPageUpdate {
  content: string;
  summary: string;
  /**
   * `revisionId` of the page as the editor opened it. When someone saved in
   * between, MediaWiki merges the two edits where it can and refuses with an
   * edit conflict where it cannot, instead of overwriting their work.
   */
  baseRevisionId: number;
}

export type WikiErrorCode =
  'not_configured' | 'unreachable' | 'unauthorized' | 'not_found' | 'conflict' | 'rejected';

/** A failure talking to MediaWiki, with the HTTP status the admin API answers with. */
export class WikiError extends Error {
  constructor(
    readonly code: WikiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'WikiError';
  }

  get status(): number {
    if (this.code === 'not_configured') return 503;
    if (this.code === 'not_found') return 404;
    if (this.code === 'conflict') return 409;
    if (this.code === 'rejected') return 422;
    return 502;
  }
}

/** Turn a `WikiError` into the admin API's error body; rethrow anything else. */
export function wikiErrorResponse(err: unknown): Response {
  if (!(err instanceof WikiError)) throw err;
  return Response.json({ error: err.code, message: err.message }, { status: err.status });
}

/** Where the site reaches MediaWiki (compose DNS in production, loopback in dev). */
function internalUrl(): string {
  return (process.env.MEDIAWIKI_URL || 'http://localhost:7010').replace(/\/+$/, '');
}

/** The wiki's public origin, for links shown to admins. */
export function wikiPublicUrl(): string {
  return (process.env.WIKI_PUBLIC_URL || 'https://wiki.rmhstudios.com').replace(/\/+$/, '');
}

export function isWikiConfigured(): boolean {
  return Boolean(process.env.MEDIAWIKI_BOT_USER && process.env.MEDIAWIKI_BOT_PASSWORD);
}

/** The page MediaWiki's installer writes, whose author is this pseudo-user. */
export const INSTALLER_USER = 'MediaWiki default';

const TIMEOUT_MS = 10_000;
const MAIN_NAMESPACE = 0;

type Params = Record<string, string | number | boolean | undefined>;

interface ApiError {
  code: string;
  info?: string;
}

type ApiResult = Record<string, unknown> & { error?: ApiError };

/** Cookies MediaWiki set on this process's session, as name → value. */
type CookieJar = Map<string, string>;

interface Session {
  cookies: CookieJar;
  csrf: string;
}

/** One sign-in per server process, shared by every request it handles. */
let session: Promise<Session> | null = null;

/** Forget the session, so the next call signs in again. For tests. */
export function resetWikiSession(): void {
  session = null;
}

function encode(params: Params): URLSearchParams {
  const out = new URLSearchParams({ format: 'json', formatversion: '2' });
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === false) continue;
    out.set(key, value === true ? '1' : String(value));
  }
  return out;
}

/**
 * One request to `api.php`. Reads are GETs; writes are form POSTs, with the
 * token last so a body cut short in transit fails MediaWiki's token check
 * rather than saving half an edit.
 */
async function request(params: Params, cookies: CookieJar, post: boolean): Promise<ApiResult> {
  const query = encode(params);
  const headers: Record<string, string> = { 'User-Agent': 'rmhstudios.com wiki admin' };
  if (cookies.size) {
    headers.Cookie = [...cookies].map(([name, value]) => `${name}=${value}`).join('; ');
  }
  let body: string | undefined;
  if (post) {
    for (const name of ['lgtoken', 'token']) {
      const token = query.get(name);
      query.delete(name);
      if (token !== null) query.append(name, token);
    }
    body = query.toString();
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
  }
  const url = post ? `${internalUrl()}/api.php` : `${internalUrl()}/api.php?${query}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: post ? 'POST' : 'GET',
      headers,
      ...(body === undefined ? {} : { body }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    console.error('[wiki] request failed:', (err as Error)?.message);
    throw new WikiError('unreachable', 'The wiki did not answer');
  }

  for (const line of res.headers.getSetCookie()) {
    const [pair = ''] = line.split(';');
    const eq = pair.indexOf('=');
    if (eq <= 0) continue;
    const name = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    // MediaWiki clears a cookie by setting it to "deleted" with a past expiry.
    if (value === '' || value === 'deleted') cookies.delete(name);
    else cookies.set(name, value);
  }

  // A proxy error page or a PHP fatal answers with HTML.
  const json = (await res.json().catch(() => null)) as ApiResult | null;
  if (!json || typeof json !== 'object') {
    throw new WikiError('unreachable', `The wiki answered with HTTP ${res.status}`);
  }
  return json;
}

async function signIn(): Promise<Session> {
  const user = process.env.MEDIAWIKI_BOT_USER;
  const password = process.env.MEDIAWIKI_BOT_PASSWORD;
  if (!user || !password) {
    throw new WikiError(
      'not_configured',
      'MEDIAWIKI_BOT_USER and MEDIAWIKI_BOT_PASSWORD are not set',
    );
  }
  const cookies: CookieJar = new Map();

  const loginToken = await request(
    { action: 'query', meta: 'tokens', type: 'login' },
    cookies,
    false,
  );
  const lgtoken = (loginToken.query as { tokens?: { logintoken?: string } } | undefined)?.tokens
    ?.logintoken;
  if (!lgtoken) throw new WikiError('unreachable', 'The wiki returned no login token');

  const login = await request(
    { action: 'login', lgname: user, lgpassword: password, lgtoken },
    cookies,
    true,
  );
  const result = (login.login as { result?: string; reason?: string } | undefined) ?? {};
  if (result.result !== 'Success') {
    // Never echo the password; MediaWiki's reason does not contain it.
    console.error('[wiki] sign-in refused:', result.result, result.reason ?? login.error?.info);
    throw new WikiError('unauthorized', 'The wiki refused the bot password');
  }

  const tokens = await request({ action: 'query', meta: 'tokens' }, cookies, false);
  const csrf = (tokens.query as { tokens?: { csrftoken?: string } } | undefined)?.tokens?.csrftoken;
  // An anonymous session's token is "+\\"; a signed-in one is longer.
  if (!csrf || csrf === '+\\')
    throw new WikiError('unauthorized', 'The wiki did not keep the session');
  return { cookies, csrf };
}

function getSession(): Promise<Session> {
  if (!session) {
    const pending = signIn();
    session = pending;
    // A failed sign-in is not cached: the next call tries again.
    pending.catch(() => {
      if (session === pending) session = null;
    });
  }
  return session;
}

/** Codes that mean the session or its token went stale, so a fresh sign-in can succeed. */
const STALE_SESSION = new Set([
  'badtoken',
  'assertuserfailed',
  'assertnameduserfailed',
  'notloggedin',
]);

function toWikiError(error: ApiError): WikiError {
  const message = error.info || error.code;
  if (['articleexists', 'editconflict', 'pagedeleted'].includes(error.code)) {
    return new WikiError('conflict', message);
  }
  if (['missingtitle', 'nosuchpageid', 'missing'].includes(error.code)) {
    return new WikiError('not_found', message);
  }
  if (error.code === 'readapidenied' || error.code === 'writeapidenied') {
    return new WikiError('unauthorized', message);
  }
  return new WikiError('rejected', message);
}

/**
 * One call as the bot: signs in on first use, asserts the session is still
 * signed in, and on a stale session or token signs in once more and retries.
 * Exported for `./appearance.server.ts` and `./seed.server.ts`; page work goes
 * through the functions below.
 */
export async function wikiApi(params: Params, { write = false } = {}): Promise<ApiResult> {
  for (let attempt = 0; ; attempt++) {
    const current = await getSession();
    const json = await request(
      { ...params, assert: 'user', ...(write ? { token: current.csrf } : {}) },
      current.cookies,
      write,
    );
    if (!json.error) return json;
    if (attempt === 0 && STALE_SESSION.has(json.error.code)) {
      if (session && (await session) === current) session = null;
      continue;
    }
    throw toWikiError(json.error);
  }
}

interface RawRevision {
  revid: number;
  timestamp: string;
  user?: string;
  slots?: { main?: { content?: string } };
}

interface RawPage {
  pageid?: number;
  ns: number;
  title: string;
  missing?: boolean;
  invalid?: boolean;
  invalidreason?: string;
  revisions?: RawRevision[];
}

function pagesOf(json: ApiResult): RawPage[] {
  return ((json.query as { pages?: RawPage[] } | undefined)?.pages ?? []).filter(Boolean);
}

/** Every page in the main namespace, redirects left out, sorted by title. */
export async function listWikiPages(): Promise<WikiPageSummary[]> {
  const pages: WikiPageSummary[] = [];
  let next: Record<string, string> = {};
  // MediaWiki pages its answers; follow `continue` until it stops.
  for (let round = 0; round < 100; round++) {
    const json = await wikiApi({
      action: 'query',
      generator: 'allpages',
      gapnamespace: MAIN_NAMESPACE,
      gapfilterredir: 'nonredirects',
      gaplimit: 'max',
      prop: 'revisions',
      rvprop: 'timestamp',
      ...next,
    });
    for (const page of pagesOf(json)) {
      const revision = page.revisions?.[0];
      if (page.pageid === undefined || !revision) continue;
      pages.push({ id: page.pageid, title: page.title, updatedAt: revision.timestamp });
    }
    const more = json.continue as Record<string, string> | undefined;
    if (!more) break;
    next = more;
  }
  return pages.sort((a, b) => a.title.localeCompare(b.title));
}

async function readPage(selector: Params): Promise<RawPage | null> {
  const json = await wikiApi({
    action: 'query',
    prop: 'revisions',
    rvprop: 'ids|timestamp|user|content',
    rvslots: 'main',
    ...selector,
  });
  const page = pagesOf(json)[0];
  if (!page || page.missing || page.invalid || !page.revisions?.[0]) return null;
  return page;
}

function toPage(raw: RawPage): WikiPage {
  const revision = raw.revisions![0]!;
  return {
    id: raw.pageid!,
    title: raw.title,
    updatedAt: revision.timestamp,
    revisionId: revision.revid,
    content: revision.slots?.main?.content ?? '',
  };
}

export async function getWikiPage(id: number): Promise<WikiPage> {
  const page = await readPage({ pageids: id });
  // Interface pages (the sidebar, site CSS) are not the admin page's to edit.
  if (!page || page.ns !== MAIN_NAMESPACE) {
    throw new WikiError('not_found', 'That page does not exist');
  }
  return toPage(page);
}

/** Who saved the latest revision of a page, or null when there is no such page. */
export async function wikiPageLastEditor(title: string): Promise<string | null> {
  const page = await readPage({ titles: title, rvprop: 'user' });
  return page?.revisions?.[0]?.user ?? null;
}

function editResult(json: ApiResult): { pageid: number } {
  const edit = json.edit as { result?: string; pageid?: number; info?: string } | undefined;
  if (edit?.result !== 'Success' || edit.pageid === undefined) {
    throw new WikiError('rejected', edit?.info || 'The wiki refused the edit');
  }
  return { pageid: edit.pageid };
}

/**
 * Create a page. The title is checked first: MediaWiki normalises it (first
 * letter upper-case, underscores to spaces), refuses an invalid one, and a
 * prefix such as `Help:` would put the page in a namespace the admin page
 * does not list. `createonly` turns a race with another writer into a conflict
 * rather than an overwrite.
 */
export async function createWikiPage(input: WikiPageInput): Promise<WikiPage> {
  const check = pagesOf(await wikiApi({ action: 'query', titles: input.title }))[0];
  if (!check || check.invalid) {
    throw new WikiError('rejected', check?.invalidreason || 'That title is not allowed');
  }
  if (check.ns !== MAIN_NAMESPACE) {
    throw new WikiError('rejected', 'Choose a title without a namespace prefix such as "Help:"');
  }
  if (!check.missing) throw new WikiError('conflict', 'A page with that title already exists');

  const { pageid } = editResult(
    await wikiApi(
      {
        action: 'edit',
        title: check.title,
        text: input.content,
        summary: input.summary || undefined,
        createonly: true,
      },
      { write: true },
    ),
  );
  return getWikiPage(pageid);
}

/**
 * Replace a page's text. The title is kept: a move is a MediaWiki operation.
 *
 * The base is sent as `baserevid` and never as `basetimestamp`. Every edit
 * from the site is made by the same bot account, so two admins editing one
 * page is, to MediaWiki, one user conflicting with themselves; it lets such a
 * "self-conflict" overwrite when given a timestamp, and refuses it when given
 * only the revision id.
 */
export async function updateWikiPage(id: number, input: WikiPageUpdate): Promise<WikiPage> {
  await getWikiPage(id);
  editResult(
    await wikiApi(
      {
        action: 'edit',
        pageid: id,
        text: input.content,
        summary: input.summary || undefined,
        baserevid: input.baseRevisionId,
        nocreate: true,
      },
      { write: true },
    ),
  );
  return getWikiPage(id);
}

/**
 * Write any page by title, whatever its namespace, creating it if needed. For
 * the wiki's own configuration pages (`MediaWiki:Sidebar`) and the seed; the
 * admin API goes through `createWikiPage` and `updateWikiPage`.
 */
export async function writeWikiText(title: string, text: string, summary: string): Promise<void> {
  editResult(await wikiApi({ action: 'edit', title, text, summary }, { write: true }));
}

/**
 * Render pages again, with their link tables. MediaWiki colours each internal
 * link at render time (blue when the target exists, red when not) and fixes
 * links to a new page later through its job queue, which runs only as visitors
 * load pages. A batch of pages that link to each other is purged once all of
 * them exist, so none of them starts out with red links.
 */
export async function purgeWikiPages(titles: readonly string[]): Promise<void> {
  // MediaWiki takes up to 50 titles per call.
  for (let i = 0; i < titles.length; i += 50) {
    await wikiApi(
      { action: 'purge', titles: titles.slice(i, i + 50).join('|'), forcelinkupdate: true },
      { write: true },
    );
  }
}

export async function deleteWikiPage(id: number): Promise<void> {
  await getWikiPage(id);
  await wikiApi(
    { action: 'delete', pageid: id, reason: 'Deleted from rmhstudios.com/admin/wiki' },
    { write: true },
  );
}
