import { createAuthClient } from 'better-auth/react';
import { stripeClient } from '@better-auth/stripe/client';
import { passkeyClient } from '@better-auth/passkey/client';
import { customSessionClient } from 'better-auth/client/plugins';
import type { auth } from '@/lib/auth';
import { refreshLiveSession } from '@/lib/session/live-session';

export const authClient =
  createAuthClient(
    {
      plugins:
        [
          stripeClient(
            {
              subscription: true,
            },
          ),
          passkeyClient(),
          customSessionClient<
            typeof auth
          >(),
        ],
    },
  );

// The shell reads the session from `lib/session/live-session.ts`, which keeps this
// module (and its plugins) out of the entry. This client is never a second source
// of it: when a request made through it changes the session (sign-in, sign-out,
// profile update) the session signal flips and the live store asks again.
// `listen` reports the current value at once; only later flips are changes.
if (
  typeof window !==
  'undefined'
) {
  let listening = false;
  authClient.$store.listen(
    '$sessionSignal',
    () => {
      if (
        listening
      )
        refreshLiveSession();
    },
  );
  listening = true;
}
