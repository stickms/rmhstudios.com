'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Palette, Plus } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ThemeEditor } from './ThemeEditor';
import type { ThemeTokens, UserThemeView } from '@/lib/themes/tokens';

function Swatch({ tokens }: { tokens: ThemeTokens }) {
  const colors = [tokens.bg, tokens.surface, tokens.accent, tokens.text];
  return (
    <span className="flex h-8 w-8 shrink-0 overflow-hidden rounded-site-sm border border-site-border">
      {colors.map((c, i) => (
        <span key={i} className="flex-1" style={{ backgroundColor: c }} />
      ))}
    </span>
  );
}

export function ThemeStudio({
  initialMine,
  initialShop,
  signedIn,
}: {
  initialMine: UserThemeView[];
  initialShop: UserThemeView[];
  signedIn: boolean;
}) {
  const { t } = useTranslation('theme-studio');
  const [mine, setMine] = useState(initialMine);
  const [shop, setShop] = useState(initialShop);
  const [editing, setEditing] = useState<UserThemeView | null | 'new'>(null);

  async function refreshMine() {
    const res = await fetch('/api/themes');
    if (res.ok) setMine(((await res.json()) as { themes: UserThemeView[] }).themes);
  }

  async function buy(theme: UserThemeView) {
    try {
      const res = await fetch(`/api/themes/${theme.id}/buy`, { method: 'POST' });
      if (!res.ok) {
        const d = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(d?.error);
      }
      setShop((prev) => prev.map((s) => (s.id === theme.id ? { ...s, owned: true, sales: s.sales + 1 } : s)));
      toast.success(t('bought', { defaultValue: 'Theme purchased — it is in your inventory' }));
    } catch (e) {
      toast.error(
        e instanceof Error && e.message === 'INSUFFICIENT_COINS'
          ? t('insufficient', { defaultValue: "You don't have enough coins" })
          : t('buy-error', { defaultValue: "Couldn't buy the theme" }),
      );
    }
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
    <div className="px-4 pt-4 pb-12 space-y-8">
      {signedIn ? (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-site-text">{t('my-themes', { defaultValue: 'My themes' })}</h2>
            <Button variant="accent" size="sm" onClick={() => setEditing('new')}>
              <Plus className="h-4 w-4" aria-hidden />
              {t('new-theme', { defaultValue: 'New theme' })}
            </Button>
          </div>
          {mine.length === 0 ? (
            <EmptyState icon={Palette} title={t('no-themes', { defaultValue: 'No themes yet' })} />
          ) : (
            <ul className="space-y-2">
              {mine.map((theme) => (
                <li key={theme.id}>
                  <Card interactive className="flex-row items-center gap-3 px-4 py-3">
                    <button type="button" onClick={() => setEditing(theme)} className="flex min-w-0 flex-1 items-center gap-3 text-start">
                      <Swatch tokens={theme.tokens} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-site-text">{theme.name}</span>
                        <span className="block text-xs text-site-text-muted">
                          {theme.status.toLowerCase()}
                          {theme.status === 'PUBLISHED' ? ` · ${theme.sales} ${t('sales', { defaultValue: 'sales' })}` : ''}
                        </span>
                      </span>
                    </button>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      <section>
        <h2 className="mb-3 text-sm font-semibold text-site-text">{t('community-themes', { defaultValue: 'Community themes' })}</h2>
        {shop.length === 0 ? (
          <EmptyState icon={Palette} title={t('shop-empty', { defaultValue: 'No themes for sale yet' })} />
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {shop.map((theme) => (
              <li key={theme.id}>
                <Card className={cn('flex-row items-center gap-3 px-4 py-3')}>
                  <Swatch tokens={theme.tokens} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-site-text">{theme.name}</span>
                    <span className="block truncate text-xs text-site-text-muted">
                      {theme.author?.name ?? theme.author?.handle} · {theme.sales} {t('sales', { defaultValue: 'sales' })}
                    </span>
                  </span>
                  {theme.owned ? (
                    <span className="text-xs text-site-success">{t('owned', { defaultValue: 'Owned' })}</span>
                  ) : (
                    <Button variant="outline" size="sm" onClick={() => buy(theme)} disabled={!signedIn}>
                      {theme.priceCoins}
                    </Button>
                  )}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
