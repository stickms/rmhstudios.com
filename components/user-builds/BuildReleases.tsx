/**
 * The Releases section of a build page (s04-04): the latest release expanded, the earlier ones behind a disclosure,
 * and, for the build's owner, New release and a delete on every row. The list is the page's own data (the latest 20
 * releases, read with the build) and follows what the owner publishes or deletes here; nothing is fetched on load.
 */
import { useId, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { ARRIVE, useArrivingKeys } from '@/components/ui/arrive';
import { toast } from '@/lib/toast';
import { api } from '@/lib/contract/client';
import { cn } from '@/lib/utils';
import { commitLink, shortCommit, sortReleases, splitReleases, type ReleaseView } from '@/lib/builds/releases';
import { deleteReleaseApi } from '@/lib/builds/releases.contract';
import { NewReleaseDialog } from './NewReleaseDialog';

interface Props {
  buildId: string;
  /** The build's repository, so a GitHub commit becomes a link. */
  repoUrl: string | null | undefined;
  isOwner: boolean;
  /** The releases the page loaded, in any order. */
  initialReleases: ReleaseView[];
}

export function BuildReleases({ buildId, repoUrl, isOwner, initialReleases }: Props) {
  const { t, i18n } = useTranslation('build-releases');
  const confirm = useConfirm();
  const listId = useId();
  const [releases, setReleases] = useState(() => sortReleases(initialReleases));
  const [showEarlier, setShowEarlier] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const arrived = useArrivingKeys(releases.map((r) => r.id));

  // Nobody but the owner has anything to do in an empty section.
  if (releases.length === 0 && !isOwner) return null;

  const date = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'long' });
  const { latest, earlier } = splitReleases(releases);

  const askDelete = async (release: ReleaseView) => {
    const ok = await confirm({
      title: t('delete-title', { version: release.version, defaultValue: 'Delete {{version}}?' }),
      description: t('delete-body', {
        defaultValue: 'The release leaves this page. Nobody is notified, and publishing the same version again does not notify either.',
      }),
      confirmLabel: t('delete', { defaultValue: 'Delete' }),
      danger: true,
    });
    if (!ok) return;
    try {
      await api(deleteReleaseApi, { params: { id: buildId, releaseId: release.id } });
      setReleases((prev) => prev.filter((r) => r.id !== release.id));
      toast.success(t('deleted', { defaultValue: 'Release deleted.' }));
    } catch {
      toast.error(t('delete-failed', { defaultValue: 'The release could not be deleted.' }));
    }
  };

  const row = (release: ReleaseView, isLatest: boolean) => {
    const link = commitLink(repoUrl, release.commitHash);
    return (
      <li
        key={release.id}
        className={cn('border-b border-site-border py-4', arrived(release.id) && ARRIVE)}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="t-heading flex flex-wrap items-baseline gap-x-2">
              <span className="break-all">{release.version}</span>
              {isLatest && <span className="t-label">{t('latest', { defaultValue: 'Latest' })}</span>}
            </h3>
            <p className="t-meta mt-1">
              <time dateTime={release.createdAt}>{date.format(new Date(release.createdAt))}</time>
              {release.commitHash &&
                (link ? (
                  <>
                    {' · '}
                    <a href={link} target="_blank" rel="noopener noreferrer" className="underline">
                      {shortCommit(release.commitHash)}
                    </a>
                  </>
                ) : (
                  <> · {shortCommit(release.commitHash)}</>
                ))}
            </p>
          </div>
          {isOwner && (
            <IconButton
              icon={Trash2}
              variant="ghost"
              label={t('delete-release', { version: release.version, defaultValue: 'Delete release {{version}}' })}
              onClick={() => void askDelete(release)}
            />
          )}
        </div>
        {release.changelog && (
          <div className="t-prose mt-3 break-words">
            <ReactMarkdown>{release.changelog}</ReactMarkdown>
          </div>
        )}
      </li>
    );
  };

  return (
    <section id="releases" aria-labelledby={`${listId}-title`} className="scroll-mt-4">
      <div className="flex items-center justify-between gap-3 border-b border-site-border pb-3">
        <h2 id={`${listId}-title`} className="t-heading">
          {t('title', { defaultValue: 'Releases' })}
        </h2>
        {isOwner && (
          <Button variant="default" size="sm" onClick={() => setDialogOpen(true)}>
            <Plus aria-hidden />
            {t('new-release', { defaultValue: 'New release' })}
          </Button>
        )}
      </div>

      {latest ? (
        <ul>{row(latest, true)}</ul>
      ) : (
        <p className="t-body py-4 text-site-text-muted">
          {t('empty', { defaultValue: 'No releases yet. Publish one to tell the people who watch or bought this build.' })}
        </p>
      )}

      {earlier.length > 0 && (
        <div className="pt-3">
          <Button
            variant="ghost"
            size="sm"
            aria-expanded={showEarlier}
            aria-controls={`${listId}-earlier`}
            onClick={() => setShowEarlier((v) => !v)}
          >
            {showEarlier
              ? t('hide-earlier', { n: earlier.length, defaultValue: 'Hide earlier releases ({{n}})' })
              : t('earlier', { n: earlier.length, defaultValue: 'Earlier releases ({{n}})' })}
          </Button>
          <ul id={`${listId}-earlier`} hidden={!showEarlier}>
            {showEarlier && earlier.map((r) => row(r, false))}
          </ul>
        </div>
      )}

      {isOwner && (
        <NewReleaseDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          buildId={buildId}
          onCreated={(release) => setReleases((prev) => sortReleases([release, ...prev]))}
        />
      )}
    </section>
  );
}
