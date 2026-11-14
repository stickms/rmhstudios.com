import { useCallback, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { toast } from '@/lib/toast';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { api } from '@/lib/contract/client';
import { setPlayLimitsApi } from '@/lib/economy/play-limits.contract';
import { playLimitsQuery } from '@/lib/settings/privacy.queries';
import type { PlayLimitsView } from '@/lib/economy/play-limits.server';
import { MAX_COOL_OFF_DAYS, MAX_DAILY_CAP } from '@/lib/economy/play-limits';
import { SettingsSection } from '@/components/settings/SettingsSection';
import { useArrival } from '@/components/ui/arrive';

/**
 * Responsible play (W8) — the member's own guard rails, in Settings → Privacy.
 *
 * Three controls, and the copy around them is load-bearing: this panel exists
 * so that somebody can bind their own hands, and it has to be honest about the
 * fact that they will not be able to unbind them straight away. Every deferral
 * is stated BEFORE the click, not reported after it.
 *
 * The asymmetry itself lives in `lib/economy/play-limits.ts` and is enforced in
 * the ledger — this component never decides anything, it only says what the
 * server is about to do and shows what came back.
 */

/** ISO → the member's locale, or null when there is nothing to show. */
function useWhen() {
  const { i18n } = useTranslation();
  return useCallback(
    (iso: string | null) =>
      iso
        ? new Date(iso).toLocaleString(i18n.language, { dateStyle: 'medium', timeStyle: 'short' })
        : null,
    [i18n.language],
  );
}

export function PlayLimitsPanel() {
  const { t } = useTranslation('site');
  const confirm = useConfirm();
  const when = useWhen();

  // A failed read renders the empty state; it is not worth a toast.
  const { data } = useQuery(playLimitsQuery());
  const [saved, setSaved] = useState<PlayLimitsView | null>(null);
  const view = saved ?? data ?? null;
  const arrival = useArrival(view !== null);
  const [capDraft, setCapDraft] = useState<string | null>(null);
  const capInput =
    capDraft ?? (view && view.dailyCoinCap !== null ? String(view.dailyCoinCap) : '');
  const setCapInput = setCapDraft;
  const [saving, setSaving] = useState(false);

  const save = useCallback(
    async (body: {
      dailyCoinCap?: number | null;
      excludeForDays?: number;
      coolOffForDays?: number;
    }) => {
      setSaving(true);
      try {
        const next = await api(setPlayLimitsApi, { body });
        setSaved(next);
        setCapDraft(null);
        if (next.pendingCapAt) {
          toast.success(
            t('play-limits-deferred', {
              defaultValue: 'Saved. Because this gives you more room, it takes effect {{when}}.',
              when: when(next.pendingCapAt),
            }),
          );
        } else {
          toast.success(t('play-limits-saved', { defaultValue: 'Saved.' }));
        }
      } catch {
        toast.error(t('play-limits-error', { defaultValue: 'Could not save that. Try again.' }));
      } finally {
        setSaving(false);
      }
    },
    [t, when],
  );

  if (!view) return null;

  const excludedUntil = when(view.selfExcludedUntil);
  const coolingUntil = when(view.coolOffUntil);
  const parsedCap = capInput.trim() === '' ? null : Number(capInput);
  const capIsValid =
    parsedCap === null ||
    (Number.isInteger(parsedCap) && parsedCap >= 1 && parsedCap <= MAX_DAILY_CAP);
  const capChanged = parsedCap !== view.dailyCoinCap;
  // Naming the direction before the click is the whole point: a member should
  // never discover the 24-hour wait by having already committed to it.
  const wouldDefer =
    capChanged &&
    (parsedCap === null || view.dailyCoinCap === null
      ? view.dailyCoinCap !== null
      : parsedCap > view.dailyCoinCap);

  async function exclude(days: number) {
    const ok = await confirm({
      title: t('play-limits-exclude-confirm-title', {
        defaultValue: 'Exclude yourself for {{days}} days?',
        days,
      }),
      description: t('play-limits-exclude-confirm-body', {
        defaultValue:
          'You will not be able to stake coins anywhere on the site until it ends, and this cannot be shortened or undone — not by you, and not by support. You can still play everything that does not cost coins.',
      }),
      confirmLabel: t('play-limits-exclude-confirm-cta', { defaultValue: 'Exclude me' }),
      danger: true,
    });
    if (ok) await save({ excludeForDays: days });
  }

  return (
    <SettingsSection
      className={arrival}
      title={t('play-limits-title', { defaultValue: 'Staking limits' })}
      description={t('play-limits-subtitle', {
        defaultValue:
          'Limits you set on wagers, predictions and the casino tables. Tightening one applies at once; loosening one waits a day.',
      })}
    >
      {excludedUntil && (
        <p className="surface-field rounded-site p-4 text-sm text-site-text">
          {t('play-limits-excluded-until', {
            defaultValue: "You're excluded from staking until {{when}}.",
            when: excludedUntil,
          })}
        </p>
      )}
      {!excludedUntil && coolingUntil && (
        <p className="surface-field rounded-site p-4 text-sm text-site-text">
          {t('play-limits-cooling-until', {
            defaultValue: "You're taking a break from staking until {{when}}.",
            when: coolingUntil,
          })}
        </p>
      )}

      <div className="space-y-2">
        <label htmlFor="play-limit-cap" className="block text-sm font-medium text-site-text">
          {t('play-limits-cap-label', { defaultValue: 'Most coins I can stake per day' })}
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            id="play-limit-cap"
            inputMode="numeric"
            value={capInput}
            onChange={(e) => setCapInput(e.target.value)}
            placeholder={t('play-limits-cap-none', { defaultValue: 'No limit' })}
            className="max-w-40"
            aria-describedby="play-limit-cap-hint"
          />
          <Button
            onClick={() => void save({ dailyCoinCap: parsedCap })}
            disabled={saving || !capIsValid || !capChanged}
          >
            {t('play-limits-cap-save', { defaultValue: 'Save limit' })}
          </Button>
        </div>
        <p id="play-limit-cap-hint" className="text-xs text-site-text-muted">
          {view.dailyCoinCap !== null
            ? t('play-limits-cap-used', {
                defaultValue: "You've staked {{staked}} of {{cap}} today.",
                staked: view.stakedToday,
                cap: view.dailyCoinCap,
              })
            : t('play-limits-cap-unset', {
                defaultValue: "You've staked {{staked}} today. Leave this blank for no limit.",
                staked: view.stakedToday,
              })}
        </p>
        {wouldDefer && (
          <p className="text-xs text-site-warning">
            {t('play-limits-cap-will-defer', {
              defaultValue: 'This gives you more room, so it will take effect in 24 hours.',
            })}
          </p>
        )}
        {view.pendingCapAt && (
          <p className="text-xs text-site-text-muted">
            {view.pendingCap === null
              ? t('play-limits-pending-remove', {
                  defaultValue: 'Your limit will be removed {{when}}.',
                  when: when(view.pendingCapAt),
                })
              : t('play-limits-pending-raise', {
                  defaultValue: 'Your limit changes to {{cap}} {{when}}.',
                  cap: view.pendingCap,
                  when: when(view.pendingCapAt),
                })}
          </p>
        )}
      </div>

      <div className="space-y-2 border-t border-site-border pt-4">
        <p className="text-sm font-medium text-site-text">
          {t('play-limits-break-label', { defaultValue: 'Take a break' })}
        </p>
        <div className="flex flex-wrap gap-2">
          {[1, 7, MAX_COOL_OFF_DAYS].map((days) => (
            <Button
              key={days}
              variant="default"
              onClick={() => void save({ coolOffForDays: days })}
              disabled={saving}
            >
              {t('play-limits-break-days', {
                defaultValue_one: '{{count}} day',
                defaultValue: '{{count}} days',
                count: days,
              })}
            </Button>
          ))}
        </div>
        <p className="text-xs text-site-text-muted">
          {t('play-limits-break-hint', {
            defaultValue:
              'A break refuses every stake until it ends. It cannot be cut short, but the rest of the site is unchanged.',
          })}
        </p>
      </div>

      <div className="space-y-2 border-t border-site-border pt-4">
        <p className="text-sm font-medium text-site-text">
          {t('play-limits-exclude-label', { defaultValue: 'Exclude myself' })}
        </p>
        <div className="flex flex-wrap gap-2">
          {[30, 90, 365].map((days) => (
            <Button
              key={days}
              variant="default"
              onClick={() => void exclude(days)}
              disabled={saving}
            >
              {t('play-limits-exclude-days', { defaultValue: '{{count}} days', count: days })}
            </Button>
          ))}
        </div>
        <p className="text-xs text-site-text-muted">
          {t('play-limits-exclude-hint', {
            defaultValue:
              'Exclusion also hides wagers, predictions and the casino from your navigation and search. It cannot be shortened or undone once set.',
          })}
        </p>
      </div>
    </SettingsSection>
  );
}
