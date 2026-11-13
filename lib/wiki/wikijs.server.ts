/**
 * Server-side client for the Wiki.js instance behind wiki.rmhstudios.com.
 *
 * The wiki is a separate product (the `wikijs` compose service) with its own
 * users. Site admins do not get a second account there: the site talks to
 * Wiki.js's GraphQL API with one API key (`WIKIJS_API_KEY`, created in the
 * Wiki.js admin area), and `/api/admin/wiki/**` puts the site's own admin check
 * in front of it. The key never reaches a browser.
 *
 * Setup and operations: `docs/wiki.md`.
 */

export interface WikiPageSummary {
  id: number;
  path: string;
  locale: string;
  title: string;
  description: string;
  isPublished: boolean;
  updatedAt: string;
}

export interface WikiPage extends WikiPageSummary {
  content: string;
  tags: string[];
}

export interface WikiPageInput {
  path: string;
  title: string;
  description: string;
  content: string;
  tags: string[];
  isPublished: boolean;
}

export type WikiErrorCode =
  'not_configured' | 'unreachable' | 'not_found' | 'conflict' | 'rejected';

/** A failure talking to Wiki.js, with the HTTP status the admin API answers with. */
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

/** Where the site reaches Wiki.js (compose DNS in production, loopback in dev). */
function internalUrl(): string {
  return (process.env.WIKIJS_URL || 'http://localhost:7010').replace(/\/+$/, '');
}

/** The wiki's public origin, for links shown to admins. */
export function wikiPublicUrl(): string {
  return (process.env.WIKI_PUBLIC_URL || 'https://wiki.rmhstudios.com').replace(/\/+$/, '');
}

/** The one locale the site writes pages in. Wiki.js namespaces every path by locale. */
function wikiLocale(): string {
  return process.env.WIKIJS_LOCALE || 'en';
}

export function isWikiConfigured(): boolean {
  return Boolean(process.env.WIKIJS_API_KEY);
}

const TIMEOUT_MS = 10_000;

async function gql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const key = process.env.WIKIJS_API_KEY;
  if (!key) throw new WikiError('not_configured', 'WIKIJS_API_KEY is not set');

  let res: Response;
  try {
    res = await fetch(`${internalUrl()}/graphql`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    console.error('[wiki] request failed:', (err as Error)?.message);
    throw new WikiError('unreachable', 'The wiki did not answer');
  }

  // A proxy error page or an unfinished setup wizard answers with HTML.
  const json = (await res.json().catch(() => null)) as {
    data?: T;
    errors?: { message?: string }[];
  } | null;
  if (!json) throw new WikiError('unreachable', `The wiki answered with HTTP ${res.status}`);
  const first = json.errors?.[0]?.message;
  if (first) {
    if (/does not exist|not found/i.test(first)) throw new WikiError('not_found', first);
    throw new WikiError('rejected', first);
  }
  if (!json.data) throw new WikiError('unreachable', 'The wiki returned no data');
  return json.data;
}

interface ResponseResult {
  succeeded: boolean;
  errorCode: number;
  slug: string;
  message: string | null;
}

function assertSucceeded(result: ResponseResult | null | undefined): void {
  if (result?.succeeded) return;
  const slug = result?.slug ?? '';
  const message = result?.message || slug || 'The wiki refused the change';
  if (/Duplicate|AlreadyExists/i.test(slug)) throw new WikiError('conflict', message);
  if (/NotFound/i.test(slug)) throw new WikiError('not_found', message);
  throw new WikiError('rejected', message);
}

const SUMMARY_FIELDS = 'id path locale title description isPublished updatedAt';
const PAGE_FIELDS = `${SUMMARY_FIELDS} content tags { tag }`;
const RESULT_FIELDS = 'responseResult { succeeded errorCode slug message }';

type RawPage = WikiPageSummary & { content: string; tags: { tag: string }[] | null };

function toPage(raw: RawPage): WikiPage {
  return { ...raw, description: raw.description ?? '', tags: (raw.tags ?? []).map((t) => t.tag) };
}

export async function listWikiPages(): Promise<WikiPageSummary[]> {
  const data = await gql<{ pages: { list: WikiPageSummary[] } }>(
    `query { pages { list(orderBy: TITLE) { ${SUMMARY_FIELDS} } } }`,
  );
  return data.pages.list.map((p) => ({
    ...p,
    title: p.title ?? p.path,
    description: p.description ?? '',
  }));
}

export async function getWikiPage(id: number): Promise<WikiPage> {
  const data = await gql<{ pages: { single: RawPage | null } }>(
    `query ($id: Int!) { pages { single(id: $id) { ${PAGE_FIELDS} } } }`,
    { id },
  );
  if (!data.pages.single) throw new WikiError('not_found', 'That page does not exist');
  return toPage(data.pages.single);
}

/**
 * `create` and `update` answer with the stored row, whose locale column is not
 * the `locale` field the schema promises, so asking for the full page there
 * fails the whole mutation ("Cannot return null for non-nullable field
 * Page.locale"). Both take the id only and read the page back with `single`.
 */
export async function createWikiPage(input: WikiPageInput): Promise<WikiPage> {
  const data = await gql<{
    pages: { create: { responseResult: ResponseResult; page: { id: number } | null } };
  }>(
    `mutation ($content: String!, $description: String!, $isPublished: Boolean!, $locale: String!,
               $path: String!, $tags: [String]!, $title: String!) {
       pages {
         create(content: $content, description: $description, editor: "markdown",
                isPublished: $isPublished, isPrivate: false, locale: $locale, path: $path,
                tags: $tags, title: $title) {
           ${RESULT_FIELDS}
           page { id }
         }
       }
     }`,
    { ...input, locale: wikiLocale() },
  );
  assertSucceeded(data.pages.create.responseResult);
  if (!data.pages.create.page) throw new WikiError('rejected', 'The wiki returned no page');
  return getWikiPage(data.pages.create.page.id);
}

/** Update a page in place. The path and locale are kept: a move is a Wiki.js operation. */
export async function updateWikiPage(
  id: number,
  input: Omit<WikiPageInput, 'path'>,
): Promise<WikiPage> {
  const current = await getWikiPage(id);
  const data = await gql<{
    pages: { update: { responseResult: ResponseResult } };
  }>(
    `mutation ($id: Int!, $content: String, $description: String, $isPublished: Boolean,
               $locale: String, $path: String, $tags: [String], $title: String) {
       pages {
         update(id: $id, content: $content, description: $description, editor: "markdown",
                isPublished: $isPublished, isPrivate: false, locale: $locale, path: $path,
                tags: $tags, title: $title) {
           ${RESULT_FIELDS}
         }
       }
     }`,
    { id, ...input, locale: current.locale, path: current.path },
  );
  assertSucceeded(data.pages.update.responseResult);
  return getWikiPage(id);
}

export async function deleteWikiPage(id: number): Promise<void> {
  const data = await gql<{ pages: { delete: { responseResult: ResponseResult } } }>(
    `mutation ($id: Int!) { pages { delete(id: $id) { ${RESULT_FIELDS} } } }`,
    { id },
  );
  assertSucceeded(data.pages.delete.responseResult);
}
