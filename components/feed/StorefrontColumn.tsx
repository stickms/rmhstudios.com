'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Store, Plus, Trash2, Check, ShoppingBag, X, EyeOff, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CoinIcon } from '@/components/rmhcoins/CoinIcon';
import { Spinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { UserAvatar } from './UserAvatar';
import { PinnedHero } from './PinnedHero';
import { ColumnHeader } from './ColumnHeader';
import { Reveal } from '@/components/motion';

interface Product {
  id: string;
  title: string;
  description: string | null;
  price: number;
  active: boolean;
  salesCount: number;
  owned: boolean;
  deliverable: string | null;
}

interface Creator {
  id: string;
  name: string | null;
  handle: string | null;
  image: string | null;
}

const fmt = (n: number) => n.toLocaleString();

export function StorefrontColumn({
  userid,
  initialData,
}: {
  userid: string;
  /** Storefront prefetched by the route loader; `null` when not prefetched/found. */
  initialData?: {
    creator: Creator;
    products: Product[];
    isOwner: boolean;
    signedIn: boolean;
  } | null;
}) {
  const { t } = useTranslation('feed');
  // Seed from the loader when provided so the storefront paints immediately and
  // the mount fetch is skipped. Mutations still fetch to refresh.
  const seeded = useRef(initialData !== undefined && initialData !== null);
  const [creator, setCreator] = useState<Creator | null>(initialData?.creator ?? null);
  const [products, setProducts] = useState<Product[]>(initialData?.products ?? []);
  const [isOwner, setIsOwner] = useState(!!initialData?.isOwner);
  const [signedIn, setSignedIn] = useState(!!initialData?.signedIn);
  const [loading, setLoading] = useState(!seeded.current);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', price: '', deliverable: '' });
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/storefront/creator/${encodeURIComponent(userid)}`, {
      credentials: 'include',
    });
    if (res.status === 404) {
      setNotFound(true);
      return;
    }
    if (res.ok) {
      const data = await res.json();
      setCreator(data.creator);
      setProducts(data.products ?? []);
      setIsOwner(!!data.isOwner);
      setSignedIn(!!data.signedIn);
    }
  }, [userid]);

  useEffect(() => {
    // The route loader already seeded the storefront (the column remounts per
    // userid via its `key`), so skip the mount fetch.
    if (seeded.current) return;
    let active = true;
    (async () => {
      try {
        await load();
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [load]);

  async function create() {
    setBusy('create');
    setError(null);
    try {
      const price = parseInt(form.price, 10);
      const res = await fetch('/api/storefront/products', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title.trim(),
          description: form.description.trim() || undefined,
          price,
          deliverable: form.deliverable.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? t('could-not-create', { defaultValue: 'Could not create' }));
        return;
      }
      setForm({ title: '', description: '', price: '', deliverable: '' });
      setShowForm(false);
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function buy(id: string) {
    setBusy(`buy:${id}`);
    try {
      const res = await fetch(`/api/storefront/products/${id}/buy`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data?.error) alert(data.error);
        return;
      }
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function toggleActive(p: Product) {
    setBusy(`tog:${p.id}`);
    try {
      const res = await fetch(`/api/storefront/products/${p.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !p.active }),
      });
      if (res.ok) await load();
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    setBusy(`del:${id}`);
    try {
      const res = await fetch(`/api/storefront/products/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (res.ok) await load();
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }
  if (notFound || !creator) {
    return (
      <EmptyState
        description={t('storefront-not-found', { defaultValue: 'Storefront not found.' })}
      />
    );
  }

  const validForm = form.title.trim().length >= 2 && parseInt(form.price, 10) > 0;

  return (
    <div className="min-h-screen">
      <PinnedHero
        screens={2}
        eyebrow={
          creator.handle
            ? `@${creator.handle}`
            : t('storefront-eyebrow', { defaultValue: 'Creator store' })
        }
        title={creator.name || t('creator', { defaultValue: 'Creator' })}
        subtitle={t('storefront-hero-sub', {
          defaultValue: 'Coin-purchasable drops, straight from the creator.',
        })}
        scrollCue={t('storefront-scroll-cue', { defaultValue: 'View products' })}
      />
      <ColumnHeader
        icon={Store}
        actions={
          isOwner && (
            <Button
              size="sm"
              variant="accent"
              className="gap-1"
              onClick={() => setShowForm((v) => !v)}
            >
              <Plus className="h-3.5 w-3.5" /> {t('new-product', { defaultValue: 'New product' })}
            </Button>
          )
        }
      >
        <h1 className="truncate text-lg font-bold text-site-text">
          {t('creators-store', {
            name: creator.name || creator.handle || 'Creator',
            defaultValue: "{{name}}'s store",
          })}
        </h1>
      </ColumnHeader>

      <div className="flex items-center gap-3 border-b border-site-border px-4 py-3">
        <UserAvatar user={creator} />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-site-text">
            {creator.name || 'Creator'}
          </p>
          {creator.handle && (
            <p className="truncate text-xs text-site-text-dim">@{creator.handle}</p>
          )}
        </div>
      </div>

      {showForm && (
        <div className="border-b border-site-border bg-site-surface/30 p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-site-text">
              {t('new-product', { defaultValue: 'New product' })}
            </h2>
            <button
              onClick={() => setShowForm(false)}
              className="text-site-text-dim hover:text-site-text"
              aria-label={t('close', { defaultValue: 'Close' })}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-3 space-y-2">
            <input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder={t('title-placeholder', { defaultValue: 'Title' })}
              maxLength={80}
              className="w-full rounded-site-sm border border-site-border bg-site-bg px-3 py-2 text-sm text-site-text outline-none focus:border-site-accent"
            />
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder={t('description-optional-placeholder', {
                defaultValue: 'Description (optional)',
              })}
              maxLength={500}
              rows={2}
              className="w-full resize-none rounded-site-sm border border-site-border bg-site-bg px-3 py-2 text-sm text-site-text outline-none focus:border-site-accent"
            />
            <input
              type="number"
              min={1}
              value={form.price}
              onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
              placeholder={t('price-coins-placeholder', { defaultValue: 'Price (coins)' })}
              className="w-full rounded-site-sm border border-site-border bg-site-bg px-3 py-2 text-sm text-site-text outline-none focus:border-site-accent"
            />
            <textarea
              value={form.deliverable}
              onChange={(e) => setForm((f) => ({ ...f, deliverable: e.target.value }))}
              placeholder={t('deliverable-placeholder', {
                defaultValue: 'Deliverable — link, code, or message revealed to buyers (optional)',
              })}
              maxLength={2000}
              rows={2}
              className="w-full resize-none rounded-site-sm border border-site-border bg-site-bg px-3 py-2 text-sm text-site-text outline-none focus:border-site-accent"
            />
            {error && <p className="text-xs text-site-danger">{error}</p>}
            <div className="flex justify-end">
              <Button
                size="sm"
                variant="accent"
                disabled={!validForm || busy === 'create'}
                onClick={create}
              >
                {busy === 'create' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  t('list-product', { defaultValue: 'List product' })
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      <Reveal className="space-y-2 p-4">
        {products.length === 0 ? (
          <EmptyState
            description={
              isOwner
                ? t('no-products-owner', { defaultValue: 'No products yet — list your first one!' })
                : t('no-products-visitor', { defaultValue: 'This creator has no products yet.' })
            }
          />
        ) : (
          products.map((p) => (
            <div
              key={p.id}
              className={`rounded-site border p-4 ${p.active ? 'border-site-border bg-site-surface' : 'border-site-border/60 bg-site-bg opacity-70'}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-site-text">{p.title}</p>
                  {p.description && (
                    <p className="mt-0.5 text-sm text-site-text-muted">{p.description}</p>
                  )}
                  <p className="mt-1 text-[11px] text-site-text-dim">
                    {t('sold-count', {
                      count: p.salesCount,
                      formattedCount: fmt(p.salesCount),
                      defaultValue: '{{formattedCount}} sold',
                    })}
                    {!p.active ? t('hidden-suffix', { defaultValue: ' · hidden' }) : ''}
                  </p>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1 text-sm font-bold text-site-text">
                  <CoinIcon className="h-4 w-4" /> {fmt(p.price)}
                </span>
              </div>

              {p.deliverable && (
                <div className="mt-2 rounded-site-sm border border-site-accent/30 bg-site-accent/5 p-2 text-sm text-site-text">
                  <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-site-accent">
                    {t('deliverable-label', { defaultValue: 'Deliverable' })}
                  </p>
                  <p className="whitespace-pre-wrap break-words">{p.deliverable}</p>
                </div>
              )}

              <div className="mt-3 flex items-center gap-2">
                {isOwner ? (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy === `tog:${p.id}`}
                      onClick={() => toggleActive(p)}
                      className="gap-1"
                    >
                      {p.active ? (
                        <EyeOff className="h-3.5 w-3.5" />
                      ) : (
                        <Eye className="h-3.5 w-3.5" />
                      )}
                      {p.active
                        ? t('hide', { defaultValue: 'Hide' })
                        : t('show', { defaultValue: 'Show' })}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy === `del:${p.id}`}
                      onClick={() => remove(p.id)}
                      className="gap-1 text-site-text-muted hover:text-site-danger"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> {t('delete', { defaultValue: 'Delete' })}
                    </Button>
                  </>
                ) : p.owned ? (
                  <span className="inline-flex items-center gap-1 text-sm font-semibold text-site-accent">
                    <Check className="h-4 w-4" /> {t('purchased', { defaultValue: 'Purchased' })}
                  </span>
                ) : (
                  <Button
                    size="sm"
                    variant="accent"
                    disabled={!signedIn || busy === `buy:${p.id}`}
                    onClick={() => buy(p.id)}
                    className="gap-1"
                  >
                    {busy === `buy:${p.id}` ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <ShoppingBag className="h-3.5 w-3.5" />
                    )}
                    {signedIn
                      ? t('buy', { defaultValue: 'Buy' })
                      : t('sign-in-to-buy', { defaultValue: 'Sign in to buy' })}
                  </Button>
                )}
              </div>
            </div>
          ))
        )}
      </Reveal>
    </div>
  );
}
