import { useId, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { api, errorField } from '@/lib/contract/client';
import { toast } from '@/lib/toast';
import {
  ISSUE_BODY_MAX,
  ISSUE_PLATFORMS,
  ISSUE_STEPS_MAX,
  ISSUE_TITLE_MAX,
  type IssuePlatform,
  type IssueRefusal,
  type IssueView,
} from '@/lib/builds/issues';
import { createBuildIssueApi, editBuildIssueApi, listBuildIssuesApi } from '@/lib/builds/issues.contract';

/**
 * The report form, in a dialog: a title, what happened, the steps (optional), the release (the latest by default) and
 * the platform line from a short list. With `issue` it edits that open issue instead. No device data is collected.
 */
export function BuildIssueForm({
  open,
  onOpenChange,
  buildId,
  releases,
  issue,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  buildId: string;
  releases: { id: string; version: string }[];
  issue?: IssueView | undefined;
}) {
  const { t } = useTranslation('build-issues');
  const uid = useId();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(issue?.title ?? '');
  const [body, setBody] = useState(issue?.body ?? '');
  const [steps, setSteps] = useState(issue?.steps ?? '');
  const [versionId, setVersionId] = useState(issue?.version?.id ?? releases[0]?.id ?? '');
  const [platform, setPlatform] = useState<IssuePlatform>(issue?.platform ?? 'desktop');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const incomplete = title.trim() === '' || body.trim() === '';

  function platformLabel(p: IssuePlatform): string {
    switch (p) {
      case 'phone':
        return t('platform-phone', { defaultValue: 'Phone browser' });
      case 'tablet':
        return t('platform-tablet', { defaultValue: 'Tablet browser' });
      default:
        return t('platform-desktop', { defaultValue: 'Desktop browser' });
    }
  }

  function refusal(reason: IssueRefusal | undefined): string {
    switch (reason) {
      case 'blocked':
        return t('refused-blocked', { defaultValue: 'You cannot report issues on this build.' });
      case 'banned':
        return t('refused-banned', { defaultValue: 'You cannot report issues right now.' });
      case 'daily-cap':
        return t('refused-daily-cap', {
          defaultValue: 'You have reported the most issues allowed on this build today. Try again tomorrow.',
        });
      case 'closed':
        return t('refused-closed', { defaultValue: 'This issue is no longer open, so it cannot be edited.' });
      case 'invalid':
        return t('refused-invalid', { defaultValue: 'Check the fields and try again.' });
      default:
        return t('send-failed', { defaultValue: 'Could not save the issue.' });
    }
  }

  async function submit() {
    if (busy || incomplete) return;
    setBusy(true);
    setProblem(null);
    const fields = {
      title: title.trim(),
      body: body.trim(),
      steps: steps.trim(),
      platform,
      ...(versionId ? { versionId } : {}),
    };
    try {
      if (issue) await api(editBuildIssueApi, { params: { id: buildId, issueId: issue.id }, body: fields });
      else await api(createBuildIssueApi, { params: { id: buildId }, body: fields });
      toast.success(
        issue ? t('saved', { defaultValue: 'Issue updated' }) : t('sent', { defaultValue: 'Issue reported' }),
      );
      void queryClient.invalidateQueries({ queryKey: [listBuildIssuesApi.path] });
      onOpenChange(false);
    } catch (error) {
      setProblem(refusal(errorField<IssueRefusal>(error, 'reason')));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogTitle>
          {issue
            ? t('edit-title', { defaultValue: 'Edit issue' })
            : t('report-title', { defaultValue: 'Report an issue' })}
        </DialogTitle>
        <DialogDescription>
          {t('form-hint', {
            defaultValue:
              'Say what went wrong and how to make it happen again. The creator and other players can read it.',
          })}
        </DialogDescription>
        <div className="mt-3 flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${uid}-title`}>{t('field-title', { defaultValue: 'Title' })}</Label>
            <Input
              id={`${uid}-title`}
              dir="auto"
              maxLength={ISSUE_TITLE_MAX}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${uid}-body`}>{t('field-body', { defaultValue: 'What happened' })}</Label>
            <Textarea
              id={`${uid}-body`}
              dir="auto"
              rows={4}
              maxLength={ISSUE_BODY_MAX}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${uid}-steps`}>
              {t('field-steps', { defaultValue: 'Steps to reproduce (optional)' })}
            </Label>
            <Textarea
              id={`${uid}-steps`}
              dir="auto"
              rows={3}
              maxLength={ISSUE_STEPS_MAX}
              value={steps}
              onChange={(e) => setSteps(e.target.value)}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {releases.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${uid}-version`}>{t('field-version', { defaultValue: 'Version' })}</Label>
                <Select id={`${uid}-version`} value={versionId} onChange={(e) => setVersionId(e.target.value)}>
                  {releases.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.version}
                    </option>
                  ))}
                </Select>
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${uid}-platform`}>{t('field-platform', { defaultValue: 'Platform' })}</Label>
              <Select
                id={`${uid}-platform`}
                value={platform}
                onChange={(e) => setPlatform(e.target.value as IssuePlatform)}
              >
                {ISSUE_PLATFORMS.map((p) => (
                  <option key={p} value={p}>
                    {platformLabel(p)}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          {problem && (
            <p role="alert" className="t-body text-site-danger">
              {problem}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="default" onClick={() => onOpenChange(false)}>
              {t('cancel', { defaultValue: 'Cancel' })}
            </Button>
            <Button variant="primary" loading={busy} disabled={incomplete} onClick={() => void submit()}>
              {issue ? t('save', { defaultValue: 'Save changes' }) : t('send', { defaultValue: 'Report issue' })}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
