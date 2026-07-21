'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Palette, Plus, Coins, Check, Sparkles, Eye } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { LiquidTabs } from '@/components/ui/liquid-tabs';
import { ViewTransitionLink } from '@/components/ui/ViewTransitionLink';
import { useThemeStore } from '@/stores/themeStore';
import { deriveAppliedTheme, type ThemeTokens, type UserThemeView } from '@/lib/themes/tokens';
import { ThemeEditor } from './ThemeEditor';
import { ThemeMiniShell } from './ThemeMiniShell';

function PriceChip({ coins }: { coins: number | null }) {
  if (coins == null) return null;
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-site-accent-dim px-2 py-0.5 text-xs font-semibold text-site-accent tabular-nums">
      <Coins className="h-3 w-3" aria-hidden />
      {coins}
    </span>
  );
}

export function ThemeStudio({
  initialMine,
  initialShop,
  initialOwned,
  signedIn,
  isMember,
}: {
  initialMine: UserThemeView[];
  initialShop: UserThemeView[];
  initialOwned: UserThemeView[];
  signedIn: boolean;
  isMember: boolean;
}) {
  const { t } = useTranslation('theme-studio');
  const [mine, setMine] = useState(initialMine);
  const [shop, setShop] = useState(initialShop);
  const [owned, setOwned] = useState(initialOwned);
  const [editing, setEditing] = useState<UserThemeView | null | 'new'>(null);
  const [sort, setSort] = useState<'top' | 'new'>('top');
  const [sorting, setSorting] = useState(false);

  const applied = useThemeStore((s) => s.userTheme);
  const setUserTheme = useThemeStore((s) => s.setUserTheme);
  const setUserThemePreview = useThemeStore((s) => s.setUserThemePreview);

  async function refreshMine() {
    const res = await fetch('/api/themes');
    if (res.ok) setMine(((await res.json()) as { themes: UserThemeView[] }).themes);
  }

  async function changeSort(next: 'top' | 'new') {
    setSort(next);
    setSorting(true);
    try {
      const res = await fetch(`/api/themes/shop?sort=${next}`);
      if (res.ok) setShop(((await res.json()) as { themes: UserThemeView[] }).themes);
    } finally {
      setSorting(false);
    }
  }

  async function buy(theme: UserThemeView) {
    try {
      const res = await fetch(`/api/themes/${theme.id}/buy`, { method: 'POST' });
      if (!res.ok) {
        const d = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(d?.error);
      }
      setShop((prev) => prev.map((s) => (s.id === theme.id ? { ...s, owned: true, sales: s.sales + 1 } : s)));
      setOwned((prev) => (prev.some((o) => o.id === theme.id) ? prev : [{ ...theme, owned: true }, ...prev]));
      toast.success(t('bought', { defaultValue: 'Theme purchased — it is in your inventory' }));
    } catch (e) {
      toast.error(
        e instanceof Error && e.message === 'INSUFFICIENT_COINS'
          ? t('insufficient', { defaultValue: "You don't have enough coins" })
          : t('buy-error', { defaultValue: "Couldn't buy the theme" }),
      );
    }
  }

  function apply(id: string, tokens: ThemeTokens) {
    setUserTheme(deriveAppliedTheme(id, tokens));
    toast.success(t('applied', { defaultValue: 'Theme applied' }));
  }

  function remove() {
    setUserTheme(null);
    toast.success(t('removed', { defaultValue: 'Reverted to your base theme' }));
  }

  function preview(theme: UserThemeView, purchasable: boolean) {
    const base = deriveAppliedTheme(theme.id, theme.tokens);
    setUserThemePreview({
      ...base,
      name: theme.name,
      priceCoins: theme.priceCoins,
      purchasable: purchasable && !theme.owned,
    });
  }

  if (editing !== null) {
    return (
      <div className="px-4 pt-4 pb-12">
        <ThemeEditor
          initial={editing === 'new' ? null : editing}
          onDone={() => {
            setEditing(null);
            void refreshMine();
          }}
        />
      </div>
    );
  }

  return (
    <div className="px-4 pt-4 pb-16 space-y-8">
      {/* ── Create: members only; non-members get an upsell (§14.2) ── */}
      {signedIn ? (
        <section>
          {isMember ? (
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-site-text">
                {t('my-themes', { defaultValue: 'My themes' })}
              </h2>
              <Button variant="accent" size="sm" onClick={() => setEditing('new')}>
                <Plus className="h-4 w-4" aria-hidden />
                {t('new-theme', { defaultValue: 'New theme' })}
              </Button>
            </div>
          ) : (
            <Card pane className="flex-row items-center gap-3 p-4">
              <Sparkles className="h-5 w-5 shrink-0 text-site-accent" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-site-text">
                  {t('member-gate-title', { defaultValue: 'Create & sell themes with a membership' })}
                </p>
                <p className="text-xs text-site-text-muted">
                  {t('member-gate-desc', {
                    defaultValue: 'Anyone can buy themes with coins — designing and selling them is a member perk.',
                  })}
                </p>
              </div>
              <Button asChild variant="accent" size="sm">
                <ViewTransitionLink to="/store">
                  {t('member-gate-cta', { defaultValue: 'Become a member' })}
                </ViewTransitionLink>
              </Button>
            </Card>
          )}

          {isMember ? (
            mine.length === 0 ? (
              <EmptyState icon={Palette} title={t('no-themes', { defaultValue: 'No themes yet' })} />
            ) : (
              <ul className="space-y-2">
                {mine.map((theme) => (
                  <li key={theme.id}>
                    <Card className="flex-row items-center gap-3 px-4 py-3">
                      <button
                        type="button"
                        onClick={() => setEditing(theme)}
                        className="flex min-w-0 flex-1 items-center gap-3 text-start"
                      >
                        <span className="w-24 shrink-0">
                          <ThemeMiniShell tokens={theme.tokens} size="sm" className="!h-14" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-site-text">{theme.name}</span>
                          <span className="block text-xs text-site-text-muted">
                            {theme.status.toLowerCase()}
                            {theme.status === 'PUBLISHED' ? ` · ${theme.sales} ${t('sales', { defaultValue: 'sales' })}` : ''}
                          </span>
                        </span>
                      </button>
                      <ApplyControl
                        active={applied?.id === theme.id}
                        onApply={() => apply(theme.id, theme.tokens)}
                        onRemove={remove}
                        t={t}
                      />
                    </Card>
                  </li>
                ))}
              </ul>
            )
          ) : null}
        </section>
      ) : null}

      {/* ── Owned inventory: Apply / Remove (§14.2) ── */}
      {signedIn && owned.length > 0 ? (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-site-text">
            {t('owned-themes', { defaultValue: 'Your inventory' })}
          </h2>
          <ul className="space-y-2">
            {owned.map((theme) => (
              <li key={theme.id}>
                <Card className="flex-row items-center gap-3 px-4 py-3">
                  <span className="w-24 shrink-0">
                    <ThemeMiniShell tokens={theme.tokens} size="sm" className="!h-14" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-site-text">{theme.name}</span>
                    <span className="block truncate text-xs text-site-text-muted">
                      {theme.author?.name ?? theme.author?.handle}
                    </span>
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => preview(theme, false)}>
                    <Eye className="h-4 w-4" aria-hidden />
                    {t('preview', { defaultValue: 'Preview' })}
                  </Button>
                  <ApplyControl
                    active={applied?.id === theme.id}
                    onApply={() => apply(theme.id, theme.tokens)}
                    onRemove={remove}
                    t={t}
                  />
                </Card>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* ── Marketplace browse ── */}
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-site-text">
            {t('community-themes', { defaultValue: 'Community themes' })}
          </h2>
          <LiquidTabs
            size="sm"
            aria-label={t('sort-label', { defaultValue: 'Sort themes' })}
            value={sort}
            onChange={(id) => void changeSort(id as 'top' | 'new')}
            tabs={[
              { id: 'top', label: t('sort-top', { defaultValue: 'Top' }) },
              { id: 'new', label: t('sort-new', { defaultValue: 'New' }) },
            ]}
          />
        </div>
        {shop.length === 0 ? (
          <EmptyState icon={Palette} title={t('shop-empty', { defaultValue: 'No themes for sale yet' })} />
        ) : (
          <ul className={cn('grid gap-3 sm:grid-cols-2 lg:grid-cols-3', sorting && 'opacity-60')}>
            {shop.map((theme) => (
              <li key={theme.id}>
                <Card interactive className="gap-3 p-3">
                  <ThemeMiniShell tokens={theme.tokens} size="sm" />
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-site-text">{theme.name}</span>
                      <span className="block truncate text-xs text-site-text-muted">
                        {theme.author?.name ?? theme.author?.handle} · {theme.sales} {t('sales', { defaultValue: 'sales' })}
                      </span>
                    </span>
                    <PriceChip coins={theme.priceCoins} />
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" onClick={() => preview(theme, true)} className="flex-1">
                      <Eye className="h-4 w-4" aria-hidden />
                      {t('preview', { defaultValue: 'Preview' })}
                    </Button>
                    {theme.owned ? (
                      <ApplyControl
                        active={applied?.id === theme.id}
                        onApply={() => apply(theme.id, theme.tokens)}
                        onRemove={remove}
                        t={t}
                      />
                    ) : (
                      <Button variant="accent" size="sm" onClick={() => buy(theme)} disabled={!signedIn} className="flex-1">
                        {t('buy-for', { defaultValue: 'Buy' })}
                      </Button>
                    )}
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ApplyControl({
  active,
  onApply,
  onRemove,
  t,
}: {
  active: boolean;
  onApply: () => void;
  onRemove: () => void;
  t: (key: string, opts?: { defaultValue: string }) => string;
}) {
  if (active) {
    return (
      <Button variant="outline" size="sm" onClick={onRemove}>
        <Check className="h-4 w-4 text-site-success" aria-hidden />
        {t('remove', { defaultValue: 'Remove' })}
      </Button>
    );
  }
  return (
    <Button variant="outline" size="sm" onClick={onApply}>
      {t('apply', { defaultValue: 'Apply' })}
    </Button>
  );
}
