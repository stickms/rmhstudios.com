/**
 * Gives the engine's hub client (lib/tf2-game/net/client.ts) the site's session token.
 * Import it for its side effect from any page that can open a hub connection: one that imports
 * `@/lib/tf2-game/net/client` or creates a game client. lib/__tests__/tf2-engine-boundaries.test.ts
 * holds that list.
 */

import { authClient } from '@/lib/auth-client';
import { registerSessionTokenSource } from '@/lib/tf2-game/net/session-token';

registerSessionTokenSource(
  async () => {
    const current =
      await authClient.getSession();
    return current
      ?.data
      ?.session
      ?.token;
  },
);
