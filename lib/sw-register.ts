/**
 * Service-worker registration. Called once from the root component.
 *
 * Production-only: a service worker in dev would fight Vite's module server
 * and HMR. Also skipped inside the Discord Activity iframe (its CSP and
 * scope rules don't allow it) and on browsers without support.
 */

// NOT from '@/lib/discord-sdk' — see that module's re-export note; importing it
// here would drag the Activity SDK onto every page's critical path.
import { isDiscordActivity } from '@/lib/discord-activity';
import { initOfflineOutbox } from '@/lib/offline/outbox';

export function registerServiceWorker(): void {
  if (!import.meta.env.PROD) return;
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  if (isDiscordActivity()) return;

  // Defer past load so registration never competes with first-paint work.
  const register = () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      // The worker's offline outbox (B10) needs a page-side listener for its
      // progress messages, and a replay nudge where Background Sync is absent.
      .then(() => initOfflineOutbox())
      .catch((err) => console.error('[sw] registration failed:', err));
  };
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}
