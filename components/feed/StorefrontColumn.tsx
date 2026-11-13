import { useEffect, useState, useCallback, useRef, useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { Check, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { CoinAmount } from '@/components/shop/CoinAmount';
import { toast } from '@/lib/toast';
import { api } from '@/lib/contract/client';
import { HttpError, serverError } from '@/lib/http';
import {
  createStorefrontProductApi,
  deleteStorefrontProductApi,
  getStorefrontApi,
  updateStorefrontProductApi,
  buyStorefrontProductApi,
} from '@/lib/storefront/storefront.contract';
import { PageLayout } from './PageLayout';
import { UserAvatar } from './UserAvatar';

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
const EMPTY_FORM = { title: '', description: '', price: '', deliverable: '' };

/**
 * A creator's storefront, `/store/<userid>`: the things one person sells for coins.
 *
 * Anatomy: a titled page (the creator's name is the title, once), the seller as one row that
 * links to their profile, then the products as rows on rules: name and price on one line, the
 * description, what it has sold, the deliverable for whoever may see it, and the row's actions.
 * These products have no picture, so they are rows, not tiles. The owner's one primary is New
 * product, which opens a dialog; a visitor's Buy asks before it spends coins.
 */
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
  const confirm = useConfirm();
  const formId = useId();
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
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api(getStorefrontApi, { params: { userid }, retries: 0 });
      setCreator(data.creator);
      setProducts(data.products ?? []);
      setIsOwner(!!data.isOwner);
      setSignedIn(!!data.signedIn);
    } catch (e) {
      if (e instanceof HttpError && e.status === 404) setNotFound(true);
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
    if (busy !== null) return;
    setBusy('create');
    setError(null);
    try {
      await api(createStorefrontProductApi, {
        body: {
          title: form.title.trim(),
          description: form.description.trim() || undefined,
          price: parseInt(form.price, 10),
          deliverable: form.deliverable.trim() || undefined,
        },
      });
      setForm(EMPTY_FORM);
      setShowForm(false);
      await load();
    } catch (e) {
      setError(
        serverError(e) ??
          t('storefront-create-failed', {
            defaultValue: 'The product was not listed. Check the fields and try again.',
          }),
      );
    } finally {
      setBusy(null);
    }
  }

  async function buy(p: Product) {
    if (busy !== null) return;
    const ok = await confirm({
      title: t('storefront-buy-title', { title: p.title, defaultValue: 'Buy {{title}}?' }),
      description: t('storefront-buy-desc', {
        price: fmt(p.price),
        defaultValue: 'This spends {{price}} coins and shows you the deliverable.',
      }),
      confirmLabel: t('storefront-buy-confirm', {
        price: fmt(p.price),
        defaultValue: 'Buy for {{price}} coins',
      }),
    });
    if (!ok) return;
    setBusy(`buy:${p.id}`);
    try {
      await api(buyStorefrontProductApi, { params: { id: p.id } });
      toast.success(t('storefront-bought', { title: p.title, defaultValue: 'Bought {{title}}' }));
      await load();
    } catch (e) {
      toast.error(
        serverError(e) ?? t('storefront-buy-failed', { defaultValue: 'Purchase failed' }),
      );
    } finally {
      setBusy(null);
    }
  }

  async function toggleActive(p: Product) {
    if (busy !== null) return;
    setBusy(`tog:${p.id}`);
    try {
      await api(updateStorefrontProductApi, { params: { id: p.id }, body: { active: !p.active } });
      await load();
    } catch (e) {
      toast.error(
        serverError(e) ??
          t('storefront-update-failed', { defaultValue: 'That did not save. Try again.' }),
      );
    } finally {
      setBusy(null);
    }
  }

  async function remove(p: Product) {
    if (busy !== null) return;
    const ok = await confirm({
      title: t('storefront-delete-title', { title: p.title, defaultValue: 'Delete {{title}}?' }),
      description: t('storefront-delete-desc', {
        defaultValue:
          'It leaves your store, and people who bought it lose its deliverable. To keep their access, hide it instead.',
      }),
      confirmLabel: t('delete', { defaultValue: 'Delete' }),
      danger: true,
    });
    if (!ok) return;
    setBusy(`del:${p.id}`);
    try {
      await api(deleteStorefrontProductApi, { params: { id: p.id } });
      await load();
    } catch (e) {
      toast.error(
        serverError(e) ??
          t('storefront-delete-failed', { defaultValue: 'That was not deleted. Try again.' }),
      );
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <PageLayout title={t('storefront', { defaultValue: 'Storefront' })}>
        <div className="flex justify-center pt-4 pb-12">
          <Spinner />
        </div>
      </PageLayout>
    );
  }
  if (notFound || !creator) {
    return (
      <PageLayout title={t('storefront', { defaultValue: 'Storefront' })}>
        <EmptyState
          title={t('storefront-missing-title', { defaultValue: 'No store here' })}
          description={t('storefront-missing-desc', {
            defaultValue: 'This link does not match anyone. Check the name, or go to the store.',
          })}
          action={
            <Button asChild variant="default">
              <Link to="/store">{t('storefront-missing-action', { defaultValue: 'Go to the store' })}</Link>
            </Button>
          }
        />
      </PageLayout>
    );
  }

  const validForm = form.title.trim().length >= 2 && parseInt(form.price, 10) > 0;
  const creatorName = creator.name || creator.handle || t('creator', { defaultValue: 'Creator' });

  return (
    <PageLayout
      title={t('creators-store', { name: creatorName, defaultValue: "{{name}}'s store" })}
      description={t('storefront-lead', { defaultValue: 'Sold for coins. Buyers get the deliverable at once.' })}
      headerRight={
        isOwner ? (
          <Button variant="primary" onClick={() => setShowForm(true)}>
            <Plus aria-hidden />
            {t('new-product', { defaultValue: 'New product' })}
          </Button>
        ) : undefined
      }
    >
      <Link
        to="/u/$userid"
        params={{ userid: creator.handle ?? creator.id }}
        className="flex min-h-11 items-center gap-3 border-y border-site-border py-3"
      >
        <UserAvatar user={creator} linkToProfile={false} />
        <span className="min-w-0">
          <span className="t-body block truncate font-medium text-site-text">{creatorName}</span>
          {creator.handle ? (
            <span className="t-meta block truncate" dir="ltr">
              @{creator.handle}
            </span>
          ) : null}
        </span>
        <span className="t-body ms-auto shrink-0 text-site-text-muted">
          {t('storefront-view-profile', { defaultValue: 'View profile' })}
        </span>
      </Link>

      {products.length === 0 ? (
        <EmptyState
          className="pt-6"
          title={t('storefront-empty-title', { defaultValue: 'No products yet' })}
          description={
            isOwner
              ? t('storefront-empty-owner', {
                  defaultValue: 'List something you make: a file, a code, a link or a message.',
                })
              : t('no-products-visitor', { defaultValue: 'This creator has no products yet.' })
          }
        />
      ) : (
        <ul>
          {products.map((p) => (
            <li key={p.id} className="flex flex-col gap-2 border-b border-site-border py-4">
              <div className="flex items-start justify-between gap-3">
                <h2 className="t-body min-w-0 break-words font-medium text-site-text">{p.title}</h2>
                <CoinAmount amount={p.price} className="t-body text-site-text" />
              </div>
              {p.description ? (
                <p className="t-body text-site-text-muted">{p.description}</p>
              ) : null}
              <p className="t-meta flex flex-wrap items-center gap-2">
                <span>
                  {t('sold-count', {
                    count: p.salesCount,
                    formattedCount: fmt(p.salesCount),
                    defaultValue: '{{formattedCount}} sold',
                  })}
                </span>
                {!p.active ? (
                  <Badge>{t('storefront-hidden', { defaultValue: 'Hidden' })}</Badge>
                ) : null}
              </p>

              {p.deliverable ? (
                <div className="border-s-2 border-site-border ps-3">
                  <p className="t-label">{t('deliverable-label', { defaultValue: 'Deliverable' })}</p>
                  <p className="t-body whitespace-pre-wrap break-words text-site-text">
                    {p.deliverable}
                  </p>
                </div>
              ) : null}

              <div className="flex flex-wrap items-center gap-2 pt-1">
                {isOwner ? (
                  <>
                    <Button
                      variant="default"
                      disabled={busy !== null}
                      loading={busy === `tog:${p.id}`}
                      onClick={() => toggleActive(p)}
                    >
                      {p.active
                        ? t('hide', { defaultValue: 'Hide' })
                        : t('show', { defaultValue: 'Show' })}
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={busy !== null}
                      loading={busy === `del:${p.id}`}
                      onClick={() => remove(p)}
                    >
                      {t('delete', { defaultValue: 'Delete' })}
                    </Button>
                  </>
                ) : p.owned ? (
                  <p className="t-body inline-flex min-h-9 items-center gap-1 text-site-text">
                    <Check className="size-4" aria-hidden />
                    {t('purchased', { defaultValue: 'Purchased' })}
                  </p>
                ) : signedIn ? (
                  <Button
                    variant="default"
                    disabled={busy !== null}
                    loading={busy === `buy:${p.id}`}
                    onClick={() => buy(p)}
                  >
                    {t('buy', { defaultValue: 'Buy' })}
                  </Button>
                ) : (
                  <Button asChild variant="default">
                    <a href="/login">{t('sign-in-to-buy', { defaultValue: 'Sign in to buy' })}</a>
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={showForm}
        onOpenChange={(next) => {
          setShowForm(next);
          if (!next) setError(null);
        }}
      >
        <DialogContent mobileFullscreen className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('new-product', { defaultValue: 'New product' })}</DialogTitle>
            <DialogDescription>
              {t('storefront-form-desc', {
                defaultValue: 'Buyers pay in coins and see the deliverable as soon as they buy.',
              })}
            </DialogDescription>
          </DialogHeader>
          <form
            id={formId}
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (validForm) void create();
            }}
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${formId}-title`}>
                {t('storefront-field-title', { defaultValue: 'Name' })}
              </Label>
              <Input
                id={`${formId}-title`}
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                maxLength={80}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${formId}-price`}>
                {t('storefront-field-price', { defaultValue: 'Price in coins' })}
              </Label>
              <Input
                id={`${formId}-price`}
                type="number"
                inputMode="numeric"
                min={1}
                value={form.price}
                onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${formId}-description`}>
                {t('storefront-field-description', { defaultValue: 'Description (optional)' })}
              </Label>
              <Textarea
                id={`${formId}-description`}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                maxLength={500}
                rows={2}
                className="resize-none"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${formId}-deliverable`}>
                {t('storefront-field-deliverable', { defaultValue: 'Deliverable (optional)' })}
              </Label>
              <Textarea
                id={`${formId}-deliverable`}
                value={form.deliverable}
                onChange={(e) => setForm((f) => ({ ...f, deliverable: e.target.value }))}
                maxLength={2000}
                rows={2}
                className="resize-none"
                aria-describedby={`${formId}-deliverable-hint`}
              />
              <p id={`${formId}-deliverable-hint`} className="t-body text-site-text-muted">
                {t('storefront-field-deliverable-hint', {
                  defaultValue: 'A link, a code or a message. Only buyers see it.',
                })}
              </p>
            </div>
            {error ? (
              <p role="alert" className="t-body text-site-danger">
                {error}
              </p>
            ) : null}
          </form>
          <DialogFooter>
            <Button variant="default" onClick={() => setShowForm(false)}>
              {t('cancel', { defaultValue: 'Cancel' })}
            </Button>
            <Button
              type="submit"
              form={formId}
              variant="primary"
              disabled={!validForm}
              loading={busy === 'create'}
            >
              {t('list-product', { defaultValue: 'List product' })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageLayout>
  );
}
