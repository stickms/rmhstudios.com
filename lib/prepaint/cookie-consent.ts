import { COOKIE_CONSENTED_CLASS, COOKIE_CONSENT_STORAGE_KEY } from '../cookie-consent';
import type { PrepaintCtx } from './types';

/** Hides the server-rendered cookie notice before first paint for a visitor who has already answered it. */
export function cookieConsentStep({ html }: PrepaintCtx): void {
  const v = localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY);
  if (v === 'all' || v === 'essential') html.classList.add(COOKIE_CONSENTED_CLASS);
}
