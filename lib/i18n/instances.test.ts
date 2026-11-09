import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The per-namespace loading contract (perf audit B6): the client i18next
 * instance pulls exactly the (language, namespace) pairs that are asked for —
 * never a whole locale, never the whole English catalog. The generated
 * `resources.<locale>` maps are replaced with spies so the test can count which
 * namespace thunks were actually invoked (each is one chunk in a real build).
 */

const calls = vi.hoisted(() => ({ log: [] as string[] }));

function thunks(lng: string, namespaces: string[]) {
  return Object.fromEntries(
    namespaces.map((ns) => [
      ns,
      async () => {
        calls.log.push(`${lng}:${ns}`);
        return { default: { greeting: `${lng}/${ns}/greeting` } };
      },
    ]),
  );
}

const NS = ['common', 'nav', 'c-game', 'c-wager', 'c-blog', 'f-perf'];

vi.mock('@/lib/i18n/resources.en', () => ({ default: thunks('en', NS) }));
vi.mock('@/lib/i18n/resources.de', () => ({ default: thunks('de', NS) }));
vi.mock('@/lib/i18n/resources.fr', () => ({ default: thunks('fr', NS) }));

/** A fresh module graph per test: the client instance is a module singleton. */
async function freshClient() {
  vi.resetModules();
  calls.log.length = 0;
  return import('@/lib/i18n/instances');
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('client i18n backend (per-namespace loading)', () => {
  beforeEach(() => {
    calls.log.length = 0;
  });

  it('English does not import any namespace at init', async () => {
    const { ensureClientLocale, clientI18n } = await freshClient();
    ensureClientLocale('en');
    await flush();
    expect(calls.log).toEqual([]);
    expect(clientI18n.language).toBe('en');
    // react-i18next must not suspend for a namespace that is still arriving.
    expect(clientI18n.options.react?.useSuspense).toBe(false);
  });

  it('English loads only the namespace a component asks for, on demand', async () => {
    const { ensureClientLocale, clientI18n } = await freshClient();
    ensureClientLocale('en');
    expect(clientI18n.hasLoadedNamespace('c-game')).toBe(false);
    // What useTranslation('c-game') does for a namespace that is not loaded.
    await clientI18n.loadNamespaces('c-game');
    expect(calls.log).toEqual(['en:c-game']);
    expect(clientI18n.hasLoadedNamespace('c-game')).toBe(true);
    expect(clientI18n.t('greeting', { ns: 'c-game', defaultValue: 'x' })).toBe('en/c-game/greeting');
  });

  it('t() returns the defaultValue until the namespace arrives', async () => {
    const { ensureClientLocale, clientI18n } = await freshClient();
    ensureClientLocale('en');
    expect(clientI18n.t('greeting', { ns: 'c-wager', defaultValue: 'Default' })).toBe('Default');
    await clientI18n.loadNamespaces('c-wager');
    expect(clientI18n.t('greeting', { ns: 'c-wager', defaultValue: 'Default' })).toBe('en/c-wager/greeting');
  });

  it('a non-en locale keeps the root loader core bundle and fetches only a requested non-core namespace (plus its en fallback)', async () => {
    const { ensureClientLocale, clientI18n } = await freshClient();
    ensureClientLocale('de', { common: { greeting: 'inline/common' }, nav: { greeting: 'inline/nav' } });
    await flush();
    // Core namespaces came inline: nothing was fetched for them.
    expect(calls.log).toEqual([]);
    expect(clientI18n.t('greeting', { ns: 'nav', defaultValue: 'x' })).toBe('inline/nav');
    expect(clientI18n.hasLoadedNamespace('nav')).toBe(true);

    await clientI18n.loadNamespaces('c-blog');
    expect(calls.log.sort()).toEqual(['de:c-blog', 'en:c-blog']);
    expect(clientI18n.t('greeting', { ns: 'c-blog', defaultValue: 'x' })).toBe('de/c-blog/greeting');
    // Never an unrelated namespace, never a whole locale.
    expect(calls.log).not.toContain('de:f-perf');
    expect(calls.log).not.toContain('en:f-perf');
  });

  it('switching locale loads only the namespaces in use', async () => {
    const { ensureClientLocale, clientI18n } = await freshClient();
    ensureClientLocale('en');
    await clientI18n.loadNamespaces('c-game');
    calls.log.length = 0;

    ensureClientLocale('fr');
    await vi.waitFor(() => expect(clientI18n.language).toBe('fr'));


    const fetchedFr = calls.log.filter((c) => c.startsWith('fr:')).map((c) => c.slice(3));
    // The core set plus the one in-use namespace — not c-wager, c-blog or f-perf.
    expect(fetchedFr).toContain('c-game');
    expect(fetchedFr).toContain('common');
    expect(fetchedFr).not.toContain('c-wager');
    expect(fetchedFr).not.toContain('c-blog');
    expect(fetchedFr).not.toContain('f-perf');
    expect(clientI18n.t('greeting', { ns: 'c-game', defaultValue: 'x' })).toBe('fr/c-game/greeting');
  });

  it('a t() that reads an undeclared namespace loads it (cross-namespace reads)', async () => {
    const { ensureClientLocale, clientI18n } = await freshClient();
    ensureClientLocale('fr', { common: { greeting: 'inline/common' } });
    await flush();
    expect(calls.log).toEqual([]);
    // No useTranslation('c-wager') anywhere: only a cross-namespace t() call.
    expect(clientI18n.t('greeting', { ns: 'c-wager', defaultValue: 'Default' })).toBe('Default');
    await vi.waitFor(() => expect(clientI18n.t('greeting', { ns: 'c-wager', defaultValue: 'Default' })).toBe('fr/c-wager/greeting'));
    expect(calls.log.sort()).toEqual(['en:c-wager', 'fr:c-wager']);
  });

  it('a namespace a locale has no file for resolves empty instead of failing', async () => {
    const { ensureClientLocale, clientI18n } = await freshClient();
    ensureClientLocale('en');
    await clientI18n.loadNamespaces('r-not-translated');
    expect(clientI18n.t('anything', { ns: 'r-not-translated', defaultValue: 'Fallback' })).toBe('Fallback');
  });
});
