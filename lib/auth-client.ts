import { createAuthClient } from "better-auth/react";
import { stripeClient } from "@better-auth/stripe/client";
import { passkeyClient } from "@better-auth/passkey/client";
import { customSessionClient } from "better-auth/client/plugins";
import type { auth } from "@/lib/auth";

export const authClient = createAuthClient({
  plugins: [
    stripeClient({
      subscription: true,
    }),
    passkeyClient(),
    customSessionClient<typeof auth>(),
  ],
});
