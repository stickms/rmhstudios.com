import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

type ToastModule = typeof import('@/lib/toast');

/** A stand-in for sonner's `toast` that records every call in order. */
function fakeSonner() {
  const calls: Array<[string, ...unknown[]]> = [];
  const record =
    (name: string) =>
    (...args: unknown[]) => {
      calls.push([name, ...args]);
      return `sonner-${calls.length}`;
    };
  const real = Object.assign(record('default'), {
    success: record('success'),
    error: record('error'),
    info: record('info'),
    warning: record('warning'),
    message: record('message'),
    custom: record('custom'),
    dismiss: record('dismiss'),
  });
  return { calls, real: real as unknown as Parameters<ToastModule['bindToaster']>[0] };
}

describe('lib/toast: sonner loads on the first toast', () => {
  let mod: ToastModule;

  beforeEach(async () => {
    vi.resetModules();
    mod = await import('@/lib/toast');
  });

  it('asks for the toaster once, on the first call', () => {
    const wake = vi.fn();
    mod.subscribeToasterWanted(wake);
    expect(mod.toasterWanted()).toBe(false);
    mod.toast.error('first');
    mod.toast.success('second');
    expect(mod.toasterWanted()).toBe(true);
    expect(wake).toHaveBeenCalledTimes(1);
  });

  it('replays what was raised before the toaster was up, in order, under the ids it returned', () => {
    const { calls, real } = fakeSonner();
    const a = mod.toast.error('lost connection');
    const b = mod.toast('plain', { duration: 10 });
    const c = mod.toast.success('kept', { id: 'mine' });
    mod.toast.dismiss(a);
    expect(new Set([a, b, c]).size).toBe(3);
    expect(c).toBe('mine');
    expect(calls).toEqual([]);

    mod.bindToaster(real);
    expect(calls).toEqual([
      ['error', 'lost connection', { id: a }],
      ['default', 'plain', { duration: 10, id: b }],
      ['success', 'kept', { id: 'mine' }],
      ['dismiss', a],
    ]);
  });

  it('gives a queued custom toast the id its caller dismisses it by', () => {
    const { calls, real } = fakeSonner();
    const render = () => null as never;
    const id = mod.toast.custom(render, { duration: 5 });
    mod.bindToaster(real);
    expect(calls).toEqual([['custom', render, { duration: 5, id }]]);
  });

  it('calls sonner directly once it is bound', () => {
    const { calls, real } = fakeSonner();
    mod.bindToaster(real);
    expect(mod.toast.warning('careful', { duration: 1 })).toBe('sonner-1');
    expect(mod.toast.info('fyi')).toBe('sonner-2');
    expect(calls).toEqual([
      ['warning', 'careful', { duration: 1 }],
      ['info', 'fyi', undefined],
    ]);
    // A toast raised after binding never re-arms the loader.
    expect(mod.toasterWanted()).toBe(false);
  });
});

describe('the site toaster sits bottom right and wears the site tokens', () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
  const src = read('components/ui/site-toaster.tsx');
  const css = read('app/styles/steel-overlay.css');

  it('is placed bottom right, above the docked globe below 1024px and 16px off the edge from there', () => {
    expect(src).toContain('position="bottom-right"');
    expect(src).not.toContain('position="bottom-left"');
    expect(src).toContain("offset={{ bottom: 'var(--toast-bottom)', right: '1rem' }}");
    expect(css).toMatch(/:root \{\s*--toast-bottom: var\(--site-floating-reserve\);/);
    expect(css).toMatch(/@media \(min-width: 1024px\) \{\s*:root \{\s*--toast-bottom: calc\(1rem \+ env\(safe-area-inset-bottom, 0px\)\);/);
  });

  it("points every colour sonner owns at a site token, so a toast follows the page's theme", () => {
    const palette = /const TOKEN_PALETTE = \{([\s\S]*?)\} as CSSProperties;/.exec(src)![1]!;
    const entries = [...palette.matchAll(/'(--[a-z-]+)': '([^']+)'/g)];
    expect(entries.length).toBe(17);
    for (const [, , value] of entries) expect(value).toMatch(/^var\(--site-[a-z-]+\)$/);
    expect(src).toContain('style={TOKEN_PALETTE}');
    expect(css).toMatch(/\[data-description\] \{\s*color: var\(--site-text-muted\);/);
  });
});
