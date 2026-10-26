/**
 * A single HUD, public page or share link: a read-only live preview you can
 * flip through every page of, what changed from the default, and the actions —
 * download, edit a copy, like.
 */
'use client';

import { Link, useNavigate } from '@tanstack/react-router';
import { Download, GitFork, Heart, Pencil } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import AppHeader from '@/components/shared/AppHeader';
import { useSession } from '@/components/Providers';
import { api, ApiError } from '@/lib/tf2-hud/api';
import type { HudDetail } from '@/lib/tf2-hud/api-types';
import { loadOverlay, type Progress } from '@/lib/tf2-hud/cloud';
import type { Overlay } from '@/lib/tf2-hud/project/types';
import { baseCache, useEditor } from '@/lib/tf2-hud/store';
import { buildHudZip } from '@/lib/tf2-hud/zip/build';
import { slugify } from '@/lib/tf2-hud/zip/export';
import Preview from './Preview';
import PreviewToolbar from './PreviewToolbar';
import { SceneProvider } from './scene-context';
import { Btn, Pill } from './ui';

export default function Tf2HudDetail({ slug, token }: { slug?: string; token?: string }) {
  const { t } = useTranslation('c-tf2-hud');
  const navigate = useNavigate();
  const { data: session } = useSession();
  const boot = useEditor((s) => s.boot);
  const loadProject = useEditor((s) => s.loadProject);
  const [detail, setDetail] = useState<HudDetail | null>(null);
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [liked, setLiked] = useState(false);
  const [likes, setLikes] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await boot();
        const d = token ? await api.getShared(token) : await api.get(slug!);
        if (cancelled) return;
        setDetail(d);
        setLiked(d.liked);
        setLikes(d.likeCount);
        const source = token ? { token } : { hud: d.id };
        const { overlay: o, meta } = await loadOverlay(
          d,
          source,
          (p) => !cancelled && setProgress(p),
        );
        if (cancelled) return;
        setOverlay(o);
        // The preview reads from the editor store; mount this HUD there read-only.
        loadProject({ meta, overlay: o });
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof ApiError && e.status === 404
              ? t('hud-not-found', {
                  defaultValue: 'That HUD could not be found, or you do not have access to it.',
                })
              : t('load-failed', {
                  defaultValue: 'Could not load the HUD. Check your connection and try again.',
                }),
          );
        }
      } finally {
        if (!cancelled) setProgress(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, token, boot, loadProject, t]);

  const changed = useMemo(() => detail?.manifest ?? [], [detail]);

  const download = async () => {
    if (!detail || !overlay) return;
    setBusy(true);
    try {
      const blob = await buildHudZip({
        meta: {
          name: detail.title,
          description: detail.description,
          author: detail.author?.name ?? '',
          tags: detail.tags,
        },
        overlay,
        base: baseCache,
        scope: 'full',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${slugify(detail.title)}.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      if (!token)
        void fetch(`/api/tf2-hud/huds/${detail.id}/download`, { method: 'POST' }).catch(
          () => undefined,
        );
    } catch {
      toast.error(
        t('export-failed', {
          defaultValue: 'Could not build the zip. Check your connection and try again.',
        }),
      );
    } finally {
      setBusy(false);
    }
  };

  const editCopy = () => {
    if (!detail || !overlay) return;
    loadProject({
      forkOfId: detail.id,
      meta: {
        name: `${detail.title} ${t('copy-suffix', { defaultValue: '(copy)' })}`.slice(0, 80),
        description: detail.description,
        author: '',
        tags: detail.tags,
      },
      overlay,
    });
    void navigate({ to: '/tf2-hud/editor', search: {} });
  };

  const toggleLike = async () => {
    if (!detail) return;
    if (!session) {
      toast.info(t('sign-in-like', { defaultValue: 'Sign in to like HUDs.' }));
      return;
    }
    try {
      const r = await api.like(detail.id);
      setLiked(r.liked);
      setLikes(r.likeCount);
    } catch {
      toast.error(t('like-failed', { defaultValue: 'Could not update your like.' }));
    }
  };

  if (error) {
    return (
      <div className="app-page flex min-h-dvh flex-col items-center justify-center gap-4 bg-(--app-bg) p-6 text-center text-(--app-text)">
        <p className="max-w-md text-sm text-(--app-text-muted)">{error}</p>
        <Link
          to="/tf2-hud/workshop"
          className="rounded-(--app-radius-sm) bg-(--app-accent) px-4 py-2 text-sm font-semibold text-(--app-accent-fg)"
        >
          {t('browse-workshop', { defaultValue: 'Browse the workshop' })}
        </Link>
      </div>
    );
  }

  return (
    <div
      data-jelly-scope="off"
      data-jelly="off"
      className="app-page min-h-dvh bg-(--app-bg) text-(--app-text)"
    >
      <AppHeader
        title={detail?.title ?? 'RMH TF2 HUD Editor'}
        backLabel={t('workshop', { defaultValue: 'HUD Workshop' })}
        backHref="/tf2-hud/workshop"
      />
      <main className="mx-auto w-full max-w-6xl px-4 pb-16">
        <div className="flex flex-wrap items-start justify-between gap-4 py-6">
          <div className="min-w-0">
            <h1 className="tf2hud-title text-4xl sm:text-5xl">{detail?.title ?? '…'}</h1>
            {detail ? (
              <p className="mt-1 text-sm text-(--app-text-muted)">
                {detail.author
                  ? t('by', { defaultValue: 'by {{name}}', name: detail.author.name })
                  : null}
                {detail.forkOf ? (
                  <>
                    {' · '}
                    {t('fork-of', { defaultValue: 'fork of {{title}}', title: '' })}
                    <Link
                      to="/tf2-hud/h/$slug"
                      params={{ slug: detail.forkOf.slug }}
                      className="underline"
                    >
                      {detail.forkOf.title}
                    </Link>
                  </>
                ) : null}
                {token ? (
                  <Pill className="ms-2" tone="info">
                    {t('shared-link', { defaultValue: 'Shared link' })}
                  </Pill>
                ) : null}
              </p>
            ) : null}
            {detail?.description ? (
              <p className="mt-3 max-w-2xl whitespace-pre-line text-sm text-(--app-text)">
                {detail.description}
              </p>
            ) : null}
            {detail?.tags.length ? (
              <ul className="mt-3 flex flex-wrap gap-1">
                {detail.tags.map((tag) => (
                  <li key={tag}>
                    <Pill>{tag}</Pill>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!token ? (
              <Btn
                icon={Heart}
                onClick={() => void toggleLike()}
                aria-pressed={liked}
                variant={liked ? 'primary' : 'secondary'}
              >
                {likes}
              </Btn>
            ) : null}
            {detail?.isOwner && !token ? (
              <Link
                to="/tf2-hud/editor"
                search={{ hud: detail.id }}
                className="inline-flex h-8 items-center gap-1.5 rounded-(--app-radius-sm) border border-(--app-border-bright) bg-(--app-bg-subtle) px-3 text-xs font-semibold hover:bg-(--app-surface-hover)"
              >
                <Pencil className="size-4" aria-hidden />
                {t('open-editor', { defaultValue: 'Open in editor' })}
              </Link>
            ) : null}
            <Btn icon={GitFork} disabled={!overlay} onClick={editCopy}>
              {t('edit-copy', { defaultValue: 'Edit a copy' })}
            </Btn>
            <Btn
              variant="primary"
              icon={Download}
              disabled={!overlay || busy}
              onClick={() => void download()}
            >
              {busy
                ? t('building', { defaultValue: 'Building…' })
                : t('download', { defaultValue: 'Download' })}
            </Btn>
          </div>
        </div>

        {progress ? (
          <p role="status" className="mb-3 text-xs text-(--app-text-muted)">
            {t('loading-hud', {
              defaultValue: 'Downloading files {{done}}/{{total}}…',
              done: progress.done,
              total: progress.total,
            })}
          </p>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
          <section
            aria-label={t('preview', { defaultValue: 'Preview' })}
            className="flex h-[min(70dvh,40rem)] min-h-96 flex-col overflow-hidden rounded-(--app-radius) border border-(--app-border)"
          >
            {overlay ? (
              <SceneProvider>
                <PreviewToolbar />
                <Preview readOnly />
              </SceneProvider>
            ) : (
              <div className="flex flex-1 items-center justify-center text-sm text-(--app-text-dim)">
                {t('loading', { defaultValue: 'Loading…' })}
              </div>
            )}
          </section>
          <aside aria-label={t('details', { defaultValue: 'Details' })} className="space-y-4">
            <div className="rounded-(--app-radius) border border-(--app-border) bg-(--app-bg-subtle) p-3 text-xs text-(--app-text-muted)">
              <dl className="space-y-1">
                <div className="flex justify-between">
                  <dt>{t('versions', { defaultValue: 'Version' })}</dt>
                  <dd>v{detail?.latestVersion ?? '–'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>{t('changed-files', { defaultValue: 'Changed files' })}</dt>
                  <dd>{changed.length}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>{t('forks', { defaultValue: 'Forks' })}</dt>
                  <dd>{detail?.forkCount ?? 0}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>{t('downloads', { defaultValue: 'Downloads' })}</dt>
                  <dd>{detail?.downloadCount ?? 0}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>{t('updated', { defaultValue: 'Updated' })}</dt>
                  <dd>{detail ? new Date(detail.updatedAt).toLocaleDateString() : '–'}</dd>
                </div>
              </dl>
            </div>
            <div className="rounded-(--app-radius) border border-(--app-border) bg-(--app-bg-subtle)">
              <h2 className="tf2hud-panel-head border-b border-(--app-border) px-3 py-2">
                {t('files-changed', { defaultValue: 'Files changed from default' })}
              </h2>
              <ul className="max-h-64 overflow-y-auto py-1">
                {changed.length === 0 ? (
                  <li className="px-3 py-3 text-xs text-(--app-text-dim)">
                    {t('no-changes-yet', {
                      defaultValue: 'No changes from the TF2 Default HUD yet.',
                    })}
                  </li>
                ) : (
                  changed.map((e) => (
                    <li
                      key={e.path}
                      className="flex items-center gap-2 px-3 py-0.5 font-mono text-[11px]"
                    >
                      <span
                        className={e.deleted ? 'tf2hud-badge-deleted' : 'tf2hud-badge-modified'}
                      >
                        {e.deleted ? 'D' : '•'}
                      </span>
                      <span className="truncate text-(--app-text-muted)">{e.path}</span>
                    </li>
                  ))
                )}
              </ul>
            </div>
            <p className="text-[11px] text-(--app-text-dim)">
              {t('license-note', {
                defaultValue:
                  'Downloads include the LICENSE that comes with the TF2 Default base HUD; see it for the terms that apply.',
              })}
            </p>
          </aside>
        </div>
      </main>
    </div>
  );
}
