/**
 * Service-worker registration. Called once from the root component.
 *
 * Production-only: a service worker in dev would fight Vite's module server
 * and HMR. Also skipped inside the Discord Activity iframe (its CSP and
 * scope rules don't allow it) and on browsers without support.
 */

import { isDiscordActivity } from '@/lib/discord-sdk';

export function registerServiceWorker(): void {
  if (!import.meta.env.PROD) return;
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  if (isDiscordActivity()) return;

  // Defer past load so registration never competes with first-paint work.
  const register = () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .catch((err) => console.error('[sw] registration failed:', err));
  };
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}
