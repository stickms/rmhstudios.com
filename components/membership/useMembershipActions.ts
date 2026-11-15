import {
  useEffect,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from '@/lib/toast';
import { authClient } from '@/lib/auth-client';

/**
 * Subscribe and billing-portal actions for the membership pages (the main-site
 * `MembershipPanel` and the Steam-framed `/games/membership`), so the Stripe calls
 * exist once. `returnPath` is where Stripe sends the viewer back to, and where the
 * `?status=success|cancelled` banner is read from.
 *
 * `busy` is one key for the whole page: callers disable every plan and portal
 * button while it is non-null, so two checkout sessions can't be opened at once.
 * On success it stays set — the page is navigating to Stripe, and re-enabling
 * the buttons in the moment before it unloads invites a second click.
 */
export function useMembershipActions(
  returnPath: string,
) {
  const {
    t,
  } =
    useTranslation(
      'site',
    );
  const [
    busy,
    setBusy,
  ] =
    useState<
      | string
      | null
    >(
      null,
    );
  const busyRef =
    useRef<
      | string
      | null
    >(
      null,
    );
  const [
    status,
    setStatus,
  ] =
    useState<
      | 'success'
      | 'cancelled'
      | null
    >(
      null,
    );

  useEffect(() => {
    const url =
      new URL(
        window
          .location
          .href,
      );
    const p =
      url.searchParams.get(
        'status',
      );
    if (
      p ===
        'success' ||
      p ===
        'cancelled'
    )
      setStatus(
        p,
      );
    if (
      p !==
      null
    ) {
      // Read once; a refresh or a shared link must not replay the banner.
      url.searchParams.delete(
        'status',
      );
      window.history.replaceState(
        window
          .history
          .state,
        '',
        url.pathname +
          url.search +
          url.hash,
      );
    }
  }, []);

  function begin(
    key: string,
  ): boolean {
    if (
      busyRef.current !==
      null
    )
      return false;
    busyRef.current =
      key;
    setBusy(
      key,
    );
    return true;
  }
  function fail(
    err: unknown,
  ) {
    console.error(
      'membership action failed:',
      err,
    );
    const message =
      err &&
      typeof err ===
        'object' &&
      'message' in
        err &&
      typeof err.message ===
        'string'
        ? err.message
        : null;
    toast.error(
      message ||
        t(
          'membership-action-failed',
          {
            defaultValue:
              'Could not reach billing. Try again.',
          },
        ),
    );
    busyRef.current =
      null;
    setBusy(
      null,
    );
  }

  async function subscribe(
    plan:
      | 'starter'
      | 'pro',
  ) {
    if (
      !begin(
        plan,
      )
    )
      return;
    try {
      const result =
        await authClient.subscription.upgrade(
          {
            plan,
            successUrl: `${returnPath}?status=success`,
            cancelUrl: `${returnPath}?status=cancelled`,
          },
        );
      if (
        result?.error
      )
        return fail(
          result.error,
        );
      if (
        result
          ?.data
          ?.url &&
        !result
          .data
          .redirect
      ) {
        window.location.href =
          result.data.url;
      } else if (
        !result
          ?.data
          ?.redirect
      ) {
        return fail(
          null,
        );
      }
      // Redirecting: leave `busy` set until the page unloads.
    } catch (err) {
      fail(
        err,
      );
    }
  }

  async function manageBilling() {
    if (
      !begin(
        'portal',
      )
    )
      return;
    try {
      const result =
        await authClient.subscription.billingPortal(
          {
            returnUrl:
              returnPath,
          },
        );
      if (
        result?.error
      )
        return fail(
          result.error,
        );
      if (
        result
          ?.data
          ?.url &&
        !result
          .data
          .redirect
      ) {
        window.location.href =
          result.data.url;
      } else if (
        !result
          ?.data
          ?.redirect
      ) {
        return fail(
          null,
        );
      }
    } catch (err) {
      fail(
        err,
      );
    }
  }

  return {
    busy,
    status,
    setStatus,
    subscribe,
    manageBilling,
  };
}
