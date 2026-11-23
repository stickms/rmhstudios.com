/**
 * Cloudflare Turnstile, client-safe half: which auth endpoints want a token, and the header it travels in.
 * The server half (`turnstile.server.ts`) reads the keys; Better Auth's `captcha` plugin checks the token.
 *
 * Only sign-up and "Forgot password?" are behind it: they are what a bot uses to make accounts and to send
 * email. Sign-in is guarded by the per-address limit on wrong passwords instead, so a person signing in
 * never meets a challenge. With no keys configured nothing is asked for.
 */

/** The endpoints Better Auth refuses without a valid token, when Turnstile is configured. */
export const TURNSTILE_ENDPOINTS = ['/sign-up/email', '/request-password-reset'] as const;

/** The request header Better Auth's captcha plugin reads the token from. */
export const CAPTCHA_HEADER = 'x-captcha-response';
