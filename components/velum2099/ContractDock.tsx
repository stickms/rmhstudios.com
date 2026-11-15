/**
 * Velum2099 contract board (R12). The game is plain DOM; this React layer talks
 * to it over window events: `velum2099:sim` (a drive started/stopped),
 * `velum2099:delivered` (a courier leg finished), `velum2099:contract-failed`,
 * and `velum2099:take-contract` (sent back to the game).
 */

import {
  useCallback,
  useEffect,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from '@/lib/toast';
import { ScrollText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { api } from '@/lib/contract/client';
import { HttpError } from '@/lib/http';
import {
  listVelumContractsApi,
  submitVelumContractApi,
} from '@/lib/velum2099/velum.contract';
import {
  legLength,
  type ContractRoute,
  type ContractView,
} from '@/lib/velum2099/contracts';
import { useArrival } from '@/components/ui/arrive';
import { cn } from '@/lib/utils';

interface Delivered extends ContractRoute {
  seconds: number;
  contract: boolean;
}

const fmt =
  (
    s: number,
  ) =>
    `${Math.floor(s / 60)}:${(s % 60).toFixed(2).padStart(5, '0')}`;

export function ContractDock() {
  const {
    t,
  } =
    useTranslation(
      'f-async-games',
    );
  const [
    sim,
    setSim,
  ] =
    useState(
      false,
    );
  const [
    open,
    setOpen,
  ] =
    useState(
      false,
    );
  const [
    board,
    setBoard,
  ] =
    useState<
      | ContractView[]
      | null
    >(
      null,
    );
  const [
    failed,
    setFailed,
  ] =
    useState(
      false,
    );
  const arrival =
    useArrival(
      board !==
        null ||
        failed,
    );
  const [
    active,
    setActive,
  ] =
    useState<
      | string
      | null
    >(
      null,
    );

  const submit =
    useCallback(
      async (
        run: Delivered,
      ) => {
        try {
          const body =
            await api(
              submitVelumContractApi,
              {
                body: {
                  pickupX:
                    run.pickupX,
                  pickupZ:
                    run.pickupZ,
                  dropX:
                    run.dropX,
                  dropZ:
                    run.dropZ,
                  seconds:
                    Math.round(
                      run.seconds *
                        100,
                    ) /
                    100,
                },
              },
            );
          if (
            body.result ===
            'posted'
          ) {
            toast.success(
              t(
                'contract-posted',
                {
                  defaultValue:
                    'Contract posted at {{time}}.',
                  time: fmt(
                    run.seconds,
                  ),
                },
              ),
            );
          } else if (
            body.result ===
            'record'
          ) {
            toast.success(
              t(
                'contract-record',
                {
                  defaultValue:
                    'New record: {{time}}. The route is yours.',
                  time: fmt(
                    run.seconds,
                  ),
                },
              ),
            );
          } else {
            toast(
              t(
                'contract-slower',
                {
                  defaultValue:
                    '{{time}} — the record is {{best}}.',
                  time: fmt(
                    run.seconds,
                  ),
                  best: fmt(
                    body.previousSeconds ??
                      0,
                  ),
                },
              ),
            );
          }
          setBoard(
            null,
          );
        } catch (e) {
          if (
            e instanceof
              HttpError &&
            e.status ===
              401
          ) {
            toast(
              t(
                'contract-sign-in',
                {
                  defaultValue:
                    'Sign in to post contract times.',
                },
              ),
            );
            return;
          }
          toast.error(
            t(
              'contract-error',
              {
                defaultValue:
                  'Could not reach the contract board.',
              },
            ),
          );
        }
      },
      [
        t,
      ],
    );

  useEffect(() => {
    const onSim =
      (
        e: Event,
      ) => {
        const on =
          Boolean(
            (
              e as CustomEvent<{
                active: boolean;
              }>
            )
              .detail
              ?.active,
          );
        setSim(
          on,
        );
        if (
          !on
        ) {
          setActive(
            null,
          );
          setOpen(
            false,
          );
        }
      };
    const onDelivered =
      (
        e: Event,
      ) => {
        const run =
          (
            e as CustomEvent<Delivered>
          )
            .detail;
        setActive(
          null,
        );
        if (
          run.contract
        ) {
          void submit(
            run,
          );
          return;
        }
        toast(
          t(
            'contract-delivered',
            {
              defaultValue:
                'Delivered in {{time}}.',
              time: fmt(
                run.seconds,
              ),
            },
          ),
          {
            action:
              {
                label:
                  t(
                    'contract-post',
                    {
                      defaultValue:
                        'Post as contract',
                    },
                  ),
                onClick:
                  () =>
                    void submit(
                      run,
                    ),
              },
            duration: 12_000,
          },
        );
      };
    const onFailed =
      () => {
        setActive(
          null,
        );
        toast.error(
          t(
            'contract-failed',
            {
              defaultValue:
                'Contract failed — the clock ran out.',
            },
          ),
        );
      };
    window.addEventListener(
      'velum2099:sim',
      onSim,
    );
    window.addEventListener(
      'velum2099:delivered',
      onDelivered,
    );
    window.addEventListener(
      'velum2099:contract-failed',
      onFailed,
    );
    return () => {
      window.removeEventListener(
        'velum2099:sim',
        onSim,
      );
      window.removeEventListener(
        'velum2099:delivered',
        onDelivered,
      );
      window.removeEventListener(
        'velum2099:contract-failed',
        onFailed,
      );
    };
  }, [
    submit,
    t,
  ]);

  useEffect(() => {
    if (
      !open
    )
      return;
    let live = true;
    setFailed(
      false,
    );
    api(
      listVelumContractsApi,
    )
      .then(
        (
          b,
        ) =>
          live &&
          setBoard(
            b.contracts,
          ),
      )
      .catch(
        () =>
          live &&
          setFailed(
            true,
          ),
      );
    return () => {
      live = false;
    };
  }, [
    open,
  ]);

  if (
    !sim
  )
    return null;

  const take =
    (
      c: ContractView,
    ) => {
      window.dispatchEvent(
        new CustomEvent(
          'velum2099:take-contract',
          {
            detail:
              {
                id: c.id,
                pickup:
                  {
                    x: c.pickupX,
                    z: c.pickupZ,
                  },
                drop: {
                  x: c.dropX,
                  z: c.dropZ,
                },
              },
          },
        ),
      );
      setActive(
        c.id,
      );
      setOpen(
        false,
      );
    };

  return (
    <>
      <Button
        data-floating="feature-overlay"
        variant="default"
        size="sm"
        className="surface-overlay fixed end-[calc(0.75rem+var(--safe-right))] bottom-24 z-30"
        onClick={() =>
          setOpen(
            true,
          )
        }
      >
        <ScrollText
          aria-hidden
        />
        {active
          ? t(
              'contract-dock-active',
              {
                defaultValue:
                  'Contract running',
              },
            )
          : t(
              'contract-dock',
              {
                defaultValue:
                  'Contracts',
              },
            )}
      </Button>
      <Dialog
        open={
          open
        }
        onOpenChange={
          setOpen
        }
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t(
                'contract-board',
                {
                  defaultValue:
                    'Contract board',
                },
              )}
            </DialogTitle>
            <DialogDescription>
              {t(
                'contract-board-help',
                {
                  defaultValue:
                    'Routes other couriers posted. Take one, beat the record, and the route is credited to you. Finish any plain courier run to post your own.',
                },
              )}
            </DialogDescription>
          </DialogHeader>
          {failed ? (
            <p
              className={cn(
                'text-sm text-site-danger',
                arrival,
              )}
            >
              {t(
                'contract-load-error',
                {
                  defaultValue:
                    'The board did not load.',
                },
              )}
            </p>
          ) : board ===
            null ? (
            <p className="text-sm text-site-text-muted">
              {t(
                'contract-loading',
                {
                  defaultValue:
                    'Loading…',
                },
              )}
            </p>
          ) : board.length ===
            0 ? (
            <p
              className={cn(
                'text-sm text-site-text-muted',
                arrival,
              )}
            >
              {t(
                'contract-empty',
                {
                  defaultValue:
                    'No contracts yet. Deliver a package and post the first.',
                },
              )}
            </p>
          ) : (
            <ul
              className={cn(
                'max-h-[50dvh] space-y-2 overflow-y-auto',
                arrival,
              )}
            >
              {board.map(
                (
                  c,
                ) => (
                  <li
                    key={
                      c.id
                    }
                    className="surface-card flex items-center gap-3 rounded-site p-4"
                  >
                    <div className="min-w-0 grow">
                      <p className="font-mono text-sm font-bold text-site-text">
                        {fmt(
                          c.bestSeconds,
                        )}
                      </p>
                      <p className="truncate text-xs text-site-text-muted">
                        {t(
                          'contract-leg',
                          {
                            defaultValue:
                              '{{metres}} m leg',
                            metres:
                              Math.round(
                                legLength(
                                  c,
                                ),
                              ),
                          },
                        )}
                        {
                          ' · '
                        }
                        {c.mine
                          ? t(
                              'contract-held-you',
                              {
                                defaultValue:
                                  'held by you',
                              },
                            )
                          : t(
                              'contract-held-by',
                              {
                                defaultValue:
                                  'held by {{name}}',
                                name:
                                  c
                                    .holder
                                    ?.username ??
                                  c
                                    .holder
                                    ?.name ??
                                  t(
                                    'contract-unknown',
                                    {
                                      defaultValue:
                                        'a courier',
                                    },
                                  ),
                              },
                            )}
                        {
                          ' · '
                        }
                        {t(
                          'contract-runs',
                          {
                            defaultValue_one:
                              '{{count}} run',
                            defaultValue:
                              '{{count}} runs',
                            count:
                              c.runs,
                          },
                        )}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="default"
                      onClick={() =>
                        take(
                          c,
                        )
                      }
                    >
                      {t(
                        'contract-take',
                        {
                          defaultValue:
                            'Take it',
                        },
                      )}
                    </Button>
                  </li>
                ),
              )}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
