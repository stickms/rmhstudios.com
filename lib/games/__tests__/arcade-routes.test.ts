import { describe, expect, it } from 'vitest';
import { isRedirect } from '@tanstack/react-router';
import { Route as ArcadeRoute } from '@/app/routes/_site/arcade';
import { Route as LeaderboardRoute } from '@/app/routes/_site/leaderboard';
import { EXCLUDED_ROUTES, STATIC_ROUTES } from '@/lib/sitemap';

describe('/arcade and /leaderboard', () => {
  it('/leaderboard redirects to the arcade pass leaderboard', () => {
    let thrown: unknown;
    try {
      (LeaderboardRoute.options.beforeLoad as (ctx: unknown) => void)({});
    } catch (e) {
      thrown = e;
    }
    expect(isRedirect(thrown)).toBe(true);
    expect((thrown as { options: unknown }).options).toMatchObject({
      to: '/arcade',
      search: { sub: 'leaderboard' },
    });
  });

  it('/arcade renders a page of its own and is listed in the sitemap', () => {
    // The Ranked summary, Arcade Pass and party bar live here, outside the
    // Steam-style library; it must not be a redirect any more.
    expect(ArcadeRoute.options.component).toBeTypeOf('function');
    expect(STATIC_ROUTES.map((r) => r.loc)).toContain('/arcade');
    expect(Object.keys(EXCLUDED_ROUTES)).not.toContain('/arcade');
  });
});
