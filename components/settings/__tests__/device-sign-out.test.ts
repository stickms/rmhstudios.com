/**
 * The one sign-out helper and the account-deletion flow (sprint 07, feature 03). The helper is a plain module, so its
 * behaviour is tested against a fake browser; the wiring of the four call sites and the deletion panel is held by
 * reading their source, because the suite has no DOM.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

import { signOutAndMaybeClear, writeClearOnSignOut, type UnsentChoice } from '@/lib/device-data/sign-out';
import { databaseNames, freshEnv, makeDatabase } from '@/lib/device-data/__tests__/fakes';

async function browser(withStudio: boolean) {
  const env = freshEnv();
  await makeDatabase(env.indexedDB, 'rmh-library-reader', { books: [{ slug: 'a' }] });
  if (withStudio) {
    await makeDatabase(env.indexedDB, 'rmh-studio-db', {
      projects: [{ id: 'p' }],
      samples: [{ id: 's' }],
      presets: [],
    });
    env.localStorage.setItem('rmh-compose-draft', '{"text":"draft"}');
  }
  env.localStorage.setItem('rmh-user-theme', 'night');
  env.localStorage.setItem('vb-meta', '{}');
  return env;
}

function harness(env: Awaited<ReturnType<typeof browser>>, answer: UnsentChoice = 'keep') {
  const order: string[] = [];
  const signOut = vi.fn(async () => {
    order.push(`signOut after ${(await databaseNames(env.indexedDB)).join(',') || 'no databases'}`);
  });
  const choose = vi.fn(async () => answer);
  return { signOut, choose, order };
}

describe('signOutAndMaybeClear', () => {
  it('changes nothing from today while the switch is off', async () => {
    const env = await browser(true);
    const h = harness(env);
    const out = await signOutAndMaybeClear({ ...h, env });
    expect(out).toBe('signed-out');
    expect(h.choose).not.toHaveBeenCalled();
    expect(h.signOut).toHaveBeenCalledOnce();
    expect(await databaseNames(env.indexedDB)).toEqual(['rmh-library-reader', 'rmh-studio-db']);
    expect(env.localStorage.getItem('vb-meta')).toBe('{}');
  });

  it('clears before signing out when the switch is on, and does not ask when no work exists only here', async () => {
    const env = await browser(false);
    writeClearOnSignOut(true, env);
    const h = harness(env);
    await signOutAndMaybeClear({ ...h, env });
    expect(h.choose).not.toHaveBeenCalled();
    expect(h.order).toEqual(['signOut after no databases']);
    expect(env.localStorage.getItem('vb-meta')).toBeNull();
    expect(env.localStorage.getItem('rmh-user-theme')).toBe('night');
  });

  it('asks first when Studio work or drafts exist, with the counts', async () => {
    const env = await browser(true);
    writeClearOnSignOut(true, env);
    const h = harness(env);
    await signOutAndMaybeClear({ ...h, env });
    expect(h.choose).toHaveBeenCalledWith({ projects: 1, samples: 1, drafts: 1 });
  });

  it('keep leaves the Studio database and the drafts intact and clears the rest', async () => {
    const env = await browser(true);
    writeClearOnSignOut(true, env);
    const h = harness(env, 'keep');
    expect(await signOutAndMaybeClear({ ...h, env })).toBe('signed-out');
    expect(await databaseNames(env.indexedDB)).toEqual(['rmh-studio-db']);
    expect(env.localStorage.getItem('rmh-compose-draft')).toContain('draft');
    expect(env.localStorage.getItem('vb-meta')).toBeNull();
    expect(env.localStorage.getItem('rmh-user-theme')).toBe('night');
    expect(h.signOut).toHaveBeenCalledOnce();
  });

  it('delete removes the Studio work and the drafts too, and keeps the theme', async () => {
    const env = await browser(true);
    writeClearOnSignOut(true, env);
    const h = harness(env, 'delete');
    await signOutAndMaybeClear({ ...h, env });
    expect(await databaseNames(env.indexedDB)).toEqual([]);
    expect(env.localStorage.getItem('rmh-compose-draft')).toBeNull();
    expect(env.localStorage.getItem('rmh-user-theme')).toBe('night');
  });

  it('cancel signs nothing out and clears nothing', async () => {
    const env = await browser(true);
    writeClearOnSignOut(true, env);
    const h = harness(env, 'cancel');
    expect(await signOutAndMaybeClear({ ...h, env })).toBe('cancelled');
    expect(h.signOut).not.toHaveBeenCalled();
    expect(await databaseNames(env.indexedDB)).toEqual(['rmh-library-reader', 'rmh-studio-db']);
    expect(env.localStorage.getItem('vb-meta')).toBe('{}');
  });

  it('a forced clear (account deletion) ignores the switch, and cancel there means keep', async () => {
    const env = await browser(true);
    const h = harness(env, 'cancel');
    const out = await signOutAndMaybeClear({ ...h, env, force: true, cancelMeans: 'keep' });
    expect(out).toBe('signed-out');
    expect(await databaseNames(env.indexedDB)).toEqual(['rmh-studio-db']);
    expect(env.localStorage.getItem('vb-meta')).toBeNull();
  });

  it('skipClear signs out without touching or asking, whatever the switch says', async () => {
    const env = await browser(true);
    writeClearOnSignOut(true, env);
    const h = harness(env);
    await signOutAndMaybeClear({ ...h, env, skipClear: true });
    expect(h.choose).not.toHaveBeenCalled();
    expect(await databaseNames(env.indexedDB)).toEqual(['rmh-library-reader', 'rmh-studio-db']);
  });

  it('still signs out when the question itself fails', async () => {
    const env = await browser(true);
    writeClearOnSignOut(true, env);
    const signOut = vi.fn(async () => {});
    const choose = vi.fn(async () => {
      throw new Error('dialog failed');
    });
    expect(await signOutAndMaybeClear({ signOut, choose, env })).toBe('signed-out');
    expect(signOut).toHaveBeenCalledOnce();
    expect(await databaseNames(env.indexedDB)).toContain('rmh-studio-db');
  });
});

const read = (p: string) => readFileSync(p, 'utf8');

describe('the sign-out call sites', () => {
  const SITES = [
    'components/shell/AccountMenu.tsx',
    'components/shell/GlobeBar.tsx',
    'components/site/CommandPalette.tsx',
    'components/settings/SignInMethodsPanel.tsx',
    'components/site/DeleteAccountPanel.tsx',
  ];

  it.each(SITES)('%s signs out only through the shared helper', (file) => {
    const src = read(file);
    expect(src).toContain('useDeviceSignOut');
    // Every `authClient.signOut(` sits inside a `deviceSignOut.run(` callback.
    const calls = [...src.matchAll(/authClient\s*\.signOut\(/g)];
    expect(calls.length).toBeGreaterThan(0);
    for (const c of calls) {
      const before = src.slice(0, c.index);
      expect(
        Math.max(before.lastIndexOf('deviceSignOut.run('), before.lastIndexOf('runDeviceSignOut(')),
        `${file} signs out outside the helper`,
      ).toBeGreaterThan(before.lastIndexOf('\n\n'));
    }
  });

  it('the account menu, globe bar and palette render the keep-or-delete dialog', () => {
    for (const f of SITES.slice(0, 3)) expect(read(f)).toContain('deviceSignOut.dialog');
  });

  it('signing in again leaves the device alone', () => {
    expect(read('components/settings/SignInMethodsPanel.tsx')).toMatch(/skipClear:\s*true/);
  });
});

describe('the account deletion panel', () => {
  const src = read('components/site/DeleteAccountPanel.tsx');

  it('clears this device only after the server confirmed the deletion, forced and keeping on cancel', () => {
    const api = src.search(/await api\(\s*deleteAccountApi/);
    const failedReturn = src.indexOf('return;', api);
    const clear = src.indexOf('deviceSignOut.run(');
    expect(api).toBeGreaterThan(-1);
    expect(clear).toBeGreaterThan(failedReturn);
    expect(src.slice(clear, clear + 400)).toMatch(/force:\s*true/);
    expect(src.slice(clear, clear + 400)).toMatch(/cancelMeans:\s*'keep'/);
  });

  it('tells the member about other devices and points to the device page', () => {
    expect(src).toContain("'delete-other-devices'");
    expect(src).toContain('/settings/device');
  });
});
