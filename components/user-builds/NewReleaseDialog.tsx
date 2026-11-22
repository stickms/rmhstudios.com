/**
 * The New release dialog (s04-04): version, changelog (Write and Preview tabs) and an optional commit. Publish is the
 * dialog's one ink primary. The rules are the shared ones in `lib/builds/releases`; the server checks them again.
 */
import { useId, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Tabs } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/lib/toast';
import { api } from '@/lib/contract/client';
import { HttpError } from '@/lib/http';
import { CHANGELOG_MAX, VERSION_MAX, isValidCommitHash, isValidVersion, type ReleaseView } from '@/lib/builds/releases';
import { createReleaseApi } from '@/lib/builds/releases.contract';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  buildId: string;
  onCreated: (release: ReleaseView) => void;
}

export function NewReleaseDialog({ open, onOpenChange, buildId, onCreated }: Props) {
  const { t } = useTranslation('build-releases');
  const ids = useId();
  const [version, setVersion] = useState('');
  const [changelog, setChangelog] = useState('');
  const [commit, setCommit] = useState('');
  const [mode, setMode] = useState<'write' | 'preview'>('write');
  const [taken, setTaken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const trimmedVersion = version.trim();
  const trimmedCommit = commit.trim();
  const versionError = (() => {
    if (trimmedVersion === '') return null;
    if (!isValidVersion(trimmedVersion)) {
      return t('error-version', {
        defaultValue: 'Use letters, digits, dots, plus and hyphens, starting with a letter or digit.',
      });
    }
    if (taken === trimmedVersion) {
      return t('error-version-taken', { defaultValue: 'This build already has that version.' });
    }
    return null;
  })();
  const commitError =
    trimmedCommit !== '' && !isValidCommitHash(trimmedCommit)
      ? t('error-commit', { defaultValue: 'A commit is 7 to 40 hexadecimal characters.' })
      : null;
  const canPublish = trimmedVersion !== '' && !versionError && !commitError && !busy;

  const submit = async () => {
    if (!canPublish) return;
    setBusy(true);
    try {
      const { release } = await api(createReleaseApi, {
        params: { id: buildId },
        body: {
          version: trimmedVersion,
          ...(changelog.trim() ? { changelog } : {}),
          ...(trimmedCommit ? { commitHash: trimmedCommit } : {}),
        },
      });
      onCreated(release);
      setVersion('');
      setChangelog('');
      setCommit('');
      setMode('write');
      onOpenChange(false);
      toast.success(t('published', { version: release.version, defaultValue: 'Release {{version}} published.' }));
    } catch (e) {
      if (e instanceof HttpError && e.status === 409) setTaken(trimmedVersion);
      else if (e instanceof HttpError && e.status === 429) {
        toast.error(t('error-rate', { defaultValue: 'Too many releases this hour. Try again later.' }));
      } else toast.error(t('error-publish', { defaultValue: 'The release could not be published.' }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('dialog-title', { defaultValue: 'New release' })}</DialogTitle>
          <DialogDescription>
            {t('dialog-description', {
              defaultValue: 'Watchers and members who bought this build are told when it is public.',
            })}
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="space-y-1">
            <label htmlFor={`${ids}-version`} className="t-label block">
              {t('version', { defaultValue: 'Version' })}
            </label>
            <Input
              id={`${ids}-version`}
              value={version}
              maxLength={VERSION_MAX}
              autoComplete="off"
              placeholder="1.1"
              onChange={(e) => setVersion(e.target.value)}
              aria-required
              aria-invalid={versionError !== null}
              aria-describedby={versionError ? `${ids}-version-error` : undefined}
            />
            {versionError && (
              <p id={`${ids}-version-error`} role="alert" className="t-meta text-site-danger">
                {versionError}
              </p>
            )}
          </div>

          <div className="space-y-1">
            <label htmlFor={`${ids}-changelog`} className="t-label block">
              {t('changelog', { defaultValue: 'What changed' })}
            </label>
            <Tabs
              aria-label={t('changelog-mode', { defaultValue: 'Changelog view' })}
              sheet={false}
              value={mode}
              onChange={(v) => setMode(v === 'preview' ? 'preview' : 'write')}
              tabs={[
                { id: 'write', label: t('write', { defaultValue: 'Write' }) },
                { id: 'preview', label: t('preview', { defaultValue: 'Preview' }) },
              ]}
            />
            {mode === 'write' ? (
              <Textarea
                id={`${ids}-changelog`}
                value={changelog}
                rows={6}
                maxLength={CHANGELOG_MAX}
                onChange={(e) => setChangelog(e.target.value)}
                aria-describedby={`${ids}-changelog-hint`}
              />
            ) : (
              <div className="t-prose min-h-24 break-words border-b border-site-border py-2">
                {changelog.trim() ? (
                  <ReactMarkdown>{changelog}</ReactMarkdown>
                ) : (
                  <p className="t-body text-site-text-muted">
                    {t('preview-empty', { defaultValue: 'Nothing to preview yet.' })}
                  </p>
                )}
              </div>
            )}
            <p id={`${ids}-changelog-hint`} className="t-meta">
              {t('changelog-hint', {
                length: changelog.length,
                max: CHANGELOG_MAX,
                defaultValue: 'Markdown. {{length}} of {{max}}',
              })}
            </p>
          </div>

          <div className="space-y-1">
            <label htmlFor={`${ids}-commit`} className="t-label block">
              {t('commit', { defaultValue: 'Commit (optional)' })}
            </label>
            <Input
              id={`${ids}-commit`}
              value={commit}
              maxLength={40}
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => setCommit(e.target.value)}
              aria-invalid={commitError !== null}
              aria-describedby={commitError ? `${ids}-commit-error` : undefined}
            />
            {commitError && (
              <p id={`${ids}-commit-error`} role="alert" className="t-meta text-site-danger">
                {commitError}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="default" onClick={() => onOpenChange(false)}>
              {t('cancel', { defaultValue: 'Cancel' })}
            </Button>
            <Button type="submit" variant="primary" disabled={!canPublish} loading={busy}>
              {t('publish', { defaultValue: 'Publish' })}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
