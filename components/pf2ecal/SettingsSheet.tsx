'use client';

/**
 * Board settings: the Discord webhook and when the morning-of reminder fires.
 *
 * Laid out as an iOS Settings screen — grouped lists, a switch, a time field,
 * and a footer sentence under each group explaining what it does. That is not
 * decoration: the two things here (a secret and a schedule) are exactly what
 * iOS puts in that shape, and the footer is the only place on a phone where an
 * explanation actually fits.
 *
 * **The webhook is write-only from the client's side.** The server sends back
 * a mask (`discord.com/…/123/…ab12`), never the URL, so the field starts empty
 * with the mask shown as its placeholder-in-prose above it. Leaving it empty on
 * save keeps whatever is stored; that is why the API's `webhookUrl` is
 * tri-state. Without it, changing the reminder time would require re-pasting a
 * secret nobody has a copy of.
 */

import { Check, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SettingsDTO } from '@/lib/pf2ecal/types';
import { Group, Row, Segmented, Switch } from './ios';
import { Sheet } from './Sheet';

/** `09:00` ⇄ minutes past midnight, the shape the API stores. */
function minutesToTimeValue(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function timeValueToMinutes(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

/**
 * The zones the group plausibly means by "morning".
 *
 * A short list rather than a full IANA picker: this is one table, the schedule
 * is defined in Eastern, and a 400-entry `<select>` on a phone to choose
 * between two answers is worse than no choice at all. The server still
 * validates any zone, so widening this later needs no server change.
 */
const ZONES = [
  { value: 'America/New_York', label: 'Eastern' },
  { value: 'America/Chicago', label: 'Central' },
  { value: 'America/Denver', label: 'Mountain' },
  { value: 'America/Los_Angeles', label: 'Pacific' },
] as const;

type ZoneValue = (typeof ZONES)[number]['value'];

export interface SettingsDraft {
  webhookUrl: string;
  remindersEnabled: boolean;
  reminderMinutes: number;
  reminderTimeZone: string;
}

interface SettingsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: SettingsDTO;
  canEdit: boolean;
  saving: boolean;
  testing: boolean;
  onSave: (draft: {
    webhookUrl?: string | null;
    remindersEnabled: boolean;
    reminderMinutes: number;
    reminderTimeZone: string;
  }) => void;
  onTest: (webhookUrl: string) => void;
}

export function SettingsSheet({
  open,
  onOpenChange,
  settings,
  canEdit,
  saving,
  testing,
  onSave,
  onTest,
}: SettingsSheetProps) {
  const { t } = useTranslation('r-pf2ecal');

  const [webhookUrl, setWebhookUrl] = useState('');
  const [clearWebhook, setClearWebhook] = useState(false);
  const [enabled, setEnabled] = useState(settings.remindersEnabled);
  const [time, setTime] = useState(minutesToTimeValue(settings.reminderMinutes));
  const [zone, setZone] = useState<string>(settings.reminderTimeZone);

  // Re-seed from the server every time the sheet opens, so a cancelled edit
  // does not survive as a stale draft into the next open.
  useEffect(() => {
    if (!open) return;
    setWebhookUrl('');
    setClearWebhook(false);
    setEnabled(settings.remindersEnabled);
    setTime(minutesToTimeValue(settings.reminderMinutes));
    setZone(settings.reminderTimeZone);
  }, [open, settings.remindersEnabled, settings.reminderMinutes, settings.reminderTimeZone]);

  const minutes = timeValueToMinutes(time);
  const hasWebhook = clearWebhook
    ? false
    : Boolean(settings.webhookMasked) || webhookUrl.trim() !== '';
  const timeInvalid = minutes === null;
  // Turning the switch on with nothing to post to would save a setting that
  // silently does nothing, so the save is blocked rather than the switch.
  const missingWebhook = enabled && !hasWebhook;

  const save = () => {
    if (timeInvalid || minutes === null || missingWebhook) return;
    onSave({
      // Tri-state, matching the API: undefined = leave the stored secret alone.
      webhookUrl: clearWebhook ? null : webhookUrl.trim() === '' ? undefined : webhookUrl.trim(),
      remindersEnabled: enabled,
      reminderMinutes: minutes,
      reminderTimeZone: zone,
    });
  };

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={t('settings', { defaultValue: 'Settings' })}
      subtitle={t('settings-sub', { defaultValue: 'Discord reminders for this board' })}
    >
      <div className="flex flex-col gap-6">
        {!canEdit && (
          <p className="pf2e-caption">
            {t('settings-signed-out', {
              defaultValue: 'Sign in to change these.',
            })}
          </p>
        )}

        <Group
          title={t('discord-webhook', { defaultValue: 'Discord webhook' })}
          footer={
            <>
              {t('webhook-help', {
                defaultValue:
                  'In Discord: Channel Settings → Integrations → Webhooks → Copy Webhook URL.',
              })}{' '}
              {settings.webhookMasked && !clearWebhook
                ? t('webhook-saved', {
                    defaultValue: 'Saved: {{masked}}. Leave the field blank to keep it.',
                    masked: settings.webhookMasked,
                  })
                : t('webhook-none', { defaultValue: 'None saved yet.' })}
            </>
          }
        >
          <Row>
            <label className="pf2e-sr-only" htmlFor="pf2e-webhook">
              {t('webhook-url', { defaultValue: 'Webhook URL' })}
            </label>
            <input
              id="pf2e-webhook"
              className="pf2e-field"
              type="url"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              disabled={!canEdit || clearWebhook}
              value={webhookUrl}
              onChange={(event) => setWebhookUrl(event.target.value)}
              placeholder={
                settings.webhookMasked
                  ? t('webhook-placeholder-saved', { defaultValue: 'Paste to replace' })
                  : 'https://discord.com/api/webhooks/…'
              }
              style={{ textAlign: 'left' }}
            />
          </Row>

          {settings.webhookMasked && canEdit && (
            <Row>
              <span className="pf2e-row-label">
                {clearWebhook
                  ? t('webhook-will-clear', { defaultValue: 'Will be removed on save' })
                  : t('remove-webhook', { defaultValue: 'Remove webhook' })}
              </span>
              <button
                type="button"
                className="pf2e-btn pf2e-btn-ghost pf2e-btn-sm"
                onClick={() => {
                  setClearWebhook((v) => !v);
                  if (!clearWebhook) setEnabled(false);
                }}
              >
                {clearWebhook ? (
                  t('undo', { defaultValue: 'Undo' })
                ) : (
                  <Trash2 size={16} aria-hidden />
                )}
              </button>
            </Row>
          )}

          <Row>
            <span className="pf2e-row-label">
              {t('send-test', { defaultValue: 'Send a test message' })}
            </span>
            <button
              type="button"
              className="pf2e-btn pf2e-btn-secondary pf2e-btn-sm"
              // Tests the value in the FIELD, so it verifies a URL before it is
              // committed — which is the only moment the button is useful.
              disabled={!canEdit || testing || webhookUrl.trim() === ''}
              onClick={() => onTest(webhookUrl.trim())}
            >
              {testing
                ? t('sending', { defaultValue: 'Sending…' })
                : t('test', { defaultValue: 'Test' })}
            </button>
          </Row>
        </Group>

        <Group
          title={t('reminders', { defaultValue: 'Reminders' })}
          footer={t('reminders-help', {
            defaultValue:
              'On the morning of each session, the channel gets the time, the place and who has replied. Nothing is posted for a cancelled session.',
          })}
        >
          <Row label={t('morning-reminder', { defaultValue: 'Morning reminder' })}>
            <Switch
              checked={enabled}
              disabled={!canEdit}
              label={t('morning-reminder', { defaultValue: 'Morning reminder' })}
              onChange={setEnabled}
            />
          </Row>

          <Row label={t('reminder-time', { defaultValue: 'Time' })}>
            <label className="pf2e-sr-only" htmlFor="pf2e-reminder-time">
              {t('reminder-time', { defaultValue: 'Time' })}
            </label>
            <input
              id="pf2e-reminder-time"
              className="pf2e-field"
              type="time"
              disabled={!canEdit}
              value={time}
              onChange={(event) => setTime(event.target.value)}
              style={{ width: 'auto', flex: '0 0 auto' }}
            />
          </Row>
        </Group>

        <Group title={t('reminder-zone', { defaultValue: 'Timezone' })}>
          <Row>
            {/* `min-w-0` on the wrapper so the control can shrink to the row
                rather than overflowing it at 320px. */}
            <div className="min-w-0 flex-1">
              <Segmented
                segments={ZONES}
                value={(ZONES.find((z) => z.value === zone)?.value ?? ZONES[0].value) as ZoneValue}
                onChange={(next) => setZone(next)}
                label={t('reminder-zone', { defaultValue: 'Timezone' })}
              />
            </div>
          </Row>
        </Group>

        {(timeInvalid || missingWebhook) && (
          <p className="pf2e-caption" role="alert">
            {timeInvalid
              ? t('bad-time', { defaultValue: 'Pick a valid time.' })
              : t('need-webhook', {
                  defaultValue: 'Add a webhook URL before turning reminders on.',
                })}
          </p>
        )}

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            className="pf2e-btn pf2e-btn-ghost"
            onClick={() => onOpenChange(false)}
          >
            {t('cancel', { defaultValue: 'Cancel' })}
          </button>
          <button
            type="button"
            className="pf2e-btn pf2e-btn-primary"
            disabled={!canEdit || saving || timeInvalid || missingWebhook}
            onClick={save}
          >
            {saving ? (
              t('saving', { defaultValue: 'Saving…' })
            ) : (
              <>
                <Check size={17} aria-hidden />
                {t('save', { defaultValue: 'Save' })}
              </>
            )}
          </button>
        </div>
      </div>
    </Sheet>
  );
}
