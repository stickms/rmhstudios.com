'use client';

import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { toast } from 'sonner';

import { Switch } from '@/components/ui/switch';
import { LiquidTabs, type LiquidTab } from '@/components/ui/liquid-tabs';
import { useAccessPrefs } from '@/lib/access/use-access-prefs';
import {
  setAccessPrefs,
  mirrorQuietHours,
  readQuietHours,
  SHAKE_OK_KEY,
  type AccessPrefs,
} from '@/lib/access/prefs';
import { formatClockTime, formatNumberPref } from '@/lib/access/format';
import { isTouchPhone, motionPermissionGated, requestMotionPermission } from '@/lib/access/shake';
import { activityNotificationsSupported } from '@/lib/access/activity';

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="glass-pane rounded-site p-5">
      <h3 className="text-sm font-semibold text-site-text">{title}</h3>
      {description ? (
        <p className="mb-3 text-sm text-site-text-muted">{description}</p>
      ) : (
        <div className="mb-3" />
      )}
      <div className="max-w-xl space-y-3">{children}</div>
    </section>
  );
}

function Seg<K extends keyof AccessPrefs>({
  field,
  label,
  options,
  value,
}: {
  field: K;
  label: string;
  options: { id: AccessPrefs[K] & string; label: string }[];
  value: AccessPrefs[K] & string;
}) {
  const tabs: LiquidTab[] = options.map((o) => ({ id: o.id, label: o.label }));
  return (
    <div>
      <p className="mb-1.5 text-xs text-site-text-muted">{label}</p>
      <LiquidTabs
        tabs={tabs}
        value={value}
        aria-label={label}
        size="sm"
        onChange={(id) => setAccessPrefs({ [field]: id } as Partial<AccessPrefs>)}
      />
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <span className="min-w-0">
        <span id={id} className="block text-sm text-site-text">
          {label}
        </span>
        <span className="block text-xs text-site-text-muted">{description}</span>
      </span>
      <Switch checked={checked} onCheckedChange={onChange} aria-labelledby={id} />
    </div>
  );
}

/**
 * Settings for the access & comfort additions (text spacing, formats, captions,
 * shake-to-report, bedtime mode, running-timer notification). Everything is
 * per-device (localStorage) and applied immediately; nothing here needs an account.
 */
export function AccessPrefsPanel() {
  const { t } = useTranslation('f-access');
  const p = useAccessPrefs();
  const [phone, setPhone] = useState(false);
  const [quiet, setQuiet] = useState<boolean | null>(null);

  useEffect(() => {
    setPhone(isTouchPhone());
    setQuiet(readQuietHours() !== null);
    // Bedtime follows the quiet hours saved with the notification settings; mirror
    // them onto this device so the pre-paint script can read them without a request.
    fetch('/api/preferences/notifications', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { quietStart?: number | null; quietEnd?: number | null } | null) => {
        if (!d) return;
        mirrorQuietHours(d.quietStart ?? null, d.quietEnd ?? null);
        setQuiet(readQuietHours() !== null);
      })
      .catch(() => {});
  }, []);

  async function onShake(next: boolean) {
    if (next && motionPermissionGated()) {
      const ok = await requestMotionPermission();
      if (!ok) {
        toast.error(t('shake-denied', { defaultValue: 'Motion access was not allowed.' }));
        return;
      }
      try {
        localStorage.setItem(SHAKE_OK_KEY, '1');
      } catch {
        /* storage unavailable */
      }
    }
    setAccessPrefs({ shake: next });
  }

  async function onActivity(next: boolean) {
    if (next && Notification.permission !== 'granted') {
      const res = await Notification.requestPermission();
      if (res !== 'granted') {
        toast.error(
          t('activity-denied', { defaultValue: 'Notifications are blocked for this site.' }),
        );
        return;
      }
    }
    setAccessPrefs({ activity: next });
  }

  const sample = new Date(2026, 9, 12, 15, 45);
  const spacingOpts = [
    { id: 'off' as const, label: t('spacing-off', { defaultValue: 'Default' }) },
    { id: 'relaxed' as const, label: t('spacing-relaxed', { defaultValue: 'Relaxed' }) },
    { id: 'wide' as const, label: t('spacing-wide', { defaultValue: 'Wide' }) },
  ];
  const auto = t('opt-auto', { defaultValue: 'Auto' });

  return (
    <div className="space-y-6">
      <Section
        title={t('spacing-title', { defaultValue: 'Text spacing' })}
        description={t('spacing-desc', {
          defaultValue: 'Loosen line height, letter spacing and word spacing across the site.',
        })}
      >
        <Seg
          field="spacing"
          label={t('spacing-label', { defaultValue: 'Spacing' })}
          options={spacingOpts}
          value={p.spacing}
        />
        <p className="glass-inset rounded-site-sm p-3 text-sm text-site-text">
          {t('spacing-sample', {
            defaultValue:
              'The quick brown fox jumps over the lazy dog. Spacing changes here as soon as you pick a level.',
          })}
        </p>
      </Section>

      <Section
        title={t('formats-title', { defaultValue: 'Formats' })}
        description={t('formats-desc', {
          defaultValue: 'Clock, week start and number style, independent of your language.',
        })}
      >
        <Seg
          field="clock"
          label={t('clock-label', { defaultValue: 'Clock' })}
          options={[
            { id: 'auto', label: auto },
            { id: '12', label: t('clock-12', { defaultValue: '12-hour' }) },
            { id: '24', label: t('clock-24', { defaultValue: '24-hour' }) },
          ]}
          value={p.clock}
        />
        <Seg
          field="weekStart"
          label={t('week-label', { defaultValue: 'Week starts on' })}
          options={[
            { id: 'auto', label: auto },
            { id: '0', label: t('week-sun', { defaultValue: 'Sunday' }) },
            { id: '1', label: t('week-mon', { defaultValue: 'Monday' }) },
            { id: '6', label: t('week-sat', { defaultValue: 'Saturday' }) },
          ]}
          value={p.weekStart}
        />
        <Seg
          field="numberFormat"
          label={t('number-label', { defaultValue: 'Numbers' })}
          options={[
            { id: 'auto', label: auto },
            { id: 'en-US', label: '1,234.5' },
            { id: 'de-DE', label: '1.234,5' },
            { id: 'fr-FR', label: '1 234,5' },
            { id: 'en-IN', label: '12,34,567.8' },
          ]}
          value={p.numberFormat}
        />
        <p className="text-xs text-site-text-muted">
          {t('formats-preview', {
            defaultValue: 'Preview: {{time}} · {{number}}',
            time: formatClockTime(sample, p),
            number: formatNumberPref(1234567.8, p, { maximumFractionDigits: 1 }),
          })}
        </p>
      </Section>

      <Section
        title={t('captions-title', { defaultValue: 'Captions' })}
        description={t('captions-desc', {
          defaultValue: 'Size and background for WebVTT captions on videos that have them.',
        })}
      >
        <Seg
          field="captionSize"
          label={t('caption-size', { defaultValue: 'Size' })}
          options={[
            { id: 'sm', label: t('size-sm', { defaultValue: 'Small' }) },
            { id: 'md', label: t('size-md', { defaultValue: 'Medium' }) },
            { id: 'lg', label: t('size-lg', { defaultValue: 'Large' }) },
            { id: 'xl', label: t('size-xl', { defaultValue: 'Huge' }) },
          ]}
          value={p.captionSize}
        />
        <Seg
          field="captionBg"
          label={t('caption-bg', { defaultValue: 'Background' })}
          options={[
            { id: 'none', label: t('bg-none', { defaultValue: 'None' }) },
            { id: 'dim', label: t('bg-dim', { defaultValue: 'Dim' }) },
            { id: 'solid', label: t('bg-solid', { defaultValue: 'Solid' }) },
          ]}
          value={p.captionBg}
        />
        <div className="rounded-site-sm bg-site-bg p-4 text-center">
          <span
            className="inline-block rounded-site-sm px-2 py-1"
            style={{
              background: 'var(--rmh-cue-bg)',
              color: 'white',
              fontSize: 'calc(1rem * var(--rmh-cue-scale, 1))',
            }}
          >
            {t('caption-sample', { defaultValue: 'This is how captions will look.' })}
          </span>
        </div>
      </Section>

      <Section title={t('more-title', { defaultValue: 'Comfort & reminders' })}>
        {phone ? (
          <ToggleRow
            label={t('shake-label', { defaultValue: 'Shake to report a problem' })}
            description={t('shake-desc', {
              defaultValue: 'Shake your phone to open the feedback sheet. Off inside games.',
            })}
            checked={p.shake}
            onChange={(v) => void onShake(v)}
          />
        ) : null}
        <ToggleRow
          label={t('bedtime-label', { defaultValue: 'Bedtime mode' })}
          description={t('bedtime-desc', {
            defaultValue: 'Dim and soften colours during your quiet hours.',
          })}
          checked={p.bedtime}
          onChange={(v) => setAccessPrefs({ bedtime: v })}
        />
        {p.bedtime && quiet === false ? (
          <p className="text-xs text-site-text-muted">
            {t('bedtime-no-quiet', { defaultValue: 'You have not set quiet hours yet.' })}{' '}
            <Link to="/settings/notifications" className="underline">
              {t('bedtime-set-quiet', { defaultValue: 'Set quiet hours' })}
            </Link>
          </p>
        ) : null}
        {activityNotificationsSupported() ? (
          <ToggleRow
            label={t('activity-label', { defaultValue: 'Show my study timer in notifications' })}
            description={t('activity-desc', {
              defaultValue:
                'A single notification for a running RMHStudy timer, updated when the phase changes.',
            })}
            checked={p.activity}
            onChange={(v) => void onActivity(v)}
          />
        ) : null}
      </Section>
    </div>
  );
}
