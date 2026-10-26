/**
 * Landing: start a HUD (TF2 Default, a zip, a workshop HUD), reopen a local
 * draft, or head to your saved HUDs.
 */
'use client';

import { Link, useNavigate } from '@tanstack/react-router';
import { Boxes, FileArchive, FolderOpen, Globe, Layers, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import AppHeader from '@/components/shared/AppHeader';
import { deleteDraft, listDrafts, type DraftSummary } from '@/lib/tf2-hud/local-drafts';
import { useEditor } from '@/lib/tf2-hud/store';
import { ImportError } from '@/lib/tf2-hud/zip/import';
import Tf2Logo from './Tf2Logo';
import { Btn, IconBtn } from './ui';

export default function Tf2HudLanding() {
  const { t } = useTranslation('c-tf2-hud');
  const navigate = useNavigate();
  const newProject = useEditor((s) => s.newProject);
  const importZipFile = useEditor((s) => s.importZipFile);
  const [drafts, setDrafts] = useState<DraftSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const zip = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void listDrafts().then(setDrafts);
  }, []);

  const start = () => {
    newProject();
    void navigate({ to: '/tf2/hud-editor/editor', search: {} });
  };

  const importFile = async (file: File) => {
    setBusy(true);
    try {
      const r = await importZipFile(file);
      for (const w of r.warnings) toast.warning(w);
      void navigate({ to: '/tf2/hud-editor/editor', search: {} });
    } catch (e) {
      toast.error(
        e instanceof ImportError
          ? e.message
          : t('import-failed', { defaultValue: 'Could not read that zip.' }),
      );
    } finally {
      setBusy(false);
    }
  };

  const features = [
    {
      icon: Layers,
      title: t('f-preview', { defaultValue: 'Live in-game preview' }),
      body: t('f-preview-body', {
        defaultValue:
          'Every HUD page laid out with the engine’s own proportional rules, at any resolution, with adjustable health, ammo, class and round state.',
      }),
    },
    {
      icon: Boxes,
      title: t('f-files', { defaultValue: 'Real TF2 file structure' }),
      body: t('f-files-body', {
        defaultValue:
          'resource/, scripts/, materials/ and sound/ exactly as the game expects, a changed-files view and per-file diffs against the default HUD.',
      }),
    },
    {
      icon: FileArchive,
      title: t('f-zip', { defaultValue: 'Zip in, zip out' }),
      body: t('f-zip-body', {
        defaultValue: 'Import any HUD zip and download a ready-to-install folder for tf/custom.',
      }),
    },
    {
      icon: Globe,
      title: t('f-share', { defaultValue: 'Save, share, remix' }),
      body: t('f-share-body', {
        defaultValue:
          'Autosave to your account, version history, share links, and a workshop to fork other people’s HUDs.',
      }),
    },
  ];

  return (
    <div className="app-page min-h-dvh bg-(--app-bg) text-(--app-text)">
      <AppHeader
        title="RMH TF2 HUD Editor"
        backLabel={t('tf2-hub', { defaultValue: 'TF2 Hub' })}
        backHref="/tf2"
      />
      <main className="mx-auto w-full max-w-5xl px-4 pb-16">
        <section className="py-10 text-center sm:py-16">
          <Tf2Logo
            className="max-h-24 w-auto"
            label={t('game-name', { defaultValue: 'Team Fortress 2' })}
          />
          <h1 className="tf2hud-title text-5xl text-(--app-text) sm:text-7xl">
            {t('hero', { defaultValue: 'Build your TF2 HUD' })}
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-(--app-text-muted)">
            {t('hero-body', {
              defaultValue:
                'Edit, preview, test and share custom Team Fortress 2 HUDs without leaving your browser.',
            })}
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            <Btn size="md" variant="primary" onClick={start}>
              {t('start-default', { defaultValue: 'Start from TF2 Default' })}
            </Btn>
            <Btn
              size="md"
              variant="secondary"
              icon={FileArchive}
              disabled={busy}
              onClick={() => zip.current?.click()}
            >
              {busy
                ? t('importing', { defaultValue: 'Importing…' })
                : t('upload-zip', { defaultValue: 'Upload a zip' })}
            </Btn>
            <Link
              to="/tf2/workshop"
              search={{ type: 'huds' }}
              className="inline-flex h-10 items-center gap-1.5 rounded-(--app-radius-sm) border border-(--app-border-bright) bg-(--app-bg-subtle) px-4 text-sm font-semibold text-(--app-text) hover:bg-(--app-surface-hover)"
            >
              <Globe className="size-4" aria-hidden />
              {t('browse-workshop', { defaultValue: 'Browse the workshop' })}
            </Link>
          </div>
          <input
            ref={zip}
            type="file"
            accept=".zip,application/zip"
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void importFile(f);
            }}
          />
        </section>

        {drafts.length ? (
          <section className="mb-10" aria-labelledby="tf2hud-drafts">
            <div className="mb-2 flex items-center justify-between">
              <h2 id="tf2hud-drafts" className="tf2hud-panel-head">
                {t('drafts', { defaultValue: 'Continue editing' })}
              </h2>
              <Link
                to="/tf2/hud-editor/mine"
                className="text-xs font-semibold text-(--app-accent) hover:underline"
              >
                {t('my-saved-huds', { defaultValue: 'My saved HUDs' })}
              </Link>
            </div>
            <ul className="divide-y divide-(--app-border) rounded-(--app-radius) border border-(--app-border)">
              {drafts.slice(0, 6).map((d) => (
                <li key={d.id} className="flex items-center gap-3 px-3 py-2">
                  <FolderOpen className="size-4 shrink-0 text-(--app-text-dim)" aria-hidden />
                  <Link
                    to="/tf2/hud-editor/editor"
                    search={{ draft: d.id }}
                    className="min-w-0 flex-1 truncate text-sm font-medium text-(--app-text) hover:underline"
                  >
                    {d.meta.name}
                  </Link>
                  <span className="shrink-0 text-xs text-(--app-text-dim)">
                    {t('n-changed', { defaultValue: '{{count}} changed', count: d.fileCount })} ·{' '}
                    {new Date(d.updatedAt).toLocaleDateString()}
                  </span>
                  <IconBtn
                    icon={Trash2}
                    size="xs"
                    label={t('delete-draft', {
                      defaultValue: 'Delete draft {{name}}',
                      name: d.meta.name,
                    })}
                    onClick={() => {
                      void deleteDraft(d.id).then(() =>
                        setDrafts((cur) => cur.filter((x) => x.id !== d.id)),
                      );
                    }}
                  />
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section
          aria-label={t('features', { defaultValue: 'Features' })}
          className="grid gap-3 sm:grid-cols-2"
        >
          {features.map((f) => (
            <div
              key={f.title}
              className="rounded-(--app-radius) border border-(--app-border) bg-(--app-bg-subtle) p-4"
            >
              <f.icon className="mb-2 size-5 text-(--app-accent)" aria-hidden />
              <h3 className="tf2hud-title text-xl">{f.title}</h3>
              <p className="mt-1 text-sm text-(--app-text-muted)">{f.body}</p>
            </div>
          ))}
        </section>

        <p className="mt-10 text-center text-xs text-(--app-text-dim)">
          {t('legal', {
            defaultValue:
              'Team Fortress 2 is a trademark of Valve Corporation. This is an unofficial fan tool.',
          })}
        </p>
      </main>
    </div>
  );
}
