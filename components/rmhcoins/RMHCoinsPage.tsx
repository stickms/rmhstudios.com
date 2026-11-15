import {
  lazy,
  useEffect,
  useState,
} from 'react';
import {
  Link,
  useSearch,
} from '@tanstack/react-router';
import {
  TrendingUp,
  Gamepad2,
} from 'lucide-react';
import { useSession } from '@/components/Providers';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import {
  Tabs,
  type TabItem,
} from '@/components/ui/tabs';
import { toast } from '@/lib/toast';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/contract/client';
import {
  HttpError,
  serverError,
} from '@/lib/http';
import { claimCoinsApi } from '@/lib/coins.contract';
import { CoinIcon } from './CoinIcon';
import { PlayTab } from './PlayTab';
import { PredictionsMarketTab } from '@/components/predictions/PredictionsMarketTab';
import { useForecastingTab } from '@/components/forecasting/forecastingTab';
import { coinBalanceApi } from '@/lib/site-reads.contract';
import {
  ArrivalSuspense,
  useArrival,
} from '@/components/ui/arrive';
import { cn } from '@/lib/utils';

const ForecastingPanel =
  lazy(
    () =>
      import('@/components/forecasting/ForecastingPanel').then(
        (
          m,
        ) => ({
          default:
            m.ForecastingPanel,
        }),
      ),
  );

export function RMHCoinsPage() {
  const {
    t,
  } =
    useTranslation(
      'c-rmhcoins',
    );
  const {
    data: session,
    isPending,
  } =
    useSession();
  const [
    coins,
    setCoins,
  ] =
    useState(
      0,
    );
  const [
    loading,
    setLoading,
  ] =
    useState(
      true,
    );
  const [
    claiming,
    setClaiming,
  ] =
    useState(
      false,
    );
  // A table invite link (`?tab=games&game=holdem&lobby=…`) has to open on the
  // games side, or the person who followed it lands on prediction markets.
  const search =
    useSearch(
      {
        strict: false,
      },
    ) as Record<
      string,
      unknown
    >;
  const [
    tab,
    setTab,
  ] =
    useState<
      | 'markets'
      | 'games'
      | 'forecasting'
    >(
      search.tab ===
        'games'
        ? 'games'
        : search.tab ===
            'forecasting'
          ? 'forecasting'
          : 'markets',
    );
  const forecastingTab =
    useForecastingTab();
  const arrival =
    useArrival(
      !isPending &&
        !loading,
    );

  // Signed out is a supported state, not a redirect. This page used to bounce
  // anyone without a session to /login, which meant the prediction markets —
  // public information, and the reason most people arrive — were invisible
  // until you had an account. Now the markets read normally, the casino tables
  // show their lobbies read-only, and the sign-in ask lands on the control you
  // actually pressed.
  const signedIn =
    Boolean(
      session?.user,
    );

  // Fetch coin balance
  useEffect(() => {
    if (
      !session?.user
    ) {
      // No balance to fetch, and nothing to wait for.
      setLoading(
        false,
      );
      return;
    }
    setLoading(
      true,
    );
    api(
      coinBalanceApi,
    )
      .then(
        (
          data,
        ) => {
          setCoins(
            data.coins ??
              0,
          );
        },
      )
      .catch(
        console.error,
      )
      .finally(
        () =>
          setLoading(
            false,
          ),
      );
  }, [
    session,
  ]);

  const handleClaimCoins =
    async () => {
      if (
        claiming ||
        coins >=
          10
      )
        return;
      setClaiming(
        true,
      );
      try {
        const data =
          await api(
            claimCoinsApi,
          );
        setCoins(
          data.newBalance,
        );
        toast.success(
          t(
            'coins-added',
            {
              defaultValue:
                '+10 coins added!',
            },
          ),
        );
      } catch (e) {
        // A refusal carries the server's own message; anything else is a transport failure.
        if (
          e instanceof
          HttpError
        ) {
          toast.error(
            serverError(
              e,
            ) ??
              t(
                'claim-failed',
                {
                  defaultValue:
                    'Claim failed',
                },
              ),
          );
        } else {
          toast.error(
            t(
              'network-error',
              {
                defaultValue:
                  'Network error',
              },
            ),
          );
        }
      } finally {
        setClaiming(
          false,
        );
      }
    };

  if (
    isPending ||
    loading
  ) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner />
      </div>
    );
  }

  const tabs: TabItem[] =
    [
      {
        id: 'markets',
        label:
          t(
            'tab-markets',
            {
              defaultValue:
                'Markets',
            },
          ),
        icon: TrendingUp,
      },
      {
        id: 'games',
        label:
          t(
            'tab-games',
            {
              defaultValue:
                'Games',
            },
          ),
        icon: Gamepad2,
      },
      forecastingTab,
    ];

  return (
    <div
      className={cn(
        'flex w-full flex-col gap-4',
        arrival,
      )}
    >
      {/* Balance bar — a balance once you have one, the offer of one before. */}
      <div className="flex items-center justify-between gap-3 rounded-site px-4 py-3">
        {signedIn ? (
          <>
            <div className="flex items-center gap-2">
              <CoinIcon className="size-6" />
              <span className="font-semibold text-2xl text-site-warning">
                {
                  coins
                }
              </span>
              <span className="text-sm text-site-text-muted">
                {t(
                  'rmh-coins',
                  {
                    defaultValue:
                      'RMH Coins',
                  },
                )}
              </span>
            </div>
            {coins <
              10 && (
              <Button
                onClick={
                  handleClaimCoins
                }
                loading={
                  claiming
                }
                variant="default"
                size="sm"
                className="border-site-warning/50 text-site-warning hover:bg-site-warning/10"
              >
                {t(
                  'claim-free-coins',
                  {
                    defaultValue:
                      'Claim 10 Free Coins',
                  },
                )}
              </Button>
            )}
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 min-w-0">
              <CoinIcon className="size-6 shrink-0" />
              <span className="text-sm text-site-text-muted">
                {t(
                  'signed-out-balance',
                  {
                    defaultValue:
                      'Sign in to claim free RMH Coins and back your calls.',
                  },
                )}
              </span>
            </div>
            <Button
              asChild
              variant="default"
              size="sm"
              className="shrink-0"
            >
              <Link
                to="/login"
                search={{
                  callbackURL:
                    '/predictions',
                }}
              >
                {t(
                  'sign-in',
                  {
                    defaultValue:
                      'Sign in',
                  },
                )}
              </Link>
            </Button>
          </>
        )}
      </div>

      {/* Markets / Games switch — §5.45 tab sheet on the shared Tabs renderer
          (§17.5: this strip was hand-rolled with no tab semantics, so the §16.2
          design-lint gate never saw it). Sits below the balance header. */}
      <div className="px-4">
        <Tabs
          tabs={
            tabs
          }
          value={
            tab
          }
          onChange={(
            id,
          ) =>
            setTab(
              id as
                | 'markets'
                | 'games'
                | 'forecasting',
            )
          }
          idBase="rmhcoins"
          aria-label={t(
            'tabs-aria',
            {
              defaultValue:
                'Predictions sections',
            },
          )}
        />
      </div>

      {/* Tab content */}
      <div className="flex-1">
        {tab ===
        'markets' ? (
          <div
            id="rmhcoins-panel-markets"
            role="tabpanel"
            aria-labelledby="rmhcoins-tab-markets"
          >
            <PredictionsMarketTab
              coins={
                coins
              }
              setCoins={
                setCoins
              }
              signedIn={
                signedIn
              }
            />
          </div>
        ) : tab ===
          'forecasting' ? (
          <div
            id="rmhcoins-panel-forecasting"
            role="tabpanel"
            aria-labelledby="rmhcoins-tab-forecasting"
          >
            <ArrivalSuspense
              fallback={
                <div className="flex justify-center py-10">
                  <Spinner />
                </div>
              }
            >
              <ForecastingPanel
                signedIn={
                  signedIn
                }
              />
            </ArrivalSuspense>
          </div>
        ) : (
          <div
            id="rmhcoins-panel-games"
            role="tabpanel"
            aria-labelledby="rmhcoins-tab-games"
          >
            <PlayTab
              coins={
                coins
              }
              setCoins={
                setCoins
              }
              signedIn={
                signedIn
              }
            />
          </div>
        )}
      </div>
    </div>
  );
}
