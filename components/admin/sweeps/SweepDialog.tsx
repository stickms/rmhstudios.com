import { useId, useState, type FormEvent } from 'react';
import { Link } from '@tanstack/react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
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
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';
import { api } from '@/lib/contract/client';
import { toast } from '@/lib/toast';
import { confirmSweepApi, listSweepsApi, previewSweepApi } from '@/lib/admin/sweeps.contract';
import { SWEEP_REASON_MAX, SWEEP_REASON_MIN, type SweepPreview, type SweepView } from '@/lib/admin/sweeps';
import { sweepRefusalText } from '@/components/admin/sweeps/sweep-refusal';

/** The windows the form offers, in hours. A sweep is at most 30 days. */
const WINDOW_HOURS = { '1h': 1, '24h': 24, '7d': 168, '30d': 720 } as const;
type WindowKey = keyof typeof WINDOW_HOURS;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subjectId: string;
  /** Already known to the caller (a handle or name); shown in the title. */
  subjectLabel: string;
}

function SweepForm({
  subjectId,
  subjectLabel,
  onClose,
}: {
  subjectId: string;
  subjectLabel: string;
  onClose: () => void;
}) {
  const { t } = useTranslation('admin-spam-sweep');
  const fmt = useLocaleFormat();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const ids = useId();
  const [windowKey, setWindowKey] = useState<WindowKey>('24h');
  const [posts, setPosts] = useState(true);
  const [replies, setReplies] = useState(true);
  const [reason, setReason] = useState('');
  const [strike, setStrike] = useState(false);
  const [result, setResult] = useState<{ sweep: SweepView; preview: SweepPreview } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const preview = useMutation({
    mutationFn: () => {
      const to = new Date();
      const from = new Date(to.getTime() - WINDOW_HOURS[windowKey] * 3_600_000);
      return api(previewSweepApi, {
        body: {
          subjectId,
          from: from.toISOString(),
          to: to.toISOString(),
          includePosts: posts,
          includeReplies: replies,
          reason: reason.trim(),
          strike,
        },
      });
    },
    onSuccess: (data) => {
      setError(null);
      setResult(data);
    },
    onError: (e) => setError(sweepRefusalText(t, e)),
  });

  const start = useMutation({
    mutationFn: (id: string) => api(confirmSweepApi, { params: { id } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [listSweepsApi.path] });
      toast.success(t('started', { defaultValue: 'The sweep is running. Follow it under Spam sweeps.' }));
      onClose();
    },
    onError: (e) => setError(sweepRefusalText(t, e)),
  });

  const reasonOk = reason.trim().length >= SWEEP_REASON_MIN && reason.trim().length <= SWEEP_REASON_MAX;
  const canPreview = reasonOk && (posts || replies) && !preview.isPending;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (canPreview) preview.mutate();
  };

  const confirmStart = async () => {
    if (!result) return;
    const { preview: p, sweep } = result;
    const age = p.account.old
      ? t('confirm-old-account', {
          days: fmt.number(p.account.ageDays),
          defaultValue: 'This account is {{days}} days old.',
        })
      : '';
    const ok = await confirm({
      title: t('confirm-title', {
        number: fmt.number(p.total),
        defaultValue: 'Remove {{number}} items?',
      }),
      description: [
        t('confirm-body', {
          defaultValue: 'They disappear from every feed and the member gets one notice. You can undo the sweep.',
        }),
        age,
      ]
        .filter(Boolean)
        .join(' '),
      confirmLabel: t('confirm-action', { defaultValue: 'Remove content' }),
      cancelLabel: t('cancel', { defaultValue: 'Cancel' }),
      danger: true,
    });
    if (ok) start.mutate(sweep.id);
  };

  if (result) {
    const p = result.preview;
    return (
      <div className="grid gap-5">
        <DialogHeader>
          <DialogTitle>{t('preview-title', { defaultValue: 'Preview' })}</DialogTitle>
          <DialogDescription>
            {t('preview-counts', {
              posts: fmt.number(p.posts),
              replies: fmt.number(p.replies),
              defaultValue: '{{posts}} posts and {{replies}} replies in the window.',
            })}
          </DialogDescription>
        </DialogHeader>
        {p.overLimit ? (
          <p role="alert" className="t-body text-site-danger">
            {t('preview-over-limit', {
              defaultValue: 'The window holds more than 5,000 items, so it cannot be started. Choose a shorter window.',
            })}
          </p>
        ) : null}
        <dl className="grid gap-1 border-y border-site-border py-3">
          <div className="flex justify-between gap-4">
            <dt className="t-label">{t('account-age', { defaultValue: 'Account age' })}</dt>
            <dd className="t-meta">
              {t('account-age-days', { days: fmt.number(p.account.ageDays), defaultValue: '{{days}} days' })}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="t-label">{t('account-strikes', { defaultValue: 'Earlier strikes' })}</dt>
            <dd className="t-meta">
              {t('account-strikes-value', {
                total: fmt.number(p.account.strikes),
                active: fmt.number(p.account.activeStrikes),
                defaultValue: '{{total}} ({{active}} active)',
              })}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="t-label">{t('account-engaged', { defaultValue: 'With replies or likes from others' })}</dt>
            <dd className="t-meta">{fmt.number(p.engaged)}</dd>
          </div>
        </dl>
        {p.sample.length > 0 ? (
          <div>
            <p className="t-label">{t('sample-title', { defaultValue: 'Newest items' })}</p>
            <ul className="mt-2 border-t border-site-border">
              {p.sample.map((item) => (
                <li key={`${item.entityType}-${item.id}`} className="border-b border-site-border py-2">
                  <p className="t-body break-words">
                    {item.excerpt || t('sample-empty', { defaultValue: '(no text)' })}
                  </p>
                  <p className="t-meta">
                    {item.entityType === 'rmhark'
                      ? t('sample-post', { defaultValue: 'Post' })
                      : t('sample-reply', { defaultValue: 'Reply' })}{' '}
                    · {fmt.dateTime(item.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <p className="t-meta">
          {t('ban-hint', { defaultValue: 'A sweep never bans the account.' })}{' '}
          <Link to="/admin/users" search={{ q: p.account.handle ?? subjectLabel }} className="underline">
            {t('ban-link', { defaultValue: 'Suspend the account separately' })}
          </Link>
        </p>
        {error ? (
          <p role="alert" className="t-body text-site-danger">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="default" onClick={() => setResult(null)}>
            {t('back', { defaultValue: 'Back' })}
          </Button>
          <Button
            type="button"
            variant="primary"
            disabled={p.overLimit || p.total === 0 || start.isPending}
            onClick={() => void confirmStart()}
          >
            {t('start-action', { number: fmt.number(p.total), defaultValue: 'Remove {{number}} items' })}
          </Button>
        </DialogFooter>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="grid gap-5">
      <DialogHeader>
        <DialogTitle>
          {t('dialog-title', { name: subjectLabel, defaultValue: 'Sweep content of {{name}}' })}
        </DialogTitle>
        <DialogDescription>
          {t('dialog-description', {
            defaultValue:
              "Remove this account's recent posts and replies in one step. Nothing changes until you confirm.",
          })}
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-2">
        <Label htmlFor={`${ids}-window`}>{t('window-label', { defaultValue: 'Window' })}</Label>
        <Select id={`${ids}-window`} value={windowKey} onChange={(e) => setWindowKey(e.target.value as WindowKey)}>
          <option value="1h">{t('window-1h', { defaultValue: 'Last hour' })}</option>
          <option value="24h">{t('window-24h', { defaultValue: 'Last 24 hours' })}</option>
          <option value="7d">{t('window-7d', { defaultValue: 'Last 7 days' })}</option>
          <option value="30d">{t('window-30d', { defaultValue: 'Last 30 days' })}</option>
        </Select>
      </div>
      <div className="flex items-center justify-between gap-4">
        <Label htmlFor={`${ids}-posts`}>{t('kind-posts', { defaultValue: 'Posts' })}</Label>
        <Switch id={`${ids}-posts`} checked={posts} onCheckedChange={setPosts} />
      </div>
      <div className="flex items-center justify-between gap-4">
        <Label htmlFor={`${ids}-replies`}>{t('kind-replies', { defaultValue: 'Replies' })}</Label>
        <Switch id={`${ids}-replies`} checked={replies} onCheckedChange={setReplies} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${ids}-reason`}>
          {t('reason-label', { defaultValue: 'Reason (the member can read it)' })}
        </Label>
        <Textarea
          id={`${ids}-reason`}
          value={reason}
          rows={3}
          maxLength={SWEEP_REASON_MAX}
          onChange={(e) => setReason(e.target.value)}
        />
        <p className="t-meta">
          {t('reason-hint', { min: SWEEP_REASON_MIN, defaultValue: 'At least {{min}} characters.' })}
        </p>
      </div>
      <div className="flex items-center justify-between gap-4">
        <Label htmlFor={`${ids}-strike`}>{t('strike-label', { defaultValue: 'Add a strike' })}</Label>
        <Switch id={`${ids}-strike`} checked={strike} onCheckedChange={setStrike} />
      </div>
      {error ? (
        <p role="alert" className="t-body text-site-danger">
          {error}
        </p>
      ) : null}
      <DialogFooter>
        <Button type="button" variant="default" onClick={onClose}>
          {t('cancel', { defaultValue: 'Cancel' })}
        </Button>
        <Button type="submit" variant="primary" disabled={!canPreview}>
          {t('preview-action', { defaultValue: 'Preview' })}
        </Button>
      </DialogFooter>
    </form>
  );
}

/**
 * The start form of a spam sweep, opened from the admin user view and from each batch-lookup row. Step one
 * collects the window, kinds and reason; step two previews what it would remove and asks once more. The form
 * mounts fresh each time the dialog opens.
 */
export function SweepDialog({ open, onOpenChange, subjectId, subjectLabel }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <SweepForm subjectId={subjectId} subjectLabel={subjectLabel} onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
