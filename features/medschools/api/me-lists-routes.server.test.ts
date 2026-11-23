import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handlersOf } from '@/lib/__tests__/api-handlers-of';

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  listLists: vi.fn(),
  createList: vi.fn(),
  renameList: vi.fn(),
  deleteList: vi.fn(),
  reorderLists: vi.fn(),
  saveItem: vi.fn(),
  patchItem: vi.fn(),
  deleteItem: vi.fn(),
  reorderItems: vi.fn(),
  addListToTracker: vi.fn(),
  getPrefs: vi.fn(),
  putPrefs: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: mocks.session } } }));
vi.mock('@/lib/prisma.server', () => ({ prisma: {} }));
vi.mock('@/lib/rate-limit.server', () => ({ withRateLimitAsync: async () => null }));
vi.mock('./lists.server', () => ({
  listLists: mocks.listLists,
  createList: mocks.createList,
  renameList: mocks.renameList,
  deleteList: mocks.deleteList,
  reorderLists: mocks.reorderLists,
  saveItem: mocks.saveItem,
  patchItem: mocks.patchItem,
  deleteItem: mocks.deleteItem,
  reorderItems: mocks.reorderItems,
  addListToTracker: mocks.addListToTracker,
}));
vi.mock('./prefs.server', () => ({ getPrefs: mocks.getPrefs, putPrefs: mocks.putPrefs }));

import { route as lists } from './medschools.me.lists.server';
import { route as list } from './medschools.me.lists.$id.server';
import { route as listOrder } from './medschools.me.list-order.server';
import { route as listItems } from './medschools.me.list-items.server';
import { route as item } from './medschools.me.lists.$id.items.$itemId.server';
import { route as itemOrder } from './medschools.me.lists.$id.item-order.server';
import { route as addToTracker } from './medschools.me.lists.$id.add-to-tracker.server';
import { route as prefs } from './medschools.me.prefs.server';
import { SharingUnavailableError } from './share-sync.server';

type Handler = (ctx: { request: Request; params: Record<string, string> }) => Promise<Response>;
const call = (
  route: unknown,
  method: string,
  opts: { body?: unknown; query?: string; params?: Record<string, string> } = {},
) =>
  handlersOf<Handler>(route)[method]!({
    params: opts.params ?? {},
    request: new Request(`https://rmhstudios.com/api/medschools/me/x${opts.query ?? ''}`, {
      method,
      headers: { cookie: 'better-auth.session_token=t', 'content-type': 'application/json' },
      ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
    }),
  });

const P = { id: 'list1', itemId: 'item1' };
const YEAR = new Date().getUTCFullYear() + (new Date().getUTCMonth() >= 5 ? 1 : 0);
const prefsBody = { programFilter: 'PHD', degree: 'MD', homeState: 'NC', chartCategories: ['INTERVIEW'] };

const all: Array<[string, unknown, string, Parameters<typeof call>[2], ReturnType<typeof vi.fn>]> = [
  ['GET lists', lists, 'GET', {}, mocks.listLists],
  ['POST lists', lists, 'POST', { body: { name: 'Reach' } }, mocks.createList],
  ['PATCH list', list, 'PATCH', { body: { name: 'Safety' }, params: P }, mocks.renameList],
  ['DELETE list', list, 'DELETE', { params: P }, mocks.deleteList],
  ['PUT list-order', listOrder, 'PUT', { body: { ids: ['a', 'b'] } }, mocks.reorderLists],
  ['POST list-items', listItems, 'POST', { body: { schoolSlug: 'duke' } }, mocks.saveItem],
  ['PATCH item', item, 'PATCH', { body: { note: 'n' }, params: P }, mocks.patchItem],
  ['DELETE item', item, 'DELETE', { params: P }, mocks.deleteItem],
  ['PUT item-order', itemOrder, 'PUT', { body: { ids: ['a'] }, params: P }, mocks.reorderItems],
  ['POST add-to-tracker', addToTracker, 'POST', { body: { cycleYear: YEAR }, params: P }, mocks.addListToTracker],
  ['GET prefs', prefs, 'GET', {}, mocks.getPrefs],
  ['PUT prefs', prefs, 'PUT', { body: prefsBody }, mocks.putPrefs],
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({ user: { id: 'u1' } });
  for (const [, , , , fn] of all) fn.mockResolvedValue({ ok: true });
});

describe('me/** lists and prefs routes', () => {
  it.each(all)('%s: signed out is 401 and the service is not called', async (_n, route, method, opts, svc) => {
    mocks.session.mockResolvedValue(null);
    expect((await call(route, method, opts)).status).toBe(401);
    expect(svc).not.toHaveBeenCalled();
  });

  it.each(all)(
    '%s: the user id comes from the session and is the first argument',
    async (_n, route, method, opts, svc) => {
      expect((await call(route, method, opts)).status).toBe(200);
      expect(svc.mock.calls[0]?.[0]).toBe('u1');
    },
  );

  it.each(all)('%s: never publicly cached, no etag', async (_n, route, method, opts) => {
    const res = await call(route, method, opts);
    const cc = res.headers.get('cache-control') ?? '';
    expect(cc).not.toContain('public');
    expect(cc).not.toContain('s-maxage');
    expect(res.headers.get('etag')).toBeNull();
  });

  it('a userId (or any unknown key) in a body is a 400 and never reaches the service', async () => {
    for (const [route, method, body] of [
      [lists, 'POST', { name: 'x', userId: 'u2' }],
      [list, 'PATCH', { name: 'x', userId: 'u2' }],
      [listOrder, 'PUT', { ids: [], userId: 'u2' }],
      [listItems, 'POST', { schoolSlug: 'duke', userId: 'u2' }],
      [item, 'PATCH', { note: 'x', listId: 'l2' }],
      [itemOrder, 'PUT', { ids: [], userId: 'u2' }],
      [addToTracker, 'POST', { userId: 'u2' }],
      [prefs, 'PUT', { ...prefsBody, userId: 'u2' }],
    ] as const) {
      expect((await call(route, method, { body, params: P })).status, method).toBe(400);
    }
    for (const fn of Object.values(mocks)) if (fn !== mocks.session) expect(fn).not.toHaveBeenCalled();
  });

  it('400 for bad names, ids, slugs, programs and prefs', async () => {
    const bad: Array<[unknown, string, unknown]> = [
      [lists, 'POST', { name: '   ' }],
      [lists, 'POST', { name: 'x'.repeat(61) }],
      [lists, 'POST', { name: 5 }],
      [listOrder, 'PUT', { ids: 'a,b' }],
      [listOrder, 'PUT', { ids: [1, 2] }],
      [listOrder, 'PUT', { ids: Array.from({ length: 201 }, (_, n) => `i${n}`) }],
      [itemOrder, 'PUT', { ids: [{}] }],
      [listItems, 'POST', { schoolSlug: 'Duke University' }],
      [listItems, 'POST', { schoolSlug: '../etc' }],
      [listItems, 'POST', { schoolSlug: 'duke', program: 'DO' }],
      [listItems, 'POST', { schoolSlug: 'duke', listId: 'a', newListName: 'b' }],
      [item, 'PATCH', {}],
      [item, 'PATCH', { note: 'x'.repeat(501) }],
      [addToTracker, 'POST', { cycleYear: String(YEAR) }],
      [addToTracker, 'POST', { cycleYear: 2062 }],
      [prefs, 'PUT', { ...prefsBody, programFilter: 'NONE' }],
      [prefs, 'PUT', { ...prefsBody, degree: 'PhD' }],
      [prefs, 'PUT', { ...prefsBody, homeState: 'ZZ' }],
      [prefs, 'PUT', { ...prefsBody, chartCategories: ['SUBMITTED'] }],
      [prefs, 'PUT', { programFilter: 'ALL' }],
    ];
    for (const [route, method, body] of bad) expect((await call(route, method, { body, params: P })).status).toBe(400);
    expect(mocks.createList).not.toHaveBeenCalled();
    expect(mocks.putPrefs).not.toHaveBeenCalled();
  });

  it('a service refusal of the name is a 400', async () => {
    mocks.createList.mockResolvedValue('bad-name');
    mocks.renameList.mockResolvedValue('bad-name');
    mocks.saveItem.mockResolvedValue('bad-name');
    expect((await call(lists, 'POST', { body: { name: 'x' } })).status).toBe(400);
    expect((await call(list, 'PATCH', { body: { name: 'x' }, params: P })).status).toBe(400);
    expect((await call(listItems, 'POST', { body: { schoolSlug: 'duke' } })).status).toBe(400);
  });

  it('404 for a null or false service result, with no existence oracle', async () => {
    mocks.renameList.mockResolvedValue(null);
    mocks.deleteList.mockResolvedValue(false);
    mocks.saveItem.mockResolvedValue(null);
    mocks.patchItem.mockResolvedValue(null);
    mocks.deleteItem.mockResolvedValue(null);
    mocks.reorderItems.mockResolvedValue(null);
    mocks.addListToTracker.mockResolvedValue(null);
    for (const [name, route, method, opts] of all) {
      if (/^(GET|PUT list-order|POST lists|PUT prefs)/.test(name)) continue;
      expect((await call(route, method, opts)).status, name).toBe(404);
    }
    mocks.saveItem.mockResolvedValue('school-missing');
    expect((await call(listItems, 'POST', { body: { schoolSlug: 'duke' } })).status).toBe(404);
  });

  it('path ids of %00, 300 characters or ../ reach the service unchanged and are a 404, never a 500', async () => {
    mocks.deleteItem.mockResolvedValue(null);
    mocks.deleteList.mockResolvedValue(false);
    for (const id of ['%00', 'x'.repeat(300), '../']) {
      expect((await call(item, 'DELETE', { params: { id, itemId: id } })).status).toBe(404);
      expect(mocks.deleteItem).toHaveBeenLastCalledWith('u1', id, id);
      expect((await call(list, 'DELETE', { params: { id } })).status).toBe(404);
      expect(mocks.deleteList).toHaveBeenLastCalledWith('u1', id);
    }
  });

  it('409 with the right code for caps, stale order and a duplicate', async () => {
    const codeOf = async (res: Response) => ({ status: res.status, ...(await res.json()) });
    mocks.createList.mockResolvedValue('cap');
    expect(await codeOf(await call(lists, 'POST', { body: { name: 'x' } }))).toMatchObject({
      status: 409,
      code: 'MEDSCHOOLS_LIST_CAP',
      max: 20,
    });
    mocks.saveItem.mockResolvedValue('cap');
    expect(await codeOf(await call(listItems, 'POST', { body: { schoolSlug: 'duke' } }))).toMatchObject({
      status: 409,
      code: 'MEDSCHOOLS_ITEM_CAP',
      max: 200,
    });
    mocks.saveItem.mockResolvedValue('list-cap');
    expect(await codeOf(await call(listItems, 'POST', { body: { schoolSlug: 'duke' } }))).toMatchObject({
      status: 409,
      code: 'MEDSCHOOLS_LIST_CAP',
    });
    mocks.reorderLists.mockResolvedValue('stale');
    mocks.reorderItems.mockResolvedValue('stale');
    for (const [route, params] of [
      [listOrder, {}],
      [itemOrder, P],
    ] as const) {
      expect(await codeOf(await call(route, 'PUT', { body: { ids: ['a'] }, params }))).toMatchObject({
        status: 409,
        code: 'MEDSCHOOLS_STALE_ORDER',
      });
    }
    mocks.patchItem.mockResolvedValue('duplicate');
    expect(await codeOf(await call(item, 'PATCH', { body: { program: 'PHD' }, params: P }))).toMatchObject({
      status: 409,
      code: 'MEDSCHOOLS_LIST_DUPLICATE',
    });
    mocks.addListToTracker.mockResolvedValue({ cap: { existing: 40, adding: 21 } });
    expect(await codeOf(await call(addToTracker, 'POST', { body: {}, params: P }))).toMatchObject({
      status: 409,
      code: 'MEDSCHOOLS_CAP',
      max: 60,
      existing: 40,
      adding: 21,
    });
  });

  it('add-to-tracker passes the list id and cycle year, and 503s without the secret', async () => {
    mocks.addListToTracker.mockResolvedValue({ cycleYear: YEAR, added: 2, skipped: 1 });
    const ok = await call(addToTracker, 'POST', { body: { cycleYear: YEAR }, params: P });
    expect(await ok.json()).toEqual({ cycleYear: YEAR, added: 2, skipped: 1 });
    expect(mocks.addListToTracker).toHaveBeenCalledWith('u1', 'list1', YEAR);
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.addListToTracker.mockRejectedValue(new SharingUnavailableError());
    expect((await call(addToTracker, 'POST', { body: {}, params: P })).status).toBe(503);
    log.mockRestore();
  });

  it('GET lists wraps the array, GET prefs returns the preferences as they are', async () => {
    mocks.listLists.mockResolvedValue([{ id: 'l' }]);
    expect(await (await call(lists, 'GET')).json()).toEqual({ lists: [{ id: 'l' }] });
    mocks.getPrefs.mockResolvedValue({ programFilter: 'ALL', degree: null, homeState: null, chartCategories: [] });
    expect(await (await call(prefs, 'GET')).json()).toEqual({
      programFilter: 'ALL',
      degree: null,
      homeState: null,
      chartCategories: [],
    });
  });

  it('a service that throws is a bare 500', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.listLists.mockRejectedValue(new Error('connection string postgres://secret'));
    const res = await call(lists, 'GET');
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal Server Error' });
    log.mockRestore();
  });
});
