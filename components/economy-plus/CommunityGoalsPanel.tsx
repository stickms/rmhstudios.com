'use client';

/**
 * Community goal pots (C5) — the wallet's "Community" tab. Lazy-loaded when the
 * tab opens. Admins also see the controls to open, cancel and fulfil goals.
 */
import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Flag, HandCoins, Plus } from 'lucide-react';
import { toast } from 'sonner';
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
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { CoinIcon } from '@/components/rmhcoins/CoinIcon';
import {
  GOAL_MAX_TARGET,
  GOAL_MIN_TARGET,
  acceptsPledges,
  type CommunityGoalView,
} from '@/lib/economy/community-goal';
import { ApiError, apiJson, errorCode, newIdempotencyKey } from './api';

const KEY = ['economy-plus', 'community-goals'] as const;

interface GoalsPayload {
  goals: CommunityGoalView[];
  viewerIsAdmin: boolean;
}

export default function CommunityGoalsPanel() {
  const { t } = useTranslation('f-economy-plus');
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: KEY,
    queryFn: () => apiJson<GoalsPayload>('/api/community-goals'),
    staleTime: 15_000,
  });

  if (isLoading || !data) {
    return (
      <div className="space-y-3 px-3 pb-8">
        <Skeleton className="h-44 w-full" />
      </div>
    );
  }

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: KEY });
    void qc.invalidateQueries({ queryKey: ['economy-plus', 'balance'] });
  };

  return (
    <div className="space-y-3 px-3 pb-8">
      <p className="px-1 text-sm text-site-text-muted">
        {t('cg-intro', {
          defaultValue:
            'Pool coins with everyone toward something for the whole site. All or nothing: if a goal misses its deadline, every pledge is refunded in full.',
        })}
      </p>

      {data.viewerIsAdmin ? (
        <div>
          <Button variant="outline" size="sm" onClick={() => setCreating(true)}>
            <Plus /> {t('cg-new', { defaultValue: 'New community goal' })}
          </Button>
        </div>
      ) : null}

      {data.goals.length === 0 ? (
        <EmptyState
          icon={Flag}
          title={t('cg-empty-title', { defaultValue: 'No community goals right now' })}
          description={t('cg-empty-desc', {
            defaultValue: 'When a goal opens, you will be able to pledge coins toward it here.',
          })}
        />
      ) : (
        <ul className="space-y-3">
          {data.goals.map((g) => (
            <GoalCard key={g.id} goal={g} isAdmin={data.viewerIsAdmin} onChanged={refresh} />
          ))}
        </ul>
      )}

      {creating ? (
        <CreateGoalDialog
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            refresh();
          }}
        />
      ) : null}
    </div>
  );
}

function statusBadge(g: CommunityGoalView, t: (k: string, o: { defaultValue: string }) => string) {
  switch (g.status) {
    case 'OPEN':
      return <Badge variant="accent">{t('cg-status-open', { defaultValue: 'Open' })}</Badge>;
    case 'FUNDED':
      return <Badge variant="success">{t('cg-status-funded', { defaultValue: 'Funded' })}</Badge>;
    case 'FULFILLED':
      return (
        <Badge variant="success">{t('cg-status-fulfilled', { defaultValue: 'Delivered' })}</Badge>
      );
    case 'REFUNDING':
    case 'REFUNDED':
      return (
        <Badge variant="default">{t('cg-status-refunded', { defaultValue: 'Refunded' })}</Badge>
      );
  }
}

function GoalCard({
  goal: g,
  isAdmin,
  onChanged,
}: {
  goal: CommunityGoalView;
  isAdmin: boolean;
  onChanged: () => void;
}) {
  const { t, i18n } = useTranslation('f-economy-plus');
  const confirm = useConfirm();
  const [coins, setCoins] = useState('');
  // One key per pledge intent: a retry after a dropped connection reuses it, so
  // the server replays the first response instead of escrowing twice.
  const keyRef = useRef<string | null>(null);
  const remaining = Math.max(0, g.targetCoins - g.raisedCoins);
  const open = acceptsPledges(g, new Date());
  const pct = Math.min(100, Math.round((g.raisedCoins / g.targetCoins) * 100));
  const fmtDeadline = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const pledge = useMutation({
    mutationFn: (amount: number) => {
      keyRef.current ??= newIdempotencyKey();
      return apiJson<{ funded: boolean }>(
        `/api/community-goals/${encodeURIComponent(g.id)}/pledge`,
        {
          method: 'POST',
          body: { coins: amount },
          idempotencyKey: keyRef.current,
        },
      );
    },
    onSuccess: (r) => {
      keyRef.current = null;
      setCoins('');
      toast.success(
        r.funded
          ? t('cg-pledge-funded', { defaultValue: 'Pledged — and that fully funds the goal!' })
          : t('cg-pledge-ok', { defaultValue: 'Pledged. Thank you!' }),
      );
      onChanged();
    },
    onError: (err) => {
      // A definitive answer from the server ends this intent; a network failure keeps the key.
      if (err instanceof ApiError) keyRef.current = null;
      const code = errorCode(err);
      toast.error(
        code === 'INSUFFICIENT_COINS'
          ? t('cg-err-coins', { defaultValue: 'Not enough coins' })
          : code === 'EXCEEDS_REMAINING'
            ? t('cg-err-remaining', {
                defaultValue: 'That is more than the goal still needs ({{remaining}}).',
                remaining: String((err as ApiError).body.remaining ?? ''),
              })
            : code === 'CLOSED'
              ? t('cg-err-closed', { defaultValue: 'This goal is no longer taking pledges.' })
              : t('cg-err-generic', { defaultValue: "Couldn't pledge right now" }),
      );
      onChanged();
    },
  });

  const admin = useMutation({
    mutationFn: (action: 'cancel' | 'fulfil') =>
      apiJson(`/api/community-goals/${encodeURIComponent(g.id)}/admin`, {
        method: 'POST',
        body: { action },
      }),
    onSuccess: onChanged,
    onError: () => toast.error(t('cg-err-admin', { defaultValue: "Couldn't update the goal" })),
  });

  const amount = Number(coins);
  const valid = Number.isInteger(amount) && amount >= 1 && amount <= remaining;

  return (
    <li className="glass-fill space-y-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-site-text">{g.title}</h3>
          <p className="mt-0.5 text-xs text-site-accent">
            {t('cg-unlocks', { defaultValue: 'Unlocks: {{unlock}}', unlock: g.unlock })}
          </p>
        </div>
        {statusBadge(g, t)}
      </div>

      {g.description ? <p className="text-sm text-site-text-muted">{g.description}</p> : null}

      <div>
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={g.targetCoins}
          aria-valuenow={Math.min(g.raisedCoins, g.targetCoins)}
          aria-label={g.title}
          className="glass-inset h-2.5 overflow-hidden rounded-full"
        >
          <div className="h-full rounded-full bg-site-accent" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-xs tabular-nums text-site-text-muted">
          <span className="flex items-center gap-1">
            <CoinIcon className="size-3.5" /> {g.raisedCoins.toLocaleString()} /{' '}
            {g.targetCoins.toLocaleString()} ({pct}%)
          </span>
          <span>
            {t('cg-pledgers', { defaultValue: '{{n}} pledgers', n: g.pledgers.toLocaleString() })}
            {' · '}
            {g.status === 'OPEN'
              ? t('cg-deadline', {
                  defaultValue: 'ends {{date}}',
                  date: fmtDeadline.format(new Date(g.deadline)),
                })
              : null}
          </span>
        </div>
      </div>

      {g.myPledge > 0 ? (
        <p className="text-xs font-semibold text-site-text">
          {t('cg-mine', {
            defaultValue: 'Your pledge: {{n}} coins',
            n: g.myPledge.toLocaleString(),
          })}
        </p>
      ) : null}
      {g.myRefunded > 0 ? (
        <p className="text-xs text-site-text-muted">
          {t('cg-refunded', {
            defaultValue: 'Refunded to you: {{n}} coins',
            n: g.myRefunded.toLocaleString(),
          })}
        </p>
      ) : null}

      {g.status === 'FUNDED' ? (
        <p className="text-xs text-site-text-muted">
          {t('cg-funded-note', {
            defaultValue: 'Funded! The team is building it — you will be notified when it ships.',
          })}
        </p>
      ) : null}
      {g.status === 'REFUNDING' || g.status === 'REFUNDED' ? (
        <p className="text-xs text-site-text-muted">
          {t('cg-missed-note', {
            defaultValue: 'This goal did not go ahead. Every pledge is returned in full.',
          })}
        </p>
      ) : null}

      {open ? (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) pledge.mutate(amount);
          }}
        >
          <Input
            value={coins}
            onChange={(e) => setCoins(e.target.value.replace(/\D/g, '').slice(0, 7))}
            inputMode="numeric"
            placeholder={t('cg-amount', { defaultValue: 'Coins' })}
            aria-label={t('cg-amount-aria', {
              defaultValue: 'Coins to pledge to {{title}}',
              title: g.title,
            })}
            className="w-32"
          />
          {[50, 250]
            .filter((v) => v <= remaining)
            .map((v) => (
              <Button
                key={v}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setCoins(String(v))}
              >
                {v}
              </Button>
            ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setCoins(String(remaining))}
          >
            {t('cg-rest', { defaultValue: 'Fund the rest' })}
          </Button>
          <Button
            type="submit"
            variant="accent"
            size="sm"
            disabled={!valid}
            loading={pledge.isPending}
          >
            <HandCoins /> {t('cg-pledge', { defaultValue: 'Pledge' })}
          </Button>
        </form>
      ) : null}

      {isAdmin && (g.status === 'OPEN' || g.status === 'FUNDED') ? (
        <div className="flex flex-wrap gap-2 border-t border-site-border pt-3">
          {g.status === 'FUNDED' ? (
            <Button
              variant="secondary"
              size="sm"
              loading={admin.isPending}
              onClick={async () => {
                const ok = await confirm({
                  title: t('cg-fulfil-title', { defaultValue: 'Mark as delivered?' }),
                  description: t('cg-fulfil-desc', {
                    defaultValue: 'Pledgers will be told the unlock has shipped.',
                  }),
                  confirmLabel: t('cg-fulfil', { defaultValue: 'Mark delivered' }),
                });
                if (ok) admin.mutate('fulfil');
              }}
            >
              {t('cg-fulfil', { defaultValue: 'Mark delivered' })}
            </Button>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            loading={admin.isPending}
            onClick={async () => {
              const ok = await confirm({
                title: t('cg-cancel-title', { defaultValue: 'Cancel and refund?' }),
                description: t('cg-cancel-desc', {
                  defaultValue: 'Every pledge is returned to its member. This cannot be undone.',
                }),
                confirmLabel: t('cg-cancel-confirm', { defaultValue: 'Cancel and refund' }),
                danger: true,
              });
              if (ok) admin.mutate('cancel');
            }}
          >
            {t('cg-cancel', { defaultValue: 'Cancel and refund' })}
          </Button>
        </div>
      ) : null}
    </li>
  );
}

function CreateGoalDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { t } = useTranslation('f-economy-plus');
  const [title, setTitle] = useState('');
  const [unlock, setUnlock] = useState('');
  const [description, setDescription] = useState('');
  const [target, setTarget] = useState('');
  const [deadline, setDeadline] = useState('');

  const create = useMutation({
    mutationFn: () =>
      apiJson('/api/community-goals', {
        method: 'POST',
        body: {
          title: title.trim(),
          unlock: unlock.trim(),
          description: description.trim(),
          targetCoins: Number(target),
          deadline: new Date(deadline).toISOString(),
        },
      }),
    onSuccess: () => {
      toast.success(t('cg-created', { defaultValue: 'Goal opened' }));
      onCreated();
    },
    onError: (err) =>
      toast.error(
        errorCode(err) === 'BAD_DEADLINE'
          ? t('cg-err-deadline', {
              defaultValue: 'The deadline must be between 1 hour and 1 year away.',
            })
          : t('cg-err-create', { defaultValue: "Couldn't open that goal" }),
      ),
  });

  const targetNum = Number(target);
  const valid =
    title.trim().length >= 3 &&
    unlock.trim().length >= 2 &&
    Number.isInteger(targetNum) &&
    targetNum >= GOAL_MIN_TARGET &&
    targetNum <= GOAL_MAX_TARGET &&
    deadline !== '' &&
    !Number.isNaN(new Date(deadline).getTime());

  return (
    <Dialog open onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent mobileFullscreen>
        <DialogHeader>
          <DialogTitle>{t('cg-create-title', { defaultValue: 'New community goal' })}</DialogTitle>
          <DialogDescription>
            {t('cg-create-desc', {
              defaultValue:
                'Members pledge coins toward it. If the target is not met by the deadline, every pledge is refunded.',
            })}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) create.mutate();
          }}
        >
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            placeholder={t('cg-f-title', { defaultValue: 'Title' })}
            aria-label={t('cg-f-title', { defaultValue: 'Title' })}
          />
          <Input
            value={unlock}
            onChange={(e) => setUnlock(e.target.value)}
            maxLength={160}
            placeholder={t('cg-f-unlock', { defaultValue: 'What it unlocks' })}
            aria-label={t('cg-f-unlock', { defaultValue: 'What it unlocks' })}
          />
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={600}
            rows={3}
            placeholder={t('cg-f-desc', { defaultValue: 'Description (optional)' })}
            aria-label={t('cg-f-desc', { defaultValue: 'Description (optional)' })}
          />
          <Input
            value={target}
            onChange={(e) => setTarget(e.target.value.replace(/\D/g, '').slice(0, 8))}
            inputMode="numeric"
            placeholder={t('cg-f-target', { defaultValue: 'Target (coins)' })}
            aria-label={t('cg-f-target', { defaultValue: 'Target (coins)' })}
          />
          <div className="space-y-1">
            <label htmlFor="cg-deadline" className="site-section-label block">
              {t('cg-f-deadline', { defaultValue: 'Deadline' })}
            </label>
            <Input
              id="cg-deadline"
              type="datetime-local"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              {t('cancel', { defaultValue: 'Cancel' })}
            </Button>
            <Button type="submit" variant="accent" disabled={!valid} loading={create.isPending}>
              {t('cg-open', { defaultValue: 'Open goal' })}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
