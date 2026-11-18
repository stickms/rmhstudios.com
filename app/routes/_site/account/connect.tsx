/**
 * /account/connect — the step after a sign-in that created a brand-new account,
 * and the step that finishes joining one.
 *
 * Two jobs, one page (design: docs/superpowers/specs/2026-11-16-account-consolidation-design.md):
 *  - **Offer.** A sign-in just created a new, empty account (Better Auth sends
 *    new users here through `newUserCallbackURL`). Ask whether they already
 *    have an account. "No" continues to where they were going; "Yes" starts the
 *    merge, which signs this new account out and sends them to /login.
 *  - **Confirm.** Back here signed in to the existing account, with a merge
 *    open in this browser: name exactly what will move, and ask to confirm.
 *
 * Anything else (no merge open, account not empty) continues straight on.
 */
import { createFileRoute } from '@tanstack/react-router';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { UserRound } from 'lucide-react';
import { authClient } from '@/lib/auth-client';
import { noindexHead } from '@/lib/seo';
import { toast } from '@/lib/toast';
import { safeInternalPath } from '@/lib/auth/redirect';
import {
  PROVIDER_NAMES,
  SESSION_NOT_FRESH,
  isSignInProviderId,
} from '@/lib/auth/providers';
import { PageLayout } from '@/components/feed/PageLayout';
import { useSession } from '@/components/Providers';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { SignedOutPrompt } from '@/components/ui/signed-out-prompt';
import { useArrival } from '@/components/ui/arrive';
import { cn } from '@/lib/utils';

export const Route =
  createFileRoute(
    '/_site/account/connect',
  )(
    {
      validateSearch:
        (
          search: Record<
            string,
            unknown
          >,
        ): {
          next?: string;
        } => ({
          next:
            typeof search.next ===
            'string'
              ? search.next
              : undefined,
        }),
      head: () =>
        noindexHead(
          'Connect accounts',
        ),
      component:
        ConnectAccountPage,
    },
  );

interface Pending {
  name:
    | string
    | null;
  image:
    | string
    | null;
  methods: string[];
  expiresAt: number;
}

type Eligibility =
  | {
      eligible: true;
      methods: string[];
    }
  | {
      eligible: false;
      reason: string;
    };

type View =
  | {
      kind: 'loading';
    }
  | {
      kind: 'confirm';
      pending: Pending;
    }
  | {
      kind: 'offer';
      methods: string[];
    }
  | {
      kind: 'error';
      message: string;
    }
  | {
      kind: 'done';
    };

function methodNames(
  methods: string[],
): string {
  return methods
    .map(
      (
        m,
      ) =>
        isSignInProviderId(
          m,
        )
          ? PROVIDER_NAMES[
              m
            ]
          : m,
    )
    .join(
      ', ',
    );
}

function ConnectAccountPage() {
  const {
    t,
  } =
    useTranslation(
      'feed',
    );
  const {
    data: session,
    isPending,
  } =
    useSession();
  const {
    next: rawNext,
  } =
    Route.useSearch();
  const next =
    safeInternalPath(
      rawNext,
    );
  const [
    view,
    setView,
  ] =
    useState<View>(
      {
        kind: 'loading',
      },
    );
  const [
    busy,
    setBusy,
  ] =
    useState(
      false,
    );
  const arrival =
    useArrival(
      view.kind !==
        'loading',
    );

  const continueOn =
    useCallback(() => {
      window.location.replace(
        next,
      );
    }, [
      next,
    ]);

  // Ask once per signed-in account. Keyed on the id, not the session object,
  // which is a new object on every session refresh.
  const userId =
    session
      ?.user
      ?.id ??
    null;
  const askedFor =
    useRef<
      | string
      | null
    >(
      null,
    );

  useEffect(() => {
    if (
      isPending ||
      !userId ||
      askedFor.current ===
        userId
    )
      return;
    askedFor.current =
      userId;
    void (async () => {
      const pending =
        await authClient.$fetch<{
          pending: Pending | null;
        }>(
          '/account-merge/pending',
          {
            method:
              'GET',
          },
        );
      if (
        pending
          .data
          ?.pending
      ) {
        setView(
          {
            kind: 'confirm',
            pending:
              pending
                .data
                .pending,
          },
        );
        return;
      }
      const eligibility =
        await authClient.$fetch<Eligibility>(
          '/account-merge/eligibility',
          {
            method:
              'GET',
          },
        );
      if (
        eligibility
          .data
          ?.eligible
      ) {
        setView(
          {
            kind: 'offer',
            methods:
              eligibility
                .data
                .methods,
          },
        );
        return;
      }
      setView(
        {
          kind: 'done',
        },
      );
      continueOn();
    })();
  }, [
    isPending,
    userId,
    continueOn,
  ]);

  const startMerge =
    async () => {
      setBusy(
        true,
      );
      const res =
        await authClient.$fetch(
          '/account-merge/start',
          {
            method:
              'POST',
          },
        );
      if (
        res.error
      ) {
        setBusy(
          false,
        );
        toast.error(
          t(
            'connect-start-failed',
            {
              defaultValue:
                'Could not start. Try again.',
            },
          ),
        );
        return;
      }
      // This new account is now signed out; sign in to the existing one and come
      // back here to confirm.
      const back = `/account/connect?next=${encodeURIComponent(next)}`;
      window.location.href = `/login?callbackURL=${encodeURIComponent(back)}`;
    };

  const confirmMerge =
    async () => {
      setBusy(
        true,
      );
      const res =
        await authClient.$fetch<{
          ok: boolean;
          moved: string[];
        }>(
          '/account-merge/confirm',
          {
            method:
              'POST',
          },
        );
      if (
        res.error
      ) {
        setBusy(
          false,
        );
        const code =
          (
            res.error as {
              code?: string;
            }
          )
            .code;
        setView(
          {
            kind: 'error',
            message:
              code ===
              SESSION_NOT_FRESH
                ? t(
                    'connect-stale',
                    {
                      defaultValue:
                        'Sign in to this account again to confirm. The request was started before you signed in.',
                    },
                  )
                : t(
                    'connect-failed',
                    {
                      defaultValue:
                        'The accounts could not be joined. Start again from the new account.',
                    },
                  ),
          },
        );
        return;
      }
      toast.success(
        t(
          'connect-done',
          {
            defaultValue:
              '{{methods}} now signs in to this account.',
            methods:
              methodNames(
                res
                  .data
                  ?.moved ??
                  [],
              ),
          },
        ),
      );
      window.location.href =
        '/settings/security';
    };

  const cancelMerge =
    async () => {
      setBusy(
        true,
      );
      await authClient.$fetch(
        '/account-merge/cancel',
        {
          method:
            'POST',
        },
      );
      continueOn();
    };

  const title =
    t(
      'connect-title',
      {
        defaultValue:
          'Connect accounts',
      },
    );

  return (
    <PageLayout
      title={
        title
      }
    >
      {!isPending &&
      !session?.user ? (
        <SignedOutPrompt
          icon={
            UserRound
          }
          title={t(
            'connect-signed-out',
            {
              defaultValue:
                'Sign in to the account you want to keep.',
            },
          )}
          callbackURL={`/account/connect?next=${encodeURIComponent(next)}`}
        />
      ) : view.kind ===
          'loading' ||
        view.kind ===
          'done' ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : view.kind ===
        'error' ? (
        <div
          className={cn(
            'flex max-w-xl flex-col gap-4',
            arrival,
          )}
        >
          <p className="t-body">
            {
              view.message
            }
          </p>
          <div>
            <Button
              variant="primary"
              onClick={
                continueOn
              }
            >
              {t(
                'connect-continue',
                {
                  defaultValue:
                    'Continue',
                },
              )}
            </Button>
          </div>
        </div>
      ) : view.kind ===
        'offer' ? (
        <div
          className={cn(
            'flex max-w-xl flex-col gap-4',
            arrival,
          )}
        >
          <h2 className="t-heading">
            {t(
              'connect-offer-title',
              {
                defaultValue:
                  'Is this your first RMH account?',
              },
            )}
          </h2>
          <p className="t-body text-site-text-muted">
            {t(
              'connect-offer-body',
              {
                defaultValue:
                  'You just created a new account with {{methods}}. If you already have an RMH account, sign in to it and we will connect {{methods}} to it instead, so everything stays in one place.',
                methods:
                  methodNames(
                    view.methods,
                  ),
              },
            )}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              onClick={
                continueOn
              }
              disabled={
                busy
              }
            >
              {t(
                'connect-offer-new',
                {
                  defaultValue:
                    'Continue with this new account',
                },
              )}
            </Button>
            <Button
              onClick={
                startMerge
              }
              loading={
                busy
              }
              disabled={
                busy
              }
            >
              {t(
                'connect-offer-existing',
                {
                  defaultValue:
                    'I already have an account',
                },
              )}
            </Button>
          </div>
        </div>
      ) : (
        <div
          className={cn(
            'flex max-w-xl flex-col gap-4',
            arrival,
          )}
        >
          <h2 className="t-heading">
            {t(
              'connect-confirm-title',
              {
                defaultValue:
                  'Connect {{methods}} to this account?',
                methods:
                  methodNames(
                    view
                      .pending
                      .methods,
                  ),
              },
            )}
          </h2>
          <p className="t-body text-site-text-muted">
            {t(
              'connect-confirm-body',
              {
                defaultValue:
                  'You will be able to sign in to this account ({{current}}) with {{methods}}. The new, empty account {{name}} will be closed.',
                current:
                  session
                    ?.user
                    ?.name ??
                  '',
                methods:
                  methodNames(
                    view
                      .pending
                      .methods,
                  ),
                name:
                  view
                    .pending
                    .name ??
                  '',
              },
            )}
          </p>
          <p className="t-meta">
            {t(
              'connect-confirm-warning',
              {
                defaultValue:
                  'Only confirm if you started this yourself, on this device, a moment ago.',
              },
            )}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              onClick={
                confirmMerge
              }
              loading={
                busy
              }
              disabled={
                busy
              }
            >
              {t(
                'connect-confirm-action',
                {
                  defaultValue:
                    'Connect',
                },
              )}
            </Button>
            <Button
              onClick={
                cancelMerge
              }
              disabled={
                busy
              }
            >
              {t(
                'connect-confirm-cancel',
                {
                  defaultValue:
                    'Cancel',
                },
              )}
            </Button>
          </div>
        </div>
      )}
    </PageLayout>
  );
}
