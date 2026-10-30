import { describe, expect, it } from 'vitest';
import { isRedirect } from '@tanstack/react-router';
import { Route } from '@/app/routes/_site/apps/index';
import { STATIC_ROUTES } from '@/lib/sitemap';

describe('/apps', () => {
  it('redirects to the library filtered to apps', () => {
    let thrown: unknown;
    try {
      (Route.options.beforeLoad as (ctx: unknown) => void)({});
    } catch (e) {
      thrown = e;
    }
    expect(isRedirect(thrown)).toBe(true);
    expect((thrown as { options: unknown }).options).toMatchObject({
      to: '/games',
      search: { kind: 'app' },
    });
  });

  it('is no longer listed in the sitemap, since it only redirects', () => {
    expect(STATIC_ROUTES.map((r) => r.loc)).not.toContain('/apps');
  });
});
