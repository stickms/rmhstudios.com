import { useEffect, useState } from 'react';
import { authClient } from '@/lib/auth-client';

/**
 * Subscribe and billing-portal actions for the membership pages (the main-site
 * `MembershipPanel` and the Steam-framed `/games/membership`), so the Stripe calls
 * exist once. `returnPath` is where Stripe sends the viewer back to, and where the
 * `?status=success|cancelled` banner is read from.
 */
export function useMembershipActions(returnPath: string) {
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<'success' | 'cancelled' | null>(null);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get('status');
    if (p === 'success' || p === 'cancelled') setStatus(p);
  }, []);

  async function subscribe(plan: 'starter' | 'pro') {
    setBusy(plan);
    try {
      const result = await authClient.subscription.upgrade({
        plan,
        successUrl: `${returnPath}?status=success`,
        cancelUrl: `${returnPath}?status=cancelled`,
      });
      if (result?.error) {
        console.error('subscribe failed:', result.error);
        return;
      }
      if (result?.data?.url && !result.data.redirect) {
        window.location.href = result.data.url;
      }
    } catch (err) {
      console.error('subscribe failed:', err);
    } finally {
      setBusy(null);
    }
  }

  async function manageBilling() {
    setBusy('portal');
    try {
      const result = await authClient.subscription.billingPortal({ returnUrl: returnPath });
      if (result?.error) {
        console.error('manageBilling failed:', result.error);
        return;
      }
      if (result?.data?.url && !result.data.redirect) {
        window.location.href = result.data.url;
      }
    } catch (err) {
      console.error('manageBilling failed:', err);
    } finally {
      setBusy(null);
    }
  }

  return { busy, status, setStatus, subscribe, manageBilling };
}
