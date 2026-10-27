/**
 * A shared loadout: every slot read-only, with like, copy-link, and "edit a
 * copy" (which forks it into your account and opens it in the builder).
 */
'use client';

import { Link, useNavigate } from '@tanstack/react-router';
import { AlertTriangle, Copy, GitFork, Heart, Pencil } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import Tf2Header from '@/components/tf2-hud/Tf2Header';
import { SignInRequiredDialog } from '@/components/shared/SignInRequiredDialog';
import { useSession } from '@/components/Providers';
import { Btn, Pill } from '@/components/tf2-hud/ui';
import { useClipboard } from '@/hooks/useClipboard';
import { ApiError } from '@/lib/tf2-hud/api';
import { loadoutApi } from '@/lib/tf2-loadout/api';
import type { LoadoutDetail } from '@/lib/tf2-loadout/api-types';
import { cosmeticSlotKeys, TAUNT_KEYS, weaponSlotsFor } from '@/lib/tf2-loadout/catalog-types';
import { WEAR_NAMES } from '@/lib/tf2-loadout/fx';
import { kitOf } from '@/lib/tf2-loadout/warpaint';
import { loadoutWarnings } from '@/lib/tf2-loadout/rules';
import WarningList from './WarningList';
import { useCatalog } from '@/lib/tf2-loadout/use-catalog';
import ItemTile from './ItemTile';
import PlayerViewer from './PlayerViewer';
import { tauntEffectOf, tauntItemOf, wornItems } from './worn';
import { CLASS_DEFAULT } from './labels';

export default function Tf2LoadoutDetail({ slug }: { slug: string }) {
  const { t } = useTranslation('c-tf2-hud');
  const navigate = useNavigate();
  const { data: session } = useSession();
  const { copy } = useClipboard();
  const cat = useCatalog();
  const [detail, setDetail] = useState<LoadoutDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [liked, setLiked] = useState(false);
  const [likes, setLikes] = useState(0);
  const [busy, setBusy] = useState(false);
  const [signIn, setSignIn] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    loadoutApi
      .get(slug)
      .then((d) => {
        if (!alive) return;
        setDetail(d);
        setLiked(d.liked);
        setLikes(d.likeCount);
      })
      .catch((e) => {
        if (alive)
          setError(
            e instanceof ApiError && e.status === 404
              ? t('loadout-not-found', {
                  defaultValue: 'This loadout does not exist or is private.',
                })
              : t('loadout-load-failed', { defaultValue: 'Could not load this loadout.' }),
          );
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const needSignIn = (feature: string) => setSignIn(feature);

  const like = async () => {
    if (!detail) return;
    if (!session) return needSignIn(t('feature-like-loadout', { defaultValue: 'Like loadouts' }));
    try {
      const r = await loadoutApi.like(detail.id);
      setLiked(r.liked);
      setLikes(r.likeCount);
    } catch {
      toast.error(t('like-failed', { defaultValue: 'Could not update your like.' }));
    }
  };

  const fork = async () => {
    if (!detail) return;
    if (!session)
      return needSignIn(
        t('feature-copy-loadout', { defaultValue: 'Copy loadouts to your account' }),
      );
    setBusy(true);
    try {
      const copyOf = await loadoutApi.fork(detail.id);
      void navigate({ to: '/tf2/loadout', search: { id: copyOf.id } });
    } catch (e) {
      toast.error(
        e instanceof ApiError
          ? e.message
          : t('fork-failed', { defaultValue: 'Could not copy the loadout.' }),
      );
      setBusy(false);
    }
  };

  const idx = cat.status === 'ready' ? cat.index : null;
  const groups =
    detail && idx
      ? [
          {
            title: t('weapons', { defaultValue: 'Weapons' }),
            keys: weaponSlotsFor(idx.catalog, detail.tfClass) as string[],
          },
          {
            title: t('cosmetics', { defaultValue: 'Cosmetics' }),
            keys: cosmeticSlotKeys(detail.slots),
          },
          { title: t('taunts', { defaultValue: 'Taunts' }), keys: ['action', ...TAUNT_KEYS] },
        ]
      : [];

  const warnings = detail && idx ? loadoutWarnings(idx.catalog, detail.tfClass, detail.slots) : [];

  return (
    <div className="app-page min-h-dvh bg-(--app-bg) text-(--app-text)">
      <Tf2Header
        title={detail?.title ?? t('loadout', { defaultValue: 'Loadout' })}
        backLabel={t('workshop-back', { defaultValue: 'Workshop' })}
        backHref="/tf2/workshop?type=loadouts"
      />
      <main className="mx-auto w-full max-w-4xl space-y-6 px-4 py-8">
        {error ? (
          <p role="alert" className="py-12 text-center text-sm text-(--app-danger)">
            {error}
          </p>
        ) : !detail ? (
          <p role="status" className="py-12 text-center text-sm text-(--app-text-muted)">
            {t('loading', { defaultValue: 'Loading…' })}
          </p>
        ) : (
          <>
            <header className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="tf2hud-title text-4xl">{detail.title}</h2>
                <Pill tone="accent">
                  {t(`class-${detail.tfClass}`, { defaultValue: CLASS_DEFAULT[detail.tfClass] })}
                </Pill>
              </div>
              <p className="text-sm text-(--app-text-dim)">
                {detail.author
                  ? t('by', { defaultValue: 'by {{name}}', name: detail.author.name })
                  : null}
                {detail.forkOf ? (
                  <>
                    {' · '}
                    {t('fork-of-link', { defaultValue: 'fork of' })}{' '}
                    <Link
                      to="/tf2/loadout/l/$slug"
                      params={{ slug: detail.forkOf.slug }}
                      className="underline"
                    >
                      {detail.forkOf.title}
                    </Link>
                  </>
                ) : null}
              </p>
              {detail.description ? (
                <p className="max-w-prose text-sm text-(--app-text-muted)">{detail.description}</p>
              ) : null}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Btn size="md" icon={Heart} onClick={() => void like()} aria-pressed={liked}>
                  {liked
                    ? t('liked', { defaultValue: 'Liked' })
                    : t('like', { defaultValue: 'Like' })}{' '}
                  · {likes}
                </Btn>
                {detail.isOwner ? (
                  <Link
                    to="/tf2/loadout"
                    search={{ id: detail.id }}
                    className="inline-flex h-10 items-center gap-1.5 rounded-(--app-radius-sm) bg-(--app-accent) px-4 text-sm font-semibold text-(--app-accent-fg) hover:bg-(--app-accent-hover)"
                  >
                    <Pencil className="size-4" aria-hidden />
                    {t('edit', { defaultValue: 'Edit' })}
                  </Link>
                ) : (
                  <Btn
                    size="md"
                    variant="primary"
                    icon={GitFork}
                    disabled={busy}
                    onClick={() => void fork()}
                  >
                    {t('edit-copy', { defaultValue: 'Edit a copy' })}
                  </Btn>
                )}
                <Btn
                  size="md"
                  icon={Copy}
                  onClick={() =>
                    void copy(window.location.href).then(() =>
                      toast.success(t('link-copied', { defaultValue: 'Link copied.' })),
                    )
                  }
                >
                  {t('copy-link', { defaultValue: 'Copy link' })}
                </Btn>
              </div>
            </header>

            {idx ? (
              <PlayerViewer
                cls={detail.tfClass}
                worn={wornItems(idx, detail.tfClass, detail.slots, cosmeticSlotKeys(detail.slots))}
                taunt={tauntItemOf(detail.slots)}
                tauntEffect={tauntEffectOf(idx, detail.slots)}
              />
            ) : null}

            {warnings.length && idx ? (
              <div
                role="status"
                className="rounded-(--app-radius-sm) border border-(--app-warning)/50 bg-(--app-warning)/10 p-2.5"
              >
                <p className="flex items-center gap-1.5 text-xs font-semibold text-(--app-warning)">
                  <AlertTriangle className="size-4 shrink-0" aria-hidden />
                  {t('not-possible', { defaultValue: 'Not possible in the game' })}
                </p>
                <WarningList warnings={warnings} idx={idx} />
              </div>
            ) : null}

            {groups.map((g) => {
              const filled = g.keys.filter((k) => detail.slots[k]);
              if (filled.length === 0) return null;
              return (
                <section key={g.title} aria-label={g.title}>
                  <h3 className="tf2hud-panel-head mb-2">{g.title}</h3>
                  <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
                    {filled.map((k) => {
                      const e = detail.slots[k];
                      const item = idx!.item(e.item);
                      const effect = e.effect !== undefined ? idx!.effect(e.effect) : undefined;
                      const paint = e.paint !== undefined ? idx!.paint(e.paint) : undefined;
                      const style = item?.st?.find((x) => x.k === e.style)?.n;
                      const kitId = kitOf(item, e);
                      const kit =
                        kitId !== undefined || e.festive
                          ? [
                              kitId !== undefined
                                ? ((idx!.catalog.kits ?? []).find((x) => x.id === kitId)?.n ??
                                  `#${kitId}`)
                                : null,
                              e.wear ? WEAR_NAMES[e.wear - 1] : null,
                              e.festive ? t('festivized', { defaultValue: 'Festivized' }) : null,
                            ]
                              .filter(Boolean)
                              .join(' · ')
                          : undefined;
                      return (
                        <li key={k} className="flex min-w-0 flex-col gap-1">
                          {item ? (
                            <ItemTile item={item} paint={paint} />
                          ) : (
                            <span className="flex aspect-[5/4] items-center justify-center rounded-(--app-radius-sm) border-2 border-dashed border-(--app-border-bright) text-xs text-(--app-text-dim)">
                              #{e.item}
                            </span>
                          )}
                          <span className="truncate text-xs">
                            {item?.n ??
                              t('unknown-item', { defaultValue: 'Item no longer in the game' })}
                          </span>
                          {paint || effect || style || kit ? (
                            <span className="truncate text-[11px] text-(--app-text-dim)">
                              {[paint?.n, style, effect?.n, kit].filter(Boolean).join(' · ')}
                            </span>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </>
        )}
      </main>
      {signIn ? (
        <SignInRequiredDialog open onClose={() => setSignIn(null)} feature={signIn} />
      ) : null}
    </div>
  );
}
