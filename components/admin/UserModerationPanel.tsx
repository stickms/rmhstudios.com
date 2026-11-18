/**
 * The admin users page's moderation drawer for one user: their strike record,
 * their feature timeouts (with Lift), and the forms to add a strike, time them
 * out of a feature, or suspend / unsuspend the account. Opens inline under the
 * user's row, as rows on rules.
 */

import { useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { formatDistanceToNow } from 'date-fns';
import { toast } from '@/lib/toast';
import { api } from '@/lib/contract/client';
import { HttpError, serverError } from '@/lib/http';
import { banAdminUserApi, strikeAdminUserApi } from '@/lib/admin/admin-ops.contract';
import type { AdminUserModeration } from '@/lib/moderation/admin-moderation.contract';
import type { RestrictableFeature } from '@/lib/moderation/restrictions';
import {
  getAdminUserModerationApi,
  liftAdminRestrictionApi,
  restrictAdminUserApi,
  RESTRICTABLE_FEATURES,
  RestrictionList,
  TIMEOUT_PRESETS,
  useFeatureLabels,
  useTimeoutLabel,
} from '@/components/moderation/moderation-ui';
import { cn } from '@/lib/utils';

type Form = 'strike' | 'timeout' | 'ban' | null;

export function UserModerationPanel({
  userId,
  isAdminUser,
  onChanged,
}: {
  userId: string;
  /** Admins cannot be timed out or banned; the forms are hidden for them. */
  isAdminUser: boolean;
  /** Tell the table the counts changed. */
  onChanged: (summary: { activeStrikes: number; activeRestrictions: number; banned: boolean }) => void;
}) {
  const { t } = useTranslation('admin');
  const featureLabels = useFeatureLabels();
  const timeoutLabel = useTimeoutLabel();
  const ids = useId();
  const [busy, setBusy] = useState(false);
  const [liftingId, setLiftingId] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(null);
  const [reason, setReason] = useState('');
  const [feature, setFeature] = useState<RestrictableFeature>('post');
  const [days, setDays] = useState('7');
  const [banDays, setBanDays] = useState('7');

  // The record is client-owned admin state, loaded when the panel opens.
  const query = useQuery({
    queryKey: ['admin', 'user-moderation', userId],
    queryFn: () => api(getAdminUserModerationApi, { params: { id: userId } }),
    staleTime: 0,
  });
  const data: AdminUserModeration | undefined = query.data;

  /** Re-read the record after an action and hand the table its new counts. */
  const load = async () => {
    const { data: next } = await query.refetch();
    if (!next) return;
    onChanged({
      activeStrikes: next.activeStrikes,
      activeRestrictions: next.restrictions.filter((r) => r.active).length,
      banned: !!next.bannedUntil,
    });
  };

  const openForm = (f: Form) => {
    setForm((cur) => (cur === f ? null : f));
    setReason('');
  };

  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(done);
      setForm(null);
      setReason('');
      await load();
    } catch (e) {
      toast.error((e instanceof HttpError && serverError(e)) || t('mod-action-failed', { defaultValue: 'That did not go through.' }));
    } finally {
      setBusy(false);
    }
  };

  const submit = () => {
    const why = reason.trim();
    if (form === 'strike') {
      if (!why) return;
      void run(
        () => api(strikeAdminUserApi, { params: { id: userId }, body: { reason: why } }),
        t('mod-strike-done', { defaultValue: 'Strike added. The user has been notified.' }),
      );
    } else if (form === 'timeout') {
      if (!why) return;
      void run(
        () =>
          api(restrictAdminUserApi, {
            params: { id: userId },
            body: { feature, reason: why, durationDays: days === 'permanent' ? null : Number(days) },
          }),
        t('mod-timeout-done', { defaultValue: 'Timed out. The user has been notified.' }),
      );
    } else if (form === 'ban') {
      void run(
        () =>
          api(banAdminUserApi, {
            params: { id: userId },
            body: { reason: why || undefined, durationDays: banDays === 'permanent' ? null : Number(banDays) },
          }),
        t('mod-ban-done', { defaultValue: 'Account suspended.' }),
      );
    }
  };

  const unban = () =>
    void run(
      () => api(banAdminUserApi, { params: { id: userId }, body: { unban: true } }),
      t('mod-unban-done', { defaultValue: 'Suspension lifted.' }),
    );

  const lift = async (id: string) => {
    setLiftingId(id);
    try {
      await api(liftAdminRestrictionApi, { params: { id } });
      toast.success(t('mod-lift-done', { defaultValue: 'Restriction lifted.' }));
      await load();
    } catch (e) {
      toast.error((e instanceof HttpError && serverError(e)) || t('mod-action-failed', { defaultValue: 'That did not go through.' }));
    } finally {
      setLiftingId(null);
    }
  };

  if (query.isPending) {
    return (
      <div className="order-last flex basis-full justify-center py-4 text-site-text-muted">
        <Spinner />
      </div>
    );
  }
  if (!data) {
    return (
      <p className="t-body order-last basis-full text-site-danger">
        {t('mod-load-failed', { defaultValue: 'Could not load this user’s record.' })}
      </p>
    );
  }

  const activeRestrictions = data.restrictions.filter((r) => r.active).length;

  return (
    <div className="order-last basis-full space-y-4 border-t border-site-border pt-3">
      <p className="t-meta">
        {t('mod-summary', {
          strikes: data.activeStrikes,
          timeouts: activeRestrictions,
          defaultValue: '{{strikes}} active strikes · {{timeouts}} active timeouts',
        })}
        {data.bannedUntil && (
          <>
            {' · '}
            <span className="text-site-danger">
              {t('mod-suspended', { defaultValue: 'Suspended' })}
            </span>{' '}
            {formatDistanceToNow(new Date(data.bannedUntil), { addSuffix: true })}
          </>
        )}
      </p>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="default" aria-expanded={form === 'strike'} onClick={() => openForm('strike')}>
          {t('mod-add-strike', { defaultValue: 'Add strike' })}
        </Button>
        {!isAdminUser && (
          <Button size="sm" variant="default" aria-expanded={form === 'timeout'} onClick={() => openForm('timeout')}>
            {t('mod-timeout', { defaultValue: 'Time out from a feature' })}
          </Button>
        )}
        {!isAdminUser &&
          (data.bannedUntil ? (
            <Button size="sm" variant="default" disabled={busy} onClick={unban}>
              {t('mod-unban', { defaultValue: 'Lift suspension' })}
            </Button>
          ) : (
            <Button size="sm" variant="danger" aria-expanded={form === 'ban'} onClick={() => openForm('ban')}>
              {t('mod-ban', { defaultValue: 'Suspend account' })}
            </Button>
          ))}
      </div>

      {form && (
        <div className="space-y-2">
          {form === 'timeout' && (
            <div className="grid gap-2 sm:grid-cols-2">
              <Select
                value={feature}
                onChange={(e) => setFeature(e.target.value as RestrictableFeature)}
                aria-label={t('mod-timeout-feature', { defaultValue: 'Feature' })}
              >
                {RESTRICTABLE_FEATURES.map((f) => (
                  <option key={f} value={f}>
                    {featureLabels[f]}
                  </option>
                ))}
              </Select>
              <Select
                value={days}
                onChange={(e) => setDays(e.target.value)}
                aria-label={t('mod-timeout-duration', { defaultValue: 'Duration' })}
              >
                {TIMEOUT_PRESETS.map((d) => (
                  <option key={d ?? 'permanent'} value={d === null ? 'permanent' : String(d)}>
                    {timeoutLabel(d)}
                  </option>
                ))}
              </Select>
            </div>
          )}
          {form === 'ban' && (
            <Select
              value={banDays}
              onChange={(e) => setBanDays(e.target.value)}
              aria-label={t('mod-ban-duration', { defaultValue: 'Suspension length' })}
            >
              {TIMEOUT_PRESETS.map((d) => (
                <option key={d ?? 'permanent'} value={d === null ? 'permanent' : String(d)}>
                  {timeoutLabel(d)}
                </option>
              ))}
            </Select>
          )}
          <label htmlFor={`${ids}-reason`} className="t-label block">
            {form === 'ban'
              ? t('mod-reason-optional', { defaultValue: 'Reason (optional)' })
              : t('mod-reason', { defaultValue: 'Reason (sent to the user)' })}
          </label>
          <Textarea
            id={`${ids}-reason`}
            value={reason}
            maxLength={500}
            rows={2}
            onChange={(e) => setReason(e.target.value)}
            className="min-h-0 resize-none px-3 py-2"
          />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setForm(null)} disabled={busy}>
              {t('mod-cancel', { defaultValue: 'Cancel' })}
            </Button>
            <Button
              size="sm"
              variant={form === 'ban' ? 'danger' : 'primary'}
              disabled={busy || (form !== 'ban' && !reason.trim())}
              onClick={submit}
            >
              {form === 'strike'
                ? t('mod-add-strike', { defaultValue: 'Add strike' })
                : form === 'timeout'
                  ? t('mod-timeout-submit', { defaultValue: 'Time out' })
                  : t('mod-ban', { defaultValue: 'Suspend account' })}
            </Button>
          </div>
        </div>
      )}

      {data.restrictions.length > 0 && (
        <section className="space-y-2">
          <h3 className="t-label">{t('mod-timeouts-heading', { defaultValue: 'Feature timeouts' })}</h3>
          <RestrictionList restrictions={data.restrictions} onLift={lift} liftingId={liftingId} />
        </section>
      )}

      <section className="space-y-2">
        <h3 className="t-label">{t('mod-strikes-heading', { defaultValue: 'Strikes' })}</h3>
        {data.strikes.length === 0 ? (
          <p className="t-body text-site-text-muted">{t('mod-no-strikes', { defaultValue: 'No strikes.' })}</p>
        ) : (
          <ul className="divide-y divide-site-border border-y border-site-border">
            {data.strikes.map((s) => (
              <li key={s.id} className={cn('py-3', !s.active && 'opacity-60')}>
                <p className={cn('t-body text-site-text', s.appealStatus === 'OVERTURNED' && 'line-through')}>
                  {s.reason}
                </p>
                <p className="t-meta mt-1">
                  {formatDistanceToNow(new Date(s.createdAt), { addSuffix: true })}
                  {s.entityType && ` · ${s.entityType}`}
                  {s.appealStatus === 'PENDING' && ` · ${t('mod-appeal-pending', { defaultValue: 'Appeal pending' })}`}
                  {s.appealStatus === 'UPHELD' && ` · ${t('mod-appeal-upheld', { defaultValue: 'Appeal upheld' })}`}
                  {s.appealStatus === 'OVERTURNED' && ` · ${t('mod-appeal-overturned', { defaultValue: 'Overturned' })}`}
                  {!s.active && s.appealStatus !== 'OVERTURNED' && ` · ${t('mod-strike-expired', { defaultValue: 'Expired' })}`}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
