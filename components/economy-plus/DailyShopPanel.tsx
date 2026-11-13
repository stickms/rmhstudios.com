/**
 * The store's "Daily" tab (C2 daily shop, C3 bundles, C6 loadouts). Lazy-loaded
 * when the tab opens, so none of it is in the store route's entry chunk.
 *
 * Anatomy: today's items as rows on rules (picture, name, rarity, one line, then "Add to bundle"
 * and the price), the bundle line above them with the tab's one primary (Buy bundle), and the
 * saved loadouts as rows under their own heading.
 *
 * Single items are bought through the ordinary `/api/shop/purchase` route at
 * their normal price; only the bundle has its own route.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Check, Plus, Trash2 } from 'lucide-react';
import { toast } from '@/lib/toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { CoinAmount } from '@/components/shop/CoinAmount';
import { ItemPicture } from '@/components/shop/ItemPicture';
import { RarityMark } from '@/components/shop/RarityMark';
import {
  BUNDLE_DISCOUNT_PCT,
  BUNDLE_SIZE,
  bundlePrice,
  type DailyShopItem,
  type DailyShopView,
} from '@/lib/shop/daily-shop';
import { LOADOUT_MAX_PRESETS, type LoadoutView } from '@/lib/shop/loadouts';
import { ApiError, apiJson, errorCode, newIdempotencyKey } from './api';
import { ShopWishButton } from './ShopWishButton';

const DAILY_KEY = ['economy-plus', 'daily-shop'] as const;
const LOADOUT_KEY = ['economy-plus', 'loadouts'] as const;

export default function DailyShopPanel({ signedIn }: { signedIn: boolean }) {
  const { t } = useTranslation('f-economy-plus');
  const qc = useQueryClient();
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const bundleKey = useRef<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: DAILY_KEY,
    queryFn: () => apiJson<DailyShopView>('/api/shop/daily'),
    staleTime: 30_000,
  });

  // After anything that changes ownership, the Shop tab's own loader data is
  // stale too (it remounts from the cached loader result), so refresh both.
  function refreshOwnership() {
    void qc.invalidateQueries({ queryKey: DAILY_KEY });
    void qc.invalidateQueries({ queryKey: LOADOUT_KEY });
    void qc.invalidateQueries({ queryKey: ['economy-plus', 'balance'] });
    void router.invalidate();
  }

  const buy = useMutation({
    mutationFn: (item: DailyShopItem) =>
      apiJson('/api/shop/purchase', { method: 'POST', body: { itemId: item.id } }),
    onSuccess: (_r, item) => {
      toast.success(t('daily-bought-item', { defaultValue: 'Bought {{name}}', name: item.name }));
      setSelected((s) => s.filter((id) => id !== item.id));
      refreshOwnership();
    },
    onError: (err) => {
      const code = errorCode(err);
      toast.error(
        code === 'Not enough coins' || (err instanceof ApiError && err.status === 400)
          ? t('daily-err-coins', { defaultValue: 'Not enough coins' })
          : err instanceof ApiError && err.status === 409
            ? t('daily-err-owned', { defaultValue: 'You already own this item' })
            : t('daily-err-generic', { defaultValue: 'Purchase failed' }),
      );
      refreshOwnership();
    },
  });

  const bundle = useMutation({
    mutationFn: (ids: string[]) => {
      bundleKey.current ??= newIdempotencyKey();
      return apiJson<{ price: number }>('/api/shop/bundle', {
        method: 'POST',
        body: { itemIds: ids },
        idempotencyKey: bundleKey.current,
      });
    },
    onSuccess: () => {
      bundleKey.current = null;
      toast.success(t('bundle-bought-done', { defaultValue: 'Bundle bought' }));
      setSelected([]);
      refreshOwnership();
    },
    onError: (err) => {
      if (err instanceof ApiError) bundleKey.current = null;
      const code = errorCode(err);
      toast.error(
        code === 'INSUFFICIENT_COINS'
          ? t('daily-err-coins', { defaultValue: 'Not enough coins' })
          : code === 'ALREADY_OWNED' || code === 'ALREADY_PURCHASED'
            ? t('bundle-err-owned', { defaultValue: 'You already own one of those items.' })
            : code === 'INVALID_BUNDLE'
              ? t('bundle-err-invalid', { defaultValue: "Those items aren't in today's bundle." })
              : t('bundle-err-generic', { defaultValue: "Couldn't buy that bundle" }),
      );
      refreshOwnership();
    },
  });

  const bySelected = useMemo(
    () => (data ? data.items.filter((i) => selected.includes(i.id)) : []),
    [data, selected],
  );

  if (isLoading || !data) {
    return (
      <div className="flex flex-col gap-3 pt-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  const listPrice = bySelected.reduce((a, i) => a + i.price, 0);
  const discounted = bundlePrice(bySelected.map((i) => i.price));
  const full = bySelected.length === BUNDLE_SIZE;

  function toggle(id: string) {
    setSelected((s) =>
      s.includes(id) ? s.filter((x) => x !== id) : s.length >= BUNDLE_SIZE ? s : [...s, id],
    );
  }

  return (
    <div className="flex flex-col gap-10 pt-4">
      <section aria-labelledby="daily-title" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
          <div className="min-w-0">
            <h2 id="daily-title" className="t-heading">
              {t('daily-title', { defaultValue: "Today's featured items" })}
            </h2>
            <p className="t-body mt-1 text-site-text-muted">
              {t('daily-lead', {
                defaultValue:
                  'A new set every day at midnight UTC. Each item stays in the shop at the same price.',
              })}
            </p>
          </div>
          <Countdown
            to={data.rotatesAt}
            onElapsed={() => void qc.invalidateQueries({ queryKey: DAILY_KEY })}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-y border-site-border py-3">
          <div className="min-w-0">
            <p className="t-body font-medium text-site-text">
              {t('bundle-line', {
                defaultValue: 'Bundle any {{size}} and save {{pct}}%',
                size: BUNDLE_SIZE,
                pct: BUNDLE_DISCOUNT_PCT,
              })}
            </p>
            <p className="t-body text-site-text-muted" aria-live="polite">
              {bySelected.length === 0
                ? t('bundle-hint-add', { defaultValue: 'Add items below to build a bundle.' })
                : t('bundle-progress', {
                    defaultValue: '{{n}} of {{size}} picked',
                    n: bySelected.length,
                    size: BUNDLE_SIZE,
                  })}
              {full ? (
                <>
                  {' · '}
                  <s>{listPrice.toLocaleString()}</s>{' '}
                  <span className="font-medium text-site-text">{discounted.toLocaleString()}</span>
                </>
              ) : null}
            </p>
          </div>
          {signedIn ? (
            <Button
              variant="primary"
              disabled={!full}
              loading={bundle.isPending}
              onClick={() => bundle.mutate(selected)}
            >
              {full
                ? t('bundle-buy-for', {
                    defaultValue: 'Buy bundle for {{price}} coins',
                    price: discounted.toLocaleString(),
                  })
                : t('bundle-buy', { defaultValue: 'Buy bundle' })}
            </Button>
          ) : (
            <Button asChild variant="primary">
              <a href="/login">{t('daily-sign-in', { defaultValue: 'Sign in to buy' })}</a>
            </Button>
          )}
        </div>

        <ul className="-mt-4">
          {data.items.map((item) => {
            const picked = selected.includes(item.id);
            return (
              <li
                key={item.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-site-border py-3"
              >
                <ItemPicture kind={item.kind} art={item.data} size="thumb" className="w-16" />
                <div className="min-w-40 flex-1">
                  <p className="t-body truncate font-medium text-site-text">{item.name}</p>
                  <p className="t-meta flex items-center gap-2">
                    <RarityMark rarity={item.rarity} />
                    <CoinAmount amount={item.price} />
                  </p>
                  <p className="t-body line-clamp-2 text-site-text-muted">{item.description}</p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {item.owned ? (
                    <p className="t-body inline-flex items-center gap-1 text-site-text">
                      <Check className="size-4" aria-hidden />
                      {t('daily-owned', { defaultValue: 'Owned' })}
                    </p>
                  ) : signedIn ? (
                    <>
                      <ShopWishButton itemId={item.id} />
                      <Button
                        variant="default"
                        aria-pressed={picked}
                        disabled={!picked && selected.length >= BUNDLE_SIZE}
                        onClick={() => toggle(item.id)}
                      >
                        {picked ? <Check aria-hidden /> : <Plus aria-hidden />}
                        {picked
                          ? t('bundle-in', { defaultValue: 'In bundle' })
                          : t('bundle-add', { defaultValue: 'Add to bundle' })}
                      </Button>
                      <Button
                        variant="default"
                        loading={buy.isPending && buy.variables?.id === item.id}
                        onClick={() => buy.mutate(item)}
                        aria-label={t('daily-buy-aria', {
                          defaultValue: 'Buy {{name}} for {{price}} coins',
                          name: item.name,
                          price: item.price,
                        })}
                      >
                        {t('daily-buy', { defaultValue: 'Buy' })}
                      </Button>
                    </>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {signedIn ? <LoadoutsSection onApplied={refreshOwnership} /> : null}
    </div>
  );
}

/** Isolated so its once-a-second tick re-renders nothing but this label. */
function Countdown({ to, onElapsed }: { to: string; onElapsed: () => void }) {
  const { t } = useTranslation('f-economy-plus');
  const end = new Date(to).getTime();
  const [left, setLeft] = useState(() => Math.max(0, end - Date.now()));
  const fired = useRef(false);
  const elapsed = useRef(onElapsed);
  useEffect(() => {
    elapsed.current = onElapsed;
  });

  useEffect(() => {
    fired.current = false;
    const tick = () => {
      const ms = Math.max(0, end - Date.now());
      setLeft(ms);
      if (ms === 0 && !fired.current) {
        fired.current = true;
        elapsed.current();
      }
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [end]);

  const total = Math.floor(left / 1000);
  const hh = String(Math.floor(total / 3600)).padStart(2, '0');
  const mm = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
  const ss = String(total % 60).padStart(2, '0');
  return (
    <p className="t-meta">
      {t('daily-rotates', { defaultValue: 'Rotates in' })}{' '}
      <time className="text-site-text" dateTime={`PT${total}S`}>{`${hh}:${mm}:${ss}`}</time>
    </p>
  );
}

function LoadoutsSection({ onApplied }: { onApplied: () => void }) {
  const { t } = useTranslation('f-economy-plus');
  const qc = useQueryClient();
  const [name, setName] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: LOADOUT_KEY,
    queryFn: () => apiJson<{ loadouts: LoadoutView[] }>('/api/shop/loadouts'),
    staleTime: 30_000,
  });

  const save = useMutation({
    mutationFn: () =>
      apiJson('/api/shop/loadouts', { method: 'POST', body: { name: name.trim() } }),
    onSuccess: () => {
      setName('');
      toast.success(t('lo-saved', { defaultValue: 'Loadout saved' }));
      void qc.invalidateQueries({ queryKey: LOADOUT_KEY });
    },
    onError: (err) => {
      const code = errorCode(err);
      toast.error(
        code === 'NOTHING_EQUIPPED'
          ? t('lo-err-empty', { defaultValue: 'Equip something first, then save your look.' })
          : code === 'TOO_MANY'
            ? t('lo-err-many', { defaultValue: 'You have reached the loadout limit.' })
            : t('lo-err-generic', { defaultValue: "Couldn't save that loadout" }),
      );
    },
  });

  const apply = useMutation({
    mutationFn: (id: string) =>
      apiJson<{ equipped: number; skipped: number }>(
        `/api/shop/loadouts/${encodeURIComponent(id)}/apply`,
        { method: 'POST' },
      ),
    onSuccess: (r) => {
      toast.success(
        r.skipped > 0
          ? t('lo-applied-skipped', {
              defaultValue: 'Loadout applied ({{skipped}} item(s) no longer owned were skipped)',
              skipped: r.skipped,
            })
          : t('lo-applied', { defaultValue: 'Loadout applied' }),
      );
      onApplied();
    },
    onError: (err) =>
      toast.error(
        errorCode(err) === 'NOTHING_OWNED'
          ? t('lo-err-nothing-owned', {
              defaultValue: 'You no longer own any item in that loadout.',
            })
          : t('lo-err-apply', { defaultValue: "Couldn't apply that loadout" }),
      ),
  });

  const remove = useMutation({
    mutationFn: (id: string) =>
      apiJson(`/api/shop/loadouts/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: LOADOUT_KEY }),
    onError: () =>
      toast.error(t('lo-err-delete', { defaultValue: "Couldn't delete that loadout" })),
  });

  const loadouts = data?.loadouts ?? [];

  return (
    <section aria-labelledby="loadouts-title" className="flex flex-col gap-4">
      <div>
        <h2 id="loadouts-title" className="t-heading">
          {t('lo-title', { defaultValue: 'Your loadouts' })}
        </h2>
        <p className="t-body mt-1 text-site-text-muted">
          {t('lo-lead', {
            defaultValue: 'Save the look you are wearing now, then switch back to it later.',
          })}
        </p>
      </div>

      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) save.mutate();
        }}
      >
        <Input
          value={name}
          onChange={(e) => setName(e.target.value.slice(0, 40))}
          placeholder={t('lo-name', { defaultValue: 'Name this loadout' })}
          aria-label={t('lo-name', { defaultValue: 'Name this loadout' })}
          className="min-w-48 flex-1"
        />
        <Button
          type="submit"
          variant="default"
          disabled={!name.trim() || loadouts.length >= LOADOUT_MAX_PRESETS}
          loading={save.isPending}
        >
          {t('lo-save', { defaultValue: 'Save current look' })}
        </Button>
      </form>

      {isLoading ? (
        <Skeleton className="h-16 w-full" />
      ) : loadouts.length === 0 ? (
        <EmptyState
          title={t('lo-empty-title', { defaultValue: 'No saved loadouts' })}
          description={t('lo-empty-text', {
            defaultValue: 'Equip cosmetics in the shop, then save them here.',
          })}
        />
      ) : (
        <ul className="border-t border-site-border">
          {loadouts.map((l) => (
            <li
              key={l.id}
              className="flex flex-wrap items-center gap-3 border-b border-site-border py-3"
            >
              <div className="min-w-40 flex-1">
                <p className="t-body flex items-center gap-2 font-medium text-site-text">
                  <span className="truncate">{l.name}</span>
                  {l.active ? (
                    <Badge variant="success">{t('lo-active', { defaultValue: 'Equipped' })}</Badge>
                  ) : null}
                </p>
                <p className="t-body truncate text-site-text-muted">
                  {l.items.map((i) => i.name).join(' · ')}
                </p>
              </div>
              <Button
                variant="default"
                disabled={l.active}
                loading={apply.isPending && apply.variables === l.id}
                onClick={() => apply.mutate(l.id)}
              >
                {t('lo-apply', { defaultValue: 'Apply' })}
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t('lo-delete-aria', {
                  defaultValue: 'Delete loadout {{name}}',
                  name: l.name,
                })}
                onClick={() => remove.mutate(l.id)}
                disabled={remove.isPending}
              >
                <Trash2 aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
