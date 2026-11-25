import { useEffect, useRef, useState } from 'react';
import { BookOpen, CheckCheck, Rocket, RotateCw, TriangleAlert, Wrench } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import {
  actionsFor,
  actorLabel,
  phaseOf,
  runbookHref,
  type AlarmAction,
  type AlarmPhase,
  type AlarmView,
} from '@/lib/oncall/dashboard';
import { remediationsFor, type RemediationDef, type RemediationId } from '@/lib/oncall/remediations';
import { cn, formatRelativeTime } from '@/lib/utils';

const PHASE_VARIANT: Record<AlarmPhase, 'danger' | 'warning' | 'success' | 'default'> = {
  paging: 'danger',
  acked: 'default',
  firing: 'warning',
  resolved: 'success',
};

const REMEDIATION_ICON: Record<RemediationId, typeof Wrench> = {
  'deploy.rerun': Rocket,
  'outbox.requeue-dead': RotateCw,
  'jobs.retry-failed': RotateCw,
};

export interface AlarmCardProps {
  alarm: AlarmView;
  now: number;
  /** Availability of each remediation on this server (from the API). */
  remediations: Record<string, { available: boolean; reason?: string }>;
  /** This card is the one the Discord link pointed at. */
  focused: boolean;
  /** Runs an action; resolves true when it worked (the panel reloads and toasts). */
  onAct: (alarm: AlarmView, action: AlarmAction) => Promise<boolean>;
  onRemediate: (alarm: AlarmView, action: RemediationId) => Promise<boolean>;
}

/** One alarm: what it is, who has it, and everything an admin can do about it from a phone. */
export function AlarmCard({ alarm, now, remediations, focused, onAct, onRemediate }: AlarmCardProps) {
  const { t } = useTranslation('f-oncall');
  const confirm = useConfirm();
  const ref = useRef<HTMLLIElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const phase = phaseOf(alarm);
  const href = runbookHref(alarm);
  const actions = actionsFor(alarm);
  const offered = alarm.state === 'firing' ? remediationsFor(alarm.id) : [];

  // The Discord "Open in panel" link: bring the card into view once it exists.
  useEffect(() => {
    if (focused) ref.current?.scrollIntoView({ block: 'center' });
  }, [focused]);

  const phaseLabel: Record<AlarmPhase, string> = {
    paging: t('phase-paging', { defaultValue: 'Paging — not acknowledged' }),
    acked: t('phase-acked', { defaultValue: 'Acknowledged' }),
    firing: t('phase-firing', { defaultValue: 'Firing' }),
    resolved: t('phase-resolved', { defaultValue: 'Resolved' }),
  };

  const run = async (id: string, fn: () => Promise<boolean>) => {
    setBusy(id);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  };

  const act = async (action: AlarmAction) => {
    if (action === 'escalate') {
      const ok = await confirm({
        title: t('confirm-escalate-title', { defaultValue: 'Escalate to Sev1?' }),
        description: t('confirm-escalate-body', {
          defaultValue: 'This pages everyone, clears any acknowledgement and keeps paging until someone takes it.',
        }),
        confirmLabel: t('escalate', { defaultValue: 'Escalate' }),
        danger: true,
      });
      if (!ok) return;
    }
    if (action === 'resolve') {
      const ok = await confirm({
        title: t('confirm-resolve-title', { defaultValue: 'Resolve this alarm?' }),
        description: t('confirm-resolve-body', {
          defaultValue:
            'It closes the alert in Discord. If the check is still failing, the alarm fires again on its next run.',
        }),
        confirmLabel: t('resolve', { defaultValue: 'Resolve' }),
      });
      if (!ok) return;
    }
    await run(action, () => onAct(alarm, action));
  };

  const remediate = async (def: RemediationDef) => {
    const copy = remediationCopy(def.id, t);
    const ok = await confirm({
      title: copy.title,
      description: copy.description,
      confirmLabel: copy.label,
      danger: def.danger,
    });
    if (!ok) return;
    await run(def.id, () => onRemediate(alarm, def.id));
  };

  const actionLabel: Record<AlarmAction, string> = {
    ack: t('ack', { defaultValue: 'Acknowledge' }),
    escalate: t('escalate', { defaultValue: 'Escalate' }),
    resolve: t('resolve', { defaultValue: 'Resolve' }),
  };

  return (
    <li
      ref={ref}
      id={`alarm-${alarm.key}`}
      aria-current={focused ? 'true' : undefined}
      className={cn('py-4', focused && 'border-s-2 border-site-text ps-3')}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={alarm.sev <= 2 ? 'danger' : 'warning'} icon={false}>
          {t('sev', { defaultValue: 'SEV{{sev}}', sev: alarm.sev })}
        </Badge>
        <Badge variant={PHASE_VARIANT[phase]}>{phaseLabel[phase]}</Badge>
        <span className="min-w-0 break-all font-mono t-meta">{alarm.key}</span>
      </div>
      <h3 className="mt-2 break-words font-semibold text-site-text">{alarm.title}</h3>
      {alarm.detail && (
        <p className="mt-1 whitespace-pre-line break-words t-body text-site-text-muted">{alarm.detail}</p>
      )}
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 t-meta sm:grid-cols-4">
        <div>
          <dt className="text-site-text-muted">{t('since', { defaultValue: 'Since' })}</dt>
          <dd>{formatRelativeTime(alarm.firedAt)}</dd>
        </div>
        <div>
          <dt className="text-site-text-muted">{t('source', { defaultValue: 'Source' })}</dt>
          <dd className="break-words">{alarm.source}</dd>
        </div>
        <div>
          <dt className="text-site-text-muted">{t('pages', { defaultValue: 'Pages sent' })}</dt>
          <dd className="tabular-nums">{alarm.pageCount}</dd>
        </div>
        <div>
          <dt className="text-site-text-muted">
            {alarm.state === 'resolved'
              ? t('resolved-at', { defaultValue: 'Resolved' })
              : t('acked-by', { defaultValue: 'Acknowledged by' })}
          </dt>
          <dd className="break-words">
            {alarm.state === 'resolved'
              ? t('resolved-after', {
                  defaultValue: '{{when}}, after {{minutes}} min',
                  when: formatRelativeTime(alarm.resolvedAt ?? alarm.updatedAt),
                  minutes: Math.max(1, Math.round(((alarm.resolvedAt ?? now) - alarm.firedAt) / 60_000)),
                })
              : alarm.acked
                ? t('acked-detail-2', {
                    defaultValue: '{{who}}, {{when}}',
                    who:
                      alarm.acked.via === 'web'
                        ? actorLabel(alarm.acked)
                        : t('discord-user', { defaultValue: 'Discord user {{id}}', id: alarm.acked.by }),
                    when: formatRelativeTime(alarm.acked.at),
                  })
                : '—'}
          </dd>
        </div>
      </dl>
      {alarm.escalated && (
        <p className="mt-2 flex items-center gap-1 t-meta text-site-danger">
          <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
          {t('escalated-by', {
            defaultValue: 'Escalated to Sev1 by {{who}}, {{when}}',
            who:
              alarm.escalated.via === 'web'
                ? actorLabel(alarm.escalated)
                : t('discord-user', { defaultValue: 'Discord user {{id}}', id: alarm.escalated.by }),
            when: formatRelativeTime(alarm.escalated.at),
          })}
        </p>
      )}

      {(actions.length > 0 || offered.length > 0 || href) && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {actions.map((action) => (
            <Button
              key={action}
              variant={action === 'escalate' ? 'danger' : 'default'}
              disabled={busy !== null}
              onClick={() => void act(action)}
              className="max-sm:flex-1"
            >
              {action === 'ack' ? (
                <CheckCheck aria-hidden />
              ) : action === 'escalate' ? (
                <TriangleAlert aria-hidden />
              ) : null}
              {busy === action ? t('working', { defaultValue: 'Working…' }) : actionLabel[action]}
            </Button>
          ))}
          {offered.map((def) => {
            const Icon = REMEDIATION_ICON[def.id];
            const status = remediations[def.id];
            const available = status?.available ?? false;
            const copy = remediationCopy(def.id, t);
            return (
              <div key={def.id} className="max-sm:w-full">
                <Button
                  variant="default"
                  disabled={busy !== null || !available}
                  onClick={() => void remediate(def)}
                  className="max-sm:w-full"
                >
                  <Icon aria-hidden />
                  {busy === def.id ? t('working', { defaultValue: 'Working…' }) : copy.label}
                </Button>
                {!available && status?.reason && (
                  <p className="mt-1 max-w-xs t-meta text-site-text-muted">{status.reason}</p>
                )}
              </div>
            );
          })}
          {href && (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-9 items-center gap-1 t-body text-site-text underline pointer-coarse:min-h-11"
            >
              <BookOpen className="size-4" aria-hidden />
              {t('runbook', { defaultValue: 'Runbook' })}
            </a>
          )}
        </div>
      )}
    </li>
  );
}

/** Wording for each remediation, in one place so the button, the confirm and the docs agree. */
function remediationCopy(
  id: RemediationId,
  t: (key: string, opts: { defaultValue: string }) => string,
): { label: string; title: string; description: string } {
  switch (id) {
    case 'deploy.rerun':
      return {
        label: t('rem-deploy-label', { defaultValue: 'Re-run deploy' }),
        title: t('rem-deploy-title', { defaultValue: 'Re-run the deploy?' }),
        description: t('rem-deploy-body', {
          defaultValue:
            'Starts the deploy workflow on main again. It builds, tests and ships the latest commit, so a fix pushed since the failure goes out with it.',
        }),
      };
    case 'outbox.requeue-dead':
      return {
        label: t('rem-outbox-label', { defaultValue: 'Requeue dead events' }),
        title: t('rem-outbox-title', { defaultValue: 'Requeue dead outbox events?' }),
        description: t('rem-outbox-body', {
          defaultValue:
            'Gives every dead outbox event another round of delivery attempts. Delivered events are not touched.',
        }),
      };
    case 'jobs.retry-failed':
      return {
        label: t('rem-jobs-label', { defaultValue: 'Retry failed jobs' }),
        title: t('rem-jobs-title', { defaultValue: 'Retry failed jobs?' }),
        description: t('rem-jobs-body', {
          defaultValue: 'Retries the newest failed jobs, up to 100 per queue, in every queue that has failures.',
        }),
      };
  }
}
