'use client';

/**
 * Web Push subscription state + subscribe/unsubscribe actions for the
 * current browser. `supported` is false (and everything is a no-op) when the
 * browser lacks push APIs, the SW isn't registered (dev), or the server has
 * no VAPID keys — callers should hide their toggle in that case.
 */

import { useCallback, useEffect, useState } from 'react';

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export function usePushSubscription(enabled: boolean) {
  const [supported, setSupported] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);

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
        fetch('/api/push/public-key').catch(() => null),
        navigator.serviceWorker.getRegistration(),
      ]);
      if (cancelled || !keyRes?.ok || !registration) return;
      setSupported(true);
      const sub = await registration.pushManager.getSubscription();
      if (!cancelled) setSubscribed(!!sub);
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  const subscribe = useCallback(async (): Promise<boolean> => {
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return false;

      const keyRes = await fetch('/api/push/public-key');
      if (!keyRes.ok) return false;
      const { key } = (await keyRes.json()) as { key: string };

      const registration = await navigator.serviceWorker.ready;
      const sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key) as BufferSource,
      });

      const json = sub.toJSON();
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ endpoint: sub.endpoint, keys: json.keys }),
      });
      if (!res.ok) {
        await sub.unsubscribe().catch(() => {});
        return false;
      }
      setSubscribed(true);
      return true;
    } catch {
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  const unsubscribe = useCallback(async (): Promise<void> => {
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const sub = await registration?.pushManager.getSubscription();
      if (sub) {
        await fetch('/api/push/subscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ endpoint: sub.endpoint }),
        }).catch(() => {});
        await sub.unsubscribe().catch(() => {});
      }
      setSubscribed(false);
    } finally {
      setBusy(false);
    }
  }, []);

  return { supported, subscribed, busy, subscribe, unsubscribe };
}
