/**
 * Web Push subscription state + subscribe/unsubscribe actions for the
 * current browser. `supported` is false (and everything is a no-op) when the
 * browser lacks push APIs, the SW isn't registered (dev), or the server has
 * no VAPID keys — callers should hide their toggle in that case.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/contract/client';
import { subscribePushApi, unsubscribePushApi } from '@/lib/push/push.contract';
import { pushPublicKeyApi } from '@/lib/push/public-key.contract';

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export function usePushSubscription(enabled: boolean) {
  const [supported, setSupported] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  /**
   * The browser's notification permission is `denied`: a subscribe can only
   * fail, and the prompt will not show again — the UI should say how to
   * re-enable it in the browser rather than offer a toggle that does nothing.
   */
  const [denied, setDenied] = useState(false);
  /** Synchronous guard: `busy` is state, so two clicks in one tick both saw it false. */
  const inFlight = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      if (
        typeof window === 'undefined' ||
        !('serviceWorker' in navigator) ||
        !('PushManager' in window) ||
        !('Notification' in window)
      ) {
        return;
      }
      // Server must have keys configured, and the SW must be registered
      // (production only) for push to be possible at all.
      const [keyRes, registration] = await Promise.all([
        api(pushPublicKeyApi).catch(() => null),
        navigator.serviceWorker.getRegistration(),
      ]);
      if (cancelled || !keyRes || !registration) return;
      setSupported(true);
      setDenied(Notification.permission === 'denied');
      const sub = await registration.pushManager.getSubscription();
      if (!cancelled) setSubscribed(!!sub);
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  const subscribe = useCallback(async (): Promise<boolean> => {
    if (inFlight.current) return false;
    inFlight.current = true;
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      setDenied(permission === 'denied');
      if (permission !== 'granted') return false;

      const { key } = await api(pushPublicKeyApi);

      const registration = await navigator.serviceWorker.ready;
      const sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key) as BufferSource,
      });

      const json = sub.toJSON();
      try {
        await api(subscribePushApi, {
          body: { endpoint: sub.endpoint, keys: json.keys as { p256dh: string; auth: string } },
        });
      } catch {
        await sub.unsubscribe().catch(() => {});
        return false;
      }
      setSubscribed(true);
      return true;
    } catch {
      return false;
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }, []);

  const unsubscribe = useCallback(async (): Promise<void> => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const sub = await registration?.pushManager.getSubscription();
      if (sub) {
        await api(unsubscribePushApi, { body: { endpoint: sub.endpoint } }).catch(() => {});
        await sub.unsubscribe().catch(() => {});
      }
      setSubscribed(false);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }, []);

  return { supported, subscribed, busy, denied, subscribe, unsubscribe };
}
