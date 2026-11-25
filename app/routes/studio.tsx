/**
 * RMH Studio Layout — Auth Gate
 *
 * Wraps all /studio routes with authentication.
 * Unauthenticated users are redirected to /login with a callback URL. The one exception is a share link
 * (`/studio?share=<token>`): a signed-out visitor may open a copy on this device, so the gate lets that query
 * through, but only a well-formed token (22 base64url characters); any other value hits the gate. Everything that touches an account is a signed-in API call, so the exception reaches no member data.
 */

import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { appRouteHead } from '@/lib/seo-catalog';
import { createServerFn } from '@tanstack/react-start';
import { getRequestSession } from '@/lib/auth-session.server';
import { SHARE_TOKEN_PATTERN } from '@/lib/studio/share-token';
import studioCss from '@/components/studio/studio.css?url';

const checkAuth = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await getRequestSession();
  if (!session?.user) throw redirect({ to: '/login', search: { callbackURL: '/studio' } });
  return { user: session.user };
});

export const Route = createFileRoute('/studio')({
  validateSearch: (search: Record<string, unknown>): { share?: string } =>
    typeof search.share === 'string' && SHARE_TOKEN_PATTERN.test(search.share)
      ? { share: search.share }
      : {},
  beforeLoad: ({ search }) => (search.share ? { user: null } : checkAuth()),
  head: () => appRouteHead('studio', { links: [{ rel: 'stylesheet', href: studioCss }] }),
  component: () => <Outlet />,
});
