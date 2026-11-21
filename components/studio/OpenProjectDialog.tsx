/**
 * Open… — the projects on this device and, for a signed-in member, on their account. Each row opens the project;
 * the trash button deletes it after a confirmation. Painted with `--app-*` tokens, like every Studio overlay.
 */
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Trash2, X } from 'lucide-react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
// The shared overlay owns the full-viewport layer (one audited place for iOS's edge contract).
import { DialogOverlay } from '@/components/ui/dialog';
import { appRoot } from '@/components/studio/app-root';
import { Tabs } from '@/components/ui/tabs';
import { useArrival } from '@/components/ui/arrive';
import { apiQuery } from '@/lib/contract/client';
import { formatRelativeTime } from '@/lib/i18n/relative-time';
import { listProjects } from '@/lib/studio/project-store';
import { formatProjectSize } from '@/lib/studio/project-session';
import { listCloudProjectsApi } from '@/lib/studio/projects.contract';
import type { ProjectMeta } from '@/lib/studio/types';
import type { OpenTab, ProjectSession } from '@/components/studio/useProjectSession';

const ROW =
  'flex min-h-11 w-full items-center gap-2 border-b border-app-border px-3 py-2 text-start text-sm hover:bg-app-surface-hover';

export function OpenProjectDialog({ session, tab }: { session: ProjectSession; tab: OpenTab }) {
  const { t, i18n } = useTranslation('studio-projects');
  const [active, setActive] = useState<OpenTab>(tab);
  const [local, setLocal] = useState<ProjectMeta[] | null>(null);
  const [localFailed, setLocalFailed] = useState(false);
  const signedIn = session.signedIn;

  const loadLocal = useCallback(async () => {
    setLocalFailed(false);
    try {
      setLocal(await listProjects());
    } catch {
      setLocal([]);
      setLocalFailed(true);
    }
  }, []);

  useEffect(() => {
    void loadLocal();
  }, [loadLocal]);

  const cloud = useQuery({ ...apiQuery(listCloudProjectsApi), enabled: signedIn });
  const localIds = new Set((local ?? []).map((p) => p.id));

  const close = () => session.setOpenDialog(null);
  const open = async (action: () => Promise<boolean>) => {
    if (await action()) close();
  };

  const localReady = local !== null;
  const localArrival = useArrival(localReady);
  const cloudArrival = useArrival(!cloud.isPending);

  const when = (at: string | number) => formatRelativeTime(at, i18n.language);

  return (
    <DialogPrimitive.Root open onOpenChange={(next) => !next && close()}>
      {/* Into the app root, where the --app-* tokens are defined (a body-level portal would lose them). */}
      <DialogPrimitive.Portal container={appRoot()}>
        <DialogOverlay
          className="app-overlay"
          style={{ background: 'var(--app-scrim)' }}
        />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="app-modal border border-app-border bg-app-surface text-app-text fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100dvh-1.5rem)] w-[calc(100dvw-1.5rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden outline-none"
          style={{ borderRadius: 'var(--app-radius-lg)' }}
        >
          <div className="flex shrink-0 items-center justify-between gap-2 px-4 pt-4">
            <DialogPrimitive.Title className="text-base font-semibold">
              {t('open-title', { defaultValue: 'Open project' })}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              aria-label={t('close', { defaultValue: 'Close' })}
              className="flex size-9 items-center justify-center rounded-app-sm text-app-text-muted hover:bg-app-surface-hover hover:text-app-text pointer-coarse:size-11"
            >
              <X className="size-4" aria-hidden />
            </DialogPrimitive.Close>
          </div>

          <Tabs
            size="sm"
            className="mx-4 mt-3"
            aria-label={t('open-source', { defaultValue: 'Where to open from' })}
            value={active}
            onChange={(id) => setActive(id as OpenTab)}
            tabs={[
              { id: 'device', label: t('tab-device', { defaultValue: 'This device' }) },
              { id: 'account', label: t('tab-account', { defaultValue: 'Your account' }) },
            ]}
          />

          <div className="min-h-0 flex-1 overflow-y-auto pb-2 pt-3">
            {active === 'device' ? (
              !localReady ? (
                <p className="px-4 py-6 text-sm text-app-text-muted">{t('loading', { defaultValue: 'Loading…' })}</p>
              ) : localFailed ? (
                <Retry message={t('device-failed', { defaultValue: 'Could not read the projects on this device.' })} onRetry={loadLocal} />
              ) : local.length === 0 ? (
                <p className="px-4 py-6 text-sm text-app-text-muted">
                  {t('device-empty', { defaultValue: 'No projects are saved on this device yet.' })}
                </p>
              ) : (
                <ul aria-label={t('device-list', { defaultValue: 'Projects on this device' })} className={localArrival}>
                  {local.map((project) => (
                    <li key={project.id} className="flex items-stretch">
                      <button type="button" className={ROW} onClick={() => open(() => session.openLocal(project.id))}>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{project.name}</span>
                          <span className="block text-xs text-app-text-muted">
                            {t('saved-when', { when: when(project.updatedAt), defaultValue: 'Saved {{when}}' })}
                          </span>
                        </span>
                      </button>
                      <RowDelete
                        label={t('delete-row', { name: project.name, defaultValue: 'Delete {{name}} from this device' })}
                        onDelete={async () => {
                          if (await session.deleteLocalById(project.id, project.name)) await loadLocal();
                        }}
                      />
                    </li>
                  ))}
                </ul>
              )
            ) : !signedIn ? (
              <p className="px-4 py-6 text-sm text-app-text-muted">
                <a href="/login?callbackURL=%2Fstudio" className="underline">
                  {t('account-sign-in', { defaultValue: 'Sign in' })}
                </a>{' '}
                {t('account-sign-in-rest', { defaultValue: 'to open projects from your account.' })}
              </p>
            ) : cloud.isPending ? (
              <p className="px-4 py-6 text-sm text-app-text-muted">{t('loading', { defaultValue: 'Loading…' })}</p>
            ) : cloud.isError ? (
              <Retry
                message={t('account-failed', { defaultValue: 'Could not load your account projects.' })}
                onRetry={() => void cloud.refetch()}
              />
            ) : cloud.data.projects.length === 0 ? (
              <p className="px-4 py-6 text-sm text-app-text-muted">
                {t('account-empty', { defaultValue: 'No projects are on your account yet. Use Save to account.' })}
              </p>
            ) : (
              <>
                <p className="px-4 pb-2 text-xs text-app-text-muted">
                  {t('account-count', {
                    count: cloud.data.projects.length,
                    max: cloud.data.limit,
                    defaultValue: '{{count}} of {{max}} projects',
                  })}
                </p>
                <ul aria-label={t('account-list', { defaultValue: 'Projects on your account' })} className={cloudArrival}>
                  {cloud.data.projects.map((project) => (
                    <li key={project.id} className="flex items-stretch">
                      <button type="button" className={ROW} onClick={() => open(() => session.openCloud(project.id))}>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{project.name}</span>
                          <span className="block text-xs text-app-text-muted">
                            {t('account-meta', {
                              when: when(project.updatedAt),
                              size: formatProjectSize(project.sizeBytes, i18n.language),
                              defaultValue: 'Saved {{when}} · {{size}}',
                            })}
                          </span>
                        </span>
                        {localIds.has(project.id) ? (
                          <span className="shrink-0 text-xs text-app-text-muted">
                            {t('on-device-too', { defaultValue: 'On this device too' })}
                          </span>
                        ) : null}
                      </button>
                      <RowDelete
                        label={t('delete-account-row', {
                          name: project.name,
                          defaultValue: 'Delete {{name}} from your account',
                        })}
                        onDelete={async () => {
                          await session.deleteCloudById(project.id, project.name);
                        }}
                      />
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function RowDelete({ label, onDelete }: { label: string; onDelete: () => Promise<void> }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={() => void onDelete()}
      className="flex w-11 shrink-0 items-center justify-center border-b border-app-border text-app-text-muted hover:bg-app-surface-hover hover:text-app-danger"
    >
      <Trash2 className="size-4" aria-hidden />
    </button>
  );
}

function Retry({ message, onRetry }: { message: string; onRetry: () => void | Promise<void> }) {
  const { t } = useTranslation('studio-projects');
  return (
    <div className="flex flex-col items-start gap-2 px-4 py-6 text-sm">
      <p className="text-app-text-muted">{message}</p>
      <button
        type="button"
        onClick={() => void onRetry()}
        className="min-h-9 rounded-app-sm border border-app-border px-3 text-sm hover:bg-app-surface-hover pointer-coarse:min-h-11"
      >
        {t('retry', { defaultValue: 'Try again' })}
      </button>
    </div>
  );
}
