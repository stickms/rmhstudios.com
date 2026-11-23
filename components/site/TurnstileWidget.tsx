/**
 * Cloudflare Turnstile, the bot check in front of sign-up and "Forgot password?" (`lib/auth/turnstile.ts`).
 * Rendered only when the server hands /login a site key, in "interaction-only" mode: most people never see
 * it, and the rare person Cloudflare is unsure about gets one click. The token goes in the
 * `x-captcha-response` header of the request it protects; each token works once, so the form calls
 * `reset()` after every submit.
 *
 * The script is loaded once, at the first form that needs it (never on any other page), from
 * challenges.cloudflare.com, which the CSP allows for this (deploy/apache/rmhstudios.conf, lib/csp).
 */
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

interface TurnstileApi {
  render: (el: HTMLElement, options: Record<string, unknown>) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let loading: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (loading) return loading;
  loading = new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('turnstile missing')));
    script.onerror = () => {
      loading = null;
      reject(new Error('turnstile failed to load'));
    };
    document.head.appendChild(script);
  });
  return loading;
}

export interface TurnstileHandle {
  /** Ask for a fresh token (a token works once). */
  reset: () => void;
}

export const TurnstileWidget = forwardRef<
  TurnstileHandle,
  {
    siteKey: string;
    /** The current token, or null when it expired, failed or was used. */
    onToken: (token: string | null) => void;
    /** `cf-turnstile` action name, shown in Cloudflare's analytics. */
    action: string;
  }
>(function TurnstileWidget({ siteKey, onToken, action }, ref) {
  const host = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const tokenCallback = useRef(onToken);
  tokenCallback.current = onToken;

  useImperativeHandle(ref, () => ({
    reset: () => {
      tokenCallback.current(null);
      if (widget.current && window.turnstile) window.turnstile.reset(widget.current);
    },
  }));

  useEffect(() => {
    let cancelled = false;
    loadTurnstile()
      .then((api) => {
        if (cancelled || !host.current) return;
        widget.current = api.render(host.current, {
          sitekey: siteKey,
          action,
          appearance: 'interaction-only',
          theme: document.documentElement.classList.contains('style-graphite') ? 'dark' : 'light',
          'refresh-expired': 'auto',
          callback: (token: string) => tokenCallback.current(token),
          'expired-callback': () => tokenCallback.current(null),
          'error-callback': () => tokenCallback.current(null),
        });
      })
      .catch(() => tokenCallback.current(null));
    return () => {
      cancelled = true;
      if (widget.current && window.turnstile) window.turnstile.remove(widget.current);
      widget.current = null;
    };
  }, [siteKey, action]);

  // Empty until Cloudflare asks for a click; then its own frame appears here, centred under the form.
  return <div ref={host} className="flex justify-center empty:hidden" />;
});
