'use client';

/**
 * Bulk content management (plan I2).
 *
 * Two steps, always, and the second is not reachable without the first: build a
 * filter → **preview** it (exact count plus ten real matches) → confirm. The
 * count the user read is posted back with the confirmation and re-checked
 * server-side, so a preview left open while the account kept posting cannot
 * commit a wider operation than the one that was on screen.
 *
 * The run itself happens on the server in chunks; this polls
 * `/api/bulk` for progress and can cancel it. Nothing here is the gate — the
 * `bulk-content` membership check and every ownership check live in the API.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ListChecks, Search, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { bulkKindCopy, bulkStatusCopy } from '@/components/trash/copy';
import {
  BULK_KINDS,
  bulkProgress,
  isTerminal,
  supportsFilter,
  type BulkFilter,
  type BulkKind,
  type BulkOperationView,
  type BulkPreview,
} from '@/lib/bulk/types';

interface UpgradeBody {
  error?: string;
  reason?: string;
  upgradeHref?: string;
  requiredTierLabel?: string;
  currentTotal?: number;
}

/** A 402 from the membership gate, carried to the UI so it can upsell. */
class BulkError extends Error {
  body: UpgradeBody;
  status: number;
  constructor(status: number, body: UpgradeBody) {
    super(body.error ?? 'Request failed');
    this.status = status;
    this.body = body;
  }
}

async function post<T>(url: string, payload: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  const body = (await res.json().catch(() => ({}))) as UpgradeBody;
  if (!res.ok) throw new BulkError(res.status, body);
  return body as T;
}

export function BulkCleanupPanel() {
  const { t } = useTranslation('settings-content');
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const kinds = bulkKindCopy(t);
  const statuses = bulkStatusCopy(t);

  const [kind, setKind] = useState<BulkKind>('delete-posts');
  const [olderThanDays, setOlderThanDays] = useState('');
  const [before, setBefore] = useState('');
  const [maxLikes, setMaxLikes] = useState('');
  const [onlyReplies, setOnlyReplies] = useState(false);
  const [tag, setTag] = useState('');
  const [preview, setPreview] = useState<BulkPreview | null>(null);
  const [upgrade, setUpgrade] = useState<UpgradeBody | null>(null);

  const operations = useQuery({
    queryKey: ['bulk-operations'],
    queryFn: async (): Promise<{ operations: BulkOperationView[] }> => {
      const res = await fetch('/api/bulk', { credentials: 'include' });
      const body = (await res.json().catch(() => ({}))) as UpgradeBody;
      if (!res.ok) throw new BulkError(res.status, body);
      return body as unknown as { operations: BulkOperationView[] };
    },
    // Poll only while something is moving. An idle page makes no requests.
    refetchInterval: (q) =>
      (q.state.data?.operations ?? []).some((op) => !isTerminal(op.status)) ? 2000 : false,
    retry: false,
  });

  const active = operations.data?.operations.find((op) => !isTerminal(op.status)) ?? null;
  const history = operations.data?.operations.filter((op) => isTerminal(op.status)) ?? [];

  // The gate can refuse on first paint (the operations list) as well as on an
  // action, and a free account hitting this page must see the upsell rather than
  // a "could not load" error — 402 carries the upgrade envelope for exactly that.
  const listGate =
    operations.error instanceof BulkError && operations.error.status === 402
      ? operations.error.body
      : null;
  const upsell = upgrade ?? listGate;

  /** Only the fields this kind honours — the rest are never sent or shown. */
  const filter: BulkFilter = {
    ...(supportsFilter(kind, 'olderThanDays') && olderThanDays !== ''
      ? { olderThanDays: Number(olderThanDays) }
      : {}),
    ...(supportsFilter(kind, 'before') && before !== ''
      ? { before: new Date(`${before}T00:00:00Z`).toISOString() }
      : {}),
    ...(supportsFilter(kind, 'maxLikes') && maxLikes !== '' ? { maxLikes: Number(maxLikes) } : {}),
    ...(supportsFilter(kind, 'onlyReplies') && onlyReplies ? { onlyReplies: true } : {}),
    ...(supportsFilter(kind, 'tag') && tag.trim() !== '' ? { tag: tag.trim() } : {}),
  };

  const handleGateError = (error: unknown) => {
    if (error instanceof BulkError && error.status === 402) {
      setUpgrade(error.body);
      return true;
    }
    return false;
  };

  const previewMutation = useMutation({
    mutationFn: () => post<BulkPreview>('/api/bulk/preview', { kind, filter }),
    onSuccess: (data) => {
      setUpgrade(null);
      setPreview(data);
    },
    onError: (error: unknown) => {
      if (handleGateError(error)) return;
      toast.error(t('bulk-preview-failed', { defaultValue: 'Could not build a preview.' }));
    },
  });

  const startMutation = useMutation({
    mutationFn: (confirmedTotal: number) =>
      post<{ operation: BulkOperationView }>('/api/bulk', { kind, filter, confirmedTotal }),
    onSuccess: () => {
      setPreview(null);
      toast.success(t('bulk-started-toast', { defaultValue: 'Started. You can leave this page.' }));
      void queryClient.invalidateQueries({ queryKey: ['bulk-operations'] });
    },
    onError: (error: unknown) => {
      if (handleGateError(error)) return;
      const body = error instanceof BulkError ? error.body : null;
      if (body?.reason === 'total-changed') {
        toast.error(
          t('bulk-total-changed', {
            defaultValue: 'The number of matches changed. Preview it again before running.',
          }),
        );
        setPreview(null);
        return;
      }
      if (body?.reason === 'already-running') {
        toast.error(
          t('bulk-already-running', {
            defaultValue: 'One cleanup runs at a time. Wait for the current one to finish.',
          }),
        );
        void queryClient.invalidateQueries({ queryKey: ['bulk-operations'] });
        return;
      }
      toast.error(t('bulk-start-failed', { defaultValue: 'Could not start that.' }));
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/bulk/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('cancel failed');
    },
    onSuccess: () => {
      toast.success(t('bulk-cancelled-toast', { defaultValue: 'Stopping…' }));
      void queryClient.invalidateQueries({ queryKey: ['bulk-operations'] });
    },
    onError: () => toast.error(t('bulk-cancel-failed', { defaultValue: 'Could not stop it.' })),
  });

  const handleRun = async () => {
    if (!preview) return;
    const ok = await confirm({
      title: t('bulk-confirm-title', {
        count: preview.total,
        unit: kinds[kind].unit,
        defaultValue: 'Process {{count}} {{unit}}?',
      }),
      description: kinds[kind].blurb,
      confirmLabel: t('bulk-confirm-run', { defaultValue: 'Run it' }),
      danger: true,
    });
    if (!ok) return;
    startMutation.mutate(preview.total);
  };

  // Any filter edit invalidates a preview: confirming against a stale count is
  // exactly the surprising-blast-radius failure this two-step exists to stop.
  const withPreviewReset =
    <T,>(set: (value: T) => void) =>
    (value: T) => {
      setPreview(null);
      set(value);
    };

  const heading = (
    <div>
      <h2 id="bulk-heading" className="font-display text-lg font-semibold text-site-text">
        {t('bulk-heading', { defaultValue: 'Bulk cleanup' })}
      </h2>
      <p className="mt-1 text-sm text-site-text-muted">
        {t('bulk-subheading', {
          defaultValue:
            'Clear out a run of old content in one pass. You always see an exact count and ten examples first.',
        })}
      </p>
    </div>
  );

  // Refused before the page ever loaded a list: show the upsell and nothing
  // else. A filter builder whose only possible outcome is another 402 is worse
  // than no builder.
  if (listGate) {
    return (
      <section aria-labelledby="bulk-heading" className="flex flex-col gap-4">
        {heading}
        <div className="glass-pane rounded-site p-4">
          <p className="text-sm text-site-text">
            {t('bulk-upgrade-body', {
              tier: listGate.requiredTierLabel ?? 'Pro',
              defaultValue: 'Bulk cleanup is a {{tier}} feature.',
            })}
          </p>
          {listGate.upgradeHref ? (
            <Button variant="accent" className="mt-3" asChild>
              <a href={listGate.upgradeHref}>
                <Sparkles aria-hidden />
                {t('bulk-upgrade-cta', { defaultValue: 'See membership' })}
              </a>
            </Button>
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby="bulk-heading" className="flex flex-col gap-4">
      {heading}

      {upsell ? (
        <div className="glass-pane rounded-site p-4">
          <p className="text-sm text-site-text">
            {t('bulk-upgrade-body', {
              tier: upsell.requiredTierLabel ?? 'Pro',
              defaultValue: 'Bulk cleanup is a {{tier}} feature.',
            })}
          </p>
          {upsell.upgradeHref ? (
            <Button variant="accent" className="mt-3" asChild>
              <a href={upsell.upgradeHref}>
                <Sparkles aria-hidden />
                {t('bulk-upgrade-cta', { defaultValue: 'See membership' })}
              </a>
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="glass-pane flex flex-col gap-4 rounded-site p-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="bulk-kind">
            {t('bulk-kind-label', { defaultValue: 'What to clean' })}
          </Label>
          <Select
            id="bulk-kind"
            value={kind}
            onChange={(event) => {
              setPreview(null);
              setKind(event.target.value as BulkKind);
            }}
          >
            {BULK_KINDS.map((id) => (
              <option key={id} value={id}>
                {kinds[id].label}
              </option>
            ))}
          </Select>
          <p className="text-xs text-site-text-muted">{kinds[kind].blurb}</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {supportsFilter(kind, 'olderThanDays') ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="bulk-older">
                {t('bulk-older-label', { defaultValue: 'Older than (days)' })}
              </Label>
              <Input
                id="bulk-older"
                type="number"
                min={0}
                inputMode="numeric"
                value={olderThanDays}
                placeholder={t('bulk-any', { defaultValue: 'Any' })}
                onChange={(event) => withPreviewReset(setOlderThanDays)(event.target.value)}
              />
            </div>
          ) : null}

          {supportsFilter(kind, 'before') ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="bulk-before">
                {t('bulk-before-label', { defaultValue: 'Created before' })}
              </Label>
              <Input
                id="bulk-before"
                type="date"
                value={before}
                onChange={(event) => withPreviewReset(setBefore)(event.target.value)}
              />
            </div>
          ) : null}

          {supportsFilter(kind, 'maxLikes') ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="bulk-likes">
                {t('bulk-likes-label', { defaultValue: 'At most this many likes' })}
              </Label>
              <Input
                id="bulk-likes"
                type="number"
                min={0}
                inputMode="numeric"
                value={maxLikes}
                placeholder={t('bulk-any', { defaultValue: 'Any' })}
                onChange={(event) => withPreviewReset(setMaxLikes)(event.target.value)}
              />
            </div>
          ) : null}

          {supportsFilter(kind, 'tag') ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="bulk-tag">{t('bulk-tag-label', { defaultValue: 'Hashtag' })}</Label>
              <Input
                id="bulk-tag"
                value={tag}
                placeholder={t('bulk-any', { defaultValue: 'Any' })}
                onChange={(event) => withPreviewReset(setTag)(event.target.value)}
              />
            </div>
          ) : null}
        </div>

        {supportsFilter(kind, 'onlyReplies') ? (
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="bulk-replies" className="cursor-pointer">
              {kind === 'delete-posts'
                ? t('bulk-replies-posts-label', { defaultValue: 'Thread follow-ups only' })
                : t('bulk-replies-comments-label', { defaultValue: 'Replies to comments only' })}
            </Label>
            <Switch
              id="bulk-replies"
              checked={onlyReplies}
              onCheckedChange={withPreviewReset(setOnlyReplies)}
            />
          </div>
        ) : null}

        <Button
          variant="secondary"
          className="self-start"
          loading={previewMutation.isPending}
          disabled={!!active}
          onClick={() => previewMutation.mutate()}
        >
          <Search aria-hidden />
          {t('bulk-preview-cta', { defaultValue: 'Preview matches' })}
        </Button>
      </div>

      {preview ? (
        <div className="glass-pane flex flex-col gap-3 rounded-site p-4">
          <p className="text-sm font-semibold text-site-text">
            {t('bulk-preview-count', {
              count: preview.total,
              unit: kinds[preview.kind].unit,
              defaultValue: '{{count}} {{unit}} match this filter',
            })}
          </p>
          {preview.dropped.length > 0 ? (
            <p className="text-xs text-site-warning">
              {t('bulk-dropped-filters', {
                fields: preview.dropped.join(', '),
                defaultValue: 'Ignored for this operation: {{fields}}',
              })}
            </p>
          ) : null}
          {preview.sample.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {preview.sample.map((row) => (
                <li key={row.id} className="glass-fill rounded-site-sm px-3 py-2">
                  <p className="truncate text-sm text-site-text">{row.label}</p>
                  {row.detail ? <p className="text-xs text-site-text-dim">{row.detail}</p> : null}
                </li>
              ))}
            </ul>
          ) : null}
          <Button
            variant="danger"
            className="self-start"
            loading={startMutation.isPending}
            disabled={preview.total === 0 || !!active}
            onClick={() => void handleRun()}
          >
            <ListChecks aria-hidden />
            {t('bulk-run-cta', { defaultValue: 'Run cleanup' })}
          </Button>
        </div>
      ) : null}

      {active ? (
        <div className="glass-pane flex flex-col gap-3 rounded-site p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-site-text">{kinds[active.kind].label}</p>
            <Badge size="sm" variant="accent">
              {statuses[active.status] ?? active.status}
            </Badge>
          </div>
          <div
            className="h-2 w-full overflow-hidden rounded-full bg-site-surface-active"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={bulkProgress(active)}
            aria-label={t('bulk-progress-label', { defaultValue: 'Cleanup progress' })}
          >
            {/* scaleX on a full-width fill, not an animated `width` — animating a
                layout property forces a reflow every frame. */}
            <div
              className="h-full origin-left bg-site-accent transition-transform duration-site-slow"
              style={{ transform: `scaleX(${bulkProgress(active) / 100})` }}
            />
          </div>
          <p className="text-xs text-site-text-muted">
            {t('bulk-progress-count', {
              processed: active.processed,
              total: active.total,
              defaultValue: '{{processed}} of {{total}} done',
            })}
          </p>
          <Button
            variant="secondary"
            className="self-start"
            loading={cancelMutation.isPending}
            onClick={() => cancelMutation.mutate(active.id)}
          >
            {t('bulk-cancel-cta', { defaultValue: 'Stop' })}
          </Button>
        </div>
      ) : null}

      {history.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-site-text">
            {t('bulk-history-heading', { defaultValue: 'Recent cleanups' })}
          </h3>
          <ul className="flex flex-col gap-2">
            {history.map((op) => (
              <li
                key={op.id}
                className="glass-fill flex flex-wrap items-center justify-between gap-2 rounded-site px-3 py-2"
              >
                <span className="text-sm text-site-text">{kinds[op.kind].label}</span>
                <span className="flex items-center gap-2">
                  <span className="text-xs text-site-text-dim">
                    {t('bulk-history-processed', {
                      count: op.processed,
                      defaultValue: '{{count}} processed',
                    })}
                  </span>
                  <Badge
                    size="sm"
                    variant={
                      op.status === 'DONE'
                        ? 'success'
                        : op.status === 'FAILED'
                          ? 'danger'
                          : 'default'
                    }
                  >
                    {statuses[op.status] ?? op.status}
                  </Badge>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {operations.isError && !upsell ? (
        <EmptyState
          icon={ListChecks}
          title={t('bulk-list-error-title', { defaultValue: 'Could not load your cleanups' })}
          description={t('bulk-list-error-body', {
            defaultValue: 'Refresh the page to try again.',
          })}
        />
      ) : null}
    </section>
  );
}
