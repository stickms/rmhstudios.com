/**
 * The login page's loader: which provider buttons to draw. Which providers are
 * on is decided by server env vars (`provider-config.server.ts`), so the page
 * asks the server instead of baking a list into the client bundle.
 */
import { createServerFn } from '@tanstack/react-start';
import type { SignInProviderId } from '@/lib/auth/providers';

export const getSignInProviders = createServerFn({
  method: 'GET',
}).handler(async (): Promise<SignInProviderId[]> => {
  const { enabledSignInProviders } = await import('@/lib/auth/provider-config.server');
  return enabledSignInProviders();
});
