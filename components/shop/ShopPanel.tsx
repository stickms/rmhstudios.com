import {
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  Link,
  useRouter,
} from '@tanstack/react-router';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Select } from '@/components/ui/select';
import { Tabs } from '@/components/ui/tabs';
import { toast } from '@/lib/toast';
import {
  KIND_ORDER,
  type ShopItemKind,
} from '@/lib/shop/catalog';
import {
  shopView,
  type ShopShow,
  type ShopSort,
} from '@/lib/shop/view';
import {
  purchaseShopItemApi,
  equipShopItemApi,
  type ShopListItem,
} from '@/lib/shop/shop.contract';
import { TIER_LABELS } from '@/lib/entitlements/features';
import { api } from '@/lib/contract/client';
import { serverError } from '@/lib/http';
import { ShopWishButton } from '@/components/economy-plus/ShopWishButton';
import { CoinAmount } from './CoinAmount';
import { ItemDialog } from './ItemDialog';
import { ItemPicture } from './ItemPicture';
import { kindLabel } from './kind-label';
import {
  PRODUCT_GRID,
  ProductTile,
} from './ProductTile';
import {
  RarityMark,
  rarityLabel,
} from './RarityMark';

/**
 * The Shop tab of /store: the cosmetics catalog as a grid of product tiles.
 *
 * Anatomy: the categories as a tab strip, a filter row (show, sort, the count), the grid, and one
 * dialog per item that holds its large preview and its one action (Buy, Equip or Unequip by
 * state). A tile is a picture and a caption; nothing is bought from the grid, so the grid carries
 * no buttons and the page keeps one primary, inside the dialog (R4).
 *
 * The catalog, the balance and what is owned come from the route loader. A purchase or an equip
 * invalidates the route, so the grid, the header's balance and the other tabs all read one fresh
 * answer instead of each patching its own copy.
 */
export function ShopPanel({
  data,
}: {
  data: {
    coins: number;
    items: ShopListItem[];
    signedIn: boolean;
  };
}) {
  const {
    t,
  } =
    useTranslation(
      'feed',
    );
  const router =
    useRouter();
  const {
    coins,
    items,
    signedIn,
  } =
    data;
  const [
    kind,
    setKind,
  ] =
    useState<ShopItemKind>(
      'NAME_COLOR',
    );
  const [
    show,
    setShow,
  ] =
    useState<ShopShow>(
      'all',
    );
  const [
    sort,
    setSort,
  ] =
    useState<ShopSort>(
      'rarity',
    );
  const [
    openId,
    setOpenId,
  ] =
    useState<
      | string
      | null
    >(
      null,
    );
  const [
    busy,
    setBusy,
  ] =
    useState(
      false,
    );

  const visible =
    shopView(
      items,
      {
        kind,
        show,
        sort,
      },
    );
  const current =
    openId
      ? (items.find(
          (
            i,
          ) =>
            i.id ===
            openId,
        ) ??
        null)
      : null;
  // Keep drawing the last item while the dialog fades out.
  const last =
    useRef<ShopListItem | null>(
      null,
    );
  if (
    current
  )
    last.current =
      current;
  const open =
    current ??
    last.current;

  const buy =
    async (
      item: ShopListItem,
    ) => {
      setBusy(
        true,
      );
      try {
        await api(
          purchaseShopItemApi,
          {
            body: {
              itemId:
                item.id,
            },
          },
        );
        toast.success(
          t(
            'shop-bought',
            {
              name: item.name,
              defaultValue:
                'Bought {{name}}',
            },
          ),
        );
        await router.invalidate();
      } catch (e) {
        toast.error(
          serverError(
            e,
          ) ||
            t(
              'purchase-failed',
              {
                defaultValue:
                  'Purchase failed',
              },
            ),
        );
      } finally {
        setBusy(
          false,
        );
      }
    };

  const equip =
    async (
      item: ShopListItem,
      equipped: boolean,
    ) => {
      setBusy(
        true,
      );
      try {
        await api(
          equipShopItemApi,
          {
            body: {
              itemId:
                item.id,
              equipped,
            },
          },
        );
        await router.invalidate();
      } catch (e) {
        toast.error(
          serverError(
            e,
          ) ||
            t(
              'shop-equip-failed',
              {
                defaultValue:
                  'That did not save. Try again.',
              },
            ),
        );
      } finally {
        setBusy(
          false,
        );
      }
    };

  const short =
    open &&
    !open.owned
      ? Math.max(
          0,
          open.price -
            coins,
        )
      : 0;

  return (
    <div className="flex flex-col gap-4 pt-4">
      <Tabs
        aria-label={t(
          'shop-categories-label',
          {
            defaultValue:
              'Shop categories',
          },
        )}
        value={
          kind
        }
        onChange={(
          id,
        ) =>
          setKind(
            id as ShopItemKind,
          )
        }
        tabs={KIND_ORDER.map(
          (
            k,
          ) => ({
            id: k,
            label:
              kindLabel(
                t,
                k,
              ),
          }),
        )}
      />

      <div
        data-slot="page-controls"
        className="flex flex-wrap items-center gap-x-3 gap-y-2"
      >
        {signedIn ? (
          <Select
            value={
              show
            }
            onChange={(
              e,
            ) =>
              setShow(
                e
                  .target
                  .value as ShopShow,
              )
            }
            aria-label={t(
              'shop-show-label',
              {
                defaultValue:
                  'Show',
              },
            )}
            className="w-auto min-w-36"
          >
            <option value="all">
              {t(
                'shop-show-all',
                {
                  defaultValue:
                    'All items',
                },
              )}
            </option>
            <option value="owned">
              {t(
                'shop-show-owned',
                {
                  defaultValue:
                    'Owned',
                },
              )}
            </option>
            <option value="unowned">
              {t(
                'shop-show-unowned',
                {
                  defaultValue:
                    'Not owned',
                },
              )}
            </option>
          </Select>
        ) : null}
        <Select
          value={
            sort
          }
          onChange={(
            e,
          ) =>
            setSort(
              e
                .target
                .value as ShopSort,
            )
          }
          aria-label={t(
            'shop-sort-label',
            {
              defaultValue:
                'Sort',
            },
          )}
          className="w-auto min-w-44"
        >
          <option value="rarity">
            {t(
              'shop-sort-rarity',
              {
                defaultValue:
                  'Rarity',
              },
            )}
          </option>
          <option value="price_asc">
            {t(
              'shop-sort-price-asc',
              {
                defaultValue:
                  'Price: low to high',
              },
            )}
          </option>
          <option value="price_desc">
            {t(
              'shop-sort-price-desc',
              {
                defaultValue:
                  'Price: high to low',
              },
            )}
          </option>
        </Select>
        <p
          className="t-meta ms-auto"
          aria-live="polite"
        >
          {t(
            'shop-count',
            {
              count:
                visible.length,
              defaultValue_one:
                '{{count}} item',
              defaultValue:
                '{{count}} items',
            },
          )}
        </p>
      </div>

      {visible.length ===
      0 ? (
        <EmptyState
          title={
            show ===
            'owned'
              ? t(
                  'shop-empty-owned-title',
                  {
                    defaultValue:
                      'Nothing owned here yet',
                  },
                )
              : t(
                  'shop-empty-title',
                  {
                    defaultValue:
                      'Nothing to show',
                  },
                )
          }
          description={
            show ===
            'owned'
              ? t(
                  'shop-empty-owned-desc',
                  {
                    defaultValue:
                      'You own nothing in this category. Show all items to see what is for sale.',
                  },
                )
              : t(
                  'shop-empty-desc',
                  {
                    defaultValue:
                      'You own everything in this category.',
                  },
                )
          }
          action={
            <Button
              variant="default"
              onClick={() =>
                setShow(
                  'all',
                )
              }
            >
              {t(
                'shop-empty-action',
                {
                  defaultValue:
                    'Show all items',
                },
              )}
            </Button>
          }
        />
      ) : (
        <div
          className={
            PRODUCT_GRID
          }
        >
          {visible.map(
            (
              item,
            ) => (
              <ProductTile
                key={
                  item.id
                }
                onOpen={() =>
                  setOpenId(
                    item.id,
                  )
                }
                picture={
                  <ItemPicture
                    kind={
                      item.kind
                    }
                    art={
                      item.data
                    }
                  />
                }
                name={
                  item.name
                }
                detail={
                  <RarityMark
                    rarity={
                      item.rarity
                    }
                  />
                }
                trailing={
                  item.equipped ? (
                    <span className="inline-flex shrink-0 items-center gap-1 text-site-text">
                      <Check
                        className="size-3.5"
                        aria-hidden
                      />
                      {t(
                        'equipped',
                        {
                          defaultValue:
                            'Equipped',
                        },
                      )}
                    </span>
                  ) : item.owned ? (
                    <span className="shrink-0 text-site-text">
                      {t(
                        'shop-owned',
                        {
                          defaultValue:
                            'Owned',
                        },
                      )}
                    </span>
                  ) : (
                    <CoinAmount
                      amount={
                        item.price
                      }
                      className="text-site-text"
                    />
                  )
                }
              />
            ),
          )}
        </div>
      )}

      <ItemDialog
        open={
          !!current
        }
        onOpenChange={(
          next,
        ) => {
          if (
            !next
          )
            setOpenId(
              null,
            );
        }}
        kind={
          open?.kind ??
          null
        }
        art={
          open?.data ??
          {}
        }
        name={
          open?.name ??
          ''
        }
        description={
          open?.description
        }
        facts={
          open
            ? [
                {
                  label:
                    t(
                      'shop-fact-kind',
                      {
                        defaultValue:
                          'Kind',
                      },
                    ),
                  value:
                    kindLabel(
                      t,
                      open.kind,
                    ),
                },
                {
                  label:
                    t(
                      'shop-fact-rarity',
                      {
                        defaultValue:
                          'Rarity',
                      },
                    ),
                  value:
                    rarityLabel(
                      t,
                      open.rarity,
                    ),
                },
                ...(open.requiresTier
                  ? [
                      {
                        label:
                          t(
                            'shop-fact-plan',
                            {
                              defaultValue:
                                'Needs plan',
                            },
                          ),
                        value:
                          TIER_LABELS[
                            open
                              .requiresTier
                          ],
                      },
                    ]
                  : []),
                {
                  label:
                    t(
                      'shop-fact-price',
                      {
                        defaultValue:
                          'Price',
                      },
                    ),
                  value:
                    (
                      <CoinAmount
                        amount={
                          open.price
                        }
                      />
                    ),
                },
                ...(signedIn
                  ? [
                      {
                        label:
                          open.owned
                            ? t(
                                'shop-fact-status',
                                {
                                  defaultValue:
                                    'Status',
                                },
                              )
                            : t(
                                'shop-fact-balance',
                                {
                                  defaultValue:
                                    'Your balance',
                                },
                              ),
                        value:
                          open.equipped ? (
                            t(
                              'equipped',
                              {
                                defaultValue:
                                  'Equipped',
                              },
                            )
                          ) : open.owned ? (
                            t(
                              'shop-owned',
                              {
                                defaultValue:
                                  'Owned',
                              },
                            )
                          ) : (
                            <CoinAmount
                              amount={
                                coins
                              }
                            />
                          ),
                      },
                    ]
                  : []),
              ]
            : []
        }
        note={
          !open ||
          open.owned
            ? undefined
            : !signedIn
              ? t(
                  'shop-note-signin',
                  {
                    defaultValue:
                      'Sign in to buy this with coins.',
                  },
                )
              : short >
                  0
                ? t(
                    'shop-note-short',
                    {
                      count:
                        short,
                      formatted:
                        short.toLocaleString(),
                      defaultValue_one:
                        'You need {{formatted}} more coin.',
                      defaultValue:
                        'You need {{formatted}} more coins.',
                    },
                  )
                : undefined
        }
        actions={
          !open ? null : !signedIn ? (
            <Button
              asChild
              variant="primary"
            >
              <a href="/login">
                {t(
                  'shop-sign-in',
                  {
                    defaultValue:
                      'Sign in',
                  },
                )}
              </a>
            </Button>
          ) : open.owned ? (
            <Button
              variant="primary"
              loading={
                busy
              }
              onClick={() =>
                equip(
                  open,
                  !open.equipped,
                )
              }
            >
              {open.equipped
                ? t(
                    'shop-unequip',
                    {
                      defaultValue:
                        'Unequip',
                    },
                  )
                : t(
                    'equip',
                    {
                      defaultValue:
                        'Equip',
                    },
                  )}
            </Button>
          ) : (
            <>
              {short >
              0 ? (
                <Button
                  asChild
                  variant="default"
                >
                  <Link to="/wallet">
                    {t(
                      'shop-open-wallet',
                      {
                        defaultValue:
                          'Open wallet',
                      },
                    )}
                  </Link>
                </Button>
              ) : (
                <ShopWishButton
                  itemId={
                    open.id
                  }
                />
              )}
              <Button
                variant="primary"
                loading={
                  busy
                }
                disabled={
                  short >
                  0
                }
                onClick={() =>
                  buy(
                    open,
                  )
                }
              >
                {t(
                  'shop-buy-for',
                  {
                    price:
                      open.price.toLocaleString(),
                    defaultValue:
                      'Buy for {{price}} coins',
                  },
                )}
              </Button>
            </>
          )
        }
      />
    </div>
  );
}
