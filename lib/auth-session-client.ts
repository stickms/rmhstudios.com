import { createAuthClient } from 'better-auth/react';
import { customSessionClient } from 'better-auth/client/plugins';
import type { auth } from '@/lib/auth';

/**
 * A session-only Better Auth client for islands (redesign audit B1).
 *
 * `lib/auth-client.ts` carries the Stripe and passkey plugins, which only the
 * site's account and checkout pages call. An island reads one thing — who is
 * signed in, from the same `/api/auth/get-session` endpoint and the same cookie —
 * so it takes this client and leaves those plugins (and @simplewebauthn) out of
 * its bundle. The session shape is identical: the `customSession` plugin is what
 * adds `tier`, and it is here.
 */
export const sessionAuthClient = createAuthClient({
  plugins: [customSessionClient<typeof auth>()],
});
