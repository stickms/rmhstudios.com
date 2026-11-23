/**
 * Cloudflare Turnstile keys, read at runtime (never baked into the client bundle): the secret for Better
 * Auth's captcha plugin, and the public site key the login page asks for through its loader. Both must be
 * set for Turnstile to be on; with either missing, sign-up and "Forgot password?" ask for nothing.
 */
function configured(): { siteKey: string; secretKey: string } | null {
  const siteKey = process.env.TURNSTILE_SITE_KEY?.trim();
  const secretKey = process.env.TURNSTILE_SECRET_KEY?.trim();
  return siteKey && secretKey ? { siteKey, secretKey } : null;
}

export function turnstileSecretKey(): string | null {
  return configured()?.secretKey ?? null;
}

export function turnstileSiteKey(): string | null {
  return configured()?.siteKey ?? null;
}
