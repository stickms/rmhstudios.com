/**
 * The login page's loader: which provider buttons to draw, and the Turnstile site key when bot checks are on.
 * Both are decided by server env vars (`provider-config.server.ts`, `turnstile.server.ts`), so the page asks
 * the server instead of baking them into the client bundle.
 */
import { createServerFn } from '@tanstack/react-start';
import type { SignInProviderId } from '@/lib/auth/providers';

export interface LoginConfig {
  providers: SignInProviderId[];
  /** Cloudflare Turnstile public site key; null when bot checks are off. */
  turnstileSiteKey: string | null;
}

export const getSignInProviders = createServerFn({
  method: 'GET',
}).handler(async (): Promise<SignInProviderId[]> => {
  const { enabledSignInProviders } = await import('@/lib/auth/provider-config.server');
  return enabledSignInProviders();
});

export const getLoginConfig = createServerFn({
  method: 'GET',
}).handler(async (): Promise<LoginConfig> => {
  const [{ enabledSignInProviders }, { turnstileSiteKey }] = await Promise.all([
    import('@/lib/auth/provider-config.server'),
    import('@/lib/auth/turnstile.server'),
  ]);
  return { providers: enabledSignInProviders(), turnstileSiteKey: turnstileSiteKey() };
});
