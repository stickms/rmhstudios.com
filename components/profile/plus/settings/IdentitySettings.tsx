'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  NOW_MAX,
  NOW_STALE_DAYS,
  PRONOUNS_MAX,
  isValidTimeZone,
  localClock,
  type ProfilePlusView,
} from '@/lib/profile/plus';
import { invalidateProfilePlus } from '../useProfilePlus';
import { PronunciationRecorder } from './PronunciationRecorder';

interface OwnView extends ProfilePlusView {
  pronunciationUrl: string | null;
  endorsementsEnabled: boolean;
}

function supportedZones(): string[] {
  try {
    const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
    return intl.supportedValuesOf?.('timeZone') ?? [];
  } catch {
    return [];
  }
}

function zoneList(current: string): string[] {
  const zones = supportedZones();
  return current && !zones.includes(current) ? [current, ...zones] : zones;
}

/** P2 /now, P3 pronouns + pronunciation, P4 timezone, P8/P9 switches. */
export default function IdentitySettings({ userId }: { userId: string }) {
  const { t } = useTranslation('f-profile-plus');
  const [view, setView] = useState<OwnView | null>(null);
  const [pronouns, setPronouns] = useState('');
  const [timezone, setTimezone] = useState('');
  const [nowText, setNowText] = useState('');
  const [counter, setCounter] = useState(false);
  const [endorse, setEndorse] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/profile/plus')
      .then((r) => (r.ok ? (r.json() as Promise<OwnView>) : null))
      .then((v) => {
        if (cancelled || !v) return;
        setView(v);
        setPronouns(v.pronouns ?? '');
        setTimezone(v.timezone ?? '');
        setNowText(v.nowText ?? '');
        setCounter(v.counterEnabled);
        setEndorse(v.endorsementsEnabled);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const zones = useMemo(() => zoneList(timezone), [timezone]);
  const preview = timezone && isValidTimeZone(timezone) ? localClock(timezone) : null;

  async function save() {
    setSaving(true);
    try {
      const res = await fetch('/api/profile/plus', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pronouns,
          timezone,
          nowText,
          counterEnabled: counter,
          endorsementsEnabled: endorse,
        }),
      });
      if (!res.ok) throw new Error();
      setView((await res.json()) as OwnView);
      invalidateProfilePlus(userId);
      toast.success(t('identity-saved', { defaultValue: 'Saved' }));
    } catch {
      toast.error(t('identity-failed', { defaultValue: "Couldn't save your changes" }));
    } finally {
      setSaving(false);
    }
  }

  if (!view) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="plus-pronouns">{t('pronouns-label', { defaultValue: 'Pronouns' })}</Label>
        <Input
          id="plus-pronouns"
          value={pronouns}
          maxLength={PRONOUNS_MAX}
          placeholder={t('pronouns-placeholder', { defaultValue: 'they/them' })}
          onChange={(e) => setPronouns(e.target.value)}
        />
        <p className="text-xs text-site-text-dim">
          {t('pronouns-hint', { defaultValue: 'Optional. Shown in your profile header.' })}
        </p>
      </div>

      <div className="space-y-2">
        <Label>{t('pron-label', { defaultValue: 'How to say your name' })}</Label>
        <PronunciationRecorder
          url={view.pronunciationUrl}
          onChange={(url) => {
            setView({ ...view, pronunciationUrl: url });
            invalidateProfilePlus(userId);
          }}
        />
        <p className="text-xs text-site-text-dim">
          {t('pron-hint', {
            defaultValue: 'A 5-second clip. A play button appears in your profile header.',
          })}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="plus-timezone">{t('timezone-label', { defaultValue: 'Local time' })}</Label>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            id="plus-timezone"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            containerClassName="min-w-0 flex-1"
            placeholder={t('timezone-none', { defaultValue: "Don't share" })}
          >
            <option value="">{t('timezone-none', { defaultValue: "Don't share" })}</option>
            {zones.map((z) => (
              <option key={z} value={z}>
                {z.replace(/_/g, ' ')}
              </option>
            ))}
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const here = Intl.DateTimeFormat().resolvedOptions().timeZone;
              if (here) setTimezone(here);
            }}
          >
            {t('timezone-detect', { defaultValue: "Use this device's zone" })}
          </Button>
        </div>
        <p className="text-xs text-site-text-dim">
          {preview
            ? t('timezone-preview', {
                time: preview.time,
                defaultValue:
                  'People will see "It\'s {{time}} for you" on your profile and in DMs.',
              })
            : t('timezone-hint', {
                defaultValue:
                  'Optional. Shows your current local time on your profile and in DMs, so people know when not to ping you.',
              })}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="plus-now">{t('now-label', { defaultValue: 'Now' })}</Label>
        <Textarea
          id="plus-now"
          rows={4}
          value={nowText}
          maxLength={NOW_MAX}
          placeholder={t('now-placeholder', {
            defaultValue: 'What are you working on, playing, reading these days? Links are fine.',
          })}
          onChange={(e) => setNowText(e.target.value)}
        />
        <p className="flex justify-between text-xs text-site-text-dim">
          <span>
            {t('now-hint', {
              days: NOW_STALE_DAYS,
              defaultValue: 'It greys out if you don’t update it for {{days}} days.',
            })}
          </span>
          <span className="tabular-nums">
            {nowText.length}/{NOW_MAX}
          </span>
        </p>
      </div>

      <div className="space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <Label htmlFor="plus-endorse">
              {t('endorse-switch', { defaultValue: 'Let members endorse my skills' })}
            </Label>
            <p className="mt-1 text-xs text-site-text-dim">
              {t('endorse-switch-hint', {
                defaultValue: 'Adds a Skills block to your profile.',
              })}
            </p>
          </div>
          <Switch id="plus-endorse" checked={endorse} onCheckedChange={setEndorse} />
        </div>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <Label htmlFor="plus-counter">
              {t('counter-switch', { defaultValue: 'Show a visitor counter' })}
            </Label>
            <p className="mt-1 text-xs text-site-text-dim">
              {t('counter-switch-hint', {
                defaultValue: 'A retro hit counter. Each visitor counts once a day.',
              })}
            </p>
          </div>
          <Switch id="plus-counter" checked={counter} onCheckedChange={setCounter} />
        </div>
      </div>

      <Button variant="accent" loading={saving} onClick={() => void save()}>
        {t('identity-save', { defaultValue: 'Save' })}
      </Button>
    </div>
  );
}
