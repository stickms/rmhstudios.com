/**
 * The Wiki.js GraphQL client. Fetch is stubbed; the shapes below were recorded
 * from a real Wiki.js 2.5.307, including the two that are not what its schema
 * promises (an invalid key reads as a guest, and `create`/`update` cannot
 * return the page's locale).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createWikiPage,
  deleteWikiPage,
  getWikiPage,
  isWikiConfigured,
  listWikiPages,
  renderWikiPage,
  updateWikiPage,
  WikiError,
  wikiErrorResponse,
  wikiPublicUrl,
} from '@/lib/wiki/wikijs.server';

const fetchMock = vi.fn();
const ok = (data: unknown) => new Response(JSON.stringify({ data }));
const result = (succeeded: boolean, slug = 'ok', message: string | null = null) => ({
  responseResult: { succeeded, errorCode: succeeded ? 0 : 1, slug, message },
});
const page = {
  id: 7,
  path: 'games/balatro',
  locale: 'en',
  title: 'Balatro',
  description: null,
  isPublished: true,
  updatedAt: '2026-11-13T00:00:00.000Z',
  content: '# hi',
  tags: [{ tag: 'games' }],
};

/** The parsed body of the nth request. */
const sent = (n: number) =>
  JSON.parse(fetchMock.mock.calls[n]![1].body as string) as {
    query: string;
    variables: Record<string, unknown>;
  };

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('WIKIJS_API_KEY', 'key-123');
  vi.stubEnv('WIKIJS_URL', 'http://wikijs:3000/');
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const code = async (p: Promise<unknown>) => {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(WikiError);
  return (err as WikiError).code;
};

describe('configuration', () => {
  it('is configured only with an API key, and refuses to call without one', async () => {
    expect(isWikiConfigured()).toBe(true);
    vi.stubEnv('WIKIJS_API_KEY', '');
    expect(isWikiConfigured()).toBe(false);
    expect(await code(listWikiPages())).toBe('not_configured');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends the key as a bearer token to the internal URL, never the public one', async () => {
    fetchMock.mockResolvedValue(ok({ pages: { list: [] } }));
    await listWikiPages();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://wikijs:3000/graphql');
    expect(init.headers.Authorization).toBe('Bearer key-123');
  });

  it('defaults the public URL to the wiki subdomain', () => {
    expect(wikiPublicUrl()).toBe('https://wiki.rmhstudios.com');
    vi.stubEnv('WIKI_PUBLIC_URL', 'http://localhost:7010/');
    expect(wikiPublicUrl()).toBe('http://localhost:7010');
  });
});

describe('reading', () => {
  it('lists pages and fills in the fields Wiki.js leaves null', async () => {
    fetchMock.mockResolvedValue(
      ok({ pages: { list: [{ ...page, title: null, content: undefined, tags: undefined }] } }),
    );
    const [first] = await listWikiPages();
    expect(first).toMatchObject({ id: 7, title: 'games/balatro', description: '' });
  });

  it('returns one page with its tags flattened', async () => {
    fetchMock.mockResolvedValue(ok({ pages: { single: page } }));
    await expect(getWikiPage(7)).resolves.toMatchObject({ tags: ['games'], description: '' });
    expect(sent(0).variables).toEqual({ id: 7 });
  });

  it('maps a missing page to not_found, whichever way Wiki.js says it', async () => {
    fetchMock.mockResolvedValueOnce(ok({ pages: { single: null } }));
    expect(await code(getWikiPage(9))).toBe('not_found');
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ errors: [{ message: 'This page does not exist.' }] })),
    );
    expect(await code(getWikiPage(9))).toBe('not_found');
  });
});

describe('writing', () => {
  const input = {
    path: 'games/balatro',
    title: 'Balatro',
    description: '',
    content: '# hi',
    tags: ['games'],
    isPublished: true,
  };

  it('creates a public Markdown page in the wiki locale, then reads it back by id', async () => {
    fetchMock
      .mockResolvedValueOnce(ok({ pages: { create: { ...result(true), page: { id: 7 } } } }))
      .mockResolvedValueOnce(ok({ pages: { single: page } }));
    await expect(createWikiPage(input)).resolves.toMatchObject({ id: 7, locale: 'en' });

    const create = sent(0);
    expect(create.variables).toMatchObject({ ...input, locale: 'en' });
    expect(create.query).toContain('editor: "markdown"');
    expect(create.query).toContain('isPrivate: false');
    // Asking the mutation for the page's locale fails the whole call on a real wiki.
    expect(create.query).toMatch(/page \{ id \}/);
    expect(sent(1).variables).toEqual({ id: 7 });
  });

  it('maps a duplicate path to conflict', async () => {
    fetchMock.mockResolvedValue(
      ok({ pages: { create: { ...result(false, 'PageDuplicateCreate', 'exists'), page: null } } }),
    );
    expect(await code(createWikiPage(input))).toBe('conflict');
  });

  it('maps any other refusal to rejected, with the wiki message', async () => {
    fetchMock.mockResolvedValue(
      ok({ pages: { create: { ...result(false, 'PageCreateForbidden', 'nope'), page: null } } }),
    );
    const err = await createWikiPage(input).catch((e: unknown) => e as WikiError);
    expect(err).toMatchObject({ code: 'rejected', message: 'nope', status: 422 });
  });

  it('updates in place, keeping the path and locale the page already has', async () => {
    fetchMock
      .mockResolvedValueOnce(ok({ pages: { single: { ...page, locale: 'fr' } } }))
      .mockResolvedValueOnce(ok({ pages: { update: result(true) } }))
      .mockResolvedValueOnce(ok({ pages: { single: { ...page, title: 'New' } } }));
    const { path: _path, ...fields } = input;
    await expect(updateWikiPage(7, { ...fields, title: 'New' })).resolves.toMatchObject({
      title: 'New',
    });
    expect(sent(1).variables).toMatchObject({
      id: 7,
      title: 'New',
      path: 'games/balatro',
      locale: 'fr',
    });
  });

  it('deletes, and reports a page that is already gone as not_found', async () => {
    fetchMock.mockResolvedValueOnce(ok({ pages: { delete: result(true) } }));
    await expect(deleteWikiPage(7)).resolves.toBeUndefined();
    fetchMock.mockResolvedValueOnce(
      ok({ pages: { delete: result(false, 'PageNotFound', 'This page does not exist.') } }),
    );
    expect(await code(deleteWikiPage(7))).toBe('not_found');
  });

  it('re-renders a page', async () => {
    fetchMock.mockResolvedValue(ok({ pages: { render: result(true) } }));
    await renderWikiPage(7);
    expect(sent(0).query).toContain('render(id: $id)');
  });
});

describe('failures', () => {
  it('is unreachable when the request throws', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
    expect(await code(listWikiPages())).toBe('unreachable');
  });

  it('is unreachable when the answer is not JSON (the setup wizard, a proxy page)', async () => {
    fetchMock.mockResolvedValue(new Response('<!DOCTYPE html><html></html>'));
    expect(await code(listWikiPages())).toBe('unreachable');
  });

  it('answers with the code and status as JSON, and rethrows what is not a WikiError', async () => {
    const res = wikiErrorResponse(new WikiError('conflict', 'taken'));
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({ error: 'conflict', message: 'taken' });
    expect(new WikiError('not_configured', '').status).toBe(503);
    expect(new WikiError('not_found', '').status).toBe(404);
    expect(new WikiError('unreachable', '').status).toBe(502);
    expect(() => wikiErrorResponse(new Error('boom'))).toThrow('boom');
  });
});
