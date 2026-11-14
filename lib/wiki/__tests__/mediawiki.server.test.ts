/**
 * The MediaWiki Action API client. Fetch is stubbed with a small fake wiki whose
 * answers copy the shapes a real MediaWiki 1.43.11 returned (formatversion=2),
 * including the ones that drive behaviour: a wrong bot password is
 * `login.result: "Failed"`, a stale session is `assertuserfailed`, a stale
 * token is `badtoken`, a missing page is `missing: true` rather than an error,
 * and an edit conflict is the `editconflict` error.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createWikiPage,
  deleteWikiPage,
  getWikiPage,
  isWikiConfigured,
  listWikiPages,
  purgeWikiPages,
  resetWikiSession,
  updateWikiPage,
  WikiError,
  wikiErrorResponse,
  wikiPageLastEditor,
  wikiPublicUrl,
  writeWikiText,
} from '@/lib/wiki/mediawiki.server';

interface Call {
  method: string;
  params: URLSearchParams;
  /** Parameter names in the order they were sent. */
  order: string[];
  cookie: string;
}

const calls: Call[] = [];
/** Answers for non-login calls, matched by action; a function sees the call. */
let respond: (call: Call) => unknown = () => ({ batchcomplete: true });
let session = 0;
let loginResult = 'Success';

const json = (value: unknown, cookies: string[] = []) => {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  for (const cookie of cookies) headers.append('Set-Cookie', cookie);
  return new Response(JSON.stringify(value), { headers });
};

const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
  const body = typeof init.body === 'string' ? init.body : '';
  const raw = init.method === 'POST' ? body : (url.split('?')[1] ?? '');
  const params = new URLSearchParams(raw);
  const call: Call = {
    method: init.method ?? 'GET',
    params,
    order: [...params.keys()],
    cookie: (init.headers as Record<string, string>).Cookie ?? '',
  };
  calls.push(call);
  const action = params.get('action');
  if (action === 'query' && params.get('type') === 'login') {
    session++;
    return json({ batchcomplete: true, query: { tokens: { logintoken: `lt${session}+\\` } } }, [
      `mediawiki_session=s${session}; path=/; HttpOnly`,
    ]);
  }
  if (action === 'login') {
    return loginResult === 'Success'
      ? json({ login: { result: 'Success', lguserid: 1, lgusername: 'Admin' } }, [
          'mediawiki_UserID=1; path=/; HttpOnly',
        ])
      : json({ login: { result: 'Failed', reason: 'Incorrect username or password entered.' } });
  }
  if (action === 'query' && params.get('meta') === 'tokens') {
    return json({ batchcomplete: true, query: { tokens: { csrftoken: `csrf${session}+\\` } } });
  }
  return json(respond(call));
});

const page = (overrides: Record<string, unknown> = {}) => ({
  pageid: 7,
  ns: 0,
  title: 'Games',
  revisions: [
    {
      revid: 12,
      parentid: 11,
      user: 'Admin',
      timestamp: '2026-11-13T00:00:00Z',
      slots: { main: { contentmodel: 'wikitext', content: "'''Games'''" } },
    },
  ],
  ...overrides,
});
const pages = (...list: unknown[]) => ({ batchcomplete: true, query: { pages: list } });
const apiError = (code: string, info = code) => ({ error: { code, info } });
const edited = { edit: { result: 'Success', pageid: 7, title: 'Games', newrevid: 13 } };

/** The calls after sign-in (login token, login, csrf token). */
const work = () =>
  calls.filter(
    (c) =>
      c.params.get('type') !== 'login' &&
      c.params.get('action') !== 'login' &&
      c.params.get('meta') !== 'tokens',
  );

beforeEach(() => {
  calls.length = 0;
  session = 0;
  loginResult = 'Success';
  respond = () => ({ batchcomplete: true });
  fetchMock.mockClear();
  resetWikiSession();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('MEDIAWIKI_BOT_USER', 'Admin@rmhsite');
  vi.stubEnv('MEDIAWIKI_BOT_PASSWORD', 'bot-secret');
  vi.stubEnv('MEDIAWIKI_URL', 'http://mediawiki/');
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
  it('is configured only with both halves of the bot password, and refuses to call without them', async () => {
    expect(isWikiConfigured()).toBe(true);
    vi.stubEnv('MEDIAWIKI_BOT_PASSWORD', '');
    expect(isWikiConfigured()).toBe(false);
    expect(await code(listWikiPages())).toBe('not_configured');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('calls the internal URL, never the public one', async () => {
    await listWikiPages();
    for (const [url] of fetchMock.mock.calls) expect(url).toMatch(/^http:\/\/mediawiki\/api\.php/);
  });

  it('defaults the public URL to the wiki subdomain', () => {
    expect(wikiPublicUrl()).toBe('https://wiki.rmhstudios.com');
    vi.stubEnv('WIKI_PUBLIC_URL', 'http://localhost:7010/');
    expect(wikiPublicUrl()).toBe('http://localhost:7010');
  });
});

describe('signing in', () => {
  it('signs in once with the bot password, keeps the session cookie, and reuses it', async () => {
    await listWikiPages();
    await listWikiPages();
    const login = calls.find((c) => c.params.get('action') === 'login')!;
    expect(login.method).toBe('POST');
    expect(login.params.get('lgname')).toBe('Admin@rmhsite');
    expect(login.params.get('lgpassword')).toBe('bot-secret');
    expect(login.params.get('lgtoken')).toBe('lt1+\\');
    expect(login.cookie).toContain('mediawiki_session=s1');
    expect(calls.filter((c) => c.params.get('action') === 'login')).toHaveLength(1);
    for (const call of work()) {
      expect(call.cookie).toContain('mediawiki_session=s1');
      expect(call.cookie).toContain('mediawiki_UserID=1');
      // Every call checks it is still signed in rather than silently acting as a guest.
      expect(call.params.get('assert')).toBe('user');
    }
  });

  it('never sends the password in a URL', async () => {
    await listWikiPages();
    for (const [url] of fetchMock.mock.calls) expect(url).not.toContain('bot-secret');
  });

  it('maps a refused bot password to unauthorized, and tries again on the next call', async () => {
    loginResult = 'Failed';
    expect(await code(listWikiPages())).toBe('unauthorized');
    loginResult = 'Success';
    await expect(listWikiPages()).resolves.toEqual([]);
  });

  it('signs in again once when the session or the token has gone stale', async () => {
    for (const stale of ['assertuserfailed', 'badtoken']) {
      resetWikiSession();
      calls.length = 0;
      let first = true;
      respond = () => {
        if (first) {
          first = false;
          return apiError(stale);
        }
        return pages();
      };
      await expect(listWikiPages()).resolves.toEqual([]);
      // The first sign-in, then one fresh one after the stale answer.
      expect(calls.filter((c) => c.params.get('action') === 'login')).toHaveLength(2);
      expect(calls.at(-1)!.cookie).toContain(`mediawiki_session=s${session}`);
    }
  });

  it('gives up after one fresh sign-in', async () => {
    respond = () => apiError('assertuserfailed', 'You are no longer logged in');
    expect(await code(listWikiPages())).toBe('rejected');
  });

  it('maps a network failure or an HTML answer to unreachable', async () => {
    fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    expect(await code(listWikiPages())).toBe('unreachable');
    fetchMock.mockResolvedValueOnce(new Response('<html>502</html>', { status: 502 }));
    expect(await code(listWikiPages())).toBe('unreachable');
  });
});

describe('reading', () => {
  it('lists main-namespace articles without redirects, follows continuation, and sorts by title', async () => {
    respond = (call) =>
      call.params.get('gapcontinue')
        ? pages({
            pageid: 2,
            ns: 0,
            title: 'Apps',
            revisions: [{ timestamp: '2026-11-12T00:00:00Z' }],
          })
        : {
            ...pages({
              pageid: 1,
              ns: 0,
              title: 'Main Page',
              revisions: [{ timestamp: '2026-11-14T00:00:00Z' }],
            }),
            continue: { gapcontinue: 'Apps', continue: 'gapcontinue||' },
          };
    await expect(listWikiPages()).resolves.toEqual([
      { id: 2, title: 'Apps', updatedAt: '2026-11-12T00:00:00Z' },
      { id: 1, title: 'Main Page', updatedAt: '2026-11-14T00:00:00Z' },
    ]);
    const [first, second] = work();
    expect(first!.params.get('generator')).toBe('allpages');
    expect(first!.params.get('gapnamespace')).toBe('0');
    expect(first!.params.get('gapfilterredir')).toBe('nonredirects');
    expect(second!.params.get('gapcontinue')).toBe('Apps');
  });

  it('returns one page with its latest revision', async () => {
    respond = () => pages(page());
    await expect(getWikiPage(7)).resolves.toEqual({
      id: 7,
      title: 'Games',
      updatedAt: '2026-11-13T00:00:00Z',
      revisionId: 12,
      content: "'''Games'''",
    });
    expect(work()[0]!.params.get('pageids')).toBe('7');
  });

  it('maps a missing page, and a page outside the main namespace, to not_found', async () => {
    respond = () => pages({ pageid: 99999, missing: true });
    expect(await code(getWikiPage(99999))).toBe('not_found');
    // MediaWiki:Sidebar and the site CSS are not the admin page's to edit.
    respond = () => pages(page({ ns: 8, title: 'MediaWiki:Sidebar' }));
    expect(await code(getWikiPage(3))).toBe('not_found');
  });

  it('reports who saved a page last, or null when there is no page', async () => {
    respond = () => pages(page({ revisions: [{ user: 'MediaWiki default', timestamp: '' }] }));
    await expect(wikiPageLastEditor('Main Page')).resolves.toBe('MediaWiki default');
    respond = () => pages({ ns: 0, title: 'Nope', missing: true });
    await expect(wikiPageLastEditor('Nope')).resolves.toBeNull();
  });
});

describe('writing', () => {
  const input = { title: 'games', content: "'''Games'''", summary: 'New page' };

  it('creates a page under the title MediaWiki normalised, create-only, then reads it back', async () => {
    respond = (call) => {
      if (call.params.get('action') === 'edit') return edited;
      if (call.params.get('titles')) return pages({ ns: 0, title: 'Games', missing: true });
      return pages(page());
    };
    await expect(createWikiPage(input)).resolves.toMatchObject({ id: 7, title: 'Games' });
    const edit = work().find((c) => c.params.get('action') === 'edit')!;
    expect(edit.method).toBe('POST');
    expect(edit.params.get('title')).toBe('Games');
    expect(edit.params.get('text')).toBe("'''Games'''");
    expect(edit.params.get('summary')).toBe('New page');
    expect(edit.params.get('createonly')).toBe('1');
    expect(edit.params.get('token')).toBe('csrf1+\\');
    // The token goes last, so a body cut short fails the token check instead of saving.
    expect(edit.order.at(-1)).toBe('token');
  });

  it('refuses a title that exists, an invalid one, or one in another namespace, before editing', async () => {
    respond = () => pages(page());
    expect(await code(createWikiPage(input))).toBe('conflict');
    respond = () =>
      pages({ title: 'a[b]', invalidreason: 'contains invalid characters', invalid: true });
    expect(await code(createWikiPage(input))).toBe('rejected');
    respond = () => pages({ ns: 12, title: 'Help:Games', missing: true });
    expect(await code(createWikiPage(input))).toBe('rejected');
    expect(work().some((c) => c.params.get('action') === 'edit')).toBe(false);
  });

  it('maps a create that lost a race to conflict', async () => {
    respond = (call) =>
      call.params.get('action') === 'edit'
        ? apiError('articleexists', 'The article you tried to create has been created already.')
        : pages({ ns: 0, title: 'Games', missing: true });
    expect(await code(createWikiPage(input))).toBe('conflict');
  });

  it('updates by page id on top of the base revision, never by timestamp, and never creates', async () => {
    respond = (call) => (call.params.get('action') === 'edit' ? edited : pages(page()));
    await updateWikiPage(7, { content: 'New text', summary: '', baseRevisionId: 12 });
    const edit = work().find((c) => c.params.get('action') === 'edit')!;
    expect(edit.params.get('pageid')).toBe('7');
    expect(edit.params.get('baserevid')).toBe('12');
    // A timestamp would let one bot account's edits overwrite each other as "self-conflicts".
    expect(edit.params.has('basetimestamp')).toBe(false);
    expect(edit.params.get('nocreate')).toBe('1');
    // An empty summary is left out, so MediaWiki writes its automatic one.
    expect(edit.params.has('summary')).toBe(false);
  });

  it('maps an edit conflict to conflict and a refusal to rejected', async () => {
    respond = (call) =>
      call.params.get('action') === 'edit'
        ? apiError('editconflict', 'Edit conflict.')
        : pages(page());
    expect(await code(updateWikiPage(7, { content: 'x', summary: '', baseRevisionId: 11 }))).toBe(
      'conflict',
    );
    respond = (call) =>
      call.params.get('action') === 'edit' ? apiError('protectedpage') : pages(page());
    expect(await code(updateWikiPage(7, { content: 'x', summary: '', baseRevisionId: 12 }))).toBe(
      'rejected',
    );
  });

  it('writes a configuration page by title, whatever its namespace', async () => {
    respond = () => edited;
    await writeWikiText('MediaWiki:Sidebar', '* navigation', 'Sidebar');
    const edit = work()[0]!;
    expect(edit.params.get('title')).toBe('MediaWiki:Sidebar');
    expect(edit.params.has('createonly')).toBe(false);
    expect(edit.params.has('nocreate')).toBe(false);
  });

  it('purges pages with their link tables, 50 titles to a call', async () => {
    respond = () => ({ batchcomplete: true, purge: [] });
    const titles = Array.from({ length: 51 }, (_, i) => `Page ${i}`);
    await purgeWikiPages(titles);
    const purges = work();
    expect(purges.map((c) => c.params.get('titles')!.split('|').length)).toEqual([50, 1]);
    for (const call of purges) {
      expect(call.method).toBe('POST');
      expect(call.params.get('forcelinkupdate')).toBe('1');
    }
  });

  it('deletes an article by id, and only an article', async () => {
    respond = (call) =>
      call.params.get('action') === 'delete' ? { delete: { title: 'Games' } } : pages(page());
    await deleteWikiPage(7);
    const del = work().find((c) => c.params.get('action') === 'delete')!;
    expect(del.method).toBe('POST');
    expect(del.params.get('pageid')).toBe('7');
    expect(del.params.get('token')).toBe('csrf1+\\');

    calls.length = 0;
    respond = () => pages(page({ ns: 8, title: 'MediaWiki:Sidebar' }));
    expect(await code(deleteWikiPage(3))).toBe('not_found');
    expect(work().some((c) => c.params.get('action') === 'delete')).toBe(false);
  });
});

describe('error responses', () => {
  it.each([
    ['not_configured', 503],
    ['unreachable', 502],
    ['unauthorized', 502],
    ['not_found', 404],
    ['conflict', 409],
    ['rejected', 422],
  ] as const)('%s answers %i with the code and message', async (errorCode, status) => {
    const res = wikiErrorResponse(new WikiError(errorCode, 'why'));
    expect(res.status).toBe(status);
    await expect(res.json()).resolves.toEqual({ error: errorCode, message: 'why' });
  });

  it('rethrows anything that is not a WikiError', () => {
    expect(() => wikiErrorResponse(new Error('boom'))).toThrow('boom');
  });
});
