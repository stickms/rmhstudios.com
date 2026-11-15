import { useCallback } from 'react';
import { useRouter } from '@tanstack/react-router';

/** A site path, or a path plus string search params (as `navigate({ to, search })` takes them). */
export type SiteTarget = string | { to: string; search?: Record<string, string> };

/**
 * Navigate to a site path from code that may run outside the site's router.
 *
 * Inside the site (a `RouterProvider` above) it is a client navigation, exactly
 * what `useNavigate()` does — the router's own search serialization included. In a
 * separately built island (redesign audit B1: `features/<id>/island.tsx`, no
 * router, no site shell) there is no router to ask, and leaving the island is a
 * document load — the destination is a site page the island never bundled. Shared
 * game code that leaves the game (`useQuitGame`, the error boundary's way home, a
 * sign-in prompt, the share sheet's "post to feed") uses this, so the same
 * component works in both deliveries. `lib/__tests__/islands.test.ts` fails if an
 * island reaches `@tanstack/react-router` anywhere but here.
 *
 * `useRouter({ warn: false })` is the router context and nothing else: it pulls
 * no route tree, so it costs an island a few hundred bytes.
 */
export function useSiteNavigate(): (target: SiteTarget) => void {
  const router = useRouter({ warn: false });
  return useCallback(
    (target: SiteTarget) => {
      const { to, search } =
        typeof target === 'string' ? { to: target, search: undefined } : target;
      if (router) {
        void router.navigate(search ? ({ to, search } as never) : { href: to });
        return;
      }
      const qs = search ? new URLSearchParams(search).toString() : '';
      window.location.assign(qs ? `${to}?${qs}` : to);
    },
    [router],
  );
}
